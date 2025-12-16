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

export async function sendTelegramMessage(chatId: number | string, text: string, parseMode: string = 'HTML', replyMarkup?: any) {
  if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN not set");
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  
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
  
  const result = await response.json();
  
  if (!result.ok) {
    console.error("Telegram API error:", result);
    throw new Error(result.description || "Telegram API error");
  }
  
  return result;
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
      preferredRegion: 'toshkent',
    });
  }

  // Handle commands
  if (text?.startsWith('/start')) {
    const currentLang = user.preferredLang === 'ar' ? 'العربية' : "O'zbekcha";
    const welcomeMessage = user.preferredLang === 'ar'
      ? `🎓 <b>مشروع التعليم الحديث</b>\n\n☀️ مرحباً ${from.first_name}!\n\nاختر المنطقة لمعرفة الطقس:`
      : `🎓 <b>Zamonaviy ta'lim loyihasi</b>\n\n☀️ Assalomu alaykum ${from.first_name}!\n\nOb-havo ma'lumotini ko'rish uchun viloyatni tanlang:`;
    
    const appBaseUrl = process.env.APP_URL 
      || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://ob-havo.replit.app');
    
    const langButtonText = user.preferredLang === 'ar' ? "🌐 تغيير اللغة → O'zbekcha" : "🌐 Tilni o'zgartirish → العربية";
    
    const keyboard = [
      [
        { text: "🏙 Toshkent | طَشْقَنْد", web_app: { url: `${appBaseUrl}?region=toshkent` } },
        { text: "🏙 Samarqand | سَمَرْقَنْد", web_app: { url: `${appBaseUrl}?region=samarqand` } }
      ],
      [
        { text: "🏙 Buxoro | بُخَارَى", web_app: { url: `${appBaseUrl}?region=buxoro` } },
        { text: "🏙 Andijon | أَنْدِيجَان", web_app: { url: `${appBaseUrl}?region=andijon` } }
      ],
      [
        { text: "🏙 Namangan | نَمَنْغَان", web_app: { url: `${appBaseUrl}?region=namangan` } },
        { text: "🏙 Farg'ona | فَرْغَانَة", web_app: { url: `${appBaseUrl}?region=fargona` } }
      ],
      [
        { text: "🏙 Nukus | نُوكُوس", web_app: { url: `${appBaseUrl}?region=nukus` } },
        { text: "🏙 Qarshi | قَرْشِي", web_app: { url: `${appBaseUrl}?region=qarshi` } }
      ],
      [
        { text: "🏙 Urganch | أُورْجِينْتْش", web_app: { url: `${appBaseUrl}?region=urganch` } },
        { text: "🏙 Jizzax | جِيزَاك", web_app: { url: `${appBaseUrl}?region=jizzax` } }
      ],
      [
        { text: "🏙 Navoiy | نَوَاوِي", web_app: { url: `${appBaseUrl}?region=navoiy` } },
        { text: "🏙 Guliston | جُولِيسْتَان", web_app: { url: `${appBaseUrl}?region=guliston` } }
      ],
      [
        { text: "🏙 Termiz | تِرْمِذ", web_app: { url: `${appBaseUrl}?region=termiz` } }
      ],
      [
        { text: langButtonText }
      ]
    ];
    
    await sendTelegramMessage(chatId, welcomeMessage, 'HTML', {
      keyboard,
      resize_keyboard: true,
      one_time_keyboard: false
    });
  }
  // Handle language change button
  else if (text?.includes("Tilni o'zgartirish") || text?.includes("تغيير اللغة")) {
    const newLang = user.preferredLang === 'ar' ? 'uz' : 'ar';
    await storage.updateUserPreferences(user.id, newLang);
    
    const appBaseUrl = process.env.APP_URL 
      || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://ob-havo.replit.app');
    
    const langButtonText = newLang === 'ar' ? "🌐 تغيير اللغة → O'zbekcha" : "🌐 Tilni o'zgartirish → العربية";
    
    const welcomeMessage = newLang === 'ar'
      ? `🎓 <b>مشروع التعليم الحديث</b>\n\n✅ تم تغيير اللغة إلى العربية\n\nاختر المنطقة لمعرفة الطقس:`
      : `🎓 <b>Zamonaviy ta'lim loyihasi</b>\n\n✅ Til o'zbekchaga o'zgartirildi\n\nOb-havo ma'lumotini ko'rish uchun viloyatni tanlang:`;
    
    const keyboard = [
      [
        { text: "🏙 Toshkent | طَشْقَنْد", web_app: { url: `${appBaseUrl}?region=toshkent` } },
        { text: "🏙 Samarqand | سَمَرْقَنْد", web_app: { url: `${appBaseUrl}?region=samarqand` } }
      ],
      [
        { text: "🏙 Buxoro | بُخَارَى", web_app: { url: `${appBaseUrl}?region=buxoro` } },
        { text: "🏙 Andijon | أَنْدِيجَان", web_app: { url: `${appBaseUrl}?region=andijon` } }
      ],
      [
        { text: "🏙 Namangan | نَمَنْغَان", web_app: { url: `${appBaseUrl}?region=namangan` } },
        { text: "🏙 Farg'ona | فَرْغَانَة", web_app: { url: `${appBaseUrl}?region=fargona` } }
      ],
      [
        { text: "🏙 Nukus | نُوكُوس", web_app: { url: `${appBaseUrl}?region=nukus` } },
        { text: "🏙 Qarshi | قَرْشِي", web_app: { url: `${appBaseUrl}?region=qarshi` } }
      ],
      [
        { text: "🏙 Urganch | أُورْجِينْتْش", web_app: { url: `${appBaseUrl}?region=urganch` } },
        { text: "🏙 Jizzax | جِيزَاك", web_app: { url: `${appBaseUrl}?region=jizzax` } }
      ],
      [
        { text: "🏙 Navoiy | نَوَاوِي", web_app: { url: `${appBaseUrl}?region=navoiy` } },
        { text: "🏙 Guliston | جُولِيسْتَان", web_app: { url: `${appBaseUrl}?region=guliston` } }
      ],
      [
        { text: "🏙 Termiz | تِرْمِذ", web_app: { url: `${appBaseUrl}?region=termiz` } }
      ],
      [
        { text: langButtonText }
      ]
    ];
    
    await sendTelegramMessage(chatId, welcomeMessage, 'HTML', {
      keyboard,
      resize_keyboard: true,
      one_time_keyboard: false
    });
  } 
  else if (text?.startsWith('/weather')) {
    const region = user.preferredRegion || 'toshkent';
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
  { id: "toshkent", name: "Toshkent", name_ar: "طَشْقَنْد" },
  { id: "samarqand", name: "Samarqand", name_ar: "سَمَرْقَنْد" },
  { id: "buxoro", name: "Buxoro", name_ar: "بُخَارَى" },
  { id: "andijon", name: "Andijon", name_ar: "أَنْدِيجَان" },
  { id: "namangan", name: "Namangan", name_ar: "نَمَنْغَان" },
  { id: "fargona", name: "Farg'ona", name_ar: "فَرْغَانَة" },
  { id: "nukus", name: "Nukus", name_ar: "نُوكُوس" },
  { id: "qarshi", name: "Qarshi", name_ar: "قَرْشِي" },
  { id: "urganch", name: "Urganch", name_ar: "أُورْجِينْتْش" },
  { id: "jizzax", name: "Jizzax", name_ar: "جِيزَاك" },
  { id: "navoiy", name: "Navoiy", name_ar: "نَوَاوِي" },
  { id: "guliston", name: "Guliston", name_ar: "جُولِيسْتَان" },
  { id: "termiz", name: "Termiz", name_ar: "تِرْمِذ" },
];

