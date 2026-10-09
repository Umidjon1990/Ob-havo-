import { mediaLibraryLimit } from "./storage-quota";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { pool } from "../../db";
import {
  campaignSchema,
  postSchema,
  ruleSchema,
  validatePublication,
  suggestedDates,
} from "../../../shared/media";
import {
  requireAdmin,
  isAuthenticated,
  validAssetSignature,
  assetSignature,
  hashToken,
  requestToken,
  seal,
} from "./security";
import { appBaseUrl, verifyAccount, PublishError } from "./providers";
import { registerYouTubePlaylistRoutes } from "./youtube-playlist-routes";
import { schedulePublications, ScheduleError } from "./scheduling";
import { registerExplainerRoutes } from "./explainer";
import { audioInput, audioCatalog, generateAudio, AudioError } from "./audio";
import { registerGrowthRoutes } from "./growth";
import { registerQualityRoutes } from "./quality";
import { registerReelRoutes, checkReelAssets } from "./reels";
const uuid = z.string().uuid();
let generatingAudio = false;
const route =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof ScheduleError || e instanceof AudioError) {
        res.status(e.status).json({ error: e.message });
      } else if (e instanceof PublishError) {
        res.status(e.ambiguous ? 409 : e.retryable ? 503 : 400).json({ error: e.message });
      } else if (e instanceof z.ZodError) {
        res
          .status(400)
          .json({
            error: "Kiritilgan ma’lumotni tekshiring.",
            details: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
          });
      } else {
        console.error(
          "Media request failed:",
          e instanceof Error ? e.name : "Unknown",
        );
        res
          .status(500)
          .json({
            error:
              "Amal bajarilmadi. Ma’lumotlarni tekshirib qayta urinib ko‘ring.",
          });
      }
    }
  };
const meta = "id,name,mime_type,size,created_at";
const accountFields =
  "id,platform,name,external_id,enabled,verified_at,(credentials IS NOT NULL) AS has_credentials";
