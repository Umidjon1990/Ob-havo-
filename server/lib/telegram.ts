import { storage } from "../storage";
import { generateWeatherAdvice } from "./openai";
import { generateDailyNews, generateNewsImage, generateNewsQuiz, formatPhotoCaption, formatNewsText, formatNewsCaption, formatVocabMessage } from "./news";
import { generateListeningPassage, generateListeningQuizzes, textToSpeechArabic, type ListeningLevel } from "./listening";
import { generateReadingPassage, generateReadingQuizzes, shuffleReadingOptions, getReadingDateString, getReadingLevelByDate, type ReadingLevel } from "./reading";

function getAppBaseUrl(): string {
  if (process.env.APP_URL) {
    const url = process.env.APP_URL.startsWith('http')
      ? process.env.APP_URL
      : `https://${process.env.APP_URL}`;
    return url.replace(/\/$/, '');
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return 'https://ob-havo.replit.app';
}

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
    
    const appBaseUrl = getAppBaseUrl();
    
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
    
    const appBaseUrl = getAppBaseUrl();
    
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
    
    const appUrl = `${getAppBaseUrl()}/admin`;
    
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
  
  // Ob-havo emoji va arabcha
  const getWeatherInfo = (condition: string) => {
    const c = condition.toLowerCase();
    if (c.includes("ochiq") || c.includes("quyosh")) return { emoji: "☀️", ar: "صَافٍ" };
    if (c.includes("bulut")) return { emoji: "☁️", ar: "غَائِم" };
    if (c.includes("yomg'ir")) return { emoji: "🌧", ar: "مَاطِر" };
    if (c.includes("qor")) return { emoji: "❄️", ar: "ثَلْجِي" };
    if (c.includes("tuman")) return { emoji: "🌫", ar: "ضَبَابِي" };
    return { emoji: "🌤", ar: "صَافٍ جُزْئِيًّا" };
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
  
  const tWeather = getWeatherInfo(tCondition);
  
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
      const w = getWeatherInfo(data.condition || "");
      let rMin = data.temperature - 3, rMax = data.temperature + 2;
      let rSunrise = "07:00", rSunset = "17:30";
      if (data.forecastData) {
        try {
          const fd = JSON.parse(data.forecastData);
          if (fd.daily?.[0]) { 
            rMin = fd.daily[0].min; 
            rMax = fd.daily[0].max;
            if (fd.daily[0].sunrise) rSunrise = new Date(fd.daily[0].sunrise).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
            if (fd.daily[0].sunset) rSunset = new Date(fd.daily[0].sunset).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
          }
        } catch {}
      }
      regionLines.push(`<b>📍 ${region.uz} | ${region.ar}</b>
${w.emoji} ${rMax}°/${rMin}° | ${data.condition} | ${w.ar}
☀️ ${rSunrise} | 🌙 ${rSunset}`);
    }
  }
  
  // Arabcha oy nomlari
  const monthsAr = ["يَنَايِر", "فِبْرَايِر", "مَارِس", "أَبْرِيل", "مَايُو", "يُونِيُو", "يُولِيُو", "أَغُسْطُس", "سِبْتَمْبَر", "أُكْتُوبَر", "نُوفَمْبَر", "دِيسَمْبَر"];
  const monthAr = monthsAr[uzTime.getUTCMonth()];
  
  // Dollar kursini olish (CBU API)
  let usdRate = "—";
  let usdDiff = "";
  let usdBuy = "—";
  let usdSell = "—";
  try {
    const cbuResponse = await fetch("https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/");
    const cbuData = await cbuResponse.json();
    if (cbuData && cbuData[0]) {
      const rate = parseFloat(cbuData[0].Rate);
      usdRate = rate.toLocaleString('uz-UZ', { maximumFractionDigits: 0 });
      // Banklar odatda rasmiy kursdan ±50-70 so'm farq qiladi
      usdBuy = Math.round(rate - 50).toLocaleString('uz-UZ');
      usdSell = Math.round(rate + 50).toLocaleString('uz-UZ');
      const diff = cbuData[0].Diff;
      if (diff) {
        usdDiff = diff.startsWith('-') ? ` (${diff})` : ` (+${diff})`;
      }
    }
  } catch (e) {
    console.error("CBU API error:", e);
  }
  
  const message = `☀️ <b>Ob-havo | الطَّقْس</b> ☀️
📅 ${day} ${month} | ${day} ${monthAr}

${regionLines.join('\n\n')}

━━━━━━━━━━━━━━━━━━━━
💵 <b>USD:</b> ${usdRate} so'm${usdDiff}
📉 Olish: ~${usdBuy} | 📈 Sotish: ~${usdSell}
📊 Manba: Markaziy Bank (cbu.uz)`;

  await sendTelegramMessage(channelId, message, 'HTML', {
    inline_keyboard: [[
      { text: "📱 Batafsil", url: "https://t.me/Ztobhavobot" }
    ]]
  });
}

