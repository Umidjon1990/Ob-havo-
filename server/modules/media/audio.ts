import { z } from "zod";

export const audioInput = z.object({
  name: z.string().trim().min(1).max(170),
  text: z.string().trim().min(1).max(2000),
  voice_id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  language: z.enum(["uz", "ar"]),
  model: z.enum(["eleven_v4", "eleven_v4_turbo"]).default("eleven_v4"),
});
export class AudioError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function eleven(path: string, body?: unknown) {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new AudioError(503, "ElevenLabs API kaliti sozlanmagan.");
  let response: Response;
  try {
    response = await fetch(`https://api.elevenlabs.io${path}`, {
      method: body ? "POST" : "GET",
      headers: { "xi-api-key": key, ...(body ? { "Content-Type": "application/json", Accept: "audio/mpeg" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(body ? 180000 : 30000),
    });
  } catch {
    throw new AudioError(504, "ElevenLabs javobi olinmadi. Audio yaratishda kredit sarflangan bo‘lishi mumkin; qayta yaratishdan oldin ElevenLabs tarixini tekshiring.");
  }
  if (!response.ok) {
    // Inspect only provider error codes; never expose raw provider payloads.
    let code = "";
    try { const data = await response.json(); code = String(data?.detail?.status || data?.detail?.code || data?.detail?.type || ""); } catch {}
    if (/missing_permissions|insufficient_permissions/i.test(code))
      throw new AudioError(403, "ElevenLabs kalitida kerakli ruxsat yetishmaydi. Ovoz ro‘yxati uchun Voices Read, audio yaratish uchun Text to Speech ruxsatini tekshiring.");
    if (/quota_exceeded|payment|subscription/i.test(code))
      throw new AudioError(402, "ElevenLabs krediti yoki tarifini tekshiring.");
    const messages: Record<number, string> = {
      401: "ElevenLabs API kaliti yaroqsiz.",
      402: "ElevenLabs krediti yoki tarifini tekshiring.",
      403: "ElevenLabs kalitida bu model yoki ovozga ruxsat yo‘q.",
      404: "ElevenLabs modeli yoki ovozi topilmadi.",
      422: "ElevenLabs bu model, matn yoki ovozni qabul qilmadi. Klon ovoz tayyorligini tekshiring.",
      429: "ElevenLabs so‘rov limiti yoki kredit limiti tugagan. Birozdan keyin tekshiring.",
    };
    throw new AudioError(response.status === 401 ? 502 : response.status, messages[response.status] || "ElevenLabs so‘rovi bajarilmadi. Hisobdagi tarix va kreditni tekshiring.");
  }
  return response;
}
export async function audioCatalog() {
  let models: any[];
  try { models = await (await eleven("/v1/models")).json(); }
  catch (e) {
    // Model-list permission is optional; generation still verifies actual access.
    if (!(e instanceof AudioError) || e.status !== 403) throw e;
    models = [{model_id:"eleven_v4",name:"Eleven v4"},{model_id:"eleven_v4_turbo",name:"Eleven v4 Turbo"}];
  }
  const voices: any[] = [];
  let token = "";
  const seen = new Set<string>();
  do {
    const params = new URLSearchParams({ page_size: "100" });
    if (token) params.set("next_page_token", token);
    const page = await (await eleven(`/v2/voices?${params}`)).json();
    voices.push(...(page.voices || []));
    token = page.has_more ? page.next_page_token || "" : "";
    if (seen.has(token)) break;
    seen.add(token);
  } while (token && seen.size < 20);
  return {
    models: (Array.isArray(models) ? models : []).filter((m: any) => ["eleven_v4", "eleven_v4_turbo"].includes(m.model_id)).map((m: any) => ({ id: m.model_id, name: m.name })),
    voices: voices.map(v => ({ id: v.voice_id, name: v.name, category: v.category, labels: v.labels || {} })),
  };
}
export async function generateAudio(input: z.infer<typeof audioInput>) {
  const response = await eleven("/v1/text-to-dialogue?output_format=mp3_44100_128", {
    inputs: [{ text: input.text, voice_id: input.voice_id }],
    model_id: input.model,
    language_code: input.language,
  });
  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length || audio.length > 50 * 1024 * 1024 || !(audio.subarray(0, 3).toString() === "ID3" || (audio[0] === 255 && (audio[1] & 224) === 224))) {
    throw new AudioError(502, "ElevenLabs yaroqli MP3 qaytarmadi. Qayta yaratishdan oldin hisob tarixini tekshiring.");
  }
  return audio;
}
