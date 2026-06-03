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

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as DailyNews;
    }
    console.error("Could not parse news JSON from:", content);
    return null;
  } catch (error) {
    console.error("Error generating daily news:", error);
    return null;
  }
}

export async function generateNewsImage(prompt: string): Promise<Buffer | null> {
  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: `Professional editorial illustration for an Arabic science and technology news post: ${prompt}. Style: modern flat design, vibrant colors, no text or writing in the image.`,
      n: 1,
      size: "1024x1024",
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) return null;

    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) return null;

    const arrayBuffer = await imgResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error("Error generating news image:", error);
    return null;
  }
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