export async function sendTelegramPhotoUrl(
  chatId: string,
  photoUrl: string,
  caption: string
) {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: "HTML",
      }),
    }
  );
  const result = await response.json();
  if (!result.ok) {
    console.error("Telegram sendPhoto error:", result);
    throw new Error(result.description || "Telegram sendPhoto error");
  }
  return result;
}

export async function sendTelegramPhotoBuffer(
  chatId: string,
  imageBuffer: Buffer,
  caption: string
) {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append(
    "photo",
    new Blob([imageBuffer], { type: "image/png" }),
    "news.png"
  );
  formData.append("caption", caption);
  formData.append("parse_mode", "HTML");

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
    { method: "POST", body: formData }
  );
  const result = await response.json();
  if (!result.ok) {
    console.error("Telegram sendPhoto (buffer) error:", result);
    throw new Error(result.description || "Telegram sendPhoto error");
  }
  return result;
}

export async function sendTelegramQuiz(
  chatId: string,
  question: string,
  options: [string, string, string, string],
  correctOptionId: 0 | 1 | 2 | 3,
  explanation: string
) {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN not set");

  // Runtime guard — reject malformed payloads before hitting Telegram API
  if (!question || question.trim().length < 3) throw new Error("Quiz question too short");
  if (!Array.isArray(options) || options.length !== 4 || options.some(o => !o || typeof o !== "string"))
    throw new Error("Quiz options must be exactly 4 non-empty strings");
  if (correctOptionId < 0 || correctOptionId > 3 || !Number.isInteger(correctOptionId))
    throw new Error(`Invalid correctOptionId: ${correctOptionId}`);

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendPoll`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        question,
        options,
        type: "quiz",
        correct_option_id: correctOptionId,
        explanation: explanation || undefined,
        is_anonymous: true,
      }),
    }
  );
  const result = await response.json();
  if (!result.ok) {
    console.error("Telegram sendPoll error:", result);
    throw new Error(result.description || "Telegram sendPoll error");
  }
  return result;
}

export async function sendDailyNewsToChannel(channelId: string): Promise<void> {
  console.log(`Generating daily news for ${channelId}...`);

  const news = await generateDailyNews();
  if (!news) {
    throw new Error(
      "OpenAI yangilik generatsiya qila olmadi. OPENAI_API_KEY yoki AI_INTEGRATIONS kaliti to'g'ri o'rnatilganligini tekshiring."
    );
  }

  const caption = formatNewsCaption(news);
  const vocabMsg = formatVocabMessage(news);
  console.log(`News generated. Caption: ${caption.length} chars, Vocab: ${vocabMsg.length} chars`);

  // 1. Send photo + caption (Arabic fact + Uzbek translation only)
  try {
    const img = await generateNewsImage(news.imagePrompt);
    if (img) {
      if (img.type === "buffer") {
        await sendTelegramPhotoBuffer(channelId, img.data, caption);
      } else {
        await sendTelegramPhotoUrl(channelId, img.data, caption);
      }
      console.log(`✓ News photo+caption sent to ${channelId}`);
    } else {
      console.warn("No image returned, sending text only");
      await sendTelegramMessage(channelId, caption, "HTML");
      console.log(`✓ News text-only sent to ${channelId}`);
    }
  } catch (imgErr: any) {
    console.warn("Image send failed, falling back to text:", imgErr?.message || imgErr);
    await sendTelegramMessage(channelId, caption, "HTML");
    console.log(`✓ News text-only (fallback) sent to ${channelId}`);
  }

  // 2. Send vocabulary as separate message (1s delay)
  try {
    await new Promise((r) => setTimeout(r, 1000));
    await sendTelegramMessage(channelId, vocabMsg, "HTML");
    console.log(`✓ Vocab message sent to ${channelId}`);
  } catch (vocabErr: any) {
    console.warn("Vocab send failed (non-fatal):", vocabErr?.message || vocabErr);
  }

  // 3. Generate and send quiz (2s delay after vocab)
  try {
    await new Promise((r) => setTimeout(r, 2000));
    const quiz = await generateNewsQuiz(news);
    if (quiz) {
      // Shuffle options so the correct answer isn't always option A
      const indexed = quiz.options.map((opt, i) => ({ opt, correct: i === quiz.correctIndex }));
      for (let i = indexed.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
      }
      const shuffledOptions = indexed.map(x => x.opt) as [string, string, string, string];
      const shuffledCorrect = indexed.findIndex(x => x.correct) as 0 | 1 | 2 | 3;

      await sendTelegramQuiz(
        channelId,
        `🧠 ${quiz.question}`,
        shuffledOptions,
        shuffledCorrect,
        quiz.explanation
      );
      console.log(`✓ Quiz sent to ${channelId}`);
    } else {
      console.warn("Quiz generation failed, skipping");
    }
  } catch (quizErr: any) {
    console.warn("Quiz send failed (non-fatal):", quizErr?.message || quizErr);
  }
}

// ─── Listening Channel Sender ──────────────────────────────────────────────────

function getListeningDateString(): string {
  const t = new Date();
  const uzTime = new Date(t.getTime() + 5 * 60 * 60 * 1000);
  const day = uzTime.getUTCDate();
  const year = uzTime.getUTCFullYear();
  const monthsUz = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];
  return `${day} ${monthsUz[uzTime.getUTCMonth()]} ${year}`;
}

async function sendTelegramAudio(chatId: string, audioBuffer: Buffer, caption: string): Promise<void> {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  form.append("audio", new Blob([audioBuffer], { type: "audio/mpeg" }), "listening.mp3");

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, {
    method: "POST",
    body: form,
  });
  const data = await response.json() as any;
  if (!data.ok) throw new Error(`Telegram sendAudio failed: ${data.description}`);
}

function shuffleQuizOptions(quiz: { question: string; options: [string,string,string,string]; correctIndex: 0|1|2|3; explanation: string }) {
  const indexed = quiz.options.map((opt, i) => ({ opt, correct: i === quiz.correctIndex }));
  for (let i = indexed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
  }
  return {
    options: indexed.map(x => x.opt) as [string,string,string,string],
    correctIndex: indexed.findIndex(x => x.correct) as 0|1|2|3,
  };
}

/** Determine listening level from Uzbekistan calendar day parity (odd=A1/A2, even=B1/B2) */
function getListeningLevelByDate(): ListeningLevel {
  const now = new Date();
  const uzDay = new Date(now.getTime() + 5 * 60 * 60 * 1000).getUTCDate();
  return uzDay % 2 !== 0 ? "A1A2" : "B1B2";
}

/** Flexible quiz poll — supports 3 or 4 options (for T/F/NG and MC polls) */
async function sendTelegramFlexQuiz(
  chatId: string,
  question: string,
  options: string[],
  correctOptionId: number,
  explanation: string
): Promise<void> {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN not set");
  if (!question || question.trim().length < 3) throw new Error("Quiz question too short");
  if (!Array.isArray(options) || options.length < 2 || options.some(o => !o || typeof o !== "string"))
    throw new Error("Quiz options invalid");
  if (correctOptionId < 0 || correctOptionId >= options.length)
    throw new Error(`Invalid correctOptionId: ${correctOptionId}`);

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendPoll`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        question,
        options,
        type: "quiz",
        correct_option_id: correctOptionId,
        explanation: explanation || undefined,
        is_anonymous: true,
      }),
    }
  );
  const result = await response.json() as any;
  if (!result.ok) {
    console.error("Telegram sendPoll (flex) error:", result);
    throw new Error(result.description || "Telegram sendPoll error");
  }
}

