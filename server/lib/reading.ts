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

// 30 A1/A2 reading topics (different from listening topics)
const TOPICS_A1A2 = [
  "الحيوانات الأليفة في المنزل",
  "البريد والطرود والرسائل",
  "المكتبة العامة وأهميتها",
  "الألوان والأشكال في الطبيعة",
  "الموسيقى وتعلم آلة موسيقية",
  "النزهة في الغابة",
  "المتحف الوطني وزيارته",
  "حديقة الحيوانات",
  "الخبز والمخابز التقليدية",
  "زراعة النباتات في البيت",
  "السباحة ونادي الرياضة",
  "الحفلة الموسيقية في الساحة",
  "محل الكتب القديمة",
  "الطقس وملابس الفصول",
  "مطعم جديد في الحي",
  "الألعاب الإلكترونية والوقت",
  "السوق الأسبوعية في القرية",
  "تعلم الرسم والتصوير",
  "حديقة الأزهار في الربيع",
  "نادي القراءة للأطفال",
  "إصلاح الدراجة الهوائية",
  "احتفال عيد الميلاد في المدرسة",
  "البحث عن عمل بدوام جزئي",
  "تعلم الطبخ من الجدة",
  "الرحلة المدرسية إلى المزرعة",
  "الفصل الدراسي الجديد",
  "شراء هاتف جديد",
  "اللغات الأجنبية وفائدتها",
  "صناعة الحرف اليدوية",
  "الألعاب الرياضية في الهواء الطلق",
];

// 30 B1/B2 reading topics (different from listening topics)
const TOPICS_B1B2 = [
  "تاريخ الحضارة المصرية القديمة",
  "الأوبئة الكبرى وكيف تغلب عليها البشر",
  "علم الأعصاب والنوم الصحي",
  "الاقتصاد التشاركي وتطبيقاته",
  "أخلاقيات الذكاء الاصطناعي",
  "الأمازون: الرئة الخضراء للأرض",
  "تاريخ الكتابة ونشأة الأبجديات",
  "عِلم الجينوم والطب الشخصي",
  "الفلسفة وأثرها على الحضارات",
  "نظرية الألعاب في الاقتصاد",
  "النظام الشمسي واكتشافات الكواكب",
  "نفسية المستهلك وتقنيات التسويق",
  "الثورة الصناعية وأثرها على المجتمع",
  "التنوع البيولوجي والحفاظ على الأنواع",
  "الابتكار والإبداع في بيئة العمل",
  "الحرب الباردة وعصر الفضاء",
  "علم اللغة وكيف نتعلم اللغات",
  "الصحة العقلية وصورة الجسد في الإعلام",
  "العمارة الإسلامية عبر العصور",
  "الديناميكية السكانية وشيخوخة المجتمعات",
  "المياه الجوفية وأزمة المياه العالمية",
  "الفنون الرقمية وحقوق الملكية الفكرية",
  "النظام الغذائي البحر متوسطي والصحة",
  "حركة حقوق الإنسان في القرن العشرين",
  "الطيران الفضائي وسياحة الفضاء",
  "الاقتصاد غير الرسمي في الدول النامية",
  "الرياضيات في الطبيعة: النسبة الذهبية",
  "الهجرة المناخية وتداعياتها",
  "فلسفة العلوم وحدود المعرفة",
  "النانوتكنولوجيا وتطبيقاتها الطبية",
];

// ─── Passage Generation ───────────────────────────────────────────────────────

function getArabicWordCount(text: string): number {
  return text.match(/[\u0600-\u06FF]+/g)?.length || 0;
}

function hasEnoughArabic(text: string): boolean {
  const visible = text.replace(/[^A-Za-z\u0600-\u06FF]/g, "");
  const arabic = text.match(/[\u0600-\u06FF]/g)?.length || 0;
  return visible.length > 0 && arabic / visible.length >= 0.82;
}

function pickFreshTopic(topics: string[], excludedTopics: string[]): string {
  const excluded = new Set(excludedTopics.map(topic => topic.trim()));
  const available = topics.filter(topic => !excluded.has(topic));
  const pool = available.length ? available : topics;
  return pool[Math.floor(Math.random() * pool.length)];
}

