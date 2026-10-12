import type { Express, Request, Response } from "express";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../../db";
import { AudioError } from "./audio";
import { mediaLibraryLimit } from "./storage-quota";
import { renderCarouselAudio } from "./carousel-audio-render";
import { carouselAudioSchema, carouselAudioKey, carouselAudioReady, preserveCarouselAudioOutput } from "../../../shared/carousel-audio";

const uuid = z.string().uuid();
const activeKinds = "('explainer','reels_audio','reels_render','carousel_audio')";
export async function checkCarouselAudioAssets(post: any) {
  if (!post.variants.carousel_audio) return;
  const audio = carouselAudioSchema.parse(post.variants.carousel_audio);
  if (post.format !== "carousel" || post.asset_ids.length < 2 || post.asset_ids.length > 10
    || new Set(post.asset_ids).size !== post.asset_ids.length)
    throw new AudioError(422, "Musiqa uchun karusel formati va 2–10 ta rasm tanlang.");
  if (post.variants.telegram_format || post.variants.reels || post.variants.explainer)
    throw new AudioError(422, "Audioli karusel uchun alohida karusel qoralamasini yarating.");
  const ids = [...post.asset_ids, audio.music_id];
  const assets = (await pool.query("SELECT id,mime_type FROM media_assets WHERE id=ANY($1::uuid[])", [ids])).rows;
  if (post.asset_ids.some((id: string) => !assets.some(a => a.id === id && ["image/jpeg", "image/png"].includes(a.mime_type))))
    throw new AudioError(422, "Audioli karuselning manba slaydlari JPG yoki PNG bo‘lishi kerak.");
  if (!assets.some(a => a.id === audio.music_id && a.mime_type === "audio/mpeg"))
    throw new AudioError(422, "Fon musiqasi uchun kutubxonadagi MP3 faylni tanlang.");
}
async function editable(client: PoolClient, id: string, expected?: string) {
  const post = (await client.query("SELECT * FROM media_posts WHERE id=$1 FOR UPDATE", [id])).rows[0];
  if (!post) throw new AudioError(404, "Karusel topilmadi.");
  if (post.format !== "carousel") throw new AudioError(422, "Avval karusel formatidagi postni saqlang.");
  if (expected && new Date(expected).getTime() !== new Date(post.updated_at).getTime())
    throw new AudioError(409, "Post yangilangan. Oynani yopib, qayta oching.");
  if ((await client.query("SELECT 1 FROM media_deliveries WHERE post_id=$1 AND status<>'cancelled' LIMIT 1", [id])).rowCount)
    throw new AudioError(409, "Rejalashtirilgan yoki yuborilgan karusel uchun nusxa yarating.");
  return post;
}
async function activeJob(client: PoolClient, id: string) {
  return (await client.query(`SELECT id,status FROM media_jobs WHERE kind IN ${activeKinds} AND status IN ('queued','running') AND payload->>'post_id'=$1 LIMIT 1`, [id])).rows[0];
}
export function registerCarouselAudioRoutes(app: Express, route: any) {
  app.get("/api/media/posts/:id/carousel-audio", route(async (req: Request, res: Response) => {
    const id = uuid.parse(req.params.id);
    const post = (await pool.query("SELECT * FROM media_posts WHERE id=$1", [id])).rows[0];
    if (!post) throw new AudioError(404, "Karusel topilmadi.");
    const key = carouselAudioKey(post);
    const job = key ? (await pool.query("SELECT id,status,error,result FROM media_jobs WHERE kind='carousel_audio' AND payload->>'post_id'=$1 AND payload->>'source_key'=$2 ORDER BY created_at DESC LIMIT 1", [id, key])).rows[0] || null : null;
    res.json({ ready: carouselAudioReady(post), job: job ? {id: job.id, status: job.status, error: job.error} : null,
      output_ids: carouselAudioReady(post) ? post.variants.carousel_audio_output.asset_ids : [], updated_at: post.updated_at });
  }));
  app.put("/api/media/posts/:id/carousel-audio", route(async (req: Request, res: Response) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({ audio: carouselAudioSchema.nullable(), updated_at: z.string().datetime({offset:true}) }).parse(req.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const post = await editable(client, id, input.updated_at);
      if (await activeJob(client, id)) throw new AudioError(409, "Karusel tayyorlanmoqda. Tugashini kuting.");
      const variants = {...post.variants, carousel_audio: input.audio || undefined};
      const next = preserveCarouselAudioOutput({...post, variants}, post);
      await checkCarouselAudioAssets(next);
      const saved = (await client.query("UPDATE media_posts SET variants=$2,updated_at=now() WHERE id=$1 RETURNING updated_at", [id, JSON.stringify(next.variants)])).rows[0];
      await client.query("COMMIT");
      res.json(saved);
    } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  }));
  app.post("/api/media/posts/:id/carousel-audio/render", route(async (req: Request, res: Response) => {
    const id = uuid.parse(req.params.id);
    const input = z.object({ updated_at: z.string().datetime({offset:true}) }).parse(req.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const post = await editable(client, id, input.updated_at);
      const active = await activeJob(client, id);
      if (active) {
        const own = (await client.query("SELECT kind FROM media_jobs WHERE id=$1", [active.id])).rows[0];
        if (own.kind !== "carousel_audio") throw new AudioError(409, "Oldingi media ishi tugashini kuting.");
        await client.query("COMMIT"); res.status(202).json(active); return;
      }
      await checkCarouselAudioAssets(post);
      const audio = carouselAudioSchema.parse(post.variants.carousel_audio);
      if (carouselAudioReady(post)) {
        await client.query("COMMIT"); res.json({status:"completed", reused:true}); return;
      }
      const job = (await client.query("INSERT INTO media_jobs(kind,payload) VALUES('carousel_audio',$1) RETURNING id,status", [JSON.stringify({post_id:id, title:post.title, source_asset_ids:post.asset_ids, source_key:carouselAudioKey(post), audio})])).rows[0];
      await client.query("COMMIT"); res.status(202).json(job);
    } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  }));
}

