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
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      telegram_id VARCHAR(50) UNIQUE NOT NULL,
      username VARCHAR(100),
      preferred_lang VARCHAR(10) DEFAULT 'uz',
      preferred_region VARCHAR(50) DEFAULT 'toshkent',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS weather_cache (
      id SERIAL PRIMARY KEY,
      region_id VARCHAR(50) UNIQUE NOT NULL,
      temperature INTEGER,
      condition VARCHAR(100),
      humidity INTEGER,
      wind_speed INTEGER,
      pressure INTEGER,
      forecast_data TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS bot_settings (
      id SERIAL PRIMARY KEY,
      channel_id VARCHAR(100),
      daily_message_enabled BOOLEAN DEFAULT false,
      daily_message_time VARCHAR(10) DEFAULT '08:00',
      daily_region VARCHAR(50) DEFAULT 'toshkent',
      last_daily_message_sent TIMESTAMP
    );
  `);
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS channels (
      id SERIAL PRIMARY KEY,
      chat_id VARCHAR(100) UNIQUE NOT NULL,
      title VARCHAR(200),
      type VARCHAR(20) DEFAULT 'channel',
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  
  await client.query(`
    INSERT INTO bot_settings (id, daily_message_enabled) 
    VALUES (1, false) 
    ON CONFLICT (id) DO NOTHING;
  `);
  
  console.log("Database tables created successfully!");
  await client.end();
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
