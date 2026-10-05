import type { Pool, Client } from "pg";
export async function ensureMediaTables(sql: Pool | Client) {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS media_sessions (token_hash TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS media_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), platform TEXT NOT NULL,
      name TEXT NOT NULL, external_id TEXT NOT NULL DEFAULT '', credentials TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true, verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS media_accounts_identity ON media_accounts(platform,external_id);
    CREATE TABLE IF NOT EXISTS media_assets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL,
      mime_type TEXT NOT NULL, size INTEGER NOT NULL, data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL,
      caption TEXT NOT NULL DEFAULT '', format TEXT NOT NULL DEFAULT 'text',
      asset_ids JSONB NOT NULL DEFAULT '[]', variants JSONB NOT NULL DEFAULT '{}',
      production_notes TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_deliveries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), post_id UUID NOT NULL REFERENCES media_posts(id) ON DELETE CASCADE,
      account_id UUID NOT NULL REFERENCES media_accounts(id), scheduled_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled', attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(), claim_id UUID, claimed_at TIMESTAMPTZ,
      provider_state JSONB NOT NULL DEFAULT '{}', external_id TEXT, external_url TEXT,
      error TEXT, published_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(post_id, account_id)
    );
    CREATE INDEX IF NOT EXISTS media_deliveries_due ON media_deliveries (status, scheduled_at, next_attempt_at);
    CREATE TABLE IF NOT EXISTS media_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), seed_key TEXT UNIQUE,
      scope TEXT NOT NULL DEFAULT 'brand', title TEXT NOT NULL, content TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true, version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_rule_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), rule_id UUID NOT NULL REFERENCES media_rules(id),
      version INTEGER NOT NULL, content TEXT NOT NULL, title TEXT NOT NULL, scope TEXT NOT NULL,
      active BOOLEAN NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_references (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, url TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'brand', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), kind TEXT NOT NULL, payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued', result JSONB, error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS media_oauth_states (
      state_hash TEXT PRIMARY KEY, session_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL
    );
  `);
  const defaults = [
    [
      "audience",
      "brand",
      "Auditoriya va tushuntirish",
      "Arab tilini o‘rganadigan o‘zbek auditoriyasi. Bir vaqtda bitta fikr, sodda tushuntirish. Arabcha misollar arab yozuvida, RTL, harflar, harakat va talaffuz tekshirilsin. O‘qishga yetarli vaqt berilsin.",
    ],
    [
      "quality",
      "brand",
      "Tasvir sifati",
      "Tiniq tasvirlar, tartibli kompozitsiya, izchil uslub. Asl muqova va logo tafsilotlari saqlansin. Arabcha yozuv alohida tahrirlanadigan matn qatlamida bo‘lsin.",
    ],
    [
      "motion",
      "video",
      "Montaj va ovoz",
      "Mazmunga mos pop-up, scale-pop, bounce, slide, typing, zoom, silliq kamera. Pop, whoosh, tick va click SFX harakatga sinxron. Musiqa nutq ostida pasayadi. Matnni o‘qishga vaqt berilsin. Presenter katta, kichik va infografika ko‘rinishida navbatlashadi. Reels/Shorts uchun odatiy format 9:16.",
    ],
    [
      "tools",
      "video",
      "Yaratish vositalari",
      "Higgsfield va HyperFrames vazifaga mos ishlatiladi. Bepul yoki mavjud imkoniyatlar afzal. Kitob mockupi yuzaga mahkam, varaqlash tabiiy. Har bir videoning davomiyligi alohida belgilanadi.",
    ],
    [
      "stickman",
      "stickman",
      "Ikki qahramon",
      "Tasdiqlangan referens asosida izchil ikki 3D stickman, o‘zbekcha yoki arabcha dialog, harakatli matn, SFX va silliq kamera. Sinov namunasini tasdiqlangan yakuniy dizayn deb olmang.",
    ],
    [
      "references",
      "brand",
      "Namunalardan o‘rganish",
      "Namuna hook, ritm, kadr, kamera, matn, o‘qish vaqti, musiqa, SFX va yakun bo‘yicha tahlil qilinadi. Faqat ochiq ko‘rilgan yoki foydalanuvchi bergan dalilga tayaning. Tasdiqlangan doimiy qoida saqlanadi; bir martalik tanlov umumiy qoida bo‘lmaydi.",
    ],
  ];
  for (const [key, scope, title, content] of defaults)
    await sql.query(
      "INSERT INTO media_rules(seed_key,scope,title,content) VALUES($1,$2,$3,$4) ON CONFLICT(seed_key) DO NOTHING",
      [key, scope, title, content],
    );
}
