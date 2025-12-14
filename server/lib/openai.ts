import OpenAI from "openai";

// This is using Replit's AI Integrations service, which provides OpenAI-compatible API access without requiring your own OpenAI API key.
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

export async function generateWeatherAdvice(
  region: string,
  temperature: number,
  condition: string,
  lang: 'ar' | 'uz'
): Promise<string> {
  const prompt = lang === 'ar' 
    ? `أنت مساعد طقس ذكي. أعطِ نصيحة قصيرة (جملة واحدة) عن الطقس في ${region} حيث درجة الحرارة ${temperature}° والحالة "${condition}". النصيحة يجب أن تكون عملية ومفيدة.`
    : `Siz aqlli ob-havo yordamchisisiz. ${region} shahrida harorat ${temperature}° va holat "${condition}" bo'lsa, qisqa maslahat bering (bir jumla). Maslahat amaliy va foydali bo'lsin.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 150,
    });
    return response.choices[0]?.message?.content || "";
  } catch (error) {
    console.error("OpenAI API error:", error);
    return lang === 'ar' 
      ? "مَهْمَا كَان الطَّقْس الْيَوْم، حَافِظ عَلَى مِزَاجِك رَائِعاً!"
      : "Bugungi ob-havo qanday bo'lishidan qat'iy nazar, kayfiyatingizni a'lo darajada saqlang!";
  }
}

export async function generateVocabularyExample(
  word: string,
  translation: string,
  lang: 'ar' | 'uz'
): Promise<string> {
  const prompt = lang === 'ar'
    ? `أعطِ مثالاً قصيراً (جملة واحدة) باستخدام الكلمة "${word}" في سياق الطقس.`
    : `"${word}" (${translation}) so'zini ob-havo kontekstida ishlatgan holda qisqa misol (bir jumla) bering.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 100,
    });
    return response.choices[0]?.message?.content || "";
  } catch (error) {
    console.error("OpenAI API error:", error);
    return "";
  }
}

export { openai };
