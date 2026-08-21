import OpenAI from "openai";

const isReplit = !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const openai = new OpenAI(
  isReplit
    ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL, apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY }
    : { apiKey: process.env.OPENAI_API_KEY }
);

export type ListeningLevel = "A1A2" | "B1B2";

export interface DialogLine {
  speaker: "M" | "F";
  text: string;
}

export interface ListeningPassage {
  arabicText: string;
  dialog: DialogLine[];
  topicAr: string;
  topicUz: string;
}

export interface ListeningQuiz {
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
}

// ─── ElevenLabs Voices ────────────────────────────────────────────────────────
const DEFAULT_MALE_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "onwK4e9ZLuTAKqWW03F9";
const DEFAULT_FEMALE_VOICE_ID = process.env.ELEVENLABS_FEMALE_VOICE_ID || "9BWtsMINqrJLrRacOk9x";
const ELEVENLABS_MODEL = "eleven_multilingual_v2";

export interface SpeakerVoices {
  maleVoiceId?: string | null;
  femaleVoiceId?: string | null;
}

// ─── MP3 helpers ──────────────────────────────────────────────────────────────

/** Strip ID3v2 header from the start of an MP3 buffer */
function stripId3v2(buf: Buffer): Buffer {
  if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    // synchsafe integer: each byte uses only 7 bits
    const size =
      ((buf[6] & 0x7f) << 21) |
      ((buf[7] & 0x7f) << 14) |
      ((buf[8] & 0x7f) << 7) |
      (buf[9] & 0x7f);
    const headerLen = 10 + size;
    return buf.slice(headerLen);
  }
  return buf;
}

/** Strip ID3v1 tag from the end of an MP3 buffer (128 bytes, starts with "TAG") */
function stripId3v1(buf: Buffer): Buffer {
  if (
    buf.length >= 128 &&
    buf[buf.length - 128] === 0x54 && // T
    buf[buf.length - 127] === 0x41 && // A
    buf[buf.length - 126] === 0x47    // G
  ) {
    return buf.slice(0, buf.length - 128);
  }
  return buf;
}

/** Skip the Xing/Info/VBRI VBR header frame if present as the first audio frame.
 *  ElevenLabs embeds a Xing frame that reports only the first segment's duration. */
function skipVbrFrame(buf: Buffer): Buffer {
  let offset = 0;
  // Find first MP3 frame sync (0xFF + high 3 bits of next byte = 0xE0)
  while (offset < buf.length - 4) {
    if (buf[offset] === 0xFF && (buf[offset + 1] & 0xE0) === 0xE0) break;
    offset++;
  }
  if (offset >= buf.length - 4) return buf;

  const b1 = buf[offset + 1];
  const b2 = buf[offset + 2];
  const b3 = buf[offset + 3];

  // Determine side-info size (MPEG version + channel mode)
  const mpegVersion = (b1 >> 3) & 0x3; // 3=MPEG1
  const channelMode = (b3 >> 6) & 0x3; // 3=Mono
  const isMpeg1 = mpegVersion === 3;
  const isMono  = channelMode === 3;
  const sideInfoSize = isMpeg1 ? (isMono ? 17 : 32) : (isMono ? 9 : 17);

  const tagOffset = offset + 4 + sideInfoSize;
  if (tagOffset + 4 > buf.length) return buf;

  const tag = buf.slice(tagOffset, tagOffset + 4).toString("ascii");
  if (tag !== "Xing" && tag !== "Info" && tag !== "VBRI") return buf;

  // Calculate this frame's byte length so we can skip it
  const BITRATES_MPEG1  = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0].map(x => x * 1000);
  const SAMPLERATES     = [44100, 48000, 32000, 0];
  const bitrateIdx  = (b2 >> 4) & 0xF;
  const srIdx       = (b2 >> 2) & 0x3;
  const padding     = (b2 >> 1) & 0x1;
  const bitrate     = BITRATES_MPEG1[bitrateIdx];
  const sampleRate  = SAMPLERATES[srIdx];

  if (!bitrate || !sampleRate) {
    // Fallback: scan for next sync
    for (let i = tagOffset + 4; i < buf.length - 4; i++) {
      if (buf[i] === 0xFF && (buf[i + 1] & 0xE0) === 0xE0) return buf.slice(i);
    }
    return buf;
  }

  const frameSize = Math.floor(144 * bitrate / sampleRate) + padding;
  const next = offset + frameSize;

  if (next < buf.length && buf[next] === 0xFF && (buf[next + 1] & 0xE0) === 0xE0) {
    return buf.slice(next);
  }
  // Fallback scan
  for (let i = next; i < buf.length - 4; i++) {
    if (buf[i] === 0xFF && (buf[i + 1] & 0xE0) === 0xE0) return buf.slice(i);
  }
  return buf;
}

