import OpenAI from "openai";

const isReplit = !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const openai = new OpenAI(
  isReplit
    ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL, apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY }
    : { apiKey: process.env.OPENAI_API_KEY }
);

export type ListeningLevel = "A1A2" | "B1B2";

export interface ListeningPassage {
  arabicText: string;
  topicAr: string;
  topicUz: string;
}

export interface ListeningQuiz {
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
}

// ─── ElevenLabs Text-to-Speech ────────────────────────────────────────────────

const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "onwK4e9ZLuTAKqWW03F9";
const ELEVENLABS_MODEL = "eleven_multilingual_v2";

export async function textToSpeechArabic(text: string): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn("ELEVENLABS_API_KEY not set — skipping TTS");
    return null;
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
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
      console.warn(`ElevenLabs TTS error ${response.status}:`, errText);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err: any) {
    console.warn("ElevenLabs TTS failed:", err?.message || err);
    return null;
  }
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
      ? "A1/A2 (مستوى مبتدئ: جمل قصيرة، مفردات أساسية، موضوع يومي بسيط)"
      : "B1/B2 (مستوى متوسط-متقدم: جمل معقدة، مفردات أكاديمية، أسلوب IELTS)";

  const prompt = `أنت خبير في إعداد اختبارات IELTS Listening. اكتب نصاً صوتياً للاستماع باللغة العربية الفصحى.

الموضوع: ${topic}
المستوى: ${levelDesc}

متطلبات النص:
- الطول: 100-130 كلمة
- الأسلوب: حوار بين شخصين أو مونولوج (مثل IELTS Listening Part 1 أو Part 2)
- كل الحركات (التشكيل الكامل) على كل كلمة بدون استثناء
- واضح ومنطقي، يحتوي على معلومات محددة يمكن الاختبار منها (أرقام، أوصاف، أسماء أماكن، مواعيد)
- ⚠️ ممنوع: أي محتوى سياسي، ديني طائفي، رياضي

أجب بـ JSON فقط:
{
  "arabicText": "النص الكامل بالتشكيل",
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
        max_completion_tokens: 800,
      });
      const content = response.choices[0]?.message?.content || "";
      if (!content) continue;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const sanitized = jsonMatch[0].replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ");
        const parsed = JSON.parse(sanitized);
        if (parsed.arabicText && parsed.topicAr && parsed.topicUz) {
          console.log(`✓ Listening passage generated (${model}), ${parsed.arabicText.length} chars`);
          return {
            arabicText: parsed.arabicText.trim(),
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

  const prompt = `أنت خبير IELTS Listening. بناءً على نص الاستماع التالي، اكتب 3 أسئلة اختبار.

النص: ${passage.arabicText}

متطلبات الأسئلة (مستوى ${levelDesc}):
- كل سؤال يختبر فهم معلومة محددة من النص (ليس رأياً)
- السؤال بالعربية (مع تشكيل) ثم الأوزبكية: "❓ [عربي]\n🇺🇿 [أوزبكي]"
- 4 خيارات بالأوزبكية، قصيرة (max 80 حرف)، خيار واحد صحيح وثلاثة منطقية لكن خاطئة
- الشرح بالأوزبكية، قصير

أجب بـ JSON فقط — مصفوفة من 3 كائنات:
[
  {
    "question": "❓ هَلْ...؟\n🇺🇿 Savol?",
    "options": ["A variant", "B variant", "C variant", "D variant"],
    "correctIndex": 0,
    "explanation": "Chunki matnda..."
  }
]`;

  const models = ["gpt-5", "gpt-4o", "gpt-4-turbo"];
  for (const model of models) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1000,
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
