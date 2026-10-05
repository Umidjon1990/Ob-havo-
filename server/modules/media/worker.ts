import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../../db";
import { openai } from "../../lib/openai";
import {
  campaignSchema,
  postSchema,
  suggestedDates,
  validatePublication,
} from "../../../shared/media";
import { publish, PublishError } from "./providers";
let publicationBusy = false,
  generationBusy = false;
export async function processDelivery() {
  if (publicationBusy) return;
  publicationBusy = true;
  try {
    await pool.query(
      "UPDATE media_deliveries SET status='needs_review',error='Jarayon uzildi. Platformada nashr bo‘lganini tekshiring.' WHERE status='publishing' AND claimed_at<now()-interval '10 minutes'",
    );
    const claim = randomUUID();
    const q = await pool.query(
      `UPDATE media_deliveries SET status='publishing',claim_id=$1,claimed_at=now(),attempts=attempts+1 WHERE id=(SELECT id FROM media_deliveries WHERE status='scheduled' AND scheduled_at<=now() AND next_attempt_at<=now() ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
      [claim],
    );
    const d = q.rows[0];
    if (!d) return;
    try {
      const p = (
        await pool.query("SELECT * FROM media_posts WHERE id=$1", [d.post_id])
      ).rows[0];
      const a = (
        await pool.query("SELECT * FROM media_accounts WHERE id=$1", [
          d.account_id,
        ])
      ).rows[0];
      if (!p || !a || !a.enabled || !a.verified_at)
        throw new PublishError(
          "Post yoki hisob tayyor emas. Ulanishni tekshiring.",
        );
      const found = (
        await pool.query(
          "SELECT id,mime_type,size,data FROM media_assets WHERE id=ANY($1::uuid[])",
          [p.asset_ids],
        )
      ).rows;
      const assets = p.asset_ids.map((id: string) =>
        found.find((v) => v.id === id),
      );
      if (assets.some((a: any) => !a))
        throw new PublishError("Postdagi media fayl topilmadi.");
      const error = validatePublication(
        p,
        a.platform,
        assets.map((a: any) => a.mime_type),
      );
      if (error) throw new PublishError(error);
      const result = await publish(
        p,
        a,
        assets,
        d.provider_state,
        async (state) => {
          await pool.query(
            "UPDATE media_deliveries SET provider_state=$2,claimed_at=now() WHERE id=$1 AND claim_id=$3",
            [d.id, state, claim],
          );
        },
      );
      await pool.query(
        "UPDATE media_deliveries SET status='published',external_id=$2,external_url=$3,published_at=now(),error=$5 WHERE id=$1 AND claim_id=$4",
        [
          d.id,
          result.external_id,
          result.external_url,
          claim,
          "note" in result ? result.note : null,
        ],
      );
    } catch (e) {
      const known = e instanceof PublishError;
      // Unknown failures may follow a successful provider request. Never retry blindly.
      const ambiguous = !known || e.ambiguous;
      const retry = known && e.retryable && !ambiguous && d.attempts < 12;
      await pool.query(
        "UPDATE media_deliveries SET status=$2,error=$3,next_attempt_at=now()+($4::int*interval '1 second') WHERE id=$1 AND claim_id=$5",
        [
          d.id,
          ambiguous ? "needs_review" : retry ? "scheduled" : "failed",
          known ? e.message : "Natija noaniq. Platformada tekshiring.",
          Math.min(900, 30 * 2 ** Math.min(d.attempts, 5)),
          claim,
        ],
      );
    }
  } catch (e) {
    console.error(
      "Media publication worker:",
      e instanceof Error ? e.name : "Unknown",
    );
  } finally {
    publicationBusy = false;
  }
}
const generatedSchema = z.object({
  title: z.string().min(1).max(100),
  caption: z.string().min(1).max(15000),
  telegram: z.string().max(4096),
  instagram: z.string().max(2200),
  youtube: z.string().max(5000),
  production_notes: z.string().max(30000),
});
export async function processGeneration() {
  if (generationBusy) return;
  generationBusy = true;
  let job: any;
  try {
    await pool.query(
      "UPDATE media_jobs SET status='failed',error='AI jarayoni uzildi. Tayyor bo‘lgan qoralamalar kutubxonada saqlangan.' WHERE status='running' AND started_at<now()-interval '10 minutes'",
    );
    job = (
      await pool.query(
        "UPDATE media_jobs SET status='running',started_at=now() WHERE id=(SELECT id FROM media_jobs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *",
      )
    ).rows[0];
    if (!job) return;
    const b = campaignSchema.parse(job.payload),
      dates = suggestedDates(b.month, b.count);
    if (dates.length !== b.count) throw new Error("Month");
    const postIds: string[] = [];
    const previous: string[] = [];
    for (let i = 0; i < b.count; i++) {
      await pool.query("UPDATE media_jobs SET started_at=now() WHERE id=$1", [
        job.id,
      ]);
      const rules = (
        await pool.query(
          "SELECT title,content FROM media_rules WHERE active AND scope=ANY($1::text[]) ORDER BY updated_at DESC",
          [["brand", b.format, ...(b.format === "stickman" ? ["video"] : [])]],
        )
      ).rows;
      const refs = b.reference_ids.length
        ? (
            await pool.query(
              "SELECT title,notes FROM media_references WHERE id=ANY($1::uuid[])",
              [b.reference_ids],
            )
          ).rows
        : [];
      const r = await openai.chat.completions.create(
        {
          model: process.env.MEDIA_TEXT_MODEL || "gpt-5",
          response_format: { type: "json_object" },
          max_completion_tokens: 5000,
          messages: [
            {
              role: "system",
              content: `Siz Zamonaviy Media Agent kontent muharririsiz. Faqat JSON qaytaring: title, caption, telegram, instagram, youtube, production_notes. Bu qoralama; kontent nashr qilindi, video yaratildi yoki namuna havolasi ko‘rildi deb aytmang. Platforma matnlarini alohida moslang. Doimiy qoidalar: ${JSON.stringify(rules)}. Matn sifatli va sodda bo‘lsin. production_notes maydonida ${b.format === "carousel" ? "har bir slayd matni va rasmini" : b.format === "text" ? "post maqsadini" : "video ssenariysi, ovoz matni, kadrlar, vaqtlar, animatsiya, SFX va Higgsfield/HyperFrames uchun aniq rejani"} yozing. Arabcha matn imlosi tekshirilsin.`,
            },
            {
              role: "user",
              content: `Mavzu: ${b.topic}\nFormat: ${b.format}\n${b.month} uchun ${b.count} ta postning ${i + 1}-si. Oldingi sarlavhalarni takrorlamang: ${JSON.stringify(previous)}. Foydalanuvchi kiritgan namuna xulosalari (havolalarning o‘zini ko‘rmagansiz): ${JSON.stringify(refs)}`,
            },
          ],
        },
        { timeout: 120000, maxRetries: 0 },
      );
      const generated = generatedSchema.parse(
        JSON.parse(r.choices[0]?.message?.content || "{}"),
      );
      const p = postSchema.parse({
        title: generated.title,
        caption: generated.caption,
        format: b.format,
        asset_ids: [],
        variants: {
          telegram: generated.telegram,
          instagram: generated.instagram,
          youtube: generated.youtube,
          suggested_at: dates[i],
        },
        production_notes: generated.production_notes,
      });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          "INSERT INTO media_posts(title,caption,format,variants,production_notes) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [p.title, p.caption, p.format, p.variants, p.production_notes],
        );
        postIds.push(inserted.rows[0].id);
        await client.query(
          "UPDATE media_jobs SET result=$2,started_at=now() WHERE id=$1",
          [job.id, { post_ids: postIds }],
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      previous.push(p.title);
    }
    await pool.query(
      "UPDATE media_jobs SET status='completed',completed_at=now(),result=$2 WHERE id=$1",
      [job.id, { post_ids: postIds }],
    );
  } catch (e) {
    if (job)
      await pool.query(
        "UPDATE media_jobs SET status='failed',completed_at=now(),error='AI rejani tugata olmadi. Kalit, xizmat limiti va tayyor qoralamalarni tekshiring.' WHERE id=$1",
        [job.id],
      );
    console.error(
      "Media generation worker:",
      e instanceof Error ? e.name : "Unknown",
    );
  } finally {
    generationBusy = false;
  }
}
export function startMediaWorker() {
  if (process.env.DISABLE_SCHEDULERS === "true") return;
  const timer = setInterval(() => {
    void processDelivery();
    void processGeneration();
  }, 15000);
  timer.unref();
  void processDelivery();
  void processGeneration();
}
