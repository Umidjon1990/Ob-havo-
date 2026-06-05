import { openai } from "./openai";

export interface DailyNews {
  topic: string;
  topicUz: string;
  arabicText: string;
  uzbekText: string;
  vocabulary: Array<{ arabic: string; uzbek: string }>;
  imagePrompt: string;
  source: string;
}

// ─── RSS Fetch ────────────────────────────────────────────────────────────────

interface RssItem {
  title: string;
  description: string;
  source: string;
}

const RSS_SOURCES = [
  { url: "https://www.aljazeera.net/rss/tech.xml", name: "Al Jazeera" },
  { url: "https://feeds.bbci.co.uk/arabic/science_and_technology/rss.xml", name: "BBC Arabic" },
  { url: "https://arabic.rt.com/rss/", name: "RT Arabic" },
];

function extractRssItems(xml: string, sourceName: string): RssItem[] {
  const items: RssItem[] = [];
  const itemMatches = xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi);
  for (const match of itemMatches) {
    const block = match[1];
    const titleMatch = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const descMatch = block.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    const title = titleMatch?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
    const desc = descMatch?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
    if (title && title.length > 10) {
      items.push({ title, description: desc.slice(0, 200), source: sourceName });
    }
  }
  return items;
}

async function fetchRealNewsHeadline(): Promise<RssItem | null> {
  // Shuffle sources for variety
  const shuffled = [...RSS_SOURCES].sort(() => Math.random() - 0.5);

  for (const src of shuffled) {
    try {
      const res = await fetch(src.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)" },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = extractRssItems(xml, src.name);
      if (items.length > 0) {
        // Pick a random item from the first 10
        const pick = items[Math.floor(Math.random() * Math.min(10, items.length))];
        console.log(`✓ RSS: "${pick.title.slice(0, 60)}..." from ${src.name}`);
        return pick;
      }
    } catch (e: any) {
      console.warn(`RSS ${src.name} failed:`, e?.message || e);
    }
  }
  return null;
}

// ─── News Generation ──────────────────────────────────────────────────────────

export async function generateDailyNews(): Promise<DailyNews | null> {
  const rss = await fetchRealNewsHeadline();

  let contextLine = "";
  let sourceName = "Texnologiya yangiliklari";

  if (rss) {
    contextLine = `الخبر الأصلي: "${rss.title}"\nالتفاصيل: "${rss.description}"`;
    sourceName = rss.source;
  } else {
    // Fallback: random topic if RSS fails
    const topics = [
      { ar: "الذَّكَاء الاصْطِنَاعِي", uz: "Sun'iy intellekt" },
      { ar: "الفَضَاء وَالنُّجُوم", uz: "Kosmosva yulduzlar" },
      { ar: "الطَّاقَة المُتَجَدِّدَة", uz: "Qayta tiklanadigan energiya" },
      { ar: "الرُّوبُوتَات", uz: "Robotlar" },
      { ar: "الطِّب الحَدِيث", uz: "Zamonaviy tibbiyot" },
      { ar: "الهَنْدَسَة الوِرَاثِيَّة", uz: "Genetik muhandislik" },
    ];
    const t = topics[Math.floor(Math.random() * topics.length)];
    contextLine = `الموضوع: ${t.ar}`;
    sourceName = "Texnologiya yangiliklari";
  }

  const prompt = `أنت صحفي وأستاذ لغة عربية. لديك الخبر التالي:

${contextLine}

المطلوب منك:
1. أعِد صياغة هذا الخبر بالعربية الفصحى مع الحركات الكاملة (التشكيل) على كل كلمة.
   - الطول: 30-40 كلمة فقط (مهم جداً — اجعله قصيراً ومركزاً)
   - الأسلوب: أكاديمي وواضح ومناسب لتعليم اللغة العربية
2. اكتب ترجمة موجزة (جملتان فقط) إلى الأوزبكية
3. اختر 10 مفردات مهمة من النص مع معناها بالأوزبكية (بحركات كاملة)
4. أعطِ وصفاً بالإنجليزية لصورة تعبر عن الموضوع (بدون نص في الصورة)
5. حدد موضوع الخبر باختصار بالعربية والأوزبكية

أجب بـ JSON فقط:
{
  "topic": "موضوع قصير بالعربية",
  "topicUz": "Mavzu o'zbekcha",
  "arabicText": "النص العربي القصير مع الحركات",
  "uzbekText": "Ikki jumladan iborat o'zbekcha tarjima.",
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
  "imagePrompt": "Vivid description for image generation, no text"
}`;

  const models = ["gpt-5", "gpt-4o", "gpt-4-turbo"];

  for (const model of models) {
    try {
      console.log(`Trying text model: ${model}`);
      const response = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1200,
      });

      const content = response.choices[0]?.message?.content || "";
      if (!content) {
        console.warn(`Model ${model} empty content`);
        continue;
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          topic: parsed.topic || "",
          topicUz: parsed.topicUz || "",
          arabicText: parsed.arabicText || "",
          uzbekText: parsed.uzbekText || "",
          vocabulary: parsed.vocabulary || [],
          imagePrompt: parsed.imagePrompt || "",
          source: sourceName,
        } as DailyNews;
      }
      console.warn(`Could not parse JSON from ${model}`);
    } catch (e: any) {
      console.warn(`Model ${model} failed:`, e?.message || e);
    }
  }

  console.error("All text models failed");
  return null;
}

