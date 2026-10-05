import { pool } from "../../db";
import { validatePublication } from "../../../shared/media";
export class ScheduleError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function schedulePublications(
  items: { post_id: string; scheduled_at: string }[],
  accountIds: string[],
) {
  const ids = Array.from(new Set(accountIds));
  if (new Set(items.map((i) => i.post_id)).size !== items.length)
    throw new ScheduleError("Bir post ro‘yxatda ikki marta tanlangan.");
  if (
    items.some((i) => new Date(i.scheduled_at).getTime() < Date.now() - 60000)
  )
    throw new ScheduleError("Kelajakdagi sana va vaqtni tanlang.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const accounts = (
      await client.query(
        "SELECT * FROM media_accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE",
        [ids],
      )
    ).rows;
    if (
      accounts.length !== ids.length ||
      accounts.some((a) => !a.enabled || !a.verified_at)
    )
      throw new ScheduleError(
        "Tanlangan hisoblarni avval ulang va tekshiring.",
      );
    const posts = (
      await client.query(
        "SELECT * FROM media_posts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [items.map((i) => i.post_id)],
      )
    ).rows;
    if (posts.length !== items.length)
      throw new ScheduleError("Post topilmadi.", 404);
    for (const post of posts) {
      if ((await client.query("SELECT 1 FROM media_jobs WHERE kind='explainer' AND status IN ('queued','running') AND payload->>'post_id'=$1",[post.id])).rowCount) throw new ScheduleError(`${post.title}: video tayyorlanishini kuting.`,409);
      const assets = (
        await client.query(
          "SELECT id,mime_type FROM media_assets WHERE id=ANY($1::uuid[])",
          [post.asset_ids],
        )
      ).rows;
      if (assets.length !== post.asset_ids.length)
        throw new ScheduleError(`${post.title}: media fayl topilmadi.`);
      const mimes = post.asset_ids.map(
        (id: string) => assets.find((a) => a.id === id).mime_type,
      );
      for (const a of accounts) {
        const error = validatePublication(post, a.platform, mimes);
        if (error) throw new ScheduleError(`${post.title}: ${error}`);
      }
      const existing = await client.query(
        "SELECT 1 FROM media_deliveries WHERE post_id=$1 AND account_id=ANY($2::uuid[]) AND status<>'cancelled'",
        [post.id, ids],
      );
      if (existing.rowCount)
        throw new ScheduleError(
          `${post.title}: shu hisob uchun allaqachon rejalashtirilgan yoki yuborilgan.`,
          409,
        );
    }
    for (const item of items)
      for (const account of accounts)
        await client.query(
          `INSERT INTO media_deliveries(post_id,account_id,scheduled_at) VALUES($1,$2,$3) ON CONFLICT(post_id,account_id) DO UPDATE SET status='scheduled',scheduled_at=EXCLUDED.scheduled_at,next_attempt_at=now(),attempts=0,claim_id=NULL,claimed_at=NULL,error=NULL,provider_state='{}'`,
          [item.post_id, account.id, item.scheduled_at],
        );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
