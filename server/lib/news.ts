import { openai } from "./openai";

export interface DailyNews {
  topic: string;
  topicUz: string;
  arabicText: string;
  uzbekText: string;
  vocabulary: Array<{ arabic: string; uzbek: string }>;
  imagePrompt: string;
}

export async function generateDailyNews(): Promise<DailyNews | null> {
  const topics = [
    { ar: "الذَّكَاء الاصْطِنَاعِي", uz: "Sun'iy intellekt" },
    { ar: "الفَضَاء وَالنُّجُوم", uz: "Kosmosva yulduzlar" },
    { ar: "الطَّاقَة المُتَجَدِّدَة", uz: "Qayta tiklanadigan energiya" },
    { ar: "الرُّوبُوتَات", uz: "Robotlar" },
    { ar: "الطِّب الحَدِيث", uz: "Zamonaviy tibbiyot" },
    { ar: "عِلْم الأَحْيَاء", uz: "Biologiya" },
    { ar: "تَقْنِيَة المَعْلُومَات", uz: "Axborot texnologiyalari" },
    { ar: "عِلْم الفِيزْيَاء", uz: "Fizika fani" },
    { ar: "اكْتِشَافَات عِلْمِيَّة حَدِيثَة", uz: "Yangi ilmiy kashfiyotlar" },
    { ar: "تَطَوُّر الإِنْتَرْنِت", uz: "Internetning rivojlanishi" },
    { ar: "الهَنْدَسَة الوِرَاثِيَّة", uz: "Genetik muhandislik" },
    { ar: "الحَوْسَبَة الكَمِّيَّة", uz: "Kvant hisoblash" },
  ];
  const chosen = topics[Math.floor(Math.random() * topics.length)];

  const prompt = `أنت صحفي وأستاذ لغة عربية متخصص في أخبار التقنية والعلوم.

اكتب خبراً يومياً تعليمياً بالعربية الفصحى مع الحركات الكاملة (التشكيل) عن موضوع: ${chosen.ar}.

المتطلبات الصارمة:
- اللغة: عربية فصحى مع الحركات الكاملة على كل كلمة
- الطول: 50-70 كلمة تحديداً
- الأسلوب: أكاديمي وواضح ومناسب لتعليم اللغة العربية

ثم أضف:
1. ترجمة كاملة دقيقة إلى الأوزبكية
2. 10 مفردات مفيدة من نص الخبر مع ترجمتها إلى الأوزبكية (بحركات كاملة)
3. وصف تفصيلي بالإنجليزية لصورة جميلة تعبر عن الموضوع (بدون نصوص أو كتابة في الصورة)

أجب بتنسيق JSON فقط بدون أي نص إضافي:
{
  "arabicText": "النص العربي مع الحركات هنا",
  "uzbekText": "O'zbekcha to'liq tarjima",
  "vocabulary": [
    {"arabic": "كَلِمَة", "uzbek": "ma'no"},
    {"arabic": "كَلِمَة", "uzbek": "ma'no"},
    {"arabic": "كَلِمَة", "uzbek": "ma'no"},
    {"arabic": "كَلِمَة", "uzbek": "ma'no"},
    {"arabic": "كَلِمَة", "uzbek": "ma'no"},
    {"arabic": "كَلِمَة", "uzbek": "ma'no"},
    {"arabic": "كَلِمَة", "uzbek": "ma'no"},
    {"arabic": "كَلِمَة", "uzbek": "ma'no"},
    {"arabic": "كَلِمَة", "uzbek": "ma'no"},
    {"arabic": "كَلِمَة", "uzbek": "ma'no"}
  ],
  "imagePrompt": "Detailed vivid English description for AI image generation, no text in image"
}`;

  const models = ["gpt-5", "gpt-4o", "gpt-4-turbo"];

  for (const model of models) {
    try {
      console.log(`Trying text model: ${model}`);
      const response = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1500,
      });

      const content = response.choices[0]?.message?.content || "";
      console.log(`Model ${model} response: ${content.length} chars`);

      if (!content) {
        console.warn(`Model ${model} returned empty content, trying next...`);
        continue;
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          topic: chosen.ar,
          topicUz: chosen.uz,
          arabicText: parsed.arabicText,
          uzbekText: parsed.uzbekText,
          vocabulary: parsed.vocabulary || [],
          imagePrompt: parsed.imagePrompt,
        } as DailyNews;
      }
      console.warn(`Could not parse JSON from ${model}. Raw:`, content.slice(0, 200));
    } catch (error: any) {
      console.warn(`Model ${model} failed:`, error?.message || error);
    }
  }

  console.error("All text models failed to generate news");
  return null;
}

