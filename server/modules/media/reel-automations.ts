import { pool } from "../../db";
import { reelPackageSchema, reelResponse } from "../../../shared/reels";

// Bind only after Meta returned a published media ID. Publication never depends
// on this transaction: a failed bind is retried without publishing twice.
export async function syncReelAutomations() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rows = (await client.query(`SELECT d.id,d.account_id,d.external_id,p.title,p.variants
      FROM media_deliveries d JOIN media_posts p ON p.id=d.post_id
      JOIN media_accounts a ON a.id=d.account_id
      WHERE d.status='published' AND a.platform='instagram'
        AND p.variants ? 'reels' AND d.external_id IS NOT NULL
        AND NOT (d.provider_state ? 'reel_bound_at')
      ORDER BY d.published_at FOR UPDATE OF d SKIP LOCKED LIMIT 20`)).rows;
    for (const row of rows) {
      const parsed = reelPackageSchema.safeParse(row.variants.reels);
      if (!parsed.success || !/^\d{5,30}$/.test(row.external_id)) continue;
      const reel = parsed.data;
      const rule = (await client.query(`INSERT INTO media_automations
        (account_id,title,trigger,keywords,action,response,media_id,enabled,require_follow,source_delivery_id)
        VALUES($1,$2,'comment',$3,'private_reply',$4,$5,$6,$7,$8)
        ON CONFLICT(source_delivery_id) DO NOTHING RETURNING id`, [row.account_id,
        row.title.slice(0, 150), JSON.stringify(reel.keywords), reelResponse(reel),
        row.external_id, reel.automation_enabled, reel.require_follow, row.id])).rows[0];
      await client.query(`UPDATE media_deliveries SET provider_state=provider_state || $2::jsonb WHERE id=$1`,
        [row.id, JSON.stringify({reel_bound_at: new Date().toISOString(), ...(rule ? {reel_automation_id: rule.id} : {})})]);
    }
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
}
