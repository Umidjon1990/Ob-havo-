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
  { url: "https://www.aljazeera.net/rss/science.xml", name: "Al Jazeera" },
  { url: "https://feeds.bbci.co.uk/arabic/science_and_technology/rss.xml", name: "BBC Arabic" },
  { url: "https://www.aljazeera.net/rss/health.xml", name: "Al Jazeera Salomatlik" },
];

// Allowed topic areas: education, medicine, history, culture, science, environment
const ALLOWED_KEYWORDS = [
  "علم", "تعليم", "صحة", "طب", "دواء", "تاريخ", "ثقافة", "حضارة", "اكتشاف",
  "بحث", "دراسة", "فضاء", "طبيعة", "بيئة", "تكنولوجيا", "ذكاء", "نبات", "حيوان",
  "جامعة", "مدرسة", "علاج", "مرض", "لغة", "أثر", "تراث", "رياضيات", "فيزياء",
  "كيمياء", "أحياء", "هندسة", "كمبيوتر", "فلك", "جغرافيا", "اقتصاد",
];

// Blocked: political, religious, sports scandal topics
const BLOCKED_KEYWORDS = [
  // Political
  "سياس", "حكوم", "رئيس", "وزير", "برلمان", "انتخاب", "حزب", "ثور", "حرب",
  "عسكر", "جيش", "قوات", "هجوم", "اعتداء", "صراع", "أزمة", "احتجاج",
  "معارض", "ديمقراط", "جمهور", "ترامب", "بايدن", "بوتين", "نتنياهو",
  "trump", "biden", "putin", "election", "president", "minister", "war", "military",
  // Religious / sectarian
  "فتوى", "طائفة", "شيعة", "سنة", "صهيون", "إسرائيل", "فلسطين", "جهاد",
  "شيخ", "إمام", "تلاوة", "قرآن", "مسجد", "كنيسة",
  // Sports
  "كأس", "مباراة", "ملعب", "فضيحة", "هدف", "لاعب", "نادي", "تصفيات",
  "كرة", "بطولة", "مونديال", "دوري", "فيفا",
];

function isBlockedTopic(title: string, desc: string): boolean {
  const text = (title + " " + desc).toLowerCase();
  return BLOCKED_KEYWORDS.some(kw => text.toLowerCase().includes(kw.toLowerCase()));
}

function isAllowedTopic(title: string, desc: string): boolean {
  if (isBlockedTopic(title, desc)) return false;
  const text = (title + " " + desc).toLowerCase();
  return ALLOWED_KEYWORDS.some(kw => text.includes(kw));
}

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

      // Filter to allowed topic areas only
      const filtered = items.filter(it => isAllowedTopic(it.title, it.description));
      const pool = filtered.length > 0 ? filtered : items;

      if (pool.length > 0) {
        const pick = pool[Math.floor(Math.random() * Math.min(10, pool.length))];
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
    // Fallback: educational / medical / historical topics
    const topics = [
      { ar: "التَّعْلِيم وَطُرُق التَّدْرِيس الحَدِيثَة", uz: "Zamonaviy ta'lim usullari" },
      { ar: "الطِّب وَالصِّحَّة الإِنْسَانِيَّة", uz: "Tibbiyot va inson salomatligi" },
      { ar: "تَارِيخ الحَضَارَة الإِسْلَامِيَّة", uz: "Islom sivilizatsiyasi tarixi" },
      { ar: "الاكْتِشَافَات العِلْمِيَّة فِي عِلْم الأَحْيَاء", uz: "Biologiyadagi kashfiyotlar" },
      { ar: "الفَلَك وَاسْتِكْشَاف الفَضَاء", uz: "Astronomiya va kosmosni o'rganish" },
      { ar: "تَارِيخ اللُّغَة العَرَبِيَّة وَتَطَوُّرُهَا", uz: "Arab tili tarixi va rivojlanishi" },
      { ar: "الطَّاقَة المُتَجَدِّدَة وَالبِيئَة", uz: "Qayta tiklanadigan energiya va atrof-muhit" },
      { ar: "عِلْم النَّفْس وَالسُّلُوك البَشَرِي", uz: "Psixologiya va inson xulq-atvori" },
      { ar: "التَّغَذِيَة وَالصِّحَّة العَامَّة", uz: "Ovqatlanish va umumiy salomatlik" },
      { ar: "الرِّيَاضِيَّات وَتَطْبِيقَاتُهَا الحَدِيثَة", uz: "Matematika va uning zamonaviy qo'llanilishi" },
      { ar: "تَارِيخ الطِّب عِنْدَ العَرَب", uz: "Arablarda tibbiyot tarixi" },
      { ar: "عِلْم الوِرَاثَة وَالجِينَات", uz: "Genetika va irsiyat ilmi" },
    ];
    const t = topics[Math.floor(Math.random() * topics.length)];
    contextLine = `الموضوع: ${t.ar}`;
    sourceName = "Ta'lim va fan";
  }

  const prompt = `أنت صحفي وأستاذ لغة عربية. لديك الخبر التالي:

${contextLine}

المطلوب منك:
1. أعِد صياغة هذا الخبر بالعربية الفصحى مع الحركات الكاملة (التشكيل) على كل كلمة.
   - الطول: 50-70 كلمة تحديداً (مهم جداً — لا أقل ولا أكثر)
   - الأسلوب: أكاديمي وواضح ومناسب لتعليم اللغة العربية
   - الموضوع يجب أن يكون في مجال: التعليم أو الطب أو التاريخ أو الثقافة أو العلوم أو البيئة
   - ⚠️ ممنوع تماماً: أي محتوى سياسي (سياسيون، حكومات، انتخابات، حروب) أو ديني (فتاوى، طوائف، نزاعات دينية)
2. اكتب ترجمة كاملة ودقيقة إلى الأوزبكية — يجب أن تعكس كل جملة عربية بدقة، لا تختصر ولا تضف معلومات جديدة
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

const CAPTION_LIMIT = 1020;

// Single all-in-one caption — trims vocab items to stay within Telegram's 1024 char limit
export function formatSingleCaption(news: DailyNews): string {
  const date = getDateString();

  const header = `📰 <b>أَخْبَار التِّقْنِيَّة وَالْعِلْم</b>