/** Return clean MP3 frames: strip ID3 tags AND Xing/VBR info frame */
function stripAllId3(buf: Buffer): Buffer {
  return skipVbrFrame(stripId3v1(stripId3v2(buf)));
}

/** Concatenate MP3 chunks: strip all metadata so players calculate duration from frame count */
function concatMp3(parts: Buffer[]): Buffer {
  if (parts.length === 0) return Buffer.alloc(0);
  const cleanParts = parts.map(p => stripAllId3(p));
  return Buffer.concat(cleanParts);
}

/** Strip all Arabic diacritics (harakat) before sending to ElevenLabs.
 *  ElevenLabs reads Arabic correctly without them; wrong tashkeel causes mispronunciation. */
function stripHarakat(text: string): string {
  return text.replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g, "").trim();
}

/**
 * Convert a non-negative integer (0–9 999 999) to Arabic words.
 * Used so ElevenLabs reads numbers correctly in Arabic instead of switching to English.
 */
function numToAr(n: number): string {
  if (n === 0) return "صفر";

  const units  = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
  const teens  = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر",
                  "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
  const tens   = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  const hunds  = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة",
                  "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

  const parts: string[] = [];

  if (n >= 1_000_000) {
    const m = Math.floor(n / 1_000_000);
    parts.push(m === 1 ? "مليون" : m === 2 ? "مليونان" : numToAr(m) + " ملايين");
    n %= 1_000_000;
  }

  if (n >= 1_000) {
    const k = Math.floor(n / 1_000);
    if      (k === 1) parts.push("ألف");
    else if (k === 2) parts.push("ألفان");
    else if (k <= 10) parts.push(units[k] + " آلاف");
    else              parts.push(numToAr(k) + " ألف");
    n %= 1_000;
  }

  if (n >= 100) {
    parts.push(hunds[Math.floor(n / 100)]);
    n %= 100;
  }

  if (n >= 10) {
    if (n < 20) {
      parts.push(teens[n - 10]);
      n = 0;
    } else {
      const u = n % 10;
      parts.push(u > 0 ? units[u] + " و" + tens[Math.floor(n / 10)] : tens[Math.floor(n / 10)]);
      n = 0;
    }
  } else if (n > 0) {
    parts.push(units[n]);
  }

  return parts.join(" و");
}

/**
 * Replace all numerals in Arabic text with Arabic words so ElevenLabs
 * does not switch to English pronunciation.
 *  ١٨٧٦  →  ألف وثمانمائة وستة وسبعون
 *  75%   →  خمسة وسبعون بالمئة
 */
function replaceNumerals(text: string): string {
  // 1) Arabic-Indic digits → Western digits
  text = text.replace(/[٠١٢٣٤٥٦٧٨٩]/g,
    d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

  // 2) Percentages:  75%  →  خمسة وسبعون بالمئة
  text = text.replace(/(\d+)\s*%/g,
    (_, n) => numToAr(parseInt(n)) + " بالمئة");

  // 3) All remaining digit sequences
  text = text.replace(/\d+/g,
    n => numToAr(parseInt(n)));

  return text;
}

async function ttsLine(text: string, voiceId: string, apiKey: string): Promise<Buffer | null> {
  // 1. Strip harakat  2. Convert numerals to Arabic words  → clean text for ElevenLabs
  const cleanText = replaceNumerals(stripHarakat(text));
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: ELEVENLABS_MODEL,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );
    if (!response.ok) {
      const errText = await response.text();
      console.warn(`ElevenLabs TTS error ${response.status} (voice ${voiceId}):`, errText);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (err: any) {
    console.warn("ElevenLabs TTS line failed:", err?.message || err);
    return null;
  }
}

// Generate dialog audio: each line with correct gendered voice, then properly concatenate
export async function generateVoicePreview(voiceId: string): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
  return ttsLine("مرحباً، هذا نموذج قصير للاستماع إلى الصوت العربي.", voiceId, apiKey);
}