let running = false;
export async function processCarouselAudio() {
  if (running) return;
  running = true;
  let lease: PoolClient | undefined, leased = false, job: any;
  let pulse: ReturnType<typeof setInterval> | undefined;
  const claim = randomUUID();
  try {
    lease = await pool.connect();
    leased = !!(await lease.query("SELECT pg_try_advisory_lock(761287) AS locked")).rows[0].locked;
    if (!leased) return;
    // Only local rendering is retried after a restart; it never calls a paid API.
    await pool.query("UPDATE media_jobs SET status='queued',started_at=NULL,error=NULL WHERE kind='carousel_audio' AND status='running' AND started_at<now()-interval '20 minutes'");
    job = (await pool.query("UPDATE media_jobs SET status='running',started_at=now(),result=$1,error=NULL WHERE id=(SELECT id FROM media_jobs WHERE kind='carousel_audio' AND status='queued' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *", [JSON.stringify({claim_id:claim})])).rows[0];
    if (!job) return;
    const beat = async () => {
      const r = await pool.query("UPDATE media_jobs SET started_at=now() WHERE id=$1 AND status='running' AND result->>'claim_id'=$2", [job.id, claim]);
      if (!r.rowCount) throw new AudioError(409, "Render navbati o‘zgargan. Natija saqlanmadi.");
    };
    pulse = setInterval(() => void beat().catch(() => {}), 20000); pulse.unref();
    const audio = carouselAudioSchema.parse(job.payload.audio);
    const ids: string[] = job.payload.source_asset_ids;
    const assets = (await pool.query("SELECT id,mime_type,data FROM media_assets WHERE id=ANY($1::uuid[])", [[...ids, audio.music_id]])).rows;
    const images = ids.map(id => assets.find(a => a.id === id));
    const music = assets.find(a => a.id === audio.music_id && a.mime_type === "audio/mpeg");
    if (!music || images.some(a => !a)) throw new AudioError(422, "Rasm yoki musiqa fayli topilmadi.");
    const videos = await renderCarouselAudio(images, music.data, audio, beat);
    const client = await pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(761281)");
      const active = (await client.query("SELECT status,result FROM media_jobs WHERE id=$1 FOR UPDATE", [job.id])).rows[0];
      if (active?.status !== "running" || active.result?.claim_id !== claim) throw new AudioError(409, "Render navbati o‘zgargan.");
      const post = (await client.query("SELECT * FROM media_posts WHERE id=$1 FOR UPDATE", [job.payload.post_id])).rows[0];
      if (!post || carouselAudioKey(post) !== job.payload.source_key) throw new AudioError(409, "Karusel manbasi o‘zgargan. Natija biriktirilmadi.");
      const used = Number((await client.query("SELECT COALESCE(SUM(size),0) AS used FROM media_assets")).rows[0].used);
      if (used + videos.reduce((n, v) => n + v.length, 0) > mediaLibraryLimit()) throw new AudioError(413, "Media kutubxonasi to‘ldi. Bo‘sh joy ajrating va qayta tayyorlang.");
      const outputIds: string[] = [];
      for (let i = 0; i < videos.length; i++) {
        const a = (await client.query("INSERT INTO media_assets(name,mime_type,size,data) VALUES($1,'video/mp4',$2,$3) RETURNING id", [`${job.payload.title} — musiqali slayd ${String(i + 1).padStart(2,"0")}.mp4`, videos[i].length, videos[i]])).rows[0];
        outputIds.push(a.id);
      }
      const variants = {...post.variants, carousel_audio_output:{source_key:job.payload.source_key, asset_ids:outputIds}};
      await client.query("UPDATE media_posts SET variants=$2,updated_at=now() WHERE id=$1", [post.id, JSON.stringify(variants)]);
      await client.query("UPDATE media_jobs SET status='completed',completed_at=now(),result=$2 WHERE id=$1", [job.id, JSON.stringify({post_id:post.id, asset_ids:outputIds, slide_seconds:audio.slide_seconds})]);
      await client.query("COMMIT");
      console.info("Carousel audio completed:", post.id, "slides:", outputIds.length);
    } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  } catch (e) {
    if (job) await pool.query("UPDATE media_jobs SET status='failed',error=$2,completed_at=now() WHERE id=$1 AND status='running' AND result->>'claim_id'=$3", [job.id, e instanceof AudioError ? e.message : "Karusel tayyorlanmadi. Rasm, MP3 va bo‘sh joyni tekshiring.", claim]).catch(() => {});
    console.error("Carousel audio worker:", e instanceof Error ? e.name : "Unknown");
  } finally {
    if (pulse) clearInterval(pulse);
    if (leased && lease) await lease.query("SELECT pg_advisory_unlock(761287)").catch(() => {});
    lease?.release(); running = false;
  }
}
