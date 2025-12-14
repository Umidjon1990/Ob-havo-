import { storage } from "../storage";
import { generateWeatherAdvice } from "./openai";

interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    first_name: string;
    username?: string;
  };
  chat: {
    id: number;
  };
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function sendTelegramMessage(chatId: number, text: string, parseMode: string = 'HTML', replyMarkup?: any) {
  if (!BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    return;
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  
  try {
    const body: any = {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    };
    
    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    return await response.json();
  } catch (error) {
    console.error("Error sending Telegram message:", error);
  }
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (!update.message) return;

  const { from, chat, text } = update.message;
  const telegramId = String(from.id);
  const chatId = chat.id;

  // Get or create user
  let user = await storage.getUserByTelegramId(telegramId);
  if (!user) {
    user = await storage.createUser({
      telegramId,
      username: from.username || from.first_name,
      preferredLang: 'uz',
      preferredRegion: 'tashkent',
    });
  }

  // Handle commands
  if (text?.startsWith('/start')) {
    const welcomeMessage = user.preferredLang === 'ar'
      ? `مرحباً ${from.first_name}! 🌤\n\nأنا بوت الطقس الذكي. يمكنني إعطاؤك توقعات الطقس وتعليمك كلمات جديدة.\n\nاستخدم /weather لمعرفة الطقس الحالي.`
      : `Assalomu alaykum ${from.first_name}! 🌤\n\nMen aqlli ob-havo boti. Sizga ob-havo ma'lumotlarini beraman va yangi so'zlarni o'rgataman.\n\n/weather - joriy ob-havo`;
    
    await sendTelegramMessage(chatId, welcomeMessage);
  } 
  else if (text?.startsWith('/weather')) {
    const region = user.preferredRegion || 'tashkent';
    const weatherData = await storage.getWeatherCache(region);
    
    if (weatherData) {
      const advice = await generateWeatherAdvice(
        region,
        weatherData.temperature || 20,
        weatherData.condition || 'Clear',
        user.preferredLang as 'ar' | 'uz'
      );
      
      const message = user.preferredLang === 'ar'
        ? `🌡 <b>${region}</b>\n\nدرجة الحرارة: ${weatherData.temperature}°C\nالحالة: ${weatherData.condition}\nالرطوبة: ${weatherData.humidity}%\n\n💡 ${advice}`
        : `🌡 <b>${region}</b>\n\nHarorat: ${weatherData.temperature}°C\nHolat: ${weatherData.condition}\nNamlik: ${weatherData.humidity}%\n\n💡 ${advice}`;
      
      await sendTelegramMessage(chatId, message);
    } else {
      const message = user.preferredLang === 'ar'
        ? 'عذراً، لا توجد بيانات متاحة حالياً.'
        : 'Kechirasiz, hozirda ma\'lumot mavjud emas.';
      await sendTelegramMessage(chatId, message);
    }
  }
  else if (text?.startsWith('/lang')) {
    const newLang = user.preferredLang === 'ar' ? 'uz' : 'ar';
    await storage.updateUserPreferences(user.id, newLang);
    
    const message = newLang === 'ar'
      ? 'تم تغيير اللغة إلى العربية ✓'
      : 'Til o\'zbekchaga o\'zgartirildi ✓';
    
    await sendTelegramMessage(chatId, message);
  }
  else if (text?.startsWith('/admin')) {
    const message = `⚙️ <b>Admin Panel</b>\n\nAdmin panelga kirish uchun quyidagi tugmani bosing:`;
    
    const appUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}/admin`
      : 'https://ob-havo.replit.app/admin';
    
    await sendTelegramMessage(chatId, message, 'HTML', {
      inline_keyboard: [[
        { text: "🔧 Admin Panel", web_app: { url: appUrl } }
      ]]
    });
  }
}

export async function setTelegramWebhook(webhookUrl: string) {
  if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN not set");
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
  });
  
  return await response.json();
}

const ALL_REGIONS = [
  { id: "toshkent", name: "Toshkent" },
  { id: "samarqand", name: "Samarqand" },
  { id: "buxoro", name: "Buxoro" },
  { id: "andijon", name: "Andijon" },
  { id: "namangan", name: "Namangan" },
  { id: "fargona", name: "Farg'ona" },
  { id: "nukus", name: "Nukus" },
  { id: "qarshi", name: "Qarshi" },
  { id: "urganch", name: "Urganch" },
  { id: "jizzax", name: "Jizzax" },
  { id: "navoiy", name: "Navoiy" },
  { id: "guliston", name: "Guliston" },
  { id: "termiz", name: "Termiz" },
];

export async function sendDailyChannelMessage(channelId: string, miniAppUrl?: string) {
  const weatherLines: string[] = [];
  const inlineKeyboard: any[][] = [];
  
  for (const region of ALL_REGIONS) {
    const weatherData = await storage.getWeatherCache(region.id);
    const temp = weatherData?.temperature ?? "--";
    const condition = weatherData?.condition || "—";
    
    weatherLines.push(`🏙 <b>${region.name}</b>: ${temp}°C, ${condition}`);
    
    const buttonUrl = miniAppUrl 
      ? `${miniAppUrl}?region=${region.id}`
      : `https://t.me/ObHavoUzBot/app?startapp=${region.id}`;
    
    inlineKeyboard.push([
      { text: `📍 ${region.name} - Batafsil`, url: buttonUrl }
    ]);
  }
  
  const today = new Date().toLocaleDateString('uz-UZ', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const message = `🌤 <b>Bugungi Ob-Havo</b>
📅 ${today}

${weatherLines.join('\n')}

📱 Batafsil ma'lumot uchun quyidagi tugmalarni bosing:`;

  await sendTelegramMessage(Number(channelId), message, 'HTML', {
    inline_keyboard: inlineKeyboard
  });
}

export async function startDailyMessageScheduler() {
  setInterval(async () => {
    try {
      const settings = await storage.getBotSettings();
      if (!settings?.dailyMessageEnabled || !settings.channelId) return;

      const now = new Date();
      const [targetHour, targetMinute] = (settings.dailyMessageTime || "08:00").split(":").map(Number);
      
      if (now.getHours() === targetHour && now.getMinutes() === targetMinute) {
        const lastSent = settings.lastDailyMessageSent;
        const today = new Date().toDateString();
        
        if (!lastSent || new Date(lastSent).toDateString() !== today) {
          await sendDailyChannelMessage(settings.channelId);
          await storage.updateBotSettings({ lastDailyMessageSent: new Date() });
          console.log("Daily message sent to channel");
        }
      }
    } catch (error) {
      console.error("Error in daily message scheduler:", error);
    }
  }, 60000); // Check every minute
}