export async function sendDailyChannelMessage(channelId: string, miniAppUrl?: string) {
  // O'zbekiston vaqti
  const now = new Date();
  const uzTime = new Date(now.getTime() + (5 * 60 * 60 * 1000));
  const day = uzTime.getUTCDate();
  const months = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
  const month = months[uzTime.getUTCMonth()];
  
  // Ob-havo emoji
  const getWeatherEmoji = (condition: string) => {
    const c = condition.toLowerCase();
    if (c.includes("ochiq") || c.includes("quyosh")) return "☀️";
    if (c.includes("bulut")) return "☁️";
    if (c.includes("yomg'ir")) return "🌧";
    if (c.includes("qor")) return "❄️";
    if (c.includes("tuman")) return "🌫";
    return "🌤";
  };
  
  // Toshkent uchun batafsil
  const toshkentData = await storage.getWeatherCache("toshkent");
  const tTemp = toshkentData?.temperature ?? 0;
  const tHumidity = toshkentData?.humidity ?? 0;
  const tCondition = toshkentData?.condition ?? "—";
  const tWindSpeed = toshkentData?.windSpeed ?? 0;
  
  let minTemp = tTemp - 5, maxTemp = tTemp + 3;
  let morningTemp = tTemp, dayTemp = tTemp, eveningTemp = tTemp;
  let sunrise = "07:00", sunset = "17:30";
  
  if (toshkentData?.forecastData) {
    try {
      const fd = JSON.parse(toshkentData.forecastData);
      if (fd.daily?.[0]) {
        minTemp = fd.daily[0].min;
        maxTemp = fd.daily[0].max;
        if (fd.daily[0].sunrise) sunrise = new Date(fd.daily[0].sunrise).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
        if (fd.daily[0].sunset) sunset = new Date(fd.daily[0].sunset).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
      }
      if (fd.hourly) {
        morningTemp = fd.hourly.find((h: any) => h.time === "07:00")?.temp ?? tTemp;
        dayTemp = fd.hourly.find((h: any) => h.time === "13:00")?.temp ?? tTemp;
        eveningTemp = fd.hourly.find((h: any) => h.time === "19:00")?.temp ?? tTemp;
      }
    } catch {}
  }
  
  const tEmoji = getWeatherEmoji(tCondition);
  
  // Barcha hududlar
  const allRegions = [
    { id: "toshkent", uz: "Toshkent", ar: "طَشْقَند" },
    { id: "samarqand", uz: "Samarqand", ar: "سَمَرْقَند" },
    { id: "buxoro", uz: "Buxoro", ar: "بُخَارَى" },
    { id: "andijon", uz: "Andijon", ar: "أَنْدِيجَان" },
    { id: "namangan", uz: "Namangan", ar: "نَمَنْغَان" },
    { id: "fargona", uz: "Farg'ona", ar: "فَرْغَانَة" },
    { id: "nukus", uz: "Nukus", ar: "نُوكُوس" },
    { id: "qarshi", uz: "Qarshi", ar: "قَرْشِي" },
    { id: "urganch", uz: "Urganch", ar: "أُورْگَنْج" },
    { id: "jizzax", uz: "Jizzax", ar: "جِيزَاخ" },
    { id: "navoiy", uz: "Navoiy", ar: "نَوَائِي" },
    { id: "guliston", uz: "Guliston", ar: "گُلِسْتَان" },
    { id: "termiz", uz: "Termiz", ar: "تِرْمِذ" },
  ];
  
  const regionLines: string[] = [];
  for (const region of allRegions) {
    const data = await storage.getWeatherCache(region.id);
    if (data) {
      const emoji = getWeatherEmoji(data.condition || "");
      let rMin = data.temperature - 3, rMax = data.temperature + 2;
      if (data.forecastData) {
        try {
          const fd = JSON.parse(data.forecastData);
          if (fd.daily?.[0]) { rMin = fd.daily[0].min; rMax = fd.daily[0].max; }
        } catch {}
      }
      regionLines.push(`${emoji} ${region.uz} | ${region.ar}: ${rMax}°/${rMin}°`);
    }
  }
  
  // Arabcha oy nomlari
  const monthsAr = ["يَنَايِر", "فِبْرَايِر", "مَارِس", "أَبْرِيل", "مَايُو", "يُونِيُو", "يُولِيُو", "أَغُسْطُس", "سِبْتَمْبَر", "أُكْتُوبَر", "نُوفَمْبَر", "دِيسَمْبَر"];
  const monthAr = monthsAr[uzTime.getUTCMonth()];
  
  const message = `☀️ <b>Ob-havo | الطَّقْس</b> ☀️
📅 ${day} ${month} | ${day} ${monthAr}

<b>📍 Toshkent | طَشْقَند</b>
${tEmoji} ${maxTemp}°/${minTemp}° | ${tCondition}
🌡 Hozir: ${tTemp}° | 💨 ${tWindSpeed} m/s | 💧 ${tHumidity}%
🌅 ${sunrise} ↔ ${sunset}

━━━━━━━━━━━━━━━━━━━━
${regionLines.join('\n')}`;

  await sendTelegramMessage(channelId, message, 'HTML', {
    inline_keyboard: [[
      { text: "📱 Batafsil", url: "https://t.me/Ztobhavobot" }
    ]]
  });
}

export async function startDailyMessageScheduler() {
  setInterval(async () => {
    try {
      const enabledChannels = await storage.getEnabledChannels();
      if (enabledChannels.length === 0) return;

      const now = new Date();
      // O'zbekiston vaqti UTC+5
      const uzTime = new Date(now.getTime() + (5 * 60 * 60 * 1000));
      const currentHour = uzTime.getUTCHours();
      const currentMinute = uzTime.getUTCMinutes();
      const today = uzTime.toDateString();

      for (const channel of enabledChannels) {
        const scheduledTime = channel.scheduledTime || "08:00";
        const [targetHour, targetMinute] = scheduledTime.split(":").map(Number);
        
        if (currentHour === targetHour && currentMinute === targetMinute) {
          const lastSent = channel.lastSentAt;
          
          if (!lastSent || new Date(lastSent).toDateString() !== today) {
            await sendDailyChannelMessage(channel.chatId);
            await storage.updateChannelLastSent(channel.chatId);
            console.log(`Daily message sent to ${channel.title || channel.chatId} at ${scheduledTime}`);
          }
        }
      }
    } catch (error) {
      console.error("Error in daily message scheduler:", error);
    }
  }, 60000);
}