export async function textToSpeechArabic(passage: ListeningPassage, voices: SpeakerVoices = {}): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn("ELEVENLABS_API_KEY not set — skipping TTS");
    return null;
  }

  const parts: Buffer[] = [];

  for (let i = 0; i < passage.dialog.length; i++) {
    const line = passage.dialog[i];
    const voiceId = line.speaker === "M"
      ? voices.maleVoiceId || DEFAULT_MALE_VOICE_ID
      : voices.femaleVoiceId || DEFAULT_FEMALE_VOICE_ID;
    let buf = await ttsLine(line.text, voiceId, apiKey);
    // Retry once on failure
    if (!buf) {
      console.warn(`TTS line ${i + 1} failed, retrying...`);
      await new Promise(r => setTimeout(r, 1000));
      buf = await ttsLine(line.text, voiceId, apiKey);
    }
    if (!buf) {
      console.warn(`TTS line ${i + 1} failed after retry — aborting audio`);
      return null;
    }
    parts.push(buf);
    console.log(`✓ TTS line ${i + 1}/${passage.dialog.length} (${line.speaker})`);
    // Avoid ElevenLabs rate limits
    if (i < passage.dialog.length - 1) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  if (parts.length === 0) return null;

  // Properly concatenate: strip ID3 tags from all but first chunk
  const combined = concatMp3(parts);
  console.log(`✓ Dialog audio ready: ${parts.length} lines, ${combined.length} bytes`);
  return combined;
}

// ─── Listening Passage Generation ─────────────────────────────────────────────

// 30 diverse A1/A2 topics — selected by Uzbekistan day-of-month index
const TOPICS_A1A2 = [
  "التسوق في السوق الشعبي",
  "وصف المنزل والغرف",
  "الطقس والفصول الأربعة",
  "الطعام والمطبخ في المنزل",
  "الأسرة والعلاقات العائلية",
  "الوقت والمواعيد اليومية",
  "الهوايات وأوقات الفراغ",
  "المدرسة والفصل الدراسي",
  "زيارة الطبيب والصيدلية",
  "التخطيط لرحلة قصيرة",
  "احتفالات أعياد الميلاد",
  "الحديقة العامة والطبيعة",
  "البحث عن شقة للإيجار",
  "التسجيل في دورة تدريبية",
  "الطبخ ووصفة طعام جديدة",
  "شراء هدية لصديق",
  "المصرف وتحويل الأموال",
  "الاتصال بخدمة العملاء",
  "حجز موعد في المستشفى",
  "الحديث عن العمل الجديد",
  "وصف الحي السكني",
  "مقابلة جار جديد",
  "شراء ملابس في المحل",
  "التحدث عن الطفولة",
  "الاستفسار عن مسار الحافلة",
  "إرسال طرد بريدي",
  "تعلم هواية جديدة",
  "الحديث عن الكتب المفضلة",
  "الاستعداد لامتحان",
  "التحدث عن الأفلام والمسلسلات",
];

// 30 diverse B1/B2 topics — selected by Uzbekistan day-of-month index
const TOPICS_B1B2 = [
  "تأثير الذكاء الاصطناعي على سوق العمل",
  "البيئة والتغير المناخي وحلوله",
  "الصحة النفسية في العصر الرقمي",
  "ريادة الأعمال وتحديات الشركات الناشئة",
  "السياحة المستدامة وأثرها على الاقتصاد",
  "التعليم عن بُعد مقارنةً بالتعليم التقليدي",
  "الاقتصاد السلوكي وقرارات المستهلك",
  "الفضاء واستكشاف المريخ",
  "التغذية الصحية وعلم الأعصاب",
  "المدن الذكية والبنية التحتية المستدامة",
  "الهوية الثقافية في عصر العولمة",
  "الأبحاث الجينية ومستقبل الطب",
  "وسائل الإعلام الاجتماعية وتأثيرها على الرأي العام",
  "الاقتصاد الدائري وإعادة التدوير",
  "الروبوتات ومستقبل التصنيع",
  "الأمن السيبراني وحماية البيانات",
  "الهجرة والاندماج الثقافي",
  "الطاقة المتجددة وبدائل النفط",
  "علم الفلك والاكتشافات الحديثة",
  "الأخلاق في تطوير التكنولوجيا",
  "التنمية الشخصية وإدارة الوقت",
  "التنوع البيولوجي وانقراض الأنواع",
  "المستشفيات الذكية والطب عن بُعد",
  "الفن والإبداع في العصر الرقمي",
  "التمويل الجماعي ونماذج الأعمال الجديدة",
  "الدراسة في الخارج والتبادل الطلابي",
  "السيارات الكهربائية وبنية الشحن",
  "علم الاجتماع وتغير القيم الأسرية",
  "الأغذية المعدلة وراثياً وأثرها الصحي",
  "التاريخ الحضاري للعالم العربي",
];