export type ImageResult =
  | { type: "buffer"; data: Buffer }
  | { type: "url"; data: string };

async function downloadImageAsBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Image download failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e: any) {
    console.warn("Image download error:", e?.message || e);
    return null;
  }
}

export async function generateNewsImage(prompt: string): Promise<ImageResult | null> {
  const fullPrompt = `High quality editorial illustration for a science and technology news article about: ${prompt}. Modern, professional, vibrant colors. No text, no letters, no writing anywhere in the image.`;

  // Model list: newest first
  const imageModels = [
    { model: "gpt-image-1", size: "1024x1024" as const },
    { model: "dall-e-3", size: "1024x1024" as const },
    { model: "dall-e-2", size: "512x512" as const },
  ];

  for (const cfg of imageModels) {
    try {
      console.log(`Trying image model: ${cfg.model}`);
      const response = await openai.images.generate({
        model: cfg.model as any,
        prompt: fullPrompt,
        n: 1,
        size: cfg.size as any,
      } as any);

      // Try base64 first (gpt-image-1 style)
      const b64 = (response.data?.[0] as any)?.b64_json;
      if (b64) {
        console.log(`✓ Image ready (${cfg.model}, base64)`);
        return { type: "buffer", data: Buffer.from(b64, "base64") };
      }

      // Try URL — download ourselves for reliability
      const url = response.data?.[0]?.url;
      if (url) {
        console.log(`✓ Image URL from ${cfg.model}, downloading...`);
        const buf = await downloadImageAsBuffer(url);
        if (buf) {
          console.log(`✓ Image downloaded (${buf.length} bytes)`);
          return { type: "buffer", data: buf };
        }
        // If download fails, still try URL directly
        console.warn(`Download failed, trying direct URL for ${cfg.model}`);
        return { type: "url", data: url };
      }

      console.warn(`${cfg.model}: no image data in response`);
    } catch (e: any) {
      console.warn(`✗ ${cfg.model} failed:`, e?.message || e);
    }
  }

  console.warn("All image models failed");
  return null;
}

function getDateStrings() {
  const now = new Date();
  const uzTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const day = uzTime.getUTCDate();
  const year = uzTime.getUTCFullYear();
  const monthsAr = [
    "يَنَايِر","فِبْرَايِر","مَارِس","أَبْرِيل","مَايُو","يُونِيُو",
    "يُولِيُو","أَغُسْطُس","سِبْتَمْبَر","أُكْتُوبَر","نُوفَمْبَر","دِيسَمْبَر",
  ];
  const monthsUz = [
    "Yanvar","Fevral","Mart","Aprel","May","Iyun",
    "Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr",
  ];
  return {
    ar: `${day} ${monthsAr[uzTime.getUTCMonth()]} ${year}`,
    uz: `${day} ${monthsUz[uzTime.getUTCMonth()]} ${year}`,
  };
}

// Short caption for photo (max ~900 chars — Telegram limit is 1024)
export function formatPhotoCaption(news: DailyNews): string {
  const date = getDateStrings();
  return `📰 <b>أَخْبَار التِّقْنِيَّة وَالْعِلْم</b>
📅 ${date.ar} | ${date.uz}
🏷 <b>Mavzu:</b> ${news.topicUz} | <b>${news.topic}</b>

${news.arabicText}`;
}

// Full text message with translation + vocabulary
export function formatNewsText(news: DailyNews): string {
  const vocabLines = news.vocabulary
    .slice(0, 10)
    .map((v, i) => `${i + 1}. <b>${v.arabic}</b> — ${v.uzbek}`)
    .join("\n");

  return `🇺🇿 <b>O'zbekcha:</b>
${news.uzbekText}

━━━━━━━━━━━━━━━━━
📖 <b>Foydali so'zlar (10 ta):</b>
${vocabLines}

━━━━━━━━━━━━━━━━━
📌 <b>Manba:</b> Texnologiya va fan yangiliklari
🤖 <b>AI:</b> GPT-4o | 🖼 GPT-Image`;
}

// Kept for backwards compatibility (text-only fallback)
export function formatNewsCaption(news: DailyNews): string {
  return formatPhotoCaption(news) + "\n\n" + formatNewsText(news);
}
