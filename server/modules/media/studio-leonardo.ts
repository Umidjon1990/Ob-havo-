import type { StudioCost, StudioJobInput, StudioProject } from "../../../shared/ai-studio";
import { studioFormats } from "../../../shared/ai-studio";
export class StudioError extends Error {
  constructor(public status: number, message: string, public ambiguous = false) { super(message); }
}
export type StudioImage = { mime_type: string; data: Buffer };
export function leonardoBody(input: Extract<StudioJobInput, {kind: "image" | "video"}>, project: StudioProject, images: Map<string, StudioImage>) {
  const shot = project.shots.find(s => s.id === input.shot_id);
  if (!shot) throw new StudioError(404, "Kadr topilmadi.");
  const reference = (id: string) => {
    const a = images.get(id);
    if (!a || !["image/png", "image/jpeg"].includes(a.mime_type)) throw new StudioError(400, "Reference uchun JPG yoki PNG kerak.");
    if (a.data.length > 7 * 1024 * 1024) throw new StudioError(413, "Reference 7 MB dan kichik bo‘lsin.");
    return { type: "BASE64", data: a.data.toString("base64") };
  };
  const [width, height] = studioFormats[project.format];
  if (input.kind === "video") {
    if (!shot.approved || !shot.image_asset_id) throw new StudioError(400, "Avval tasdiqlangan kadr rasmini tanlang.");
    if (!shot.video_prompt) throw new StudioError(400, "Video uchun harakat prompti kerak.");
    return { model: "kling-2.6", public: false, parameters: { prompt: shot.video_prompt, duration: input.duration, width, height, quantity: 1, motion_has_audio: false, guidances: { start_frame: [{ image: reference(shot.image_asset_id) }] } } };
  }
  if (!shot.prompt) throw new StudioError(400, "Kadr uchun rasm prompti kerak.");
  const guidances: Record<string, unknown> = {};
  if (input.content_reference_asset_id) guidances.content = [{ image: reference(input.content_reference_asset_id), strength: "HIGH" }];
  if (input.style_reference_asset_id) guidances.style = [{ image: reference(input.style_reference_asset_id), strength: "HIGH" }];
  return { model: "lucid-origin", public: false, parameters: { prompt: shot.prompt, mode: input.mode, width, height, quantity: input.quantity, prompt_enhance: "OFF", style_ids: ["a5632c7c-ddbb-4e2f-ba34-8456ab3ac436"], ...(input.seed !== undefined ? {seed: input.seed} : {}), ...(Object.keys(guidances).length ? {guidances} : {}) } };
}
export function providerCost(data: any): StudioCost {
  const cost = data?.cost;
  if (cost && cost.amount !== null && cost.amount !== "" && ["number","string"].includes(typeof cost.amount) && Number.isFinite(Number(cost.amount)) && Number(cost.amount) >= 0) {
    const unit = String(cost.unit || cost.currency || "").toLowerCase();
    if (["usd", "dollars", "dollar"].includes(unit)) return { amount: Number(cost.amount), unit: "USD" };
    if (["credits", "credit"].includes(unit)) return { amount: Number(cost.amount), unit: "credits" };
  }
  return typeof data?.apiCreditCost === "number" && Number.isFinite(data.apiCreditCost) && data.apiCreditCost >= 0 ? { amount: data.apiCreditCost, unit: "credits" } : null;
}
async function leonardo(path: string, body?: unknown) {
  const key = process.env.LEONARDO_API_KEY?.trim();
  if (!key) throw new StudioError(503, "Railway web xizmatiga LEONARDO_API_KEY qo‘shing.");
  let r: Response;
  try {
    r = await fetch(`https://cloud.leonardo.ai/api/rest/${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(body ? {"Content-Type": "application/json"} : {}) }, ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(60000) });
  } catch { throw new StudioError(504, "Leonardo javobi olinmadi. Kredit sarflangan bo‘lishi mumkin; vazifani qayta yuborishdan oldin hisob tarixini tekshiring.", !!body); }
  if (!r.ok) {
    const messages: Record<number, string> = { 401: "Leonardo API kaliti yaroqsiz.", 403: "Leonardo kaliti yoki model ruxsatini tekshiring.", 402: "Leonardo API balansini tekshiring.", 429: "Leonardo so‘rov limiti. Keyinroq tekshiring." };
    throw new StudioError(r.status, messages[r.status] || `Leonardo so‘rovi bajarilmadi (HTTP ${r.status}).`, !!body && r.status >= 500);
  }
  try { return await r.json(); } catch { throw new StudioError(502, "Leonardo javobi tushunarsiz. Hisob tarixini tekshiring.", !!body); }
}
export async function createLeonardoGeneration(body: unknown) {
  const data = await leonardo("v2/generations", body);
  const id = data?.generationId || data?.sdGenerationJob?.generationId;
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id)) throw new StudioError(502, "Leonardo generation ID qaytarmadi. Hisob tarixini tekshiring.", true);
  return { id, cost: providerCost(data) || providerCost(data.sdGenerationJob) };
}
export function generationResult(data: any, kind: "image" | "video") {
  const generation = data?.generations_by_pk || data?.generation || data;
  const status = String(generation?.status || "PENDING").toUpperCase();
  const images = generation?.generated_images || generation?.results || [];
  const outputs = Array.isArray(images) ? images.map((a: any) => ({ id: typeof a.id === "string" ? a.id : "", url: kind === "video" ? a.motionMP4URL || a.motion_mp4_url || a.video_url || a.url : a.url })).filter(a => typeof a.url === "string") : [];
  return { status, outputs, cost: providerCost(generation) || providerCost(data) };
}
export async function getLeonardoGeneration(id: string, kind: "image" | "video") {
  return generationResult(await leonardo(`v1/generations/${encodeURIComponent(id)}`), kind);
}
export function allowedLeonardoUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && (!u.port || u.port === "443") && ["leonardo.ai", "leonardo-cdn.com", "cloudfront.net", "amazonaws.com"].some(d => u.hostname === d || u.hostname.endsWith(`.${d}`));
  } catch { return false; }
}
export async function downloadLeonardoOutput(url: string, kind: "image" | "video") {
  if (!allowedLeonardoUrl(url)) throw new StudioError(502, "Leonardo fayl manzili tekshiruvdan o‘tmadi. Generatsiya saqlangan; qayta generatsiya qilmang.");
  const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(120000) });
  if (!r.ok || !r.body) throw new StudioError(502, "Leonardo fayli olinmadi. Generatsiya ID si saqlangan.");
  const max = 50 * 1024 * 1024;
  if (Number(r.headers.get("content-length")) > max) throw new StudioError(413, "Yaratilgan fayl 50 MB dan katta.");
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const part of r.body as any) { size += part.length; if (size > max) { await r.body.cancel().catch(() => {}); throw new StudioError(413, "Yaratilgan fayl 50 MB dan katta."); } chunks.push(part); }
  const data = Buffer.concat(chunks);
  let mime_type = "";
  if (kind === "video" && data.subarray(4, 8).toString() === "ftyp") mime_type = "video/mp4";
  if (kind === "image" && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime_type = "image/png";
  if (kind === "image" && data[0] === 255 && data[1] === 216 && data[2] === 255) mime_type = "image/jpeg";
  if (!mime_type) throw new StudioError(502, "Yaratilgan fayl formati mos emas. Generatsiya ID si saqlangan.");
  return { mime_type, data };
}