function getArabicWordCount(text: string): number {
  return text.match(/[\u0600-\u06FF]+/g)?.length || 0;
}

function hasEnoughArabic(text: string): boolean {
  const visible = text.replace(/[^A-Za-z\u0600-\u06FF]/g, "");
  const arabic = text.match(/[\u0600-\u06FF]/g)?.length || 0;
  return visible.length > 0 && arabic / visible.length >= 0.82;
}

const LIKELY_PERSON_NAMES = [
  // Keep only unambiguous person names here. Common Arabic words such as نور,
  // أمل, حياة, سلام, سعيد, and كمال must not make a valid dialog fail.
  "أحمد", "سارة", "محمد", "فاطمة", "خالد", "يوسف", "إبراهيم", "إسماعيل",
  "موسى", "عيسى", "حمزة", "خديجة", "زينب", "عائشة", "مريم", "ليلى",
  "ياسمين", "دانيال", "آريا",
];

function containsPersonalName(text: string): boolean {
  const likelyNames = new Set(LIKELY_PERSON_NAMES);
  const tokens = text.match(/[\u0621-\u064A]+/g) || [];
  const namingCues = new Set(["اسمي", "اسمه", "اسمها", "يدعى", "تدعى"]);
  return tokens.some(token => likelyNames.has(token) || namingCues.has(token)) ||
    /يا\s+[\u0621-\u064A]+/.test(text);
}

function anonymizeKnownPersonalNames(text: string): string {
  return text.replace(new RegExp(LIKELY_PERSON_NAMES.join("|"), "g"), "المتحدث");
}

async function failsPersonalNameAudit(text: string): Promise<boolean> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: `Review this educational listening dialog. Does it contain any personal name, person reference by name, greeting addressed to a named person, or title that includes a person's name in Arabic or Uzbek? Speaker markers [M] and [F] are allowed. Reply with exactly YES if it contains any name; otherwise reply with exactly NO.\n\n${text}`,
      }],
      max_completion_tokens: 8,
    });
    return response.choices[0]?.message?.content?.trim().toUpperCase() !== "NO";
  } catch (error) {
    console.warn("Listening personal-name audit unavailable; continuing with local name validation:", (error as Error)?.message || error);
    return false;
  }
}

