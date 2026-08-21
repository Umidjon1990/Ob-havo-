import { db } from "./db";
import { users, weatherCache, userProgress, botSettings, channels, newsChannels, listeningChannels, readingChannels, voiceProfiles, learningContentHistory, learningDeliveryClaims } from "@shared/schema";
import type { User, InsertUser, WeatherCache, InsertWeatherCache, UserProgress, InsertUserProgress, BotSettings, InsertBotSettings, Channel, InsertChannel, NewsChannel, InsertNewsChannel, ListeningChannel, InsertListeningChannel, ReadingChannel, InsertReadingChannel, VoiceProfile } from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";

export const DEFAULT_VOICE_IDS = [
  "G1HOkzin3NMwRHSq60UI",
  "vY0W52tbYe3pDfogQWP7",
  "w4LX7bK479eHGM1k15Em",
  "XdoLPWNt7ytn6BtU4FBf",
  "tavIIPLplRB883FzWU0V",
  "qi4PkV9c01kb869Vh7Su",
  "rUaPbzcZIu8df8iNL9WZ",
  "EUojVLG1QfxaqqH4ce6s",
  "gMB389pj77Qe5nErWNjd",
];

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
  updateChannelSchedule(chatId: string, scheduledTime: string): Promise<Channel | undefined>;
  updateChannelLastSent(chatId: string): Promise<void>;

  // News channel methods
  getNewsChannels(): Promise<NewsChannel[]>;
  getEnabledNewsChannels(): Promise<NewsChannel[]>;
  addNewsChannel(channel: InsertNewsChannel): Promise<NewsChannel>;
  removeNewsChannel(chatId: string): Promise<void>;
  toggleNewsChannel(chatId: string, enabled: boolean): Promise<NewsChannel | undefined>;
  updateNewsChannelSchedule(chatId: string, scheduledTime: string): Promise<NewsChannel | undefined>;
  updateNewsChannelLastSent(chatId: string): Promise<void>;

  // Listening channel methods
  getListeningChannels(): Promise<ListeningChannel[]>;
  getListeningChannel(chatId: string): Promise<ListeningChannel | undefined>;
  getEnabledListeningChannels(): Promise<ListeningChannel[]>;
  addListeningChannel(channel: InsertListeningChannel): Promise<ListeningChannel>;
  removeListeningChannel(chatId: string): Promise<void>;
  toggleListeningChannel(chatId: string, enabled: boolean): Promise<ListeningChannel | undefined>;
  updateListeningChannelSchedule(chatId: string, scheduledTime: string, scheduledDays: string, scheduledLevels: string): Promise<ListeningChannel | undefined>;
  updateListeningChannelVoices(chatId: string, maleVoiceId: string | null, femaleVoiceId: string | null): Promise<ListeningChannel | undefined>;
  updateListeningChannelAfterSend(chatId: string): Promise<void>;
  updateListeningChannelLevel(chatId: string, level: string): Promise<ListeningChannel | undefined>;

  // Reading channel methods
  getReadingChannels(): Promise<ReadingChannel[]>;
  getReadingChannel(chatId: string): Promise<ReadingChannel | undefined>;
  getEnabledReadingChannels(): Promise<ReadingChannel[]>;
  addReadingChannel(channel: InsertReadingChannel): Promise<ReadingChannel>;
  removeReadingChannel(chatId: string): Promise<void>;
  toggleReadingChannel(chatId: string, enabled: boolean): Promise<ReadingChannel | undefined>;
  updateReadingChannelSchedule(chatId: string, scheduledTime: string, scheduledDays: string, scheduledLevels: string): Promise<ReadingChannel | undefined>;
  updateReadingChannelAfterSend(chatId: string): Promise<void>;
  updateReadingChannelLevel(chatId: string, level: string): Promise<ReadingChannel | undefined>;

  // Learning content and voices
  getVoiceProfiles(): Promise<VoiceProfile[]>;
  updateVoiceProfile(voiceId: string, updates: Pick<VoiceProfile, "label" | "gender">): Promise<VoiceProfile | undefined>;
  getRecentTopicKeys(channelId: string, contentType: "listening" | "reading", limit?: number): Promise<string[]>;
  recordTopic(channelId: string, contentType: "listening" | "reading", topicKey: string): Promise<void>;
  claimLearningDelivery(channelId: string, contentType: "listening" | "reading", dateKey: string): Promise<boolean>;
  completeLearningDelivery(channelId: string, contentType: "listening" | "reading", dateKey: string): Promise<void>;
  releaseLearningDelivery(channelId: string, contentType: "listening" | "reading", dateKey: string): Promise<void>;
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

  async updateChannelSchedule(chatId: string, scheduledTime: string): Promise<Channel | undefined> {
    const [updated] = await db
      .update(channels)
      .set({ scheduledTime })
      .where(eq(channels.chatId, chatId))
      .returning();
    return updated;
  }

  async updateChannelLastSent(chatId: string): Promise<void> {
    await db
      .update(channels)
      .set({ lastSentAt: new Date() })
      .where(eq(channels.chatId, chatId));
  }

  async getNewsChannels(): Promise<NewsChannel[]> {
    return await db.select().from(newsChannels);
  }

  async getEnabledNewsChannels(): Promise<NewsChannel[]> {
    return await db.select().from(newsChannels).where(eq(newsChannels.enabled, true));
  }

  async addNewsChannel(channel: InsertNewsChannel): Promise<NewsChannel> {
    const [inserted] = await db.insert(newsChannels).values(channel).returning();
    return inserted;
  }

  async removeNewsChannel(chatId: string): Promise<void> {
    await db.delete(newsChannels).where(eq(newsChannels.chatId, chatId));
  }

  async toggleNewsChannel(chatId: string, enabled: boolean): Promise<NewsChannel | undefined> {
    const [updated] = await db
      .update(newsChannels)
      .set({ enabled })
      .where(eq(newsChannels.chatId, chatId))
      .returning();
    return updated;
  }

  async updateNewsChannelSchedule(chatId: string, scheduledTime: string): Promise<NewsChannel | undefined> {
    const [updated] = await db
      .update(newsChannels)
      .set({ scheduledTime })
      .where(eq(newsChannels.chatId, chatId))
      .returning();
    return updated;
  }

  async updateNewsChannelLastSent(chatId: string): Promise<void> {
    await db
      .update(newsChannels)
      .set({ lastSentAt: new Date() })
      .where(eq(newsChannels.chatId, chatId));
  }

  async getListeningChannels(): Promise<ListeningChannel[]> {
    return await db.select().from(listeningChannels);
  }

  async getListeningChannel(chatId: string): Promise<ListeningChannel | undefined> {
    const [channel] = await db.select().from(listeningChannels).where(eq(listeningChannels.chatId, chatId)).limit(1);
    return channel;
  }

  async getEnabledListeningChannels(): Promise<ListeningChannel[]> {
    return await db.select().from(listeningChannels).where(eq(listeningChannels.enabled, true));
  }

  async addListeningChannel(channel: InsertListeningChannel): Promise<ListeningChannel> {
    const [inserted] = await db.insert(listeningChannels).values(channel).returning();
    return inserted;
  }

  async removeListeningChannel(chatId: string): Promise<void> {
    await db.delete(listeningChannels).where(eq(listeningChannels.chatId, chatId));
  }

  async toggleListeningChannel(chatId: string, enabled: boolean): Promise<ListeningChannel | undefined> {
    const [updated] = await db
      .update(listeningChannels)
      .set({ enabled })
      .where(eq(listeningChannels.chatId, chatId))
      .returning();
    return updated;
  }

  async updateListeningChannelSchedule(chatId: string, scheduledTime: string, scheduledDays: string, scheduledLevels: string): Promise<ListeningChannel | undefined> {
    const [updated] = await db
      .update(listeningChannels)
      .set({ scheduledTime, scheduledDays, scheduledLevels })
      .where(eq(listeningChannels.chatId, chatId))
      .returning();
    return updated;
  }

  async updateListeningChannelVoices(chatId: string, maleVoiceId: string | null, femaleVoiceId: string | null): Promise<ListeningChannel | undefined> {
    const [updated] = await db
      .update(listeningChannels)
      .set({ maleVoiceId, femaleVoiceId })
      .where(eq(listeningChannels.chatId, chatId))
      .returning();
    return updated;
  }

  async updateListeningChannelAfterSend(chatId: string): Promise<void> {
    await db
      .update(listeningChannels)
      .set({ lastSentAt: new Date() })
      .where(eq(listeningChannels.chatId, chatId));
  }

  async updateListeningChannelLevel(chatId: string, level: string): Promise<ListeningChannel | undefined> {
    const [updated] = await db
      .update(listeningChannels)
      .set({ currentLevel: level })
      .where(eq(listeningChannels.chatId, chatId))
      .returning();
    return updated;
  }

  async getReadingChannels(): Promise<ReadingChannel[]> {
    return await db.select().from(readingChannels);
  }

  async getReadingChannel(chatId: string): Promise<ReadingChannel | undefined> {
    const [channel] = await db.select().from(readingChannels).where(eq(readingChannels.chatId, chatId)).limit(1);
    return channel;
  }

  async getEnabledReadingChannels(): Promise<ReadingChannel[]> {
    return await db.select().from(readingChannels).where(eq(readingChannels.enabled, true));
  }

  async addReadingChannel(channel: InsertReadingChannel): Promise<ReadingChannel> {
    const [inserted] = await db.insert(readingChannels).values(channel).returning();
    return inserted;
  }

  async removeReadingChannel(chatId: string): Promise<void> {
    await db.delete(readingChannels).where(eq(readingChannels.chatId, chatId));
  }

  async toggleReadingChannel(chatId: string, enabled: boolean): Promise<ReadingChannel | undefined> {
    const [updated] = await db
      .update(readingChannels)
      .set({ enabled })
      .where(eq(readingChannels.chatId, chatId))
      .returning();
    return updated;
  }

  async updateReadingChannelSchedule(chatId: string, scheduledTime: string, scheduledDays: string, scheduledLevels: string): Promise<ReadingChannel | undefined> {
    const [updated] = await db
      .update(readingChannels)
      .set({ scheduledTime, scheduledDays, scheduledLevels })
      .where(eq(readingChannels.chatId, chatId))
      .returning();
    return updated;
  }

  async updateReadingChannelAfterSend(chatId: string): Promise<void> {
    await db
      .update(readingChannels)
      .set({ lastSentAt: new Date() })
      .where(eq(readingChannels.chatId, chatId));
  }

  async updateReadingChannelLevel(chatId: string, level: string): Promise<ReadingChannel | undefined> {
    const [updated] = await db
      .update(readingChannels)
      .set({ currentLevel: level })
      .where(eq(readingChannels.chatId, chatId))
      .returning();
    return updated;
  }

  private async ensureDefaultVoiceProfiles(): Promise<void> {
    await db
      .insert(voiceProfiles)
      .values(DEFAULT_VOICE_IDS.map((voiceId, index) => ({
        voiceId,
        label: `Voice ${index + 1}`,
        gender: "unknown",
      })))
      .onConflictDoNothing();
  }

  async getVoiceProfiles(): Promise<VoiceProfile[]> {
    await this.ensureDefaultVoiceProfiles();
    return await db.select().from(voiceProfiles).orderBy(voiceProfiles.label);
  }

  async updateVoiceProfile(voiceId: string, updates: Pick<VoiceProfile, "label" | "gender">): Promise<VoiceProfile | undefined> {
    await this.ensureDefaultVoiceProfiles();
    const [updated] = await db
      .update(voiceProfiles)
      .set(updates)
      .where(eq(voiceProfiles.voiceId, voiceId))
      .returning();
    return updated;
  }

  async getRecentTopicKeys(channelId: string, contentType: "listening" | "reading", limit = 18): Promise<string[]> {
    const rows = await db
      .select({ topicKey: learningContentHistory.topicKey })
      .from(learningContentHistory)
      .where(and(
        eq(learningContentHistory.channelId, channelId),
        eq(learningContentHistory.contentType, contentType),
      ))
      .orderBy(desc(learningContentHistory.createdAt))
      .limit(limit);
    return rows.map(row => row.topicKey);
  }

  async recordTopic(channelId: string, contentType: "listening" | "reading", topicKey: string): Promise<void> {
    await db.insert(learningContentHistory).values({ channelId, contentType, topicKey });
  }

  async claimLearningDelivery(channelId: string, contentType: "listening" | "reading", dateKey: string): Promise<boolean> {
    const claim = await db
      .insert(learningDeliveryClaims)
      .values({ channelId, contentType, dateKey })
      .onConflictDoNothing()
      .returning({ id: learningDeliveryClaims.id });
    return claim.length === 1;
  }

  async completeLearningDelivery(channelId: string, contentType: "listening" | "reading", dateKey: string): Promise<void> {
    await db
      .update(learningDeliveryClaims)
      .set({ completedAt: new Date() })
      .where(and(
        eq(learningDeliveryClaims.channelId, channelId),
        eq(learningDeliveryClaims.contentType, contentType),
        eq(learningDeliveryClaims.dateKey, dateKey),
      ));
  }

  async releaseLearningDelivery(channelId: string, contentType: "listening" | "reading", dateKey: string): Promise<void> {
    await db
      .delete(learningDeliveryClaims)
      .where(and(
        eq(learningDeliveryClaims.channelId, channelId),
        eq(learningDeliveryClaims.contentType, contentType),
        eq(learningDeliveryClaims.dateKey, dateKey),
      ));
  }
}

export const storage = new DatabaseStorage();
