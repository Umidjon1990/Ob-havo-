import OpenAI from "openai";

const isReplit = !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const openai = new OpenAI(
  isReplit
    ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL, apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY }
    : { apiKey: process.env.OPENAI_API_KEY }
);

export type ReadingLevel = "A1A2" | "B1B2";

export interface ReadingPassage {
  titleAr: string;
  titleUz: string;
  paragraphsAr: [string, string, string];
  paragraphsUz: [string, string, string];
  fullAr: string;
  fullUz: string;
  topicAr: string;
  topicUz: string;
}

export interface ReadingQuiz {
  type: "multiple_choice" | "true_false_ng" | "best_title";
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

/** Strip Arabic diacritics (harakat) — reused from listening */
export function stripHarakat(text: string): string {
  return text.replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g, "").trim();
}

/** Fisher-Yates shuffle preserving correct answer index */
export function shuffleReadingOptions(quiz: ReadingQuiz): { options: string[]; correctIndex: number } {
  const indexed = quiz.options.map((opt, i) => ({ opt, correct: i === quiz.correctIndex }));
  for (let i = indexed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
  }
  return {
    options: indexed.map(x => x.opt),
    correctIndex: indexed.findIndex(x => x.correct),
  };
}

// ─── Topics ───────────────────────────────────────────────────────────────────

const TOPICS_A1A2 = [
  "أسواق التسوق في المدينة",
  "وصف المنزل والغرف",
  "الطقس والفصول الأربعة",
  "الطعام والمطبخ التقليدي",
  "وسائل المواصلات اليومية",
  "الأسرة والعلاقات الاجتماعية",
  "الحيوانات الأليفة",
  "المدرسة والدراسة",
  "الصحة والرياضة اليومية",
  "الهوايات والترفيه",
  "الأسواق الشعبية",
  "زيارة الطبيب",
  "التخطيط لرحلة قصيرة",
  "احتفالات الأعياد",
  "الحدائق العامة والطبيعة",
];

const TOPICS_B1B2 = [
  "التغير المناخي وتأثيره على البيئة",
  "الاقتصاد الرقمي والعمل عن بُعد",
  "علم النفس والسلوك الإنساني",
  "التعليم العالي والابتكار",
  "الصحة العامة وانتشار الأوبئة",
  "الذكاء الاصطناعي وتحولات المجتمع",
  "التنمية المستدامة والطاقة المتجددة",
  "الهجرة والتنوع الثقافي",
  "الفضاء واستكشاف الكون",
  "الاقتصاد السلوكي وقرارات الشراء",
  "تاريخ الحضارات القديمة",
  "الروبوتات ومستقبل العمل",
  "الأبحاث العلمية والاكتشافات الحديثة",
  "وسائل الإعلام وتشكيل الرأي العام",
  "المدن الذكية والبنية التحتية",
];

// ─── Passage Generation ───────────────────────────────────────────────────────

