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

async function ttsLine(text: string, voiceId: string, apiKey: string): Promise<Buffer | null> {
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
          text,
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

// Generate dialog audio: each line with correct gendered voice, then concatenate
export async function textToSpeechArabic(passage: ListeningPassage): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn("ELEVENLABS_API_KEY not set — skipping TTS");
    return null;
  }

  const parts: Buffer[] = [];

  for (const line of passage.dialog) {
    const voiceId = line.speaker === "M" ? MALE_VOICE_ID : FEMALE_VOICE_ID;
    const buf = await ttsLine(line.text, voiceId, apiKey);
    if (!buf) {
      console.warn(`TTS failed for a dialog line — skipping whole audio`);
      return null;
    }
    parts.push(buf);
    // Small delay between API calls to avoid rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  if (parts.length === 0) return null;
  // Concatenate all MP3 buffers — MP3 is frame-based, direct concat works
  return Buffer.concat(parts);
}

// ─── Listening Passage Generation ─────────────────────────────────────────────

const TOPICS_A1A2 = [
  "التسوق في السوق",
  "وصف المنزل والغرفة",
  "الطقس والفصول",
  "الطعام والمطعم",
  "وسائل المواصلات",
  "الأسرة والأصدقاء",
  "الوقت والمواعيد",
  "الهوايات والترفيه",
  "المدرسة والدراسة",
  "الصحة والطبيب",
];

const TOPICS_B1B2 = [
  "التكنولوجيا وتأثيرها على التعليم",
  "البيئة والتغير المناخي",
  "الصحة العامة والتغذية السليمة",
  "سوق العمل ومهارات المستقبل",
  "السياحة والثقافات المختلفة",
  "التعليم العالي والدراسة في الخارج",
  "الاقتصاد والتجارة الدولية",
  "علم النفس والسلوك البشري",
  "الابتكار والريادة في الأعمال",
  "الفضاء واستكشاف الكون",
];

export async function generateListeningPassage(level: ListeningLevel): Promise<ListeningPassage | null> {
  const topics = level === "A1A2" ? TOPICS_A1A2 : TOPICS_B1B2;
  const topic = topics[Math.floor(Math.random() * topics.length)];

  const levelDesc =
    level === "A1A2"
      ? "A1/A2 (مستوى مبتدئ: جمل قصيرة، مفردات أساسية)"
      : "B1/B2 (مستوى متوسط-متقدم: جمل معقدة، مفردات أكاديمية، أسلوب IELTS)";

  const prompt = `أنت خبير في إعداد اختبارات IELTS Listening. اكتب حواراً بين شخصين باللغة العربية الفصحى.

الموضوع: ${topic}
المستوى: ${levelDesc}

⚠️ المتطلبات الأساسية:
- الحوار بين شخصَين: رجل اسمه أَحْمَد [م] وامرأة اسمها سَارَة [أ]
- يبدأ كل سطر بـ [م] للرجل أو [أ] للمرأة
- الحوار 8-12 سطراً (يتبادلان الكلام)
- كل الحركات (التشكيل الكامل) على كل كلمة بدون استثناء
- يحتوي على معلومات محددة قابلة للاختبار (أرقام، أسماء، أماكن، أوقات، أوصاف)
- ⚠️ ممنوع: أي محتوى سياسي، ديني طائفي، رياضي

أجب بـ JSON فقط:
{
  "dialog": [
    {"speaker": "M", "text": "نَصُّ أَحْمَد..."},
    {"speaker": "F", "text": "نَصُّ سَارَة..."}
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
        max_completion_tokens: 1000,
      });
      const content = response.choices[0]?.message?.content || "";
      if (!content) continue;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const sanitized = jsonMatch[0].replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ");
        const parsed = JSON.parse(sanitized);
        if (
          Array.isArray(parsed.dialog) &&
          parsed.dialog.length >= 4 &&
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
  const levelDesc = level === "A1A2" ? "A1/A2 (مستوى مبتدئ)" : "B1/B2 (IELTS مستوى)";

  const prompt = `أنت خبير IELTS Listening. بناءً على الحوار التالي، اكتب 3 أسئلة اختبار فهم.

الحوار:
${passage.arabicText}

⚠️ متطلبات الأسئلة (مستوى ${levelDesc}):
- كل سؤال يختبر فهم معلومة محددة من الحوار (ليس رأياً)
- السؤال بالعربية الفصحى مع تشكيل كامل
- 4 خيارات بالعربية الفصحى، قصيرة (max 60 حرف لكل خيار)
- خيار واحد صحيح وثلاثة منطقية لكن خاطئة
- الشرح بالعربية الفصحى، جملة واحدة قصيرة
- ⚠️ الأسئلة والخيارات والشرح كلها بالعربية فقط — ممنوع الأوزبكية

أجب بـ JSON فقط — مصفوفة من 3 كائنات:
[
  {
    "question": "مَاذَا فَعَلَ أَحْمَد؟",
    "options": ["خيار أ", "خيار ب", "خيار ج", "خيار د"],
    "correctIndex": 0,
    "explanation": "لأَنَّ أَحْمَد قَالَ فِي الحِوَارِ..."
  }
]`;

  const models = ["gpt-5", "gpt-4o", "gpt-4-turbo"];
  for (const model of models) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1200,
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
            question: q.question.trim(),
            options: q.options.map((o: string) => o.trim().slice(0, 100)) as [string, string, string, string],
            correctIndex: q.correctIndex as 0 | 1 | 2 | 3,
            explanation: (q.explanation || "").trim().slice(0, 200),
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
