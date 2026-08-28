import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  telegramId: text("telegram_id").unique(),
  username: text("username"),
  preferredLang: varchar("preferred_lang", { length: 2 }).default('ar'),
  preferredRegion: text("preferred_region").default('tashkent'),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userProgress = pgTable("user_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  vocabularyId: text("vocabulary_id").notNull(),
  learned: boolean("learned").default(false),
  lastPracticed: timestamp("last_practiced").defaultNow(),
});

export const weatherCache = pgTable("weather_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  regionId: text("region_id").notNull().unique(),
  temperature: integer("temperature"),
  condition: text("condition"),
  humidity: integer("humidity"),
  windSpeed: integer("wind_speed"),
  pressure: integer("pressure"),
  forecastData: text("forecast_data"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const botSettings = pgTable("bot_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  channelId: text("channel_id"),
  dailyMessageEnabled: boolean("daily_message_enabled").default(false),
  dailyMessageTime: text("daily_message_time").default("08:00"),
  dailyRegion: text("daily_region").default("tashkent"),
  lastDailyMessageSent: timestamp("last_daily_message_sent"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const channels = pgTable("channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: text("chat_id").notNull().unique(),
  title: text("title"),
  type: text("type").default("channel"),
  enabled: boolean("enabled").default(true),
  scheduledTime: text("scheduled_time").default("08:00"),
  lastSentAt: timestamp("last_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const newsChannels = pgTable("news_channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: text("chat_id").notNull().unique(),
  title: text("title"),
  enabled: boolean("enabled").default(true),
  scheduledTime: text("scheduled_time").default("09:00"),
  lastSentAt: timestamp("last_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertUserProgressSchema = createInsertSchema(userProgress).omit({
  id: true,
  lastPracticed: true,
});

export const insertWeatherCacheSchema = createInsertSchema(weatherCache).omit({
  id: true,
  updatedAt: true,
});

export const insertBotSettingsSchema = createInsertSchema(botSettings).omit({
  id: true,
  updatedAt: true,
});

export const insertChannelSchema = createInsertSchema(channels).omit({
  id: true,
  createdAt: true,
});

export const insertNewsChannelSchema = createInsertSchema(newsChannels).omit({
  id: true,
  createdAt: true,
});

export const listeningChannels = pgTable("listening_channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: text("chat_id").notNull().unique(),
  title: text("title"),
  enabled: boolean("enabled").default(true),
  scheduledTime: text("scheduled_time").default("10:00"),
  scheduledDays: text("scheduled_days").default("0,1,2,3,4,5,6"),
  scheduledLevels: text("scheduled_levels").default("{}"),
  lastSentAt: timestamp("last_sent_at"),
  currentLevel: text("current_level").default("A1A2"),
  maleVoiceId: text("male_voice_id"),
  femaleVoiceId: text("female_voice_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertListeningChannelSchema = createInsertSchema(listeningChannels).omit({
  id: true,
  createdAt: true,
});

export const readingChannels = pgTable("reading_channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: text("chat_id").notNull().unique(),
  title: text("title"),
  enabled: boolean("enabled").default(true),
  scheduledTime: text("scheduled_time").default("11:00"),
  scheduledDays: text("scheduled_days").default("0,1,2,3,4,5,6"),
  scheduledLevels: text("scheduled_levels").default("{}"),
  lastSentAt: timestamp("last_sent_at"),
  currentLevel: text("current_level").default("A1A2"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReadingChannelSchema = createInsertSchema(readingChannels).omit({
  id: true,
  createdAt: true,
});

export const voiceProfiles = pgTable("voice_profiles", {
  voiceId: text("voice_id").primaryKey(),
  label: text("label").notNull(),
  gender: text("gender").notNull().default("unknown"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const learningContentHistory = pgTable("learning_content_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  channelId: text("channel_id").notNull(),
  contentType: text("content_type").notNull(),
  topicKey: text("topic_key").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const learningDeliveryClaims = pgTable("learning_delivery_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  channelId: text("channel_id").notNull(),
  contentType: text("content_type").notNull(),
  dateKey: text("date_key").notNull(),
  claimedAt: timestamp("claimed_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  uniqueDailyDelivery: uniqueIndex("learning_delivery_claims_daily_unique").on(
    table.channelId,
    table.contentType,
    table.dateKey,
  ),
}));

export const learningTests = pgTable("learning_tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contentType: text("content_type").notNull(),
  titleAr: text("title_ar").notNull(),
  titleUz: text("title_uz").notNull(),
  testDate: text("test_date").notNull(),
  level: text("level").notNull(),
  channelId: text("channel_id").notNull(),
  channelTitle: text("channel_title"),
  payload: text("payload").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVoiceProfileSchema = createInsertSchema(voiceProfiles).omit({
  createdAt: true,
});

export const insertLearningContentHistorySchema = createInsertSchema(learningContentHistory).omit({
  id: true,
  createdAt: true,
});

export const insertLearningTestSchema = createInsertSchema(learningTests).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertUserProgress = z.infer<typeof insertUserProgressSchema>;
export type UserProgress = typeof userProgress.$inferSelect;
export type InsertWeatherCache = z.infer<typeof insertWeatherCacheSchema>;
export type WeatherCache = typeof weatherCache.$inferSelect;
export type InsertBotSettings = z.infer<typeof insertBotSettingsSchema>;
export type BotSettings = typeof botSettings.$inferSelect;
export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type Channel = typeof channels.$inferSelect;
export type InsertNewsChannel = z.infer<typeof insertNewsChannelSchema>;
export type NewsChannel = typeof newsChannels.$inferSelect;
export type InsertListeningChannel = z.infer<typeof insertListeningChannelSchema>;
export type ListeningChannel = typeof listeningChannels.$inferSelect;
export type InsertReadingChannel = z.infer<typeof insertReadingChannelSchema>;
export type ReadingChannel = typeof readingChannels.$inferSelect;
export type InsertVoiceProfile = z.infer<typeof insertVoiceProfileSchema>;
export type VoiceProfile = typeof voiceProfiles.$inferSelect;
export type InsertLearningContentHistory = z.infer<typeof insertLearningContentHistorySchema>;
export type LearningContentHistory = typeof learningContentHistory.$inferSelect;
export type LearningDeliveryClaim = typeof learningDeliveryClaims.$inferSelect;
export type InsertLearningTest = z.infer<typeof insertLearningTestSchema>;
export type LearningTest = typeof learningTests.$inferSelect;