📅 ${date}
🏷 <b>${news.topicUz}</b> | ${news.topic}

${news.arabicText}

🇺🇿 ${news.uzbekText}

📖 <b>Foydali so'zlar:</b>`;

  // Add vocab items one by one until limit is hit
  let caption = header;
  for (let i = 0; i < Math.min(10, news.vocabulary.length); i++) {
    const v = news.vocabulary[i];
    const line = `\n${i + 1}. ${v.arabic} — ${v.uzbek}`;
    if (caption.length + line.length > CAPTION_LIMIT) break;
    caption += line;
  }

  return caption;
}

// ─── Quiz Generation ──────────────────────────────────────────────────────────

export interface NewsQuiz {
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
}

export async function generateNewsQuiz(news: DailyNews): Promise<NewsQuiz | null> {
  const prompt = `Siz arabcha til o'qituvchisisiz. Quyidagi yangilik asosida Telegram quiz yarating.

Yangilik mavzusi: ${news.topic} (${news.topicUz})
Arabcha matn: ${news.arabicText}
O'zbekcha tarjima: ${news.uzbekText}

Quiz talablari:
- Savol IKKI TILDA bo'lsin: avval arabcha (harakatlar bilan), keyin o'zbekcha
  Format: "❓ [arabcha savol]\n🇺🇿 [o'zbekcha savol]"
- 4 ta javob varianti: bittasi to'g'ri, uchtasi chalg'ituvchi lekin mantiqiy
- Javoblar o'zbek tilida, qisqa (max 80 belgi)
- Savol OSON bo'lmasin — mazmunni tushunishni yoki arabcha so'zlarni bilishni sinasin
- Explanation (izohlash) o'zbek tilida, qisqacha

Faqat JSON qaytaring:
{
  "question": "❓ هَلْ تَعْرِفُ...؟\n🇺🇿 Savol o'zbekcha?",
  "options": ["Variant A", "Variant B", "Variant C", "Variant D"],
  "correctIndex": 0,
  "explanation": "Nima uchun bu to'g'ri javob (qisqacha)"
}`;

  const models = ["gpt-5", "gpt-4o", "gpt-4-turbo"];
  for (const model of models) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 500,
      });
      const content = response.choices[0]?.message?.content || "";
      if (!content) continue;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        // Sanitize control characters that break JSON.parse
        const sanitized = jsonMatch[0].replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ");
        const parsed = JSON.parse(sanitized);
        if (
          parsed.question &&
          Array.isArray(parsed.options) &&
          parsed.options.length === 4 &&
          parsed.options.every((o: unknown) => typeof o === "string" && o.trim()) &&
          typeof parsed.correctIndex === "number" &&
          parsed.correctIndex >= 0 && parsed.correctIndex <= 3
        ) {
          return {
            question: parsed.question.trim(),
            options: parsed.options.map((o: string) => o.trim().slice(0, 100)) as [string, string, string, string],
            correctIndex: parsed.correctIndex as 0 | 1 | 2 | 3,
            explanation: (parsed.explanation || "").trim().slice(0, 200),
          };
        }
      }
      console.warn(`Quiz JSON parse failed for ${model}`);
    } catch (e: any) {
      console.warn(`Quiz model ${model} failed:`, e?.message || e);
    }
  }
  console.warn("All quiz models failed");
  return null;
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
