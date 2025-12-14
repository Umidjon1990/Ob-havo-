import { db } from "./db";
import { users, weatherCache, userProgress, botSettings, channels } from "@shared/schema";
import type { User, InsertUser, WeatherCache, InsertWeatherCache, UserProgress, InsertUserProgress, BotSettings, InsertBotSettings, Channel, InsertChannel } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByTelegramId(telegramId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPreferences(id: string, lang?: string, region?: string): Promise<User | undefined>;
  
  // Weather cache methods
  getWeatherCache(regionId: string): Promise<WeatherCache | undefined>;
  getAllWeatherCache(): Promise<WeatherCache[]>;
  upsertWeatherCache(cache: InsertWeatherCache): Promise<WeatherCache>;
  
  // User progress methods
  getUserProgress(userId: string): Promise<UserProgress[]>;
  updateVocabularyProgress(progress: InsertUserProgress): Promise<UserProgress>;
  
  // Bot settings methods
  getBotSettings(): Promise<BotSettings | undefined>;
  updateBotSettings(settings: Partial<InsertBotSettings>): Promise<BotSettings>;
  
  // Channel methods
  getChannels(): Promise<Channel[]>;
  getEnabledChannels(): Promise<Channel[]>;
  addChannel(channel: InsertChannel): Promise<Channel>;
  removeChannel(chatId: string): Promise<void>;
  toggleChannel(chatId: string, enabled: boolean): Promise<Channel | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByTelegramId(telegramId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserPreferences(id: string, lang?: string, region?: string): Promise<User | undefined> {
    const updates: Partial<User> = {};
    if (lang) updates.preferredLang = lang as 'ar' | 'uz';
    if (region) updates.preferredRegion = region;
    
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user;
  }

  async getWeatherCache(regionId: string): Promise<WeatherCache | undefined> {
    const [cache] = await db.select().from(weatherCache).where(eq(weatherCache.regionId, regionId)).limit(1);
    return cache;
  }

  async getAllWeatherCache(): Promise<WeatherCache[]> {
    return await db.select().from(weatherCache);
  }

  async upsertWeatherCache(cache: InsertWeatherCache): Promise<WeatherCache> {
    const existing = await this.getWeatherCache(cache.regionId);
    
    if (existing) {
      const [updated] = await db
        .update(weatherCache)
        .set({ ...cache, updatedAt: new Date() })
        .where(eq(weatherCache.regionId, cache.regionId))
        .returning();
      return updated;
    } else {
      const [inserted] = await db.insert(weatherCache).values(cache).returning();
      return inserted;
    }
  }

  async getUserProgress(userId: string): Promise<UserProgress[]> {
    return await db.select().from(userProgress).where(eq(userProgress.userId, userId));
  }

  async updateVocabularyProgress(progress: InsertUserProgress): Promise<UserProgress> {
    const [result] = await db
      .insert(userProgress)
      .values(progress)
      .onConflictDoUpdate({
        target: [userProgress.userId, userProgress.vocabularyId],
        set: { learned: progress.learned, lastPracticed: new Date() }
      })
      .returning();
    return result;
  }

  async getBotSettings(): Promise<BotSettings | undefined> {
    const [settings] = await db.select().from(botSettings).limit(1);
    return settings;
  }

  async updateBotSettings(settings: Partial<InsertBotSettings>): Promise<BotSettings> {
    const existing = await this.getBotSettings();
    
    if (existing) {
      const [updated] = await db
        .update(botSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(botSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db.insert(botSettings).values(settings as InsertBotSettings).returning();
      return inserted;
    }
  }

  async getChannels(): Promise<Channel[]> {
    return await db.select().from(channels);
  }

  async getEnabledChannels(): Promise<Channel[]> {
    return await db.select().from(channels).where(eq(channels.enabled, true));
  }

  async addChannel(channel: InsertChannel): Promise<Channel> {
    const [inserted] = await db.insert(channels).values(channel).returning();
    return inserted;
  }

  async removeChannel(chatId: string): Promise<void> {
    await db.delete(channels).where(eq(channels.chatId, chatId));
  }

  async toggleChannel(chatId: string, enabled: boolean): Promise<Channel | undefined> {
    const [updated] = await db
      .update(channels)
      .set({ enabled })
      .where(eq(channels.chatId, chatId))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