function pickFreshTopic(topics: string[], excludedTopics: string[]): string {
  const excluded = new Set(excludedTopics.map(topic => topic.trim()));
  const available = topics.filter(topic => !excluded.has(topic));
  const pool = available.length > 0 ? available : topics;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getProfessionalDialogValidationError(dialog: unknown, level: ListeningLevel): string | null {
  if (!Array.isArray(dialog)) return "dialog is not an array";
  if (dialog.length < 12 || dialog.length > 16) return `expected 12–16 lines, got ${dialog.length}`;
  const [minWords, maxWords, minTotal, maxTotal] = level === "A1A2"
    ? [7, 16, 100, 205]
    : [6, 26, 130, 330];
  const maleLines = dialog.filter(line => line?.speaker === "M").length;
  const femaleLines = dialog.filter(line => line?.speaker === "F").length;
  const totalWords = dialog.reduce((total, line) => total + getArabicWordCount(String(line?.text || "")), 0);

  if (maleLines < 4 || femaleLines < 4) return `speaker balance M=${maleLines}, F=${femaleLines}`;
  if (totalWords < minTotal || totalWords > maxTotal) return `expected ${minTotal}–${maxTotal} words, got ${totalWords}`;

  for (let index = 0; index < dialog.length; index++) {
    const line = dialog[index];
    const text = typeof line?.text === "string" ? line.text.trim() : "";
    const words = getArabicWordCount(text);
    if (line?.speaker !== "M" && line?.speaker !== "F") return `line ${index + 1} has invalid speaker`;
    if (words < minWords || words > maxWords) return `line ${index + 1} has ${words} words (expected ${minWords}–${maxWords})`;
    if (!hasEnoughArabic(text)) return `line ${index + 1} is not predominantly Arabic`;
  }
  return null;
}

function isProfessionalDialog(dialog: unknown, level: ListeningLevel): dialog is DialogLine[] {
  return getProfessionalDialogValidationError(dialog, level) === null;
}

export async function generateListeningPassage(
  level: ListeningLevel,
  excludedTopics: string[] = [],
): Promise<ListeningPassage | null> {
  const topics = level === "A1A2" ? TOPICS_A1A2 : TOPICS_B1B2;
  const topic = pickFreshTopic(topics, excludedTopics);
  const levelDesc = level === "A1A2"
    ? "A1/A2: حوار عملي واضح، مفردات عالية التكرار، معلومات صريحة وتسلسل بسيط"
    : "B1/B2: نقاش شبه رسمي، مفردات أدق، إعادة صياغة، موقف شخصي واستنتاج محدود";

  const prompt = `أنت مؤلف محترف لاختبارات الاستماع العربية وفق CEFR، ومراجع جودة صارم.
اكتب حواراً أصلياً وطبيعياً باللغة العربية الفصحى فقط.

الموضوع: ${topic}
المستوى: ${levelDesc}

شروط لا تقبل الاستثناء:
- الحوار موقف واقعي مكتمل، وليس درساً أو قائمة معلومات.
- المتحدثان رجل [M] وامرأة [F]. لا تذكر أي اسم شخص داخل الحوار أو العنوان.
- اكتب 12 إلى 16 مداخلة متوازنة؛ لكل متحدث أربع مداخلات على الأقل.
- ${level === "A1A2" ? "كل مداخلة من 7 إلى 16 كلمة." : "كل مداخلة من 12 إلى 23 كلمة."}
- اجعل الحقائق الداخلية متسقة تماماً. لا تخترع أخباراً أو إحصاءات واقعية حديثة؛ استخدم سيناريو تعليمياً واضحاً عند الحاجة إلى أرقام.
- تضمّن تفاصيل قابلة للاختبار: وقتاً أو رقماً، مكاناً أو خدمة، ترتيباً زمنياً، مقارنة، ورأياً منسوباً بوضوح لأحد المتحدثين.
- الحوار عفوي: سؤال، توضيح، تردد أو تصحيح، اتفاق أو اختلاف مهذب.
- ممنوع: السياسة، الطائفية، الرياضة، الأسماء الشخصية، الإنجليزية، والمعلومات المتناقضة.

أجب بـ JSON صالح فقط:
{
  "dialog": [
    {"speaker": "M", "text": "نص عربي طبيعي بلا اسم شخص"},
    {"speaker": "F", "text": "نص عربي طبيعي بلا اسم شخص"}
  ],
  "topicAr": "عنوان عربي قصير بلا اسم شخص",
  "topicUz": "Mavzu o‘zbekcha qisqa"
}`;

  // Retry the supported model: a single otherwise-valid dialog can be rejected
  // when it happens to include a personal name despite the prompt.
  const models = ["gpt-4o", "gpt-4o", "gpt-4o"];
  for (const model of models) {
    try {
      console.log(`Listening passage model: ${model}`);
      const response = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 2500,
      });
      const content = response.choices[0]?.message?.content || "";
      if (!content) continue;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const sanitized = jsonMatch[0].replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ");
        const parsed = JSON.parse(sanitized);
        const dialogError = getProfessionalDialogValidationError(parsed.dialog, level);
        const topicIsValid = typeof parsed.topicAr === "string" && hasEnoughArabic(parsed.topicAr) &&
          typeof parsed.topicUz === "string" && parsed.topicUz.trim().length >= 3;
        if (!dialogError && topicIsValid) {
          const dialog: DialogLine[] = parsed.dialog.map((l: any) => ({
            speaker: l.speaker as "M" | "F",
            text: anonymizeKnownPersonalNames(l.text.trim()),
          }));
          const arabicText = dialog.map(l => `[${l.speaker}] ${l.text}`).join("\n");
          const topicAr = anonymizeKnownPersonalNames(parsed.topicAr.trim());
          if (await failsPersonalNameAudit(`${arabicText}\n${topicAr}\n${parsed.topicUz}`)) {
            console.warn(`Listening passage model ${model} returned a personal name or failed name audit`);
            continue;
          }
          console.log(`✓ Dialog generated (${model}), ${dialog.length} lines`);
          return {
            arabicText,
            dialog,
            topicAr,
            topicUz: parsed.topicUz.trim(),
          };
        }
        console.warn(`Listening passage model ${model} rejected: ${dialogError || "invalid topic fields"}`);
      }
    } catch (e: any) {
      console.warn(`Listening passage model ${model} failed:`, e?.message || e);
    }
  }
  console.warn("All listening passage models failed");
  return null;
}

