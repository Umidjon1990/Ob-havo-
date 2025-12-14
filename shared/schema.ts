import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";
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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertUserProgress = z.infer<typeof insertUserProgressSchema>;
export type UserProgress = typeof userProgress.$inferSelect;
export type InsertWeatherCache = z.infer<typeof insertWeatherCacheSchema>;
export type WeatherCache = typeof weatherCache.$inferSelect;