function validBytes(mime: string, data: Buffer) {
  return mime === "image/jpeg"
    ? data[0] === 255 && data[1] === 216 && data[2] === 255
    : mime === "image/png"
      ? data
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mime === "video/mp4"
        ? data.subarray(4, 8).toString() === "ftyp"
        : mime === "audio/mpeg"
          ? data.subarray(0, 3).toString() === "ID3" ||
            (data[0] === 255 && (data[1] & 224) === 224)
          : false;
}
export function registerMediaRoutes(app: Express) {
  app.get(
    "/api/media/assets/:id/public",
    route(async (req, res) => {
      const id = uuid.parse(req.params.id),
        expires = String(req.query.expires || ""),
        sig = String(req.query.sig || "");
      if (!validAssetSignature(id, expires, sig)) {
        res.status(403).end();
        return;
      }
      await serveAsset(req, res, id);
    }),
  );
  registerGrowthRoutes(app);
  app.use("/api/media", requireAdmin);
  registerYouTubePlaylistRoutes(app, route);
  registerQualityRoutes(app, route);
  registerExplainerRoutes(app, route);
  registerReelRoutes(app, route);
  app.get("/api/media/audio/catalog", route(async (_req, res) => res.json(await audioCatalog())));
  app.post("/api/media/audio/generate", route(async (req, res) => {
    const input = audioInput.parse(req.body);
    if (generatingAudio) throw new AudioError(409, "Audio yaratilmoqda. Tugashini kuting.");
    generatingAudio = true;
    try {
      const quota = await pool.query("SELECT COALESCE(SUM(size),0) AS used FROM media_assets");
      if (Number(quota.rows[0].used) > mediaLibraryLimit() - 50 * 1024 * 1024)
        throw new AudioError(413, "Audio uchun kutubxonada kamida 50 MB bo‘sh joy kerak.");
      const audio = await generateAudio(input);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(761281)");
        const used = await client.query("SELECT COALESCE(SUM(size),0) AS used FROM media_assets");
        if (Number(used.rows[0].used) + audio.length > mediaLibraryLimit())
          throw new AudioError(413, "Audio yaratildi, ammo kutubxonaga sig‘madi. ElevenLabs tarixidan yuklab oling.");
        const r = await client.query(`INSERT INTO media_assets(name,mime_type,size,data) VALUES($1,'audio/mpeg',$2,$3) RETURNING ${meta}`, [input.name.replace(/\.mp3$/i, "") + ".mp3", audio.length, audio]);
        await client.query("COMMIT");
        res.status(201).json(r.rows[0]);
      } catch (e) { await client.query("ROLLBACK"); throw e; }
      finally { client.release(); }
    } finally { generatingAudio = false; }
  }));
  app.post(
    "/api/media/assets",
    express.raw({
      type: ["image/jpeg", "image/png", "video/mp4", "audio/mpeg"],
      limit: "50mb",
    }),
    route(async (req, res) => {
      const name = z
        .string()
        .trim()
        .min(1)
        .max(180)
        .parse(
          decodeURIComponent(String(req.headers["x-file-name"] || "media")),
        );
      const mime = String(req.headers["content-type"] || "").split(";")[0];
      if (
        !Buffer.isBuffer(req.body) ||
        !req.body.length ||
        !validBytes(mime, req.body)
      ) {
        res
          .status(400)
          .json({
            error:
              "JPG, PNG, MP4 yoki MP3 fayl tanlang. Fayl ichki formati ham mos bo‘lsin.",
          });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(761281)");
        const quota = await client.query(
          "SELECT COALESCE(SUM(size),0) AS used FROM media_assets",
        );
        if (Number(quota.rows[0].used) + req.body.length > mediaLibraryLimit()) {
          await client.query("ROLLBACK");
          res
            .status(413)
            .json({
              error:
                "Media kutubxonasi limitga yetdi. Ishlatilmagan fayllarni o‘chiring.",
            });
          return;
        }
        const r = await client.query(
          `INSERT INTO media_assets(name,mime_type,size,data) VALUES($1,$2,$3,$4) RETURNING ${meta}`,
          [name, mime, req.body.length, req.body],
        );
        await client.query("COMMIT");
        res.status(201).json(r.rows[0]);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }),
  );
  app.get(
    "/api/media/assets",
    route(async (_req, res) =>
      res.json(
        (
          await pool.query(
            `SELECT ${meta} FROM media_assets ORDER BY created_at DESC`,
          )
        ).rows,
      ),
    ),
  );
  app.post(
    "/api/media/assets/:id/download-link",
    route(async (req, res) => {
      const id = uuid.parse(req.params.id);
      const found = await pool.query("SELECT id FROM media_assets WHERE id=$1", [id]);
      if (!found.rows.length) { res.status(404).json({ error: "Fayl topilmadi." }); return; }
      const expires = String(Date.now() + 15 * 60 * 1000);
      res.setHeader("Cache-Control", "no-store");
      res.json({ url: `${appBaseUrl()}/api/media/assets/${id}/public?expires=${expires}&sig=${assetSignature(id, expires)}`, expires_at: Number(expires) });
    }),
  );
  app.get(
    "/api/media/assets/:id/download",
    route(async (req, res) => serveAsset(req, res, uuid.parse(req.params.id), true)),
  );
  app.get(
    "/api/media/assets/:id",
    route(async (req, res) => serveAsset(req, res, uuid.parse(req.params.id))),
  );
  app.delete(
    "/api/media/assets/:id",
    route(async (req, res) => {
      const id = uuid.parse(req.params.id);
      const r = await pool.query(
        "DELETE FROM media_assets a WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM media_posts p WHERE p.asset_ids ? a.id::text OR p.variants::text LIKE '%'||a.id::text||'%') AND NOT EXISTS(SELECT 1 FROM media_jobs j WHERE j.result::text LIKE '%'||a.id::text||'%' OR j.payload::text LIKE '%'||a.id::text||'%') RETURNING id",
        [id],
      );
      if (!r.rowCount) {
        res
          .status(409)
          .json({
            error:
              "Fayl postga biriktirilgan yoki topilmadi. Avval qoralamadan olib tashlang.",
          });
        return;
      }
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/media/overview",
    route(async (_req, res) => {
      const [counts, storage] = await Promise.all([
        pool.query(
          "SELECT status,count(*)::int FROM media_deliveries GROUP BY status",
        ),
        pool.query(
          "SELECT count(*)::int AS files,COALESCE(SUM(size),0)::bigint AS bytes FROM media_assets",
        ),
      ]);
      res.json({
        counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.count])),
        storage: {...storage.rows[0],limit_bytes:mediaLibraryLimit()},
        capabilities: {
          openai: !!(
            process.env.OPENAI_API_KEY ||
            process.env.AI_INTEGRATIONS_OPENAI_API_KEY
          ),
          telegram: !!process.env.TELEGRAM_BOT_TOKEN,
          youtube_oauth: !!(
            process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
          ),
          instagram_oauth: false,
        },
        timezone: "Asia/Tashkent",
      });
    }),
  );
  app.get(
    "/api/media/posts",
    route(async (_req, res) => {
      const r = await pool.query(
        `SELECT p.*,COALESCE((SELECT jsonb_agg(to_jsonb(d)||jsonb_build_object('account_name',a.name,'platform',a.platform) ORDER BY d.scheduled_at) FROM media_deliveries d JOIN media_accounts a ON a.id=d.account_id WHERE d.post_id=p.id),'[]'::jsonb) AS deliveries FROM media_posts p ORDER BY p.created_at DESC LIMIT 500`,
      );
      res.json(r.rows);
    }),
  );
  app.post(
    "/api/media/posts",
    route(async (req, res) => {
      const p = postSchema.parse(req.body);
      await checkAssets(p.asset_ids);
      for (const platform of ["telegram", "instagram", "youtube"] as const) {
        const ids = p.variants[`${platform}_asset_ids`];
        if (ids) await checkAssets(ids);
      }
      await checkInstagramCover(p);
      await checkYouTubeCover(p);
      await checkYouTubePlaylistAccount(p);
      if(p.variants.reels) await checkReelAssets(p.variants.reels,p.variants.instagram_cover_id);
      const r = await pool.query(
        "INSERT INTO media_posts(title,caption,format,asset_ids,variants,production_notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          p.title,
          p.caption,
          p.format,
          JSON.stringify(p.asset_ids),
          JSON.stringify(p.variants),
          p.production_notes,
        ],
      );
      res.status(201).json({ ...r.rows[0], deliveries: [] });
    }),
  );
  app.patch(
    "/api/media/posts/:id",
    route(async (req, res) => {
      const id = uuid.parse(req.params.id),
        p = postSchema.parse(req.body);
      await checkAssets(p.asset_ids);
      for (const platform of ["telegram", "instagram", "youtube"] as const) {
        const ids = p.variants[`${platform}_asset_ids`];
        if (ids) await checkAssets(ids);
      }
      await checkInstagramCover(p);
      await checkYouTubeCover(p);
      await checkYouTubePlaylistAccount(p);
      if(p.variants.reels) await checkReelAssets(p.variants.reels,p.variants.instagram_cover_id);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const found = await client.query(
          "SELECT id FROM media_posts WHERE id=$1 FOR UPDATE",
          [id],
        );
        if (!found.rowCount) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Post topilmadi." });
          return;
        }
        const locked = await client.query(
          "SELECT 1 FROM media_deliveries WHERE post_id=$1 AND status<>'cancelled' LIMIT 1",
          [id],
        );
        if (locked.rowCount || (await client.query("SELECT 1 FROM media_jobs WHERE kind IN ('explainer','reels_audio','reels_render') AND status IN ('queued','running') AND payload->>'post_id'=$1",[id])).rowCount) {
          await client.query("ROLLBACK");
          res
            .status(409)
            .json({
              error:
                "Yaratilayotgan, rejalashtirilgan yoki yuborilgan postni o‘zgartirib bo‘lmaydi. Rejani bekor qiling yoki nusxa yarating.",
            });
          return;
        }
        const r = await client.query(
          "UPDATE media_posts SET title=$2,caption=$3,format=$4,asset_ids=$5,variants=$6,production_notes=$7,updated_at=now() WHERE id=$1 RETURNING *",
          [
            id,
            p.title,
            p.caption,
            p.format,
            JSON.stringify(p.asset_ids),
            JSON.stringify(p.variants),
            p.production_notes,
          ],
        );
        await client.query("COMMIT");
        res.json(r.rows[0]);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }),
  );
  app.delete(
    "/api/media/posts/:id",
    route(async (req, res) => {
      const id = uuid.parse(req.params.id);
      const r = await pool.query(
        "DELETE FROM media_posts WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM media_deliveries WHERE post_id=$1 AND status<>'cancelled') AND NOT EXISTS(SELECT 1 FROM media_jobs WHERE kind IN ('explainer','reels_audio','reels_render') AND status IN ('queued','running') AND payload->>'post_id'=$1::text) RETURNING id",
        [id],
      );
      if (!r.rowCount) {
        res
          .status(409)
          .json({
            error:
              "Avval rejani bekor qiling. Yuborilgan postlar tarix uchun saqlanadi.",
          });
        return;
      }
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/media/posts/:id/schedule",
    route(async (req, res) => {
      const id = uuid.parse(req.params.id),
        body = z
          .object({
            account_ids: z.array(uuid).min(1).max(10),
            scheduled_at: z.string().datetime({ offset: true }),
          })
          .parse(req.body);
      await schedulePublications(
        [{ post_id: id, scheduled_at: body.scheduled_at }],
        body.account_ids,
      );
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/media/schedule",
    route(async (req, res) => {
      const body = z
        .object({
          account_ids: z.array(uuid).min(1).max(10),
          items: z
            .array(
              z.object({
                post_id: uuid,
                scheduled_at: z.string().datetime({ offset: true }),
              }),
            )
            .min(1)
            .max(31),
        })
        .parse(req.body);
      await schedulePublications(body.items, body.account_ids);
      res.json({ ok: true, count: body.items.length });
    }),
  );
  app.post(
    "/api/media/deliveries/:id/cancel",
    route(async (req, res) => {
      const r = await pool.query(
        "UPDATE media_deliveries SET status='cancelled' WHERE id=$1 AND status IN ('scheduled','failed') RETURNING id",
        [uuid.parse(req.params.id)],
      );
      if (!r.rowCount) {
        res
          .status(409)
          .json({
            error:
              "Yuborilayotgan yoki yuborilgan nashrni bekor qilib bo‘lmaydi.",
          });
        return;
      }
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/media/deliveries/:id/retry",
    route(async (req, res) => {
      const r = await pool.query(
        "UPDATE media_deliveries SET status='scheduled',attempts=0,next_attempt_at=now(),error=NULL WHERE id=$1 AND status='failed' RETURNING id",
        [uuid.parse(req.params.id)],
      );
      if (!r.rowCount) {
        res
          .status(409)
          .json({
            error:
              "Natijasi noaniq nashrni avtomatik takrorlamaymiz. Avval platformada tekshiring.",
          });
        return;
      }
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/media/deliveries/:id/resolve",
    route(async (req, res) => {
      const b = z
        .object({
          published: z.boolean(),
          external_url: z.string().url().optional(),
        })
        .parse(req.body);
      const r = await pool.query(
        "UPDATE media_deliveries SET status=$2,error=NULL,external_url=$3,published_at=CASE WHEN $2='published' THEN now() ELSE NULL END WHERE id=$1 AND status='needs_review' RETURNING id",
        [
          uuid.parse(req.params.id),
          b.published ? "published" : "failed",
          b.external_url || null,
        ],
      );
      if (!r.rowCount) {
        res.status(409).json({ error: "Bu nashr tekshiruv holatida emas." });
        return;
      }
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/media/accounts",
    route(async (_req, res) =>
      res.json(
        (
          await pool.query(
            `SELECT ${accountFields} FROM media_accounts ORDER BY created_at`,
          )
        ).rows,
      ),
    ),
  );
  app.post(
    "/api/media/accounts",
    route(async (req, res) => {
      const b = z
        .object({
          platform: z.enum(["telegram", "instagram"]),
          name: z.string().trim().min(1).max(100),
          external_id: z.string().trim().min(1).max(100),
          access_token: z.string().max(2000).optional(),
        })
        .parse(req.body);
      if (
        b.platform === "telegram" &&
        !/^(@[A-Za-z][A-Za-z0-9_]{4,31}|-?\d+)$/.test(b.external_id)
      ) {
        res
          .status(400)
          .json({
            error: "Kanal uchun @username yoki raqamli chat ID kiriting.",
          });
        return;
      }
      if (
        b.platform === "instagram" &&
        (!/^\d+$/.test(b.external_id) || !b.access_token)
      ) {
        res
          .status(400)
          .json({
            error: "Instagram professional hisob ID va API token kerak.",
          });
        return;
      }
      const r = await pool.query(
        `INSERT INTO media_accounts(platform,name,external_id,credentials) VALUES($1,$2,$3,$4) RETURNING ${accountFields}`,
        [
          b.platform,
          b.name,
          b.external_id,
          b.access_token ? seal({ access_token: b.access_token }) : null,
        ],
      );
      res.status(201).json(r.rows[0]);
    }),
  );
  app.post(
    "/api/media/accounts/:id/verify",
    route(async (req, res) => {
      const a = (
        await pool.query("SELECT * FROM media_accounts WHERE id=$1", [
          uuid.parse(req.params.id),
        ])
      ).rows[0];
      if (!a) {
        res.status(404).json({ error: "Hisob topilmadi." });
        return;
      }
      try {
        const result = await verifyAccount(a);
        await pool.query(
          "UPDATE media_accounts SET verified_at=now(),external_id=$2,name=CASE WHEN platform='youtube' THEN $3 ELSE name END WHERE id=$1",
          [a.id, result.external_id, result.name],
        );
        res.json({ ok: true, name: result.name });
      } catch (e) {
        await pool.query(
          "UPDATE media_accounts SET verified_at=NULL WHERE id=$1",
          [a.id],
        );
        res
          .status(400)
          .json({
            error: e instanceof Error ? e.message : "Ulanishni tekshiring.",
          });
      }
    }),
  );
  app.patch(
    "/api/media/accounts/:id",
    route(async (req, res) => {
      const b = z
          .object({
            enabled: z.boolean().optional(),
            access_token: z.string().min(1).max(2000).optional(),
          })
          .parse(req.body),
        id = uuid.parse(req.params.id);
      await pool.query(
        "UPDATE media_accounts SET enabled=COALESCE($2,enabled),credentials=COALESCE($3,credentials),verified_at=CASE WHEN $3::text IS NULL THEN verified_at ELSE NULL END WHERE id=$1",
        [
          id,
          b.enabled ?? null,
          b.access_token ? seal({ access_token: b.access_token }) : null,
        ],
      );
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/media/rules",
    route(async (_req, res) =>
      res.json(
        (await pool.query("SELECT * FROM media_rules ORDER BY created_at"))
          .rows,
      ),
    ),
  );
  app.post(
    "/api/media/rules",
    route(async (req, res) => {
      const b = ruleSchema.parse(req.body);
      res
        .status(201)
        .json(
          (
            await pool.query(
              "INSERT INTO media_rules(title,content,scope,active) VALUES($1,$2,$3,$4) RETURNING *",
              [b.title, b.content, b.scope, b.active],
            )
          ).rows[0],
        );
    }),
  );
  app.put(
    "/api/media/rules/:id",
    route(async (req, res) => {
      const b = ruleSchema
          .extend({ version: z.number().int().positive() })
          .parse(req.body),
        id = uuid.parse(req.params.id);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const old = (
          await client.query(
            "SELECT * FROM media_rules WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (!old || old.version !== b.version) {
          await client.query("ROLLBACK");
          res
            .status(409)
            .json({ error: "Qoida boshqa joyda yangilangan. Qayta yuklang." });
          return;
        }
        await client.query(
          "INSERT INTO media_rule_history(rule_id,version,title,content,scope,active) VALUES($1,$2,$3,$4,$5,$6)",
          [id, old.version, old.title, old.content, old.scope, old.active],
        );
        const r = await client.query(
          "UPDATE media_rules SET title=$2,content=$3,scope=$4,active=$5,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
          [id, b.title, b.content, b.scope, b.active],
        );
        await client.query("COMMIT");
        res.json(r.rows[0]);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }),
  );
  app.get(
    "/api/media/rules/:id/history",
    route(async (req, res) =>
      res.json(
        (
          await pool.query(
            "SELECT * FROM media_rule_history WHERE rule_id=$1 ORDER BY version DESC",
            [uuid.parse(req.params.id)],
          )
        ).rows,
      ),
    ),
  );
  app.get(
    "/api/media/references",
    route(async (_req, res) =>
      res.json(
        (
          await pool.query(
            "SELECT * FROM media_references ORDER BY created_at DESC",
          )
        ).rows,
      ),
    ),
  );
  app.post(
    "/api/media/references",
    route(async (req, res) => {
      const b = z
        .object({
          title: z.string().trim().min(1).max(150),
          url: z.union([z.string().url(), z.literal("")]).default(""),
          notes: z.string().trim().min(1).max(10000),
          scope: z
            .enum([
              "brand",
              "video",
              "image",
              "carousel",
              "stickman",
              "project",
            ])
            .default("brand"),
        })
        .parse(req.body);
      if (b.url && !["https:", "http:"].includes(new URL(b.url).protocol)) {
        res.status(400).json({ error: "HTTP yoki HTTPS havola kerak." });
        return;
      }
      res
        .status(201)
        .json(
          (
            await pool.query(
              "INSERT INTO media_references(title,url,notes,scope) VALUES($1,$2,$3,$4) RETURNING *",
              [b.title, b.url, b.notes, b.scope],
            )
          ).rows[0],
        );
    }),
  );
  app.delete(
    "/api/media/references/:id",
    route(async (req, res) => {
      await pool.query("DELETE FROM media_references WHERE id=$1", [
        uuid.parse(req.params.id),
      ]);
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/media/jobs",
    route(async (_req, res) =>
      res.json(
        (
          await pool.query(
            "SELECT id,kind,status,result,error,created_at,jsonb_build_object('post_id',payload->>'post_id') AS payload FROM media_jobs ORDER BY created_at DESC LIMIT 30",
          )
        ).rows,
      ),
    ),
  );
  app.post(
    "/api/media/campaigns",
    route(async (req, res) => {
      if (!(
        process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY
      )) {
        res.status(503).json({ error: "OpenAI kaliti sozlanmagan." });
        return;
      }
      const b = campaignSchema.parse(req.body);
      if (suggestedDates(b.month, b.count).length !== b.count) {
        res
          .status(400)
          .json({ error: "To‘liq oylik reja uchun keyingi oyni tanlang." });
        return;
      }
      const busy = await pool.query(
        "SELECT 1 FROM media_jobs WHERE status IN ('queued','running') LIMIT 1",
      );
      if (busy.rowCount) {
        res.status(409).json({ error: "Oldingi AI reja tugashini kuting." });
        return;
      }
      const r = await pool.query(
        "INSERT INTO media_jobs(kind,payload) VALUES('campaign',$1) RETURNING id,status",
        [b],
      );
      res.status(202).json(r.rows[0]);
    }),
  );
  app.get(
    "/api/media/oauth/youtube/start",
    route(async (req, res) => {
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        res
          .status(503)
          .json({
            error:
              "Railwayga GOOGLE_CLIENT_ID va GOOGLE_CLIENT_SECRET qo‘shish kerak.",
          });
        return;
      }
      const state = randomBytes(32).toString("base64url");
      await pool.query(
        "INSERT INTO media_oauth_states(state_hash,session_hash,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
        [hashToken(state), hashToken(requestToken(req)!)],
      );
      const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      u.search = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: `${appBaseUrl()}/api/media/oauth/youtube/callback`,
        response_type: "code",
        scope:
          "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl",
        access_type: "offline",
        prompt: "consent",
        state,
      }).toString();
      res.json({ url: u.href });
    }),
  );
  app.get(
    "/api/media/oauth/youtube/callback",
    route(async (req, res) => {
      const state = String(req.query.state || ""),
        code = String(req.query.code || "");
      const consumed = await pool.query(
        "DELETE FROM media_oauth_states WHERE state_hash=$1 AND session_hash=$2 AND expires_at>now() RETURNING state_hash",
        [hashToken(state), hashToken(requestToken(req)!)],
      );
      if (!consumed.rowCount || !code) {
        console.error("[youtube-oauth] callback rejected", {
          stage: !consumed.rowCount ? "state" : "consent",
          reason: !consumed.rowCount ? "state_expired_or_session_mismatch" : "authorization_code_missing",
        });
        res.redirect("/admin?section=accounts&oauth=failed");
        return;
      }
      let oauthStage = "token";
      let upstreamStatus: number | undefined;
      let upstreamReason: string | undefined;
      try {
        const r = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            redirect_uri: `${appBaseUrl()}/api/media/oauth/youtube/callback`,
            grant_type: "authorization_code",
          }),
          signal: AbortSignal.timeout(30000),
        });
        const c = await r.json();
        upstreamStatus = r.status;
        upstreamReason = typeof c.error === "string" ? c.error : undefined;
        if (!r.ok || !c.refresh_token) {
          upstreamReason ||= "refresh_token_missing";
          throw new Error("OAuth");
        }
        oauthStage = "channel";
        upstreamStatus = undefined;
        upstreamReason = undefined;
        const channels = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
          {
            headers: { Authorization: `Bearer ${c.access_token}` },
            signal: AbortSignal.timeout(30000),
          },
        );
        const d = await channels.json();
        upstreamStatus = channels.status;
        upstreamReason = d.error?.errors?.[0]?.reason;
        if (!channels.ok || !d.items?.[0]) {
          upstreamReason ||= "channel_not_found";
          throw new Error("Channel");
        }
        const expectedChannelId = process.env.YOUTUBE_CHANNEL_ID?.trim();
        const channel = expectedChannelId
          ? d.items.find((item: { id: string }) => item.id === expectedChannelId)
          : d.items[0];
        if (!channel) {
          upstreamReason = "channel_mismatch";
          throw new Error("Channel mismatch");
        }
        oauthStage = "save";
        upstreamStatus = undefined;
        upstreamReason = undefined;
        await pool.query(
          "INSERT INTO media_accounts(platform,name,external_id,credentials,verified_at) VALUES('youtube',$1,$2,$3,now()) ON CONFLICT(platform,external_id) DO UPDATE SET name=EXCLUDED.name,credentials=EXCLUDED.credentials,verified_at=now(),enabled=true",
          [
            channel.snippet.title,
            channel.id,
            seal({ refresh_token: c.refresh_token, scope: c.scope }),
          ],
        );
        console.info("[youtube-oauth] channel saved", {
          channelId: channel.id,
          channelTitle: channel.snippet.title,
          returnedChannelCount: d.items.length,
        });
        res.redirect("/admin?section=accounts&oauth=ok");
      } catch {
        // Log only bounded machine-readable diagnostics, never OAuth codes or tokens.
        console.error("[youtube-oauth] callback failed", {
          stage: oauthStage,
          status: upstreamStatus,
          reason: typeof upstreamReason === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(upstreamReason)
            ? upstreamReason : "request_or_storage_failed",
        });
        res.redirect("/admin?section=accounts&oauth=failed");
      }
    }),
  );
}
export async function checkAssets(ids: string[]) {
  if (!ids.length) return [];
  const rows = (
    await pool.query(
      "SELECT id,mime_type,size FROM media_assets WHERE id=ANY($1::uuid[])",
      [ids],
    )
  ).rows;
  if (new Set(ids).size !== ids.length || rows.length !== ids.length)
    throw new z.ZodError([
      {
        code: "custom",
        path: ["asset_ids"],
        message: "Fayl topilmadi yoki ikki marta tanlangan.",
      },
    ]);
  return ids.map((id) => rows.find((r) => r.id === id));
}
async function checkInstagramCover(p: z.infer<typeof postSchema>) {
  if (!p.variants.instagram_cover_id) return;
  const [cover] = await checkAssets([p.variants.instagram_cover_id]);
  if (!["video", "stickman"].includes(p.format) || cover.mime_type !== "image/jpeg" || cover.size > 8 * 1024 * 1024)
    throw new z.ZodError([{ code: "custom", path: ["variants", "instagram_cover_id"], message: "Reels muqovasi uchun 8 MB gacha JPG va video formati kerak." }]);
}
async function checkYouTubePlaylistAccount(p: z.infer<typeof postSchema>) {
  const binding = p.variants.youtube_playlist;
  if (!binding) return;
  const account = (await pool.query("SELECT platform FROM media_accounts WHERE id=$1", [binding.account_id])).rows[0];
  if (!account || account.platform !== "youtube" || !["video", "stickman"].includes(p.format))
    throw new z.ZodError([{ code: "custom", path: ["variants", "youtube_playlist"], message: "Playlist uchun YouTube hisobi va video formati kerak." }]);
}
async function checkYouTubeCover(p: z.infer<typeof postSchema>) {
  if (!p.variants.youtube_cover_id) return;
  const [cover] = await checkAssets([p.variants.youtube_cover_id]);
  if (!["video", "stickman"].includes(p.format) || !["image/jpeg", "image/png"].includes(cover.mime_type) || cover.size > 50 * 1024 * 1024)
    throw new z.ZodError([{ code: "custom", path: ["variants", "youtube_cover_id"], message: "YouTube muqovasi uchun 50 MB gacha JPG yoki PNG va video formati kerak." }]);
}
async function serveAsset(req: Request, res: Response, id: string, download = false) {
  const a = (
    await pool.query(
      "SELECT name,mime_type,size,data FROM media_assets WHERE id=$1",
      [id],
    )
  ).rows[0];
  if (!a) {
    res.status(404).end();
    return;
  }
  if (download) res.attachment(a.name);
  res.setHeader("Content-Type", a.mime_type);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Accept-Ranges", "bytes");
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) {
      res.status(416).setHeader("Content-Range", `bytes */${a.size}`);
      res.end();
      return;
    }
    const start = Number(match[1]),
      end = match[2] ? Math.min(Number(match[2]), a.size - 1) : a.size - 1;
    if (start >= a.size || start > end) {
      res.status(416).setHeader("Content-Range", `bytes */${a.size}`);
      res.end();
      return;
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${a.size}`);
    res.setHeader("Content-Length", end - start + 1);
    res.end(a.data.subarray(start, end + 1));
    return;
  }
  res.setHeader("Content-Length", a.size);
  res.end(a.data);
}