// ─── Image Generation ─────────────────────────────────────────────────────────

export type ImageResult =
  | { type: "buffer"; data: Buffer }
  | { type: "url"; data: string };

async function downloadImageAsBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (e: any) {
    console.warn("Image download error:", e?.message || e);
    return null;
  }
}

export async function generateNewsImage(prompt: string): Promise<ImageResult | null> {
  const fullPrompt = `High quality editorial illustration: ${prompt}. Style: modern, professional, vibrant. No text, no letters, no writing anywhere.`;

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

      const b64 = (response.data?.[0] as any)?.b64_json;
      if (b64) {
        console.log(`✓ Image ready (${cfg.model}, base64)`);
        return { type: "buffer", data: Buffer.from(b64, "base64") };
      }

      const url = response.data?.[0]?.url;
      if (url) {
        console.log(`✓ Downloading image from ${cfg.model}...`);
        const buf = await downloadImageAsBuffer(url);
        if (buf) {
          console.log(`✓ Image downloaded (${buf.length} bytes)`);
          return { type: "buffer", data: buf };
        }
        return { type: "url", data: url };
      }
    } catch (e: any) {
      console.warn(`✗ ${cfg.model}:`, e?.message || e);
    }
  }

  console.warn("All image models failed");
  return null;
}

// ─── Caption Formatting ───────────────────────────────────────────────────────

function getDateString() {
  const now = new Date();
  const t = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const day = t.getUTCDate();
  const year = t.getUTCFullYear();
  const monthsUz = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];
  const monthsAr = ["يَنَايِر","فِبْرَايِر","مَارِس","أَبْرِيل","مَايُو","يُونِيُو","يُولِيُو","أَغُسْطُس","سِبْتَمْبَر","أُكْتُوبَر","نُوفَمْبَر","دِيسَمْبَر"];
  return `${day} ${monthsAr[t.getUTCMonth()]} ${year} | ${day} ${monthsUz[t.getUTCMonth()]} ${year}`;
}

// Single all-in-one caption (fits within Telegram's 1024 char photo limit)
export function formatSingleCaption(news: DailyNews): string {
  const date = getDateString();
  const vocabLines = news.vocabulary
    .slice(0, 10)
    .map((v, i) => `${i + 1}. ${v.arabic} — ${v.uzbek}`)
    .join("\n");

  return `📰 <b>أَخْبَار التِّقْنِيَّة وَالْعِلْم</b>
📅 ${date}
🏷 <b>${news.topicUz}</b> | ${news.topic}

${news.arabicText}

🇺🇿 ${news.uzbekText}

📖 <b>Foydali so'zlar:</b>
${vocabLines}`;
}

// Backwards-compatible aliases
export function formatPhotoCaption(news: DailyNews): string {
  return formatSingleCaption(news);
}
export function formatNewsText(_news: DailyNews): string {
  return "";
}
export function formatNewsCaption(news: DailyNews): string {
  return formatSingleCaption(news);
}
