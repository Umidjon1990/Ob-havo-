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
  
  // Drop old incompatible tables if they have wrong schema
  const tablesResult = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name IN ('users', 'user_progress', 'weather_cache', 'bot_settings', 'channels')
  `);
  
  const existingTables = tablesResult.rows.map(r => r.table_name);
  
  // Check if users table has integer id (old schema)
  if (existingTables.includes('users')) {
    const colResult = await client.query(`
      SELECT data_type FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'id'
    `);
    if (colResult.rows[0]?.data_type === 'integer') {
      console.log("Dropping old tables with incompatible schema...");
      await client.query(`DROP TABLE IF EXISTS user_progress CASCADE`);
      await client.query(`DROP TABLE IF EXISTS users CASCADE`);
    }
  }
  
  // Check if weather_cache has integer id
  if (existingTables.includes('weather_cache')) {
    const colResult = await client.query(`
      SELECT data_type FROM information_schema.columns 
      WHERE table_name = 'weather_cache' AND column_name = 'id'
    `);
    if (colResult.rows[0]?.data_type === 'integer') {
      await client.query(`DROP TABLE IF EXISTS weather_cache CASCADE`);
    }
  }
  
  // Check if bot_settings has integer id
  if (existingTables.includes('bot_settings')) {
    const colResult = await client.query(`
      SELECT data_type FROM information_schema.columns 
      WHERE table_name = 'bot_settings' AND column_name = 'id'
    `);
    if (colResult.rows[0]?.data_type === 'integer') {
      await client.query(`DROP TABLE IF EXISTS bot_settings CASCADE`);
    }
  }
  
  // Check if channels has integer id
  if (existingTables.includes('channels')) {
    const colResult = await client.query(`
      SELECT data_type FROM information_schema.columns 
      WHERE table_name = 'channels' AND column_name = 'id'
    `);
    if (colResult.rows[0]?.data_type === 'integer') {
      await client.query(`DROP TABLE IF EXISTS channels CASCADE`);
    }
  }
  
  // Create tables with correct schema
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
  
  // Insert default bot settings if not exists
  const result = await client.query(`SELECT COUNT(*) FROM bot_settings`);
  if (parseInt(result.rows[0].count) === 0) {
    await client.query(`
      INSERT INTO bot_settings (daily_message_enabled) VALUES (false);
    `);
  }
  
  console.log("Database tables created successfully!");
  await client.end();
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