export async function generateReadingPassage(level: ReadingLevel): Promise<ReadingPassage | null> {
  const topics = level === "A1A2" ? TOPICS_A1A2 : TOPICS_B1B2;
  const topic = topics[Math.floor(Math.random() * topics.length)];

  const wordCount = level === "A1A2"
    ? "100–130 كلمة، جمل قصيرة وبسيطة، مفردات يومية"
    : "180–220 كلمة، أسلوب أكاديمي، تراكيب معقدة، مفردات متقدمة";

  const prompt = `أنت خبير IELTS Reading Academic متخصص في إعداد نصوص اختبارية.
اكتب نصاً قابلاً للاختبار عن موضوع: "${topic}"

المواصفات:
- المستوى: ${level === "A1A2" ? "A1/A2 مبتدئ" : "B1/B2 متوسط-متقدم"} — ${wordCount}
- 3 فقرات بالضبط: (1) مقدمة، (2) محتوى رئيسي، (3) خاتمة
- كل فقرة تحتوي على:
  * معلومة قابلة للاختبار: رقم دقيق أو تاريخ أو اسم أو مقارنة أو نسبة مئوية
  * جملة رأي (لتمكين T/F/NG)
  * جملة حقيقة واضحة
- التشكيل الكامل على النص العربي كله بدون استثناء
- ممنوع: السياسة، الطائفية، المحتوى الحساس

أجب بـ JSON فقط:
{
  "titleAr": "عنوان بالعربية مع تشكيل",
  "titleUz": "Sarlavha o'zbekcha",
  "topicAr": "عنوان قصير جداً",
  "topicUz": "Qisqa mavzu",
  "paragraphsAr": [
    "الفقرة الأولى مع تشكيل كامل...",
    "الفقرة الثانية مع تشكيل كامل...",
    "الفقرة الثالثة مع تشكيل كامل..."
  ],
  "paragraphsUz": [
    "Birinchi paragraf o'zbekcha (harakatsiz)...",
    "Ikkinchi paragraf o'zbekcha...",
    "Uchinchi paragraf o'zbekcha..."
  ]
}`;

  const models = ["gpt-5", "gpt-4o", "gpt-4-turbo"];
  for (const model of models) {
    try {
      console.log(`Reading passage model: ${model}`);
      const response = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 2000,
      });
      const content = response.choices[0]?.message?.content || "";
      if (!content) continue;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;
      const sanitized = jsonMatch[0].replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ");
      const parsed = JSON.parse(sanitized);
      if (
        parsed.titleAr && parsed.titleUz &&
        Array.isArray(parsed.paragraphsAr) && parsed.paragraphsAr.length === 3 &&
        Array.isArray(parsed.paragraphsUz) && parsed.paragraphsUz.length === 3 &&
        parsed.paragraphsAr.every((p: unknown) => typeof p === "string" && (p as string).trim().length > 10)
      ) {
        const fullAr = parsed.paragraphsAr.map((p: string) => p.trim()).join("\n\n");
        const fullUz = parsed.paragraphsUz.map((p: string) => p.trim()).join("\n\n");
        console.log(`✓ Reading passage generated (${model}), topic: ${parsed.topicUz || topic}`);
        return {
          titleAr: parsed.titleAr.trim(),
          titleUz: parsed.titleUz.trim(),
          paragraphsAr: [parsed.paragraphsAr[0].trim(), parsed.paragraphsAr[1].trim(), parsed.paragraphsAr[2].trim()],
          paragraphsUz: [parsed.paragraphsUz[0].trim(), parsed.paragraphsUz[1].trim(), parsed.paragraphsUz[2].trim()],
          fullAr,
          fullUz,
          topicAr: (parsed.topicAr || parsed.titleAr).trim(),
          topicUz: (parsed.topicUz || parsed.titleUz).trim(),
        };
      }
    } catch (e: any) {
      console.warn(`Reading passage model ${model} failed:`, e?.message || e);
    }
  }
  console.warn("All reading passage models failed");
  return null;
}

// ─── Quiz Generation ──────────────────────────────────────────────────────────

