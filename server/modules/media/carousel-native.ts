import type { Express, Request, Response } from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { pool } from "../../db";
import { AudioError } from "./audio";
import { carouselNativeSchema } from "../../../shared/carousel-native";

export async function checkNativeCarouselAssets(post: any) {
  if (!post.variants.carousel_native) return;
  if (post.format !== "carousel" || post.asset_ids.length < 2 || post.asset_ids.length > 10
    || new Set(post.asset_ids).size !== post.asset_ids.length)
    throw new AudioError(422, "Foto-karusel uchun 2–10 ta rasmni tartib bilan tanlang.");
  if (post.variants.carousel_audio || post.variants.reels || post.variants.explainer || post.variants.telegram_format)
    throw new AudioError(422, "Foto-karuselni alohida rasmli qoralama sifatida tayyorlang.");
  const assets = (await pool.query("SELECT id,mime_type FROM media_assets WHERE id=ANY($1::uuid[])", [post.asset_ids])).rows;
  if (post.asset_ids.some((id: string) => !assets.some(a => a.id === id && ["image/jpeg", "image/png"].includes(a.mime_type))))
    throw new AudioError(422, "Foto-karuselga faqat asl JPG yoki PNG rasmlar tanlang.");
}

export async function packNativeCarousel(post: any, assets: {id: string; mime_type: string; data: Buffer}[]) {
  const notes = carouselNativeSchema.parse(post.variants.carousel_native);
  if (post.asset_ids.length < 2 || post.asset_ids.length > 10 || new Set(post.asset_ids).size !== post.asset_ids.length)
    throw new AudioError(422, "Foto-karusel uchun 2–10 ta alohida rasm kerak.");
  const ordered = post.asset_ids.map((id: string) => assets.find(a => a.id === id));
  if (ordered.some((a: any) => !a || !["image/jpeg", "image/png"].includes(a.mime_type)))
    throw new AudioError(422, "Foto-karusel rasmlari topilmadi yoki formati noto‘g‘ri.");
  if (ordered.reduce((n: number, a: any) => n + a.data.length, 0) > 100 * 1024 * 1024)
    throw new AudioError(413, "Rasmlar jami 100 MB dan oshmasin.");
  const caption = post.variants.instagram ?? post.caption;
  if (caption.length > 2200) throw new AudioError(422, "Instagram caption 2200 belgidan oshmasin.");
  const dir = await mkdtemp(join(tmpdir(), "carousel-photo-"));
  try {
    const files: string[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i]!;
      const name = `${String(i + 1).padStart(2, "0")}-slayd.${a.mime_type === "image/png" ? "png" : "jpg"}`;
      await writeFile(join(dir, name), a.data); files.push(name);
    }
    await writeFile(join(dir, "CAPTION.txt"), caption, "utf8");
    await writeFile(join(dir, "MUSIQA.txt"), [
      "BARCHA RASMLAR UCHUN BITTA UMUMIY MUSIQA",
      `Trek: ${notes.music_title || "Instagram katalogidan tanlang"}`,
      `Havola: ${notes.music_url || "Ko‘rsatilmagan"}`,
      `Kesma boshlanishi: ${notes.start_seconds} soniya`,
      "Bu musiqa eslatmasi. ZIP ichidagi rasmlarga audio biriktirilmagan.",
      "Umumiy musiqani Instagram ilovasida tanlang. Alohida MP3 fayl yuklash native musiqa biriktirish bilan teng emas.",
    ].join("\n"), "utf8");
    await writeFile(join(dir, "QOLLANMA.txt"), [
      post.title, "INSTAGRAM FOTO-KARUSEL PAKETI", "",
      "1. ZIP faylni oching va raqamlangan asl rasmlarni telefoningizga saqlang.",
      "2. Instagram ilovasida yangi post ochib, rasmlarni 01, 02, ... tartibida tanlang.",
      "3. CAPTION.txt matnini postga qo‘ying.",
      "4. Musiqa qo‘shish orqali barcha rasmlar uchun bitta umumiy trek va kesmani tanlang.",
      "5. Slaydlarni surib, rasm tartibi va umumiy musiqa ijrosini tekshiring.",
      "6. Nashrni Instagram ilovasida yakunlang.", "",
      "Bu paket tayyorlanishi Instagramga nashr qilinganini yoki avtomatik nashr rejalashtirilganini anglatmaydi.",
      "Rasmlar videoga aylantirilmagan; fayllar asl ko‘rinishida saqlangan.",
    ].join("\n"), "utf8");
    files.push("CAPTION.txt", "MUSIQA.txt", "QOLLANMA.txt");
    const path = join(dir, "instagram-foto-karusel.zip");
    await promisify(execFile)("zip", ["-q", "-0", path, ...files], {cwd: dir, timeout: 60000, maxBuffer: 1024 * 1024});
    return {dir, path};
  } catch (e) {await rm(dir, {recursive: true, force: true}); throw e;}
}

export function registerNativeCarouselRoutes(app: Express, route: any) {
  app.put("/api/media/posts/:id/carousel-native", route(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const input = z.object({settings: carouselNativeSchema, updated_at: z.string().datetime({offset: true})}).parse(req.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const post = (await client.query("SELECT * FROM media_posts WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!post) throw new AudioError(404, "Karusel topilmadi.");
      if (new Date(input.updated_at).getTime() !== new Date(post.updated_at).getTime())
        throw new AudioError(409, "Post yangilangan. Qayta ochib tekshiring.");
      if ((await client.query("SELECT 1 FROM media_deliveries WHERE post_id=$1 AND status<>'cancelled' LIMIT 1", [id])).rowCount
        || (await client.query("SELECT 1 FROM media_jobs WHERE kind IN ('explainer','reels_audio','reels_render','carousel_audio') AND status IN ('queued','running') AND payload->>'post_id'=$1", [id])).rowCount)
        throw new AudioError(409, "Tayyorlanayotgan yoki rejalashtirilgan post uchun nusxa yarating.");
      const variants = {...post.variants, carousel_native: input.settings};
      delete variants.carousel_audio; delete variants.carousel_audio_output;
      await checkNativeCarouselAssets({...post, variants});
      const saved = (await client.query("UPDATE media_posts SET variants=$2,updated_at=now() WHERE id=$1 RETURNING updated_at", [id, JSON.stringify(variants)])).rows[0];
      await client.query("COMMIT"); res.json(saved);
    } catch (e) {await client.query("ROLLBACK"); throw e;} finally {client.release();}
  }));
  app.get("/api/media/posts/:id/carousel-native/package", route(async (req: Request, res: Response) => {
    const id = z.string().uuid().parse(req.params.id);
    const post = (await pool.query("SELECT * FROM media_posts WHERE id=$1", [id])).rows[0];
    if (!post) throw new AudioError(404, "Karusel topilmadi.");
    if (!post.variants.carousel_native) throw new AudioError(422, "Avval foto-karusel va musiqa eslatmasini saqlang.");
    await checkNativeCarouselAssets(post);
    const assets = (await pool.query("SELECT id,mime_type,data FROM media_assets WHERE id=ANY($1::uuid[])", [post.asset_ids])).rows;
    const archive = await packNativeCarousel(post, assets);
    res.download(archive.path, "instagram-foto-karusel.zip", err => {
      void rm(archive.dir, {recursive: true, force: true});
      if (err && !res.headersSent) res.status(500).json({error: "Paket yuklab olinmadi. Qayta urinib ko‘ring."});
    });
  }));
}