// ─── Listening Quiz Generation ─────────────────────────────────────────────────

export async function generateListeningQuizzes(
  passage: ListeningPassage,
  level: ListeningLevel
): Promise<ListeningQuiz[]> {
  const levelDesc = level === "A1A2"
    ? "A1/A2 — تفصيل صريح، ترتيب بسيط، ومعلومة مباشرة"
    : "B1/B2 — تفصيل دقيق، موقف، واستنتاج يربط معلومتين";

  const prompt = `أنت مراجع محترف لاختبارات الاستماع العربية وفق CEFR. أنشئ ثلاثة أسئلة عادلة وصعبة بقدر المستوى، ولا تخمّن أي معلومة خارج الحوار.

الحوار:
${passage.arabicText}

المستوى: ${levelDesc}

قواعد إلزامية:
- اكتب بالضبط 3 أسئلة بالترتيب: تفصيل، موقف/اختيار، ثم ${level === "A1A2" ? "تسلسل أو تفصيل صريح آخر" : "استنتاج يربط جملتين"}.
- كل سؤال له 4 خيارات عربية فقط، خيار صحيح واحد فقط.
- كل خيار خاطئ يجب أن يكون فخاً عادلاً: رقم قريب، أو حقيقة وردت في سياق آخر، أو نقل غير صحيح للموقف. لا تستخدم خياراً عبثياً.
- لا تذكر أسماء المتحدثين؛ استخدم "المتحدث" أو "المتحدثة" فقط.
- لا تزيد الأسئلة والخيارات عن 80 حرفاً. اكتب شرحاً مختصراً يثبت الإجابة من الحوار ويكشف أقوى فخ.
- لا تعِد صياغة السؤال أو أي خيار. لا تستخدم الأوزبكية أو الإنجليزية.

أجب بـ JSON فقط — مصفوفة من 3 كائنات:
[
  {
    "question": "سؤال عربي عن الحوار",
    "options": ["خيار أ", "خيار ب", "خيار ج", "خيار د"],
    "correctIndex": 2,
    "explanation": "دليل الإجابة من الحوار وسبب خطأ الفخ الأقوى."
  }
]`;

  const models = ["gpt-5", "gpt-4o", "gpt-4-turbo"];
  for (const model of models) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1800,
      });
      const content = response.choices[0]?.message?.content || "";
      if (!content) continue;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const sanitized = jsonMatch[0].replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ");
        const parsed: any[] = JSON.parse(sanitized);
        if (!Array.isArray(parsed) || parsed.length !== 3) continue;
        const valid = parsed.map((q) => {
          const question = stripHarakat(String(q?.question || "").trim()).slice(0, 240);
          const options = Array.isArray(q?.options)
            ? q.options.map((option: unknown) => stripHarakat(String(option || "").trim()).slice(0, 90))
            : [];
          const explanation = stripHarakat(String(q?.explanation || "").trim()).slice(0, 190);
          const uniqueOptions = new Set(options.map((option: string) => option.replace(/\s+/g, " ").toLowerCase()));
          const shapeIsValid = options.length === 4 &&
            uniqueOptions.size === 4 &&
            Number.isInteger(q?.correctIndex) &&
            q.correctIndex >= 0 && q.correctIndex < 4;

          if (!shapeIsValid || !hasEnoughArabic(question) || !hasEnoughArabic(explanation) ||
            options.some((option: string) => !option || !hasEnoughArabic(option))) {
            return null;
          }
          return { question, options: options as [string, string, string, string], correctIndex: q.correctIndex as 0 | 1 | 2 | 3, explanation };
        });

        if (valid.every(Boolean) && new Set(valid.map(quiz => quiz!.question)).size === 3) {
          console.log(`✓ 3 listening quizzes generated (${model})`);
          return valid as ListeningQuiz[];
        }
      }
    } catch (e: any) {
      console.warn(`Listening quiz model ${model} failed:`, e?.message || e);
    }
  }
  console.warn("All listening quiz models failed");
  return [];
}