export async function generateReadingQuizzes(
  passage: ReadingPassage,
  level: ReadingLevel
): Promise<ReadingQuiz[]> {
  const levelDesc = level === "A1A2"
    ? "A1/A2 — أسئلة مباشرة تختبر فهم تفاصيل واضحة"
    : "B1/B2 — أسئلة IELTS Academic عالية المستوى تتطلب استنتاجاً";

  const prompt = `أنت محكّم IELTS Reading Academic معتمد. بناءً على النص التالي، اكتب 3 أسئلة من 3 أنواع مختلفة.

النص:
${passage.fullAr}

المستوى: ${levelDesc}

⚠️ اكتب بالضبط 3 أسئلة بهذه الأنواع بالترتيب:

**السؤال 1 — اختيار من متعدد (أ، ب، ج، د):**
- يختبر فهم تفصيل محدد أو استنتاج يربط جملتين
- 4 خيارات: الصحيح + 3 خيارات تستخدم "IELTS Trap":
  * نفس الكلمات من النص لكن بسياق مختلف
  * رقم قريب من الصحيح (مثلاً 130 بدل 150)
  * معلومة صحيحة لكن تنتمي لجزء آخر من النص
- كل خيار جملة قصيرة (max 80 حرف)

**السؤال 2 — صواب / غلط / غير معطى:**
- العبارة: جملة تخبر بها المُختبَر ما إذا كانت موجودة في النص
- صواب = المعلومة في النص وصحيحة تماماً
- غلط = المعلومة في النص لكنها تناقض ما ورد
- غير معطى = غير موجودة في النص ولا يمكن استنتاجها
- الخيارات بالترتيب: ["صواب", "غلط", "غير معطى"]

**السؤال 3 — اختر العنوان المناسب:**
- السؤال: "أَيُّ عُنْوَان يُنَاسِبُ هَذَا النَّصَّ؟"
- العنوان الصحيح يلخص النص كله وفكرته الرئيسية
- 3 عناوين خاطئة:
  * واحد يغطي فقرة واحدة فقط
  * واحد أوسع بكثير من موضوع النص
  * واحد عن موضوع ثانوي ذُكر في النص

**قواعد الصياغة:**
- الأسئلة والخيارات والشرح: بالعربية فقط، بدون تشكيل (harakatsiz)
- max 80 حرف لكل خيار
- الشرح: ما يُثبت الإجابة الصحيحة + لماذا أقوى خيار خاطئ مُغرٍ

أجب بـ JSON فقط — مصفوفة من 3 كائنات:
[
  {
    "type": "multiple_choice",
    "question": "السؤال الأول",
    "options": ["خيار أ", "خيار ب", "خيار ج", "خيار د"],
    "correctIndex": 2,
    "explanation": "الشرح..."
  },
  {
    "type": "true_false_ng",
    "question": "العبارة: '...'",
    "options": ["صواب", "غلط", "غير معطى"],
    "correctIndex": 0,
    "explanation": "الشرح..."
  },
  {
    "type": "best_title",
    "question": "أي عنوان يناسب هذا النص؟",
    "options": ["عنوان أ", "عنوان ب", "عنوان ج", "عنوان د"],
    "correctIndex": 1,
    "explanation": "الشرح..."
  }
]`;

  const models = ["gpt-5", "gpt-4o", "gpt-4-turbo"];
  for (const model of models) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 2000,
      });
      const content = response.choices[0]?.message?.content || "";
      if (!content) continue;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;
      const sanitized = jsonMatch[0].replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ");
      const parsed: any[] = JSON.parse(sanitized);

      const EXPECTED_TYPES = ["multiple_choice", "true_false_ng", "best_title"];
      const EXPECTED_COUNTS = [4, 3, 4];

      const valid: ReadingQuiz[] = [];
      for (let i = 0; i < Math.min(3, parsed.length); i++) {
        const q = parsed[i];
        const expectedType = EXPECTED_TYPES[i];
        const expectedCount = EXPECTED_COUNTS[i];
        if (
          q.type === expectedType &&
          q.question?.trim() &&
          Array.isArray(q.options) &&
          q.options.length === expectedCount &&
          q.options.every((o: unknown) => typeof o === "string" && (o as string).trim()) &&
          typeof q.correctIndex === "number" &&
          q.correctIndex >= 0 &&
          q.correctIndex < expectedCount
        ) {
          valid.push({
            type: q.type,
            question: stripHarakat(q.question.trim()),
            options: q.options.map((o: string) => stripHarakat(o.trim()).slice(0, 100)),
            correctIndex: q.correctIndex,
            explanation: stripHarakat((q.explanation || "").trim()).slice(0, 250),
          });
        }
      }

      if (valid.length === 3) {
        console.log(`✓ 3 reading quizzes generated (${model})`);
        return valid;
      }
      console.warn(`Reading quiz model ${model}: only ${valid.length} valid quizzes, retrying...`);
    } catch (e: any) {
      console.warn(`Reading quiz model ${model} failed:`, e?.message || e);
    }
  }
  console.warn("All reading quiz models failed");
  return [];
}

/** Format the date string for the reading header (Uzbekistan time) */
export function getReadingDateString(): string {
  const now = new Date();
  const uzTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const day = uzTime.getUTCDate();
  const months = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];
  const month = months[uzTime.getUTCMonth()];
  const year = uzTime.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

/** Level by Uzbekistan calendar day parity — same as listening */
export function getReadingLevelByDate(): ReadingLevel {
  const now = new Date();
  const uzTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return uzTime.getUTCDate() % 2 !== 0 ? "A1A2" : "B1B2";
}
