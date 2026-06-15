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
// Male: Daniel (multilingual Arabic)
// Female: Aria (multilingual) — good Arabic pronunciation
const MALE_VOICE_ID   = process.env.ELEVENLABS_VOICE_ID        || "onwK4e9ZLuTAKqWW03F9";
const FEMALE_VOICE_ID = process.env.ELEVENLABS_FEMALE_VOICE_ID || "9BWtsMINqrJLrRacOk9x";
const ELEVENLABS_MODEL = "eleven_multilingual_v2";

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
  // Arabic diacritics: U+064B–U+065F (tanwin, fatha, damma, kasra, shadda, sukun, etc.)
  // Also U+0610–U+061A (Arabic extended marks) and U+0670 (superscript alef)
  return text.replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g, "").trim();
}

async function ttsLine(text: string, voiceId: string, apiKey: string): Promise<Buffer | null> {
  // Send harakat-free text — ElevenLabs handles Arabic pronunciation natively
  const cleanText = stripHarakat(text);
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
export async function textToSpeechArabic(passage: ListeningPassage): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn("ELEVENLABS_API_KEY not set — skipping TTS");
    return null;
  }

  const parts: Buffer[] = [];

  for (let i = 0; i < passage.dialog.length; i++) {
    const line = passage.dialog[i];
    const voiceId = line.speaker === "M" ? MALE_VOICE_ID : FEMALE_VOICE_ID;
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

export async function generateListeningPassage(level: ListeningLevel): Promise<ListeningPassage | null> {
  const topics = level === "A1A2" ? TOPICS_A1A2 : TOPICS_B1B2;
  // Deterministic by Uzbekistan day-of-month so each day has a unique topic
  const now = new Date();
  const uzDay = new Date(now.getTime() + 5 * 60 * 60 * 1000).getUTCDate();
  const topic = topics[(uzDay - 1) % topics.length];

  const levelDesc =
    level === "A1A2"
      ? "A1/A2 (مستوى مبتدئ: جمل قصيرة، مفردات أساسية)"
      : "B1/B2 (مستوى متوسط-متقدم: جمل معقدة، مفردات أكاديمية، أسلوب IELTS)";

  const prompt = `أنت خبير في إعداد اختبارات IELTS Listening Section 3. اكتب حواراً طويلاً وغنياً بالمعلومات بين شخصين باللغة العربية الفصحى.

الموضوع: ${topic}
المستوى: ${levelDesc}

⚠️ المتطلبات الإلزامية:
- الشخصيتان: رجل [M] وامرأة [F] — لا تذكر أسماءهما أبداً داخل نص الحوار (لا أحمد، لا سارة، لا أي اسم)
- يبدأ كل سطر بـ [M] أو [F] فقط
- الحوار من 12 إلى 16 سطراً — كل سطر جملة من 12 إلى 18 كلمة بالضبط
- الهدف: مدة الحوار عند القراءة بصوت عالٍ بين دقيقة وسط ودقيقة ونصف
- التشكيل الكامل (الفتحة والضمة والكسرة والشدة والسكون) على كل كلمة بدون استثناء
- الحوار طبيعي تماماً: كأنك تسمع محادثة حقيقية — لا يقول أحد اسم الآخر، بل يقول "أظن"، "وافقت"، "سمعت أن..."
- يتضمن الحوار معلومات محددة وقابلة للاختبار:
  * أرقام دقيقة (تواريخ، أسعار، مسافات، أوقات، نسب مئوية)
  * أسماء أماكن ومؤسسات (لكن ليس أسماء المتحدثَين)
  * أحداث متسلسلة بترتيب زمني
  * مقارنات بين خيارين أو أكثر
  * آراء شخصية تختلف عن الحقائق الواردة
- الأسلوب: حوار طبيعي وواقعي — تعليقات، استفسارات، توضيحات، موافقات واعتراضات
- ⚠️ ممنوع: السياسة، الطائفية، الرياضة، ذكر أسماء المتحدثَين في النص

أجب بـ JSON فقط:
{
  "dialog": [
    {"speaker": "M", "text": "نَصُّ الرَّجُلِ الطَّوِيل بِدُونِ اسْمٍ..."},
    {"speaker": "F", "text": "نَصُّ الْمَرْأَةِ الطَّوِيل بِدُونِ اسْمٍ..."}
  ],
  "topicAr": "عنوان قصير بالعربية",
  "topicUz": "Mavzu o'zbekcha"
}`;

  const models = ["gpt-5", "gpt-4o", "gpt-4-turbo"];
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
        if (
          Array.isArray(parsed.dialog) &&
          parsed.dialog.length >= 12 &&
          parsed.dialog.every((l: any) => (l.speaker === "M" || l.speaker === "F") && l.text?.trim()) &&
          parsed.topicAr &&
          parsed.topicUz
        ) {
          const dialog: DialogLine[] = parsed.dialog.map((l: any) => ({
            speaker: l.speaker as "M" | "F",
            text: l.text.trim(),
          }));
          // Full text for reference (joining dialog lines)
          const arabicText = dialog.map(l => `${l.speaker === "M" ? "أَحْمَد" : "سَارَة"}: ${l.text}`).join("\n");
          console.log(`✓ Dialog generated (${model}), ${dialog.length} lines`);
          return {
            arabicText,
            dialog,
            topicAr: parsed.topicAr.trim(),
            topicUz: parsed.topicUz.trim(),
          };
        }
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
    ? "A1/A2 — أسئلة مباشرة تختبر فهم تفاصيل واضحة"
    : "B1/B2 — أسئلة IELTS Academic من المستوى العالي";

  const prompt = `أنت محكّم IELTS Listening معتمد. بناءً على الحوار التالي، اكتب 3 أسئلة اختبار فهم دقيقة ومُحكمة.

الحوار:
${passage.arabicText}

⚠️ قواعد صياغة الأسئلة (مستوى ${levelDesc}):

1. نوع الأسئلة المطلوبة:
   - سؤال عن تفصيل محدد وُرد صراحةً في الحوار (رقم، تاريخ، مكان، اسم)
   - سؤال عن موقف أو رأي شخصية معينة
   - سؤال استنتاجي: يتطلب ربط جملتين من الحوار لا جملة واحدة

2. معايير الخيارات الخاطئة — يجب أن:
   - تحتوي على معلومات موجودة فعلاً في الحوار لكنها تنتمي لسياق مختلف (swap context)
   - تبدو معقولة تماماً لمن لم ينتبه جيداً
   - تشمل رقماً قريباً من الصحيح أو مكاناً ذُكر بسياق آخر
   - ⚠️ ممنوع: خيارات واضحة الخطأ أو خارج الحوار كلياً

3. الصياغة:
   - السؤال بالعربية الفصحى مع تشكيل كامل
   - كل خيار جملة قصيرة (max 70 حرف) بالعربية مع تشكيل
   - الشرح: يوضح لماذا الإجابة الصحيحة صحيحة ولماذا أكثر الخيارات إغراءً خاطئ
   - ⚠️ بالعربية فقط — ممنوع الأوزبكية

أجب بـ JSON فقط — مصفوفة من 3 كائنات:
[
  {
    "question": "مَا الَّذِي ذَكَرَتْهُ سَارَة بِشَأْنِ...؟",
    "options": ["خيار أ", "خيار ب", "خيار ج", "خيار د"],
    "correctIndex": 2,
    "explanation": "قَالَتْ سَارَة... بَيْنَمَا الخِيَار... يُشِير إِلَى مَعْلُومَة مِنْ سِيَاقٍ آخَر."
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
        const valid = parsed
          .filter(
            (q) =>
              q.question &&
              Array.isArray(q.options) &&
              q.options.length === 4 &&
              q.options.every((o: unknown) => typeof o === "string" && (o as string).trim()) &&
              typeof q.correctIndex === "number" &&
              q.correctIndex >= 0 &&
              q.correctIndex <= 3
          )
          .slice(0, 3)
          .map((q) => ({
            question: stripHarakat(q.question.trim()),
            options: q.options.map((o: string) => stripHarakat(o.trim()).slice(0, 100)) as [string, string, string, string],
            correctIndex: q.correctIndex as 0 | 1 | 2 | 3,
            explanation: stripHarakat((q.explanation || "").trim()).slice(0, 200),
          }));
        if (valid.length > 0) {
          console.log(`✓ ${valid.length} listening quizzes generated (${model})`);
          return valid;
        }
      }
    } catch (e: any) {
      console.warn(`Listening quiz model ${model} failed:`, e?.message || e);
    }
  }
  console.warn("All listening quiz models failed");
  return [];
}
