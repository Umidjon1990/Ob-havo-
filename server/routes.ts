import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { handleTelegramUpdate, sendTelegramMessage, setTelegramWebhook } from "./lib/telegram";
import { generateWeatherAdvice, generateVocabularyExample } from "./lib/openai";
import { regions } from "../client/src/data/regions";
import { vocabulary } from "../client/src/data/vocabulary";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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
      const webhookUrl = `${req.protocol}://${req.get('host')}/api/telegram/webhook`;
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

  // Test channel message
  app.post("/api/telegram/test-channel", async (req, res) => {
    try {
      const { channelId, region } = req.body;
      const { sendDailyChannelMessage } = await import("./lib/telegram");
      await sendDailyChannelMessage(channelId, region || 'tashkent');
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