function isProfessionalReadingPassage(parsed: any, level: ReadingLevel): boolean {
  if (!parsed || typeof parsed.titleAr !== "string" || typeof parsed.titleUz !== "string") return false;
  if (!Array.isArray(parsed.paragraphsAr) || parsed.paragraphsAr.length !== 3) return false;
  if (!Array.isArray(parsed.paragraphsUz) || parsed.paragraphsUz.length !== 3) return false;
  if (!parsed.paragraphsAr.every((paragraph: unknown) => typeof paragraph === "string" && hasEnoughArabic(paragraph))) return false;
  if (!parsed.paragraphsUz.every((paragraph: unknown) => typeof paragraph === "string" && paragraph.trim().length >= 8)) return false;

  const totalWords = parsed.paragraphsAr.reduce((sum: number, paragraph: string) => sum + getArabicWordCount(paragraph), 0);
  const [minWords, maxWords] = level === "A1A2" ? [100, 145] : [180, 245];
  return hasEnoughArabic(parsed.titleAr) &&
    typeof parsed.topicAr === "string" && hasEnoughArabic(parsed.topicAr) &&
    typeof parsed.topicUz === "string" && parsed.topicUz.trim().length >= 3 &&
    totalWords >= minWords && totalWords <= maxWords;
}

export async function generateReadingPassage(
  level: ReadingLevel,
  excludedTopics: string[] = [],
): Promise<ReadingPassage | null> {
  const topics = level === "A1A2" ? TOPICS_A1A2 : TOPICS_B1B2;
  const topic = pickFreshTopic(topics, excludedTopics);

  const wordCount = level === "A1A2"
    ? "100–145 كلمة؛ جمل واضحة ومفردات عالية التكرار وروابط بسيطة"
    : "180–245 كلمة؛ أسلوب معلوماتي متماسك، تراكيب متنوعة ومفردات مجردة مضبوطة";

  const prompt = `أنت مؤلف محترف لاختبارات القراءة العربية وفق CEFR ومراجع جودة صارم.
اكتب نصاً أصلياً قابلاً للاختبار عن الموضوع: "${topic}".

المواصفات الإلزامية:
- المستوى: ${level === "A1A2" ? "A1/A2 مبتدئ" : "B1/B2 متوسط-متقدم"} — ${wordCount}.
- ثلاث فقرات بالضبط، لكل فقرة وظيفة مختلفة: تمهيد، تفصيل/مقارنة، وخلاصة.
- استخدم حقائق داخلية متسقة وقابلة للرجوع إلى النص. لا تخترع خبراً حديثاً أو رقماً واقعياً غير متحقق؛ عند الحاجة اجعل المثال سيناريو تعليمياً واضحاً.
- أدرج أدلة كافية لثلاثة أسئلة: تفصيل، صواب/غلط/غير معطى، وعنوان رئيسي.
- في B1/B2 استخدم إعادة صياغة وروابط استدلالية؛ في A1/A2 اجعل المعنى صريحاً وتجنب الجمل المعقدة جداً.
- العربية الفصحى فقط في النص العربي، بلا سياسة أو طائفية أو محتوى حساس.

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
      if (isProfessionalReadingPassage(parsed, level)) {
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

  const prompt = `أنت محكّم IELTS Reading Academic معتمد ومتخصص في صياغة أسئلة مُضلِّلة باحترافية. بناءً على النص التالي، اكتب 3 أسئلة صعبة حقيقية.

النص:
${passage.fullAr}

المستوى: ${levelDesc}

⚠️ مبدأ التضليل الاحترافي (IELTS-grade distractors):
الأسئلة الجيدة لا تكون سهلة — المتعلم الذي لا يقرأ بعناية يجب أن يخطئ. اتبع هذه الأساليب:
- استخدم "الفخ اللغوي": نفس الكلمة من النص بمعنى مختلف في خيار خاطئ
- استخدم "التبديل الرقمي": رقم أو تاريخ قريب جداً من الصحيح (١٤٥ بدل ١٥٠)
- استخدم "النقل الخاطئ": معلومة صحيحة من النص لكنها نُسبت لشيء خاطئ
- استخدم "التوسع والتضييق": خيار أوسع أو أضيق من ما ورد فعلاً
- خيار "صحيح جزئياً": صحيح في نصفه الأول وخاطئ في نصفه الثاني

⚠️ اكتب بالضبط 3 أسئلة بهذه الأنواع بالترتيب:

**السؤال 1 — اختيار من متعدد (أ، ب، ج، د):**
- يختبر استنتاجاً غير مباشر أو تفصيلاً دقيقاً يتطلب ربط جملتين
- 4 خيارات: 1 صحيح + 3 فخاخ احترافية (انظر مبدأ التضليل أعلاه)
- الخيارات الخاطئة يجب أن تبدو معقولة تماماً للقارئ السريع
- كل خيار جملة قصيرة (max 80 حرف)

**السؤال 2 — صواب / غلط / غير معطى:**
- اختر عبارة تبدو صحيحة للوهلة الأولى لكنها تتعارض مع النص أو غير موجودة فيه
- صواب = في النص وصحيحة تماماً بدون أي تحريف
- غلط = في النص لكن تُناقض ما ورد (تحريف دقيق في رقم أو نسبة أو نسب)
- غير معطى = موضوع معقول لكنه غائب كلياً عن النص — لا يمكن تأكيده أو نفيه
- الخيارات بالترتيب الثابت: ["صواب", "غلط", "غير معطى"]

**السؤال 3 — اختر العنوان المناسب:**
- السؤال: "أي عنوان يناسب هذا النص بشكل أفضل؟"
- العنوان الصحيح: يلخص الفكرة المحورية الكاملة للنص
- 3 عناوين خاطئة يجب أن تكون مُغرية:
  * عنوان يغطي فقرة واحدة فقط (يبدو صحيحاً لمن قرأ جزءاً فقط)
  * عنوان أوسع بكثير من النص (يوحي بمحتوى لم يُذكر)
  * عنوان يركز على تفصيل ثانوي ذُكر لكنه ليس المحور الرئيسي

**قواعد الصياغة:**
- الأسئلة والخيارات والشرح: بالعربية فقط، بدون تشكيل
- max 80 حرف لكل خيار
- الشرح (مهم جداً): اذكر أولاً لماذا الإجابة صحيحة، ثم حدد بدقة لماذا أقوى فخ خاطئ يُوقع الطلاب

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
      // min/max accepted option counts per type
      const OPTION_RANGE: [number, number][] = [[4, 4], [3, 3], [3, 4]]; // best_title accepts 3 or 4

      if (!Array.isArray(parsed) || parsed.length !== 3) continue;
      const valid: ReadingQuiz[] = [];
      for (let i = 0; i < 3; i++) {
        const q = parsed[i];
        const expectedType = EXPECTED_TYPES[i];
        const [minOpts, maxOpts] = OPTION_RANGE[i];
        const optCount = Array.isArray(q.options) ? q.options.length : 0;
        const typeMatch = q.type === expectedType;
        const optsOk = optCount >= minOpts && optCount <= maxOpts &&
          q.options.every((o: unknown) => typeof o === "string" && (o as string).trim());
        const idxOk = typeof q.correctIndex === "number" &&
          Number.isInteger(q.correctIndex) &&
          q.correctIndex >= 0 && q.correctIndex < optCount;

        const question = stripHarakat(String(q.question || "").trim()).slice(0, 240);
        const options = optsOk
          ? q.options.map((option: string) => stripHarakat(option.trim()).slice(0, 90))
          : [];
        const explanation = stripHarakat(String(q.explanation || "").trim()).slice(0, 190);
        const optionsUnique = new Set(options.map((option: string) => option.replace(/\s+/g, " ").toLowerCase())).size === options.length;

        if (!typeMatch || !optsOk || !idxOk || !optionsUnique ||
          !hasEnoughArabic(question) || !hasEnoughArabic(explanation) ||
          options.some((option: string) => !option || !hasEnoughArabic(option))) {
          console.warn(`Reading quiz ${i + 1} validation failed (${model}): type=${q.type} opts=${optCount} idx=${q.correctIndex}`);
          continue;
        }
        valid.push({
          type: q.type,
          question,
          options,
          correctIndex: q.correctIndex,
          explanation,
        });
      }

      if (valid.length === 3 && new Set(valid.map(quiz => quiz.question)).size === 3) {
        console.log(`✓ 3 reading quizzes generated (${model})`);
        return valid;
      }
      console.warn(`Reading quiz model ${model}: only ${valid.length}/3 valid quizzes, retrying...`);
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
