import type { Express, NextFunction, Request, Response } from "express";
import { createServer, type Server } from "http";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { handleTelegramUpdate, sendTelegramMessage, setTelegramWebhook, sendDailyNewsToChannel, sendDailyListeningToChannel, sendDailyReadingToChannel } from "./lib/telegram";
import { generateWeatherAdvice, generateVocabularyExample, generateNewVocabulary } from "./lib/openai";
import { updateWeatherCache } from "./lib/weather";
import { generateVoicePreview, textToSpeechArabic } from "./lib/listening";
import { isValidScheduledTime, normalizeWeekdayLevelSchedule, serializeScheduledDays, serializeWeekdayLevelSchedule } from "./lib/learning-schedule";
import {
  createLearningTestDocx,
  createLearningTestsDocx,
  type LearningDocumentItem,
  type LearningDocumentMeta,
  type LearningTestPayload,
} from "./lib/learning-docx";
import { createLearningTestPdf, createLearningTestsPdf } from "./lib/learning-pdf";
import { regions } from "../client/src/data/regions";
import { vocabulary } from "../client/src/data/vocabulary";

// Admin credentials from environment variables
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Simple token storage (in production use Redis/DB)
const validTokens = new Set<string>();
const archiveAudioGenerations = new Map<string, Promise<Buffer | null>>();

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  return validTokens.has(token);
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!verifyToken(token)) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  next();
}

function parseLearningPayload(value: string): LearningTestPayload | null {
  try {
    return JSON.parse(value) as LearningTestPayload;
  } catch {
    return null;
  }
}

async function getOrCreateArchiveAudio(
  test: {
    id: string;
    contentType: string;
    channelId: string;
    audioBase64: string | null;
  },
  payload: LearningTestPayload,
): Promise<Buffer | null> {
  if (test.audioBase64) return Buffer.from(test.audioBase64, "base64");
  if (test.contentType !== "listening" || payload.contentType !== "listening") return null;

  const activeGeneration = archiveAudioGenerations.get(test.id);
  if (activeGeneration) return activeGeneration;

  const generation = (async () => {
    const channel = await storage.getListeningChannel(test.channelId);
    const audio = await textToSpeechArabic(payload.passage, {
      maleVoiceId: channel?.maleVoiceId,
      femaleVoiceId: channel?.femaleVoiceId,
    });
    if (audio) {
      await storage.updateLearningTestAudio(test.id, audio.toString("base64"), "audio/mpeg");
    }
    return audio;
  })().finally(() => archiveAudioGenerations.delete(test.id));

  archiveAudioGenerations.set(test.id, generation);
  return generation;
}

function learningDocumentMeta(test: {
  contentType: string;
  titleAr: string;
  titleUz: string;
  testDate: string;
  level: string;
  channelTitle: string | null;
}): LearningDocumentMeta {
  return {
    contentType: test.contentType as "listening" | "reading",
    titleAr: test.titleAr,
    titleUz: test.titleUz,
    testDate: test.testDate,
    level: test.level,
    channelTitle: test.channelTitle,
  };
}

function safeTestName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 70) || "arabic-test";
}

