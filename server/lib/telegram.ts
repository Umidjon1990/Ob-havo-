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
  const weatherLines: string[] = [];
  
  for (const region of ALL_REGIONS) {
    const weatherData = await storage.getWeatherCache(region.id);
    const temp = weatherData?.temperature ?? "--";
    const humidity = weatherData?.humidity ?? "--";
    const condition_uz = weatherData?.condition ?? "—";
    
    let condition_ar = "—";
    let windSpeed = "--";
    if (weatherData?.forecastData) {
      try {
        const forecast = JSON.parse(weatherData.forecastData);
        condition_ar = forecast.condition_ar || "—";
        windSpeed = forecast.windSpeed || "--";
      } catch {}
    }
    
    weatherLines.push(
      `┌─────────────────────────┐\n` +
      `│ 🏙 <b>${region.name} | ${region.name_ar}</b>\n` +
      `│ 🌡 ${temp}°C  💧 ${humidity}%  💨 ${windSpeed} km/h\n` +
      `│ ${condition_uz} | ${condition_ar}\n` +
      `└─────────────────────────┘`
    );
  }
  
  const todayAr = new Date().toLocaleDateString('ar-SA', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const todayUz = new Date().toLocaleDateString('uz-UZ', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const settings = await storage.getBotSettings();
  
  const defaultWisdoms = [
    { uz: "Ilm izlash har bir musulmonga farzdir.", ar: "طَلَبُ العِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِم" },
    { uz: "Sabr - imonning yarmi.", ar: "الصَّبْرُ نِصْفُ الإِيمَان" },
    { uz: "Kim yaxshilikka yo'l ko'rsatsa, uni qilgan kishining ajrini oladi.", ar: "مَنْ دَلَّ عَلَى خَيْرٍ فَلَهُ مِثْلُ أَجْرِ فَاعِلِه" },
    { uz: "Musulmon musulmonning birodaridur.", ar: "المُسْلِمُ أَخُو المُسْلِم" },
    { uz: "Eng yaxshi sadaqa - ilm o'rgatishdir.", ar: "أَفْضَلُ الصَّدَقَةِ أَنْ يَتَعَلَّمَ المَرْءُ عِلْماً ثُمَّ يُعَلِّمَهُ أَخَاه" },
    { uz: "Dunyo oxirat uchun ekin dalasi.", ar: "الدُّنْيَا مَزْرَعَةُ الآخِرَة" },
    { uz: "Yaxshi so'z sadaqadir.", ar: "الكَلِمَةُ الطَّيِّبَةُ صَدَقَة" },
    { uz: "Tabassum sadaqadir.", ar: "تَبَسُّمُكَ فِي وَجْهِ أَخِيكَ صَدَقَة" },
    { uz: "Kim Allohdan qo'rqsa, unga chiqish yo'li yaratiladi.", ar: "وَمَنْ يَتَّقِ اللهَ يَجْعَلْ لَهُ مَخْرَجاً" },
    { uz: "Shukr qilsangiz, albatta ko'paytiraman.", ar: "لَئِنْ شَكَرْتُمْ لَأَزِيدَنَّكُم" },
  ];
  
  let wisdom;
  if (settings?.dailyWisdomUz && settings?.dailyWisdomAr) {
    wisdom = { uz: settings.dailyWisdomUz, ar: settings.dailyWisdomAr };
  } else {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    wisdom = defaultWisdoms[dayOfYear % defaultWisdoms.length];
  }
  
  const message = `☀️ <b>Ob-havo ma'lumoti | النَّشْرَة الجَوِّيَّة</b> ☀️
━━━━━━━━━━━━━━━━━━━━━━━━
📅 ${todayUz}
📅 ${todayAr}
━━━━━━━━━━━━━━━━━━━━━━━━

${weatherLines.join('\n\n')}

━━━━━━━━━━━━━━━━━━━━━━━━
💎 <b>Kun hikmati | حِكْمَةُ اليَوْم</b>
${wisdom.uz}
${wisdom.ar}
━━━━━━━━━━━━━━━━━━━━━━━━
📲 Batafsil | لِلْمَزِيد مِنَ التَّفَاصِيل`;

  await sendTelegramMessage(channelId, message, 'HTML', {
    inline_keyboard: [[
      { text: "📱 Batafsil | بَتَفْصِيل", url: "https://t.me/Ztobhavobot" }
    ]]
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
