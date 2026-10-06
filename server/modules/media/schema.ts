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
    ALTER TABLE media_accounts ADD COLUMN IF NOT EXISTS instagram_user_id TEXT;
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
    CREATE TABLE IF NOT EXISTS media_automation_config (
      id INTEGER PRIMARY KEY CHECK(id=1), secrets TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE media_automation_config ADD COLUMN IF NOT EXISTS last_receipt JSONB;
    CREATE TABLE IF NOT EXISTS media_automations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id UUID NOT NULL REFERENCES media_accounts(id),
      title TEXT NOT NULL, trigger TEXT NOT NULL, keywords JSONB NOT NULL, action TEXT NOT NULL,
      response TEXT NOT NULL DEFAULT '', media_id TEXT NOT NULL DEFAULT '', enabled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_interactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id UUID NOT NULL REFERENCES media_accounts(id),
      event_key TEXT NOT NULL, kind TEXT NOT NULL, external_id TEXT NOT NULL, sender_id TEXT NOT NULL,
      media_id TEXT NOT NULL DEFAULT '', text TEXT NOT NULL DEFAULT '', occurred_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'received', response TEXT, error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(account_id,event_key)
    );
    ALTER TABLE media_interactions ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS media_insights (
      delivery_id UUID PRIMARY KEY REFERENCES media_deliveries(id) ON DELETE CASCADE,
      metrics JSONB NOT NULL DEFAULT '{}', errors JSONB NOT NULL DEFAULT '{}', collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_oauth_states (
      state_hash TEXT PRIMARY KEY, session_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL
    );
  `);
  const defaults = [
    ["vocabulary-layout-v2", "brand", "So‘z boyligi post tartibi", "Kuchli hook → bugungi iboralar → rasmli karusel → video → audio va chiroyli dizaynda doim ko‘rinadigan misollar → test → Zamonaviy ta’lim. Tuzuvchi: U. Abdurayimov. Ixcham matn. Talaffuz mashqi va kichik vazifa qo‘shilmasin. Tarjimadan tashqari ma’no va kichik farqlar tushuntirilsin."],
    ["visual-cartoon-v2", "brand", "Rangli 3D dizayn", "Yorqin professional animatsion 3D cartoon, izchil erkak yoki o‘g‘il bola qahramonlar, neytral vaziyatlar, diniy misollarsiz. Sodda yoki bo‘sh maket bo‘lmasin. Coverda kuchli hook va yirik yozuv markazda; yuqori-pastki kesim va profil ko‘rinishi tekshirilsin, pastda ortiqcha bo‘sh joy bo‘lmasin."],
    ["voice-portable-v2", "brand", "Klon ovoz va platformalar", "Arabcha va o‘zbekcha matn foydalanuvchining tanlangan klon ovozida o‘qilsin. Voice ID taxmin qilinmasin. Ovoz skriptida karuselni o‘tkazing, Telegram kanalidagi kabi platformaga xos iboralar bo‘lmasin. Telegramga mos yengil video, Instagram/YouTubega yuqori sifatli nusxa. Har safar avval kuchli ishlab chiqarish prompti yozilsin."],
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
