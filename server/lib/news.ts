import { openai } from "./openai";

export interface DailyNews {
  arabicText: string;
  uzbekText: string;
  phrases: Array<{ arabic: string; uzbek: string }>;
  imagePrompt: string;
}

export async function generateDailyNews(): Promise<DailyNews | null> {
  const topics = [
    "الذكاء الاصطناعي",
    "الفضاء والنجوم",
    "الطاقة المتجددة",
    "الروبوتات",
    "الطب الحديث",
    "علم الأحياء",
    "تقنية المعلومات",
    "علم الفيزياء",
    "اكتشافات علمية حديثة",
    "تطور الإنترنت",
  ];
  const topic = topics[Math.floor(Math.random() * topics.length)];

  const prompt = `أنت صحفي عربي متخصص في أخبار التقنية والعلوم.
اكتب خبراً يومياً بالعربية الفصحى مع الحركات الكاملة (التشكيل) عن موضوع: ${topic}.

المتطلبات الصارمة:
- اللغة: عربية فصحى مع الحركات الكاملة على كل كلمة
- الطول: 50-70 كلمة تحديداً
- الأسلوب: أكاديمي وواضح ومناسب لتعليم اللغة العربية

ثم أضف:
- ترجمة كاملة دقيقة إلى اللغة الأوزبكية
- 3 عبارات مفيدة مختارة من النص مع ترجمتها إلى الأوزبكية
- وصف للصورة المناسبة بالإنجليزية لـ DALL-E (لا تشمل نصاً في الصورة)

أجب بتنسيق JSON فقط:
{
  "arabicText": "النص العربي مع الحركات هنا",
  "uzbekText": "O'zbekcha to'liq tarjima",
  "phrases": [
    {"arabic": "عبارة عربية", "uzbek": "O'zbekcha ma'no"},
    {"arabic": "عبارة عربية", "uzbek": "O'zbekcha ma'no"},
    {"arabic": "عبارة عربية", "uzbek": "O'zbekcha ma'no"}
  ],
  "imagePrompt": "Detailed English description for image generation"
}`;

  const models = ["gpt-5", "gpt-4o", "gpt-4-turbo"];

  for (const model of models) {
    try {
      console.log(`Trying model: ${model}`);
      const response = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content || "";
      console.log(`Model ${model} response length: ${content.length} chars`);

      if (!content) {
        console.warn(`Model ${model} returned empty content, trying next...`);
        continue;
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as DailyNews;
      }
      console.warn(`Could not parse JSON from ${model} response, trying next. Raw:`, content.slice(0, 200));
    } catch (error: any) {
      console.warn(`Model ${model} failed:`, error?.message || error);
    }
  }

  console.error("All models failed to generate news");
  return null;
}

export async function generateNewsImageUrl(prompt: string): Promise<string | null> {
  const fullPrompt = `Professional editorial illustration for an Arabic science and technology news post: ${prompt}. Style: modern flat design, vibrant colors, no text or writing in the image.`;

  // Try dall-e-3 first, fall back to dall-e-2
  const models: Array<{ model: string; size: "1024x1024" | "512x512" }> = [
    { model: "dall-e-3", size: "1024x1024" },
    { model: "dall-e-2", size: "512x512" },
  ];

  for (const { model, size } of models) {
    try {
      console.log(`Trying image model: ${model}`);
      const response = await openai.images.generate({
        model,
        prompt: fullPrompt,
        n: 1,
        size,
      });
      const url = response.data?.[0]?.url;
      if (url) {
        console.log(`Image URL generated with ${model}`);
        return url;
      }
    } catch (error: any) {
      console.warn(`Image model ${model} failed:`, error?.message || error);
    }
  }

  return null;
}

export function formatNewsCaption(news: DailyNews): string {
  const now = new Date();
  const uzTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const day = uzTime.getUTCDate();
  const monthsAr = [
    "يَنَايِر", "فِبْرَايِر", "مَارِس", "أَبْرِيل", "مَايُو", "يُونِيُو",
    "يُولِيُو", "أَغُسْطُس", "سِبْتَمْبَر", "أُكْتُوبَر", "نُوفَمْبَر", "دِيسَمْبَر",
  ];
  const monthAr = monthsAr[uzTime.getUTCMonth()];

  const phrasesLines = news.phrases
    .map((p) => `• <b>${p.arabic}</b> — ${p.uzbek}`)
    .join("\n");

  return `📰 <b>أَخْبَار التِّقْنِيَّة وَالْعِلْم</b>
📅 ${day} ${monthAr}

${news.arabicText}

━━━━━━━━━━━━━━━━━
🇺🇿 <b>O'zbekcha:</b>
${news.uzbekText}

━━━━━━━━━━━━━━━━━
📚 <b>Foydali arabcha iboralar:</b>
${phrasesLines}`;
}