export async function sendDailyListeningToChannel(channelId: string): Promise<void> {
  console.log(`Generating listening content for ${channelId}...`);

  // Level strictly determined by Uzbekistan calendar day parity: odd=A1/A2, even=B1/B2
  const level: ListeningLevel = getListeningLevelByDate();
  const levelLabel = level === "A1A2" ? "🟢 A1/A2 — Boshlang'ich" : "🔵 B1/B2 — O'rta daraja";
  const levelTag = level === "A1A2" ? "A1/A2" : "B1/B2";

  // 1. Generate passage
  const passage = await generateListeningPassage(level);
  if (!passage) throw new Error("Listening passage generation failed");

  // 2. Generate exactly 3 quizzes — retry once if fewer than 3 returned
  let quizzes = await generateListeningQuizzes(passage, level);
  if (quizzes.length < 3) {
    console.warn(`Only ${quizzes.length} quizzes returned, retrying...`);
    const retry = await generateListeningQuizzes(passage, level);
    if (retry.length >= quizzes.length) quizzes = retry;
  }
  if (quizzes.length < 3) throw new Error(`Could not generate 3 quizzes (got ${quizzes.length})`);
  quizzes = quizzes.slice(0, 3);

  // 3. Generate dialog audio (ElevenLabs — male+female voices) — skip if unavailable
  const audioBuffer = await textToSpeechArabic(passage);
  if (!audioBuffer) {
    console.warn(`TTS unavailable for ${channelId} — skipping listening run`);
    throw new Error("ElevenLabs TTS unavailable — listening run skipped");
  }

  const date = getListeningDateString();
  const audioCaption = `🎧 <b>Tinglash Testi | اخْتِبَارُ الاسْتِمَاع</b>
📅 ${date}
${levelLabel}
🏷 <b>${passage.topicUz}</b> | ${passage.topicAr}

👨 أَحْمَد  ·  👩 سَارَة
🎵 <i>Dialogni diqqat bilan tinglang, so'ng savollarga javob bering!</i>
⬇️ Quyidagi testlarga javob bering`;

  // 4. Send audio
  await sendTelegramAudio(channelId, audioBuffer, audioCaption);
  console.log(`✓ Listening dialog audio sent to ${channelId}`);

  // 5. Send exactly 3 quiz polls (2s delay after audio, 1s between each)
  await new Promise(r => setTimeout(r, 2000));
  for (let i = 0; i < 3; i++) {
    const quiz = quizzes[i];
    const { options, correctIndex } = shuffleQuizOptions(quiz);
    const pollTitle = `🎧 [${levelTag}] | السَّمَاعَة\n❓ ${quiz.question}`;
    try {
      await sendTelegramQuiz(
        channelId,
        pollTitle,
        options,
        correctIndex,
        quiz.explanation
      );
      console.log(`✓ Listening quiz ${i + 1}/3 sent to ${channelId}`);
    } catch (qErr: any) {
      console.warn(`Quiz ${i + 1} send failed:`, qErr?.message);
    }
    if (i < 2) await new Promise(r => setTimeout(r, 1000));
  }

  // 6. Update lastSentAt and currentLevel (stored for reference, not used for scheduling)
  const nextLevel: ListeningLevel = level === "A1A2" ? "B1B2" : "A1A2";
  await storage.updateListeningChannelAfterSend(channelId, nextLevel);
  console.log(`✓ Listening done for ${channelId}, level used: ${level}`);
}

