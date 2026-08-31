import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

async function migrate() {
  await client.connect();
  
  console.log("Creating database tables...");
  
  // Only additive, repeat-safe migrations are allowed here. Existing production
  // data must never be removed automatically during a deploy.
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      telegram_id TEXT UNIQUE,
      username TEXT,
      preferred_lang VARCHAR(2) DEFAULT 'ar',
      preferred_region TEXT DEFAULT 'tashkent',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_progress (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id),
      vocabulary_id TEXT NOT NULL,
      learned BOOLEAN DEFAULT false,
      last_practiced TIMESTAMP DEFAULT NOW()
    );
  `);
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS weather_cache (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      region_id TEXT NOT NULL UNIQUE,
      temperature INTEGER,
      condition TEXT,
      humidity INTEGER,
      wind_speed INTEGER,
      pressure INTEGER,
      forecast_data TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS bot_settings (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      channel_id TEXT,
      daily_message_enabled BOOLEAN DEFAULT false,
      daily_message_time TEXT DEFAULT '08:00',
      daily_region TEXT DEFAULT 'tashkent',
      last_daily_message_sent TIMESTAMP,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS channels (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      chat_id TEXT NOT NULL UNIQUE,
      title TEXT,
      type TEXT DEFAULT 'channel',
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS news_channels (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      chat_id TEXT NOT NULL UNIQUE,
      title TEXT,
      enabled BOOLEAN DEFAULT true,
      scheduled_time TEXT DEFAULT '09:00',
      last_sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS listening_channels (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      chat_id TEXT NOT NULL UNIQUE,
      title TEXT,
      enabled BOOLEAN DEFAULT true,
      scheduled_time TEXT DEFAULT '10:00',
      last_sent_at TIMESTAMP,
      current_level TEXT DEFAULT 'A1A2',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await client.query(`
    ALTER TABLE listening_channels
      ADD COLUMN IF NOT EXISTS scheduled_days TEXT DEFAULT '0,1,2,3,4,5,6',
      ADD COLUMN IF NOT EXISTS scheduled_levels TEXT DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS male_voice_id TEXT,
      ADD COLUMN IF NOT EXISTS female_voice_id TEXT;
  `);
  await client.query(`
    UPDATE listening_channels
    SET scheduled_levels = (
      SELECT COALESCE(
        json_object_agg(day, CASE WHEN listening_channels.current_level = 'B1B2' THEN 'B1B2' ELSE 'A1A2' END)::text,
        '{}'
      )
      FROM unnest(string_to_array(COALESCE(listening_channels.scheduled_days, '0,1,2,3,4,5,6'), ',')) AS day
    )
    WHERE scheduled_levels IS NULL OR scheduled_levels = '{}';
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS reading_channels (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      chat_id TEXT NOT NULL UNIQUE,
      title TEXT,
      enabled BOOLEAN DEFAULT true,
      scheduled_time TEXT DEFAULT '11:00',
      last_sent_at TIMESTAMP,
      current_level TEXT DEFAULT 'A1A2',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await client.query(`
    ALTER TABLE reading_channels
      ADD COLUMN IF NOT EXISTS scheduled_days TEXT DEFAULT '0,1,2,3,4,5,6',
      ADD COLUMN IF NOT EXISTS scheduled_levels TEXT DEFAULT '{}';
  `);
  await client.query(`
    UPDATE reading_channels
    SET scheduled_levels = (
      SELECT COALESCE(
        json_object_agg(day, CASE WHEN reading_channels.current_level = 'B1B2' THEN 'B1B2' ELSE 'A1A2' END)::text,
        '{}'
      )
      FROM unnest(string_to_array(COALESCE(reading_channels.scheduled_days, '0,1,2,3,4,5,6'), ',')) AS day
    )
    WHERE scheduled_levels IS NULL OR scheduled_levels = '{}';
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS voice_profiles (
      voice_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS learning_content_history (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      channel_id TEXT NOT NULL,
      content_type TEXT NOT NULL,
      topic_key TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS learning_delivery_claims (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      channel_id TEXT NOT NULL,
      content_type TEXT NOT NULL,
      date_key TEXT NOT NULL,
      claimed_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP,
      CONSTRAINT learning_delivery_claims_daily_unique UNIQUE (channel_id, content_type, date_key)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS learning_tests (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      content_type TEXT NOT NULL,
      title_ar TEXT NOT NULL,
      title_uz TEXT NOT NULL,
      test_date TEXT NOT NULL,
      level TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_title TEXT,
      payload TEXT NOT NULL,
      audio_base64 TEXT,
      audio_mime_type TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await client.query(`
    ALTER TABLE learning_tests
      ADD COLUMN IF NOT EXISTS audio_base64 TEXT,
      ADD COLUMN IF NOT EXISTS audio_mime_type TEXT;
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS learning_tests_date_idx
      ON learning_tests (test_date DESC, created_at DESC);
  `);
  
  // Insert default bot settings if not exists
  const result = await client.query(`SELECT COUNT(*) FROM bot_settings`);
  if (parseInt(result.rows[0].count) === 0) {
    await client.query(`
      INSERT INTO bot_settings (daily_message_enabled) VALUES (false);
    `);
  }
  
  console.log("Database tables created successfully!");
  await client.end();
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
