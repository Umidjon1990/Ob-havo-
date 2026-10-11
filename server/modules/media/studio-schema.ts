import type { Client, Pool } from "pg";
export async function ensureStudioTables(sql: Pool | Client) {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS studio_projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL,
      brief TEXT NOT NULL DEFAULT '', script TEXT NOT NULL DEFAULT '', script_locked BOOLEAN NOT NULL DEFAULT false,
      style_bible TEXT NOT NULL DEFAULT '', format TEXT NOT NULL DEFAULT '9:16',
      reference_asset_ids JSONB NOT NULL DEFAULT '[]', shots JSONB NOT NULL DEFAULT '[]',
      sample_asset_id UUID REFERENCES media_assets(id), audio_asset_id UUID REFERENCES media_assets(id), music_asset_id UUID REFERENCES media_assets(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS studio_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES studio_projects(id),
      kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', idempotency_key TEXT NOT NULL UNIQUE,
      payload JSONB NOT NULL, generation_id TEXT, cost JSONB, result JSONB, error TEXT,
      claim_id UUID, claimed_at TIMESTAMPTZ, poll_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS studio_jobs_due ON studio_jobs(status,poll_at,created_at);
    CREATE TABLE IF NOT EXISTS studio_commands (
      command_id TEXT PRIMARY KEY, operation TEXT NOT NULL, receipt JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