function setDownloadHeaders(res: Response, mimeType: string, filename: string, cache = false): void {
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader("Cache-Control", cache ? "public, max-age=3600" : "private, no-store");
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Admin login
  app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;
    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
      return res.status(503).json({ success: false, error: "Admin credentials are not configured" });
    }
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const token = generateToken();
      validTokens.add(token);
      res.json({ success: true, token });
    } else {
      res.status(401).json({ success: false, error: "Login yoki parol xato" });
    }
  });

  // Verify token
  app.post("/api/admin/verify", (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (verifyToken(token)) {
      res.json({ valid: true });
    } else {
      res.status(401).json({ valid: false });
    }
  });

  // Admin logout
  app.post("/api/admin/logout", (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) validTokens.delete(token);
    res.json({ success: true });
  });

  // Health check endpoint for keep-alive pings
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Public learning test archive. Payloads are intentionally excluded from the list response.
  app.get("/api/tests", async (req, res) => {
    try {
      const requestedType = typeof req.query.type === "string" ? req.query.type : undefined;
      const requestedLevel = typeof req.query.level === "string" ? req.query.level : undefined;
      const topic = typeof req.query.topic === "string" ? req.query.topic.trim().slice(0, 120) : undefined;
      const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
      const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
      if (requestedType && requestedType !== "listening" && requestedType !== "reading") {
        return res.status(400).json({ error: "type must be listening or reading" });
      }
      if (requestedLevel && requestedLevel !== "A1A2" && requestedLevel !== "B1B2") {
        return res.status(400).json({ error: "level must be A1A2 or B1B2" });
      }
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      if ((dateFrom && !datePattern.test(dateFrom)) || (dateTo && !datePattern.test(dateTo))) {
        return res.status(400).json({ error: "Dates must use YYYY-MM-DD format" });
      }
      if (dateFrom && dateTo && dateFrom > dateTo) {
        return res.status(400).json({ error: "dateFrom cannot be after dateTo" });
      }
      const rawLimit = Number(req.query.limit || 100);
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 100;
      const tests = await storage.getLearningTests({
        contentType: requestedType as "listening" | "reading" | undefined,
        level: requestedLevel as "A1A2" | "B1B2" | undefined,
        topic,
        dateFrom,
        dateTo,
        limit,
      });
      res.json(tests);
    } catch (error) {
      console.error("Failed to fetch learning tests:", error);
      res.status(500).json({ error: "Failed to fetch learning tests" });
    }
  });

  app.get("/api/tests/:id/docx", async (req, res) => {
    try {
      const test = await storage.getLearningTest(req.params.id);
      if (!test) return res.status(404).json({ error: "Test not found" });

      const payload = parseLearningPayload(test.payload);
      if (!payload) return res.status(500).json({ error: "Stored test payload is invalid" });
      const document = await createLearningTestDocx(learningDocumentMeta(test), payload);

      const safeName = safeTestName(test.titleUz);
      const typeName = test.contentType === "listening" ? "tinglash" : "oqish";
      const filename = `${typeName}-${test.testDate}-${safeName}.docx`;
      setDownloadHeaders(res, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename, true);
      res.send(document);
    } catch (error) {
      console.error("Failed to create learning test document:", error);
      res.status(500).json({ error: "Failed to create test document" });
    }
  });

  app.get("/api/tests/:id/pdf", async (req, res) => {
    try {
      const test = await storage.getLearningTest(req.params.id);
      if (!test) return res.status(404).json({ error: "Test not found" });
      const payload = parseLearningPayload(test.payload);
      if (!payload) return res.status(500).json({ error: "Stored test payload is invalid" });

      const document = await createLearningTestPdf(learningDocumentMeta(test), payload);
      const typeName = test.contentType === "listening" ? "tinglash" : "oqish";
      const filename = `${typeName}-${test.testDate}-${safeTestName(test.titleUz)}.pdf`;
      setDownloadHeaders(res, "application/pdf", filename);
      res.send(document);
    } catch (error) {
      console.error("Failed to create learning test PDF:", error);
      res.status(500).json({ error: "Failed to create test PDF" });
    }
  });

  app.get("/api/tests/:id/audio", async (req, res) => {
    try {
      const test = await storage.getLearningTest(req.params.id);
      if (!test) return res.status(404).json({ error: "Test not found" });
      if (test.contentType !== "listening") {
        return res.status(404).json({ error: "Audio is available only for listening tests" });
      }
      const payload = parseLearningPayload(test.payload);
      if (!payload || payload.contentType !== "listening") {
        return res.status(500).json({ error: "Stored listening test payload is invalid" });
      }

      const audio = await getOrCreateArchiveAudio(test, payload);
      if (!audio) return res.status(503).json({ error: "Audio generation is temporarily unavailable" });
      const filename = `tinglash-${test.testDate}-${safeTestName(test.titleUz)}.mp3`;
      setDownloadHeaders(res, test.audioMimeType || "audio/mpeg", filename, true);
      res.setHeader("Content-Length", audio.length);
      res.send(audio);
    } catch (error) {
      console.error("Failed to download learning test audio:", error);
      res.status(500).json({ error: "Failed to download test audio" });
    }
  });

  app.post("/api/tests/export", async (req, res) => {
    try {
      const format = req.body?.format;
      const requestedIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
      if (format !== "docx" && format !== "pdf") {
        return res.status(400).json({ error: "format must be docx or pdf" });
      }
      const ids = Array.from(new Set<string>(
        requestedIds.filter((id: unknown): id is string => typeof id === "string" && id.length <= 200),
      ));
      if (ids.length === 0 || ids.length > 30) {
        return res.status(400).json({ error: "Select between 1 and 30 tests" });
      }

      const found = await storage.getLearningTestsByIds(ids);
      const byId = new Map(found.map(test => [test.id, test]));
      const ordered = ids.map(id => byId.get(id)).filter((test): test is NonNullable<typeof test> => Boolean(test));
      if (ordered.length !== ids.length) return res.status(404).json({ error: "One or more tests were not found" });

      const items: LearningDocumentItem[] = ordered.map(test => {
        const payload = parseLearningPayload(test.payload);
        if (!payload) throw new Error(`Stored test payload is invalid: ${test.id}`);
        return { meta: learningDocumentMeta(test), payload };
      });

      const document = format === "docx"
        ? await createLearningTestsDocx(items)
        : await createLearningTestsPdf(items);
      const mimeType = format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf";
      const filename = `arab-tili-testlari-${items.length}-ta.${format}`;
      setDownloadHeaders(res, mimeType, filename);
      res.send(document);
    } catch (error) {
      console.error("Failed to export selected learning tests:", error);
      res.status(500).json({ error: "Failed to export selected tests" });
    }
  });

  // Weather API - Get all weather data
  app.get("/api/weather", async (req, res) => {
    try {
      const allWeather = await storage.getAllWeatherCache();
      res.json(allWeather);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch weather data" });
    }
  });

  // Weather API - Get weather for a region
  app.get("/api/weather/:regionId", async (req, res) => {
    try {
      const { regionId } = req.params;
      const cached = await storage.getWeatherCache(regionId);
      
      if (cached) {
        const region = regions.find(r => r.id === regionId);
        return res.json({
          ...cached,
          name: region?.name_uz,
          name_ar: region?.name_ar,
        });
      }
      
      // If no cache, return mock data for now
      const region = regions.find(r => r.id === regionId);
      if (region) {
        return res.json({
          regionId,
          temperature: region.temp,
          condition: region.condition_uz,
          humidity: 45,
          windSpeed: 12,
          pressure: region.pressure,
          name: region.name_uz,
          name_ar: region.name_ar,
        });
      }
      
      res.status(404).json({ error: "Region not found" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch weather data" });
    }
  });

  // Get AI-powered weather advice
  app.post("/api/weather/advice", async (req, res) => {
    try {
      const { region, temperature, condition, lang } = req.body;
      
      const advice = await generateWeatherAdvice(region, temperature, condition, lang);
      res.json({ advice });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate advice" });
    }
  });

  // Manual weather refresh endpoint
  app.post("/api/weather/refresh", async (req, res) => {
    try {
      await updateWeatherCache();
      res.json({ success: true, message: "Weather data refreshed successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to refresh weather data" });
    }
  });

  // Vocabulary API - Get all vocabulary
  app.get("/api/vocabulary", async (req, res) => {
    try {
      res.json(vocabulary);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch vocabulary" });
    }
  });

  // Get vocabulary example using AI
  app.post("/api/vocabulary/example", async (req, res) => {
    try {
      const { word, translation, lang } = req.body;
      
      const example = await generateVocabularyExample(word, translation, lang);
      res.json({ example });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate example" });
    }
  });

  // Generate new vocabulary words using AI
  app.post("/api/vocabulary/generate", async (req, res) => {
    try {
      const { count } = req.body;
      const words = await generateNewVocabulary(count || 5);
      res.json({ words });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate vocabulary" });
    }
  });

  // User preferences
  app.get("/api/user/:telegramId", async (req, res) => {
    try {
      const { telegramId } = req.params;
      const user = await storage.getUserByTelegramId(telegramId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.post("/api/user", async (req, res) => {
    try {
      const user = await storage.createUser(req.body);
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.patch("/api/user/:id/preferences", async (req, res) => {
    try {
      const { id } = req.params;
      const { lang, region } = req.body;
      
      const user = await storage.updateUserPreferences(id, lang, region);
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  // Telegram webhook
  app.post("/api/telegram/webhook", async (req, res) => {
    try {
      await handleTelegramUpdate(req.body);
      res.json({ ok: true });
    } catch (error) {
      console.error("Telegram webhook error:", error);
      res.status(500).json({ error: "Failed to process update" });
    }
  });

  // Setup Telegram webhook
  app.post("/api/telegram/setup-webhook", async (req, res) => {
    try {
      // Priority: APP_URL > RAILWAY_PUBLIC_DOMAIN > request host
      let appUrl = process.env.APP_URL;
      
      // Ensure APP_URL has https:// prefix
      if (appUrl && !appUrl.startsWith('http')) {
        appUrl = `https://${appUrl}`;
      }
      
      if (!appUrl && process.env.RAILWAY_PUBLIC_DOMAIN) {
        appUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
      }
      if (!appUrl) {
        appUrl = `https://${req.get('host')}`;
      }
      const webhookUrl = `${appUrl}/api/telegram/webhook`;
      console.log("Setting webhook URL:", webhookUrl);
      const result = await setTelegramWebhook(webhookUrl);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Bot settings
  app.get("/api/bot-settings", async (req, res) => {
    try {
      const settings = await storage.getBotSettings();
      res.json(settings || {});
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/bot-settings", async (req, res) => {
    try {
      const settings = await storage.updateBotSettings(req.body);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Update channel schedule time
  app.patch("/api/channels/:chatId/schedule", async (req, res) => {
    try {
      const { chatId } = req.params;
      const { scheduledTime } = req.body;
      const channel = await storage.updateChannelSchedule(chatId, scheduledTime);
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to update schedule" });
    }
  });

  // Channels API
  app.get("/api/channels", async (req, res) => {
    try {
      const channelsList = await storage.getChannels();
      res.json(channelsList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch channels" });
    }
  });

  app.post("/api/channels", async (req, res) => {
    try {
      const { chatId, title, type } = req.body;
      const channel = await storage.addChannel({ chatId, title, type, enabled: true });
      res.json(channel);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to add channel" });
    }
  });

  app.delete("/api/channels/:chatId", async (req, res) => {
    try {
      const { chatId } = req.params;
      await storage.removeChannel(chatId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove channel" });
    }
  });

  app.patch("/api/channels/:chatId", async (req, res) => {
    try {
      const { chatId } = req.params;
      const { enabled } = req.body;
      const channel = await storage.toggleChannel(chatId, enabled);
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle channel" });
    }
  });

  // News channels API
  app.get("/api/news-channels", async (req, res) => {
    try {
      const list = await storage.getNewsChannels();
      res.json(list);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch news channels" });
    }
  });

  app.post("/api/news-channels", async (req, res) => {
    try {
      const { chatId, title } = req.body;
      const channel = await storage.addNewsChannel({ chatId, title, enabled: true });
      res.json(channel);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to add news channel" });
    }
  });

  app.delete("/api/news-channels/:chatId", async (req, res) => {
    try {
      const { chatId } = req.params;
      await storage.removeNewsChannel(chatId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove news channel" });
    }
  });

  app.patch("/api/news-channels/:chatId", async (req, res) => {
    try {
      const { chatId } = req.params;
      const { enabled } = req.body;
      const channel = await storage.toggleNewsChannel(chatId, enabled);
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle news channel" });
    }
  });

  app.patch("/api/news-channels/:chatId/schedule", async (req, res) => {
    try {
      const { chatId } = req.params;
      const { scheduledTime } = req.body;
      const channel = await storage.updateNewsChannelSchedule(chatId, scheduledTime);
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to update news schedule" });
    }
  });

  // Send test news to a channel immediately
  app.post("/api/news-channels/:chatId/send-now", async (req, res) => {
    const { chatId } = req.params;
    try {
      await sendDailyNewsToChannel(chatId);
      await storage.updateNewsChannelLastSent(chatId);
      res.json({ ok: true });
    } catch (error: any) {
      console.error(`send-now error for ${chatId}:`, error.message);
      res.status(500).json({ ok: false, error: error.message || "Yuborishda xatolik" });
    }
  });

  // ─── Listening channels API ───────────────────────────────────────────────────

  app.get("/api/listening-voices", requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getVoiceProfiles());
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch voice profiles" });
    }
  });

  app.patch("/api/listening-voices/:voiceId", requireAdmin, async (req, res) => {
    try {
      const { voiceId } = req.params;
      const { label, gender } = req.body;
      if (typeof label !== "string" || !label.trim() || label.trim().length > 60) {
        return res.status(400).json({ error: "Voice label is required and must be under 60 characters" });
      }
      if (!["male", "female", "unknown"].includes(gender)) {
        return res.status(400).json({ error: "Voice gender must be male, female, or unknown" });
      }
      const profile = await storage.updateVoiceProfile(voiceId, { label: label.trim(), gender });
      if (!profile) return res.status(404).json({ error: "Voice profile not found" });
      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: "Failed to update voice profile" });
    }
  });

  app.post("/api/listening-voices/:voiceId/preview", requireAdmin, async (req, res) => {
    try {
      const audio = await generateVoicePreview(req.params.voiceId);
      if (!audio) return res.status(502).json({ error: "ElevenLabs preview could not be generated" });
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      res.send(audio);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Voice preview failed" });
    }
  });

  app.get("/api/listening-channels", requireAdmin, async (req, res) => {
    try {
      const list = await storage.getListeningChannels();
      res.json(list);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch listening channels" });
    }
  });

  app.post("/api/listening-channels", requireAdmin, async (req, res) => {
    try {
      const { chatId, title, scheduledTime, scheduledDays, scheduledLevels } = req.body;
      const safeTime = isValidScheduledTime(scheduledTime) ? scheduledTime : "10:00";
      const safeLevels = scheduledLevels
        ? serializeWeekdayLevelSchedule(scheduledLevels)
        : JSON.stringify(normalizeWeekdayLevelSchedule(null, "A1A2", scheduledDays || "0,1,2,3,4,5,6"));
      const safeDays = serializeScheduledDays(Object.keys(JSON.parse(safeLevels)).map(Number));
      const channel = await storage.addListeningChannel({
        chatId,
        title: title || chatId,
        enabled: true,
        scheduledTime: safeTime,
        scheduledDays: safeDays,
        scheduledLevels: safeLevels,
        currentLevel: "A1A2",
      });
      res.json(channel);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to add listening channel" });
    }
  });

  app.delete("/api/listening-channels/:chatId", requireAdmin, async (req, res) => {
    try {
      const { chatId } = req.params;
      await storage.removeListeningChannel(chatId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove listening channel" });
    }
  });

  app.patch("/api/listening-channels/:chatId", requireAdmin, async (req, res) => {
    try {
      const { chatId } = req.params;
      const { enabled } = req.body;
      const channel = await storage.toggleListeningChannel(chatId, enabled);
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle listening channel" });
    }
  });

  app.patch("/api/listening-channels/:chatId/level", requireAdmin, async (req, res) => {
    try {
      const { chatId } = req.params;
      const { level } = req.body;
      if (level !== "A1A2" && level !== "B1B2") {
        return res.status(400).json({ error: "level must be A1A2 or B1B2" });
      }
      const channel = await storage.updateListeningChannelLevel(chatId, level);
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to update listening level" });
    }
  });

  app.patch("/api/listening-channels/:chatId/schedule", requireAdmin, async (req, res) => {
    try {
      const { chatId } = req.params;
      const { scheduledTime, scheduledLevels } = req.body;
      if (!isValidScheduledTime(scheduledTime)) {
        return res.status(400).json({ error: "Invalid time. Use HH:mm." });
      }
      const levels = serializeWeekdayLevelSchedule(scheduledLevels);
      const channel = await storage.updateListeningChannelSchedule(
        chatId,
        scheduledTime,
        serializeScheduledDays(Object.keys(JSON.parse(levels)).map(Number)),
        levels,
      );
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to update listening schedule" });
    }
  });

  app.patch("/api/listening-channels/:chatId/voices", requireAdmin, async (req, res) => {
    try {
      const { chatId } = req.params;
      const { maleVoiceId, femaleVoiceId } = req.body;
      if ((maleVoiceId && typeof maleVoiceId !== "string") || (femaleVoiceId && typeof femaleVoiceId !== "string")) {
        return res.status(400).json({ error: "Invalid voice selection" });
      }
      const profiles = await storage.getVoiceProfiles();
      const male = maleVoiceId ? profiles.find(profile => profile.voiceId === maleVoiceId) : undefined;
      const female = femaleVoiceId ? profiles.find(profile => profile.voiceId === femaleVoiceId) : undefined;
      if (maleVoiceId && !male) {
        return res.status(400).json({ error: "Tanlangan erkak voice topilmadi" });
      }
      if (femaleVoiceId && !female) {
        return res.status(400).json({ error: "Tanlangan ayol voice topilmadi" });
      }
      if (maleVoiceId && femaleVoiceId && maleVoiceId === femaleVoiceId) {
        return res.status(400).json({ error: "Erkak va ayol speaker uchun turli voice tanlang" });
      }
      const channel = await storage.updateListeningChannelVoices(chatId, maleVoiceId || null, femaleVoiceId || null);
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to update listening voices" });
    }
  });

  app.post("/api/listening-channels/:chatId/send-now", requireAdmin, async (req, res) => {
    const { chatId } = req.params;
    try {
      await sendDailyListeningToChannel(chatId, { claimScheduledDelivery: false });
      res.json({ ok: true });
    } catch (error: any) {
      console.error(`listening send-now error for ${chatId}:`, error.message);
      res.status(500).json({ ok: false, error: error.message || "Yuborishda xatolik" });
    }
  });

  // ─── Reading channels API ─────────────────────────────────────────────────────

  app.get("/api/reading-channels", requireAdmin, async (req, res) => {
    try {
      const list = await storage.getReadingChannels();
      res.json(list);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reading channels" });
    }
  });

  app.post("/api/reading-channels", requireAdmin, async (req, res) => {
    try {
      const { chatId, title, scheduledTime, scheduledDays, scheduledLevels } = req.body;
      const safeTime = isValidScheduledTime(scheduledTime) ? scheduledTime : "11:00";
      const safeLevels = scheduledLevels
        ? serializeWeekdayLevelSchedule(scheduledLevels)
        : JSON.stringify(normalizeWeekdayLevelSchedule(null, "A1A2", scheduledDays || "0,1,2,3,4,5,6"));
      const safeDays = serializeScheduledDays(Object.keys(JSON.parse(safeLevels)).map(Number));
      const channel = await storage.addReadingChannel({
        chatId,
        title: title || chatId,
        enabled: true,
        scheduledTime: safeTime,
        scheduledDays: safeDays,
        scheduledLevels: safeLevels,
        currentLevel: "A1A2",
      });
      res.json(channel);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to add reading channel" });
    }
  });

  app.delete("/api/reading-channels/:chatId", requireAdmin, async (req, res) => {
    try {
      const { chatId } = req.params;
      await storage.removeReadingChannel(chatId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove reading channel" });
    }
  });

  app.patch("/api/reading-channels/:chatId", requireAdmin, async (req, res) => {
    try {
      const { chatId } = req.params;
      const { enabled } = req.body;
      const channel = await storage.toggleReadingChannel(chatId, enabled);
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle reading channel" });
    }
  });

  app.patch("/api/reading-channels/:chatId/level", requireAdmin, async (req, res) => {
    try {
      const { chatId } = req.params;
      const { level } = req.body;
      if (level !== "A1A2" && level !== "B1B2") {
        return res.status(400).json({ error: "level must be A1A2 or B1B2" });
      }
      const channel = await storage.updateReadingChannelLevel(chatId, level);
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to update reading level" });
    }
  });

  app.patch("/api/reading-channels/:chatId/schedule", requireAdmin, async (req, res) => {
    try {
      const { chatId } = req.params;
      const { scheduledTime, scheduledLevels } = req.body;
      if (!isValidScheduledTime(scheduledTime)) {
        return res.status(400).json({ error: "Invalid time. Use HH:mm." });
      }
      const levels = serializeWeekdayLevelSchedule(scheduledLevels);
      const channel = await storage.updateReadingChannelSchedule(
        chatId,
        scheduledTime,
        serializeScheduledDays(Object.keys(JSON.parse(levels)).map(Number)),
        levels,
      );
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to update reading schedule" });
    }
  });

  app.post("/api/reading-channels/:chatId/send-now", requireAdmin, async (req, res) => {
    const { chatId } = req.params;
    try {
      await sendDailyReadingToChannel(chatId, { claimScheduledDelivery: false });
      res.json({ ok: true });
    } catch (error: any) {
      console.error(`reading send-now error for ${chatId}:`, error.message);
      res.status(500).json({ ok: false, error: error.message || "Yuborishda xatolik" });
    }
  });

  return httpServer;
}
