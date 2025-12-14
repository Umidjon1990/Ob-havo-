import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { handleTelegramUpdate, sendTelegramMessage, setTelegramWebhook } from "./lib/telegram";
import { generateWeatherAdvice, generateVocabularyExample, generateNewVocabulary } from "./lib/openai";
import { updateWeatherCache } from "./lib/weather";
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

  // Test channel message (sends all regions with "Batafsil" buttons)
  app.post("/api/telegram/test-channel", async (req, res) => {
    try {
      const { channelId, miniAppUrl } = req.body;
      const { sendDailyChannelMessage } = await import("./lib/telegram");
      await sendDailyChannelMessage(channelId, miniAppUrl);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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

  // Send to all enabled channels
  app.post("/api/telegram/broadcast", async (req, res) => {
    try {
      const { sendDailyChannelMessage } = await import("./lib/telegram");
      const enabledChannels = await storage.getEnabledChannels();
      
      for (const channel of enabledChannels) {
        await sendDailyChannelMessage(channel.chatId);
      }
      
      res.json({ ok: true, sent: enabledChannels.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