export async function startListeningScheduler() {
  setInterval(async () => {
    try {
      const channels = await storage.getEnabledListeningChannels();
      if (channels.length === 0) return;

      const now = new Date();
      const uzTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
      const currentHour = uzTime.getUTCHours();
      const currentMinute = uzTime.getUTCMinutes();
      const today = uzTime.toDateString();

      const due = channels.filter(ch => {
        const [h, m] = (ch.scheduledTime || "10:00").split(":").map(Number);
        if (currentHour !== h || currentMinute !== m) return false;
        const lastSent = ch.lastSentAt;
        return !lastSent || new Date(lastSent).toDateString() !== today;
      });

      await Promise.allSettled(
        due.map(ch =>
          sendDailyListeningToChannel(ch.chatId)
            .then(() => console.log(`✓ Listening sent to ${ch.title || ch.chatId}`))
            .catch((err: any) => console.error(`✗ Listening error [${ch.chatId}]:`, err?.message))
        )
      );
    } catch (error) {
      console.error("Error in listening scheduler:", error);
    }
  }, 60000);
}

// ─── Reading Channel Sender ────────────────────────────────────────────────────

export async function sendDailyReadingToChannel(channelId: string): Promise<void> {
  console.log(`Generating reading content for ${channelId}...`);

  const level: ReadingLevel = getReadingLevelByDate();
  const levelLabel = level === "A1A2" ? "🟢 A1/A2 — Boshlang'ich" : "🔵 B1/B2 — O'rta daraja";
  const levelTag = level === "A1A2" ? "A1/A2" : "B1/B2";

  // 1. Generate passage
  const passage = await generateReadingPassage(level);
  if (!passage) throw new Error("Reading passage generation failed");

  // 2. Generate quizzes — retry once if fewer than 3 returned
  let quizzes = await generateReadingQuizzes(passage, level);
  if (quizzes.length < 3) {
    console.warn(`Only ${quizzes.length} reading quizzes, retrying...`);
    const retry = await generateReadingQuizzes(passage, level);
    if (retry.length >= quizzes.length) quizzes = retry;
  }
  if (quizzes.length < 3) throw new Error(`Could not generate 3 reading quizzes (got ${quizzes.length})`);
  quizzes = quizzes.slice(0, 3);

  const date = getReadingDateString();

  // 3. Send intro message
  const introText = `📖 <b>O'qib Tushunish | اخْتِبَارُ القِرَاءَة</b>
📅 ${date}
${levelLabel}
🏷 <b>${passage.topicUz}</b> | ${passage.topicAr}

📌 Quyidagi arabcha matnni diqqat bilan o'qing, so'ng 3 ta savolga javob bering!
⬇️ <i>Matn quydagi xabar orqali keladi</i>`;

  await sendTelegramMessage(channelId, introText, "HTML");
  console.log(`✓ Reading intro sent to ${channelId}`);

  // 4. Send Arabic passage only (no translation)
  const passageText = `📄 <b>${passage.titleAr}</b>\n\n${passage.fullAr}`;

  if (passageText.length <= 4000) {
    await sendTelegramMessage(channelId, passageText, "HTML");
  } else {
    const chunks = passageText.match(/.{1,4000}/gs) || [passageText];
    for (const chunk of chunks) {
      await sendTelegramMessage(channelId, chunk, "HTML");
      await new Promise(r => setTimeout(r, 800));
    }
  }
  console.log(`✓ Reading passage sent to ${channelId}`);

  // 5. Send 3 quiz polls (2s delay after passage, 1s between each)
  await new Promise(r => setTimeout(r, 2000));

  const quizLabels = ["1️⃣ اختيار من متعدد", "2️⃣ صواب / غلط / غير معطى", "3️⃣ اختر العنوان"];

  for (let i = 0; i < 3; i++) {
    const quiz = quizzes[i];
    const { options, correctIndex } = shuffleReadingOptions(quiz);
    const pollQuestion = `📖 [${levelTag}] ${quizLabels[i]}\n❓ ${quiz.question}`;

    try {
      await sendTelegramFlexQuiz(
        channelId,
        pollQuestion,
        options,
        correctIndex,
        quiz.explanation
      );
      console.log(`✓ Reading quiz ${i + 1}/3 sent to ${channelId}`);
    } catch (qErr: any) {
      console.warn(`Reading quiz ${i + 1} send failed:`, qErr?.message);
    }
    if (i < 2) await new Promise(r => setTimeout(r, 1000));
  }

  // 6. Update lastSentAt and currentLevel
  const nextLevel: ReadingLevel = level === "A1A2" ? "B1B2" : "A1A2";
  await storage.updateReadingChannelAfterSend(channelId, nextLevel);
  console.log(`✓ Reading done for ${channelId}, level used: ${level}`);
}

export async function startReadingScheduler() {
  setInterval(async () => {
    try {
      const channels = await storage.getEnabledReadingChannels();
      if (channels.length === 0) return;

      const now = new Date();
      const uzTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
      const currentHour = uzTime.getUTCHours();
      const currentMinute = uzTime.getUTCMinutes();
      const today = uzTime.toDateString();

      const due = channels.filter(ch => {
        const [h, m] = (ch.scheduledTime || "11:00").split(":").map(Number);
        if (currentHour !== h || currentMinute !== m) return false;
        const lastSent = ch.lastSentAt;
        return !lastSent || new Date(lastSent).toDateString() !== today;
      });

      await Promise.allSettled(
        due.map(ch =>
          sendDailyReadingToChannel(ch.chatId)
            .then(() => console.log(`✓ Reading sent to ${ch.title || ch.chatId}`))
            .catch((err: any) => console.error(`✗ Reading error [${ch.chatId}]:`, err?.message))
        )
      );
    } catch (error) {
      console.error("Error in reading scheduler:", error);
    }
  }, 60000);
}

export async function startDailyNewsScheduler() {
  setInterval(async () => {
    try {
      const newsChannels = await storage.getEnabledNewsChannels();
      if (newsChannels.length === 0) return;

      const now = new Date();
      const uzTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
      const currentHour = uzTime.getUTCHours();
      const currentMinute = uzTime.getUTCMinutes();
      const today = uzTime.toDateString();

      const due = newsChannels.filter(ch => {
        const [h, m] = (ch.scheduledTime || "10:00").split(":").map(Number);
        if (currentHour !== h || currentMinute !== m) return false;
        const lastSent = ch.lastSentAt;
        return !lastSent || new Date(lastSent).toDateString() !== today;
      });

      await Promise.allSettled(
        due.map(ch =>
          sendDailyNewsToChannel(ch.chatId)
            .then(() => storage.updateNewsChannelLastSent(ch.chatId))
            .then(() => console.log(`✓ News sent to ${ch.title || ch.chatId}`))
            .catch((err: any) => console.error(`✗ News error [${ch.chatId}]:`, err?.message))
        )
      );
    } catch (error) {
      console.error("Error in daily news scheduler:", error);
    }
  }, 60000);
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
