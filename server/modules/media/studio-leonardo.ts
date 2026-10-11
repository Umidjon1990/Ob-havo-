import type { StudioCost, StudioJobInput, StudioProject } from "../../../shared/ai-studio";
import { studioFormats } from "../../../shared/ai-studio";
export class StudioError extends Error {
  constructor(public status: number, message: string, public ambiguous = false) { super(message); }
}
export type StudioImage = { mime_type: string; data: Buffer };
export function leonardoBody(input: Extract<StudioJobInput, {kind: "image" | "video"}>, project: StudioProject, images: Map<string, StudioImage>) {
  const shot = project.shots.find(s => s.id === input.shot_id);
  if (!shot) throw new StudioError(404, "Kadr topilmadi.");
  const source = (id: string) => {
    const a = images.get(id);
    if (!a || !["image/png", "image/jpeg"].includes(a.mime_type)) throw new StudioError(400, "Reference uchun JPG yoki PNG kerak.");
    if (a.data.length > 7 * 1024 * 1024) throw new StudioError(413, "Reference 7 MB dan kichik bo‘lsin.");
    return a;
  };
  const reference = (id: string) => ({ type: "BASE64", data: source(id).data.toString("base64") });
  const [width, height] = studioFormats[project.format];
  if (input.kind === "video") {
    if (!shot.approved || !shot.image_asset_id) throw new StudioError(400, "Avval tasdiqlangan kadr rasmini tanlang.");
    if (!shot.video_prompt) throw new StudioError(400, "Video uchun harakat prompti kerak.");
    return { model: "kling-2.6", public: false, parameters: { prompt: shot.video_prompt, duration: input.duration, width, height, quantity: 1, motion_has_audio: false, guidances: { start_frame: [{ image: reference(shot.image_asset_id) }] } } };
  }
  if (!shot.prompt) throw new StudioError(400, "Kadr uchun rasm prompti kerak.");
  if (input.image_model === "lightning-xl") {
    if (shot.prompt.length > 1500) throw new StudioError(400, "Lightning XL prompti 1500 belgidan oshmasin.");
    if (input.quantity > 4) throw new StudioError(400, "Lightning XL uchun bir kadrga ko‘pi bilan 4 rasm tanlang.");
    const [w, h] = { "9:16": [720, 1280], "16:9": [1280, 720], "1:1": [1024, 1024] }[project.format];
    const references = [
      [input.character_reference_asset_id, 133, "Mid"],
      [input.content_reference_asset_id, 100, "Low"],
      [input.style_reference_asset_id, 67, "High"],
    ].filter(([id]) => id).map(([id, preprocessorId, strengthType]) => ({ image: source(id as string), preprocessorId, strengthType }));
    return { api_version: "v1", body: { modelId: "b24e16ff-06e3-43eb-8d33-4416c2d75876", public: false, prompt: shot.prompt, width: w, height: h, num_images: input.quantity, alchemy: true, presetStyle: "PHOTOGRAPHY", enhancePrompt: false, ...(input.seed !== undefined ? {seed: input.seed} : {}) }, references };
  }
  if (input.character_reference_asset_id) throw new StudioError(400, "Character Reference uchun Lightning XL modelini tanlang.");
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
async function leonardo(path: string, body?: unknown, billable = !!body) {
  const key = process.env.LEONARDO_API_KEY?.trim();
  if (!key) throw new StudioError(503, "Railway web xizmatiga LEONARDO_API_KEY qo‘shing.");
  let r: Response;
  try {
    r = await fetch(`https://cloud.leonardo.ai/api/rest/${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(body ? {"Content-Type": "application/json"} : {}) }, ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(60000) });
  } catch { throw new StudioError(504, billable ? "Leonardo javobi olinmadi. Kredit sarflangan bo‘lishi mumkin; vazifani qayta yuborishdan oldin hisob tarixini tekshiring." : "Leonardo reference yuklash javobi olinmadi. Pullik generatsiya yuborilmadi.", billable); }
  if (!r.ok) {
    // Bounded provider diagnostic; remove credentials, prompts, URLs and byte data.
    let detail = "";
    try {
      const failure = await r.json() as any;
      const message = failure?.error || failure?.message || failure?.errors?.[0]?.message;
      if (typeof message === "string") {
        detail = message.replaceAll(key, "[redacted]");
        const prompt = (body as any)?.prompt || (body as any)?.parameters?.prompt;
        if (typeof prompt === "string" && prompt) detail = detail.replaceAll(prompt, "[prompt]");
        detail = detail.replace(/https?:\/\/\S+/g, "[url]").replace(/[A-Za-z0-9+/]{120,}={0,2}/g, "[data]").replace(/[\r\n]+/g," ").slice(0,300);
      }
    } catch {}
    const messages: Record<number, string> = { 401: "Leonardo API kaliti yaroqsiz.", 403: "Leonardo kaliti yoki model ruxsatini tekshiring.", 402: "Leonardo API balansini tekshiring.", 429: "Leonardo so‘rov limiti. Keyinroq tekshiring." };
    const balanceError = /(insufficient|not enough|exceed|limit).*(credit|balance)|(credit|balance).*(insufficient|not enough|exceed|limit)/i.test(detail);
    throw new StudioError(r.status, `${balanceError ? "Leonardo API balansida kredit yetarli emas." : messages[r.status] || `Leonardo so‘rovi bajarilmadi (HTTP ${r.status}).`} Endpoint: ${path}.${detail ? ` ${detail}` : ""}`, billable && r.status >= 500);
  }
  try { return await r.json(); } catch { throw new StudioError(502, "Leonardo javobi tushunarsiz. Hisob tarixini tekshiring.", billable); }
}
export async function uploadLeonardoReference(image: StudioImage) {
  const response = await leonardo("v1/init-image", {extension: image.mime_type === "image/png" ? "png" : "jpg"}, false);
  const upload = response?.uploadInitImage;
  if (typeof upload?.id !== "string" || !/^[a-f0-9-]{36}$/i.test(upload.id) || typeof upload.url !== "string" || !allowedLeonardoUrl(upload.url)) throw new StudioError(502, "Leonardo reference yuklash manzili mos emas. Pullik generatsiya yuborilmadi.");
  let fields: Record<string, unknown>;
  try { fields = typeof upload.fields === "string" ? JSON.parse(upload.fields) : upload.fields; } catch { throw new StudioError(502, "Leonardo reference yuklash sozlamalari mos emas."); }
  if (!fields || typeof fields !== "object" || Array.isArray(fields) || Object.keys(fields).length > 30 || Object.values(fields).some(v => typeof v !== "string")) throw new StudioError(502, "Leonardo reference yuklash sozlamalari mos emas.");
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value as string);
  form.append("file", new Blob([new Uint8Array(image.data)], {type: image.mime_type}), image.mime_type === "image/png" ? "reference.png" : "reference.jpg");
  try {
    const r = await fetch(upload.url, {method: "POST", body: form, redirect: "error", signal: AbortSignal.timeout(60000)});
    if (!r.ok) throw new StudioError(502, `Leonardo reference yuklanmadi (HTTP ${r.status}). Pullik generatsiya yuborilmadi.`);
  } catch (e) { if (e instanceof StudioError) throw e; throw new StudioError(504, "Leonardo reference yuklanmadi. Pullik generatsiya yuborilmadi."); }
  return upload.id;
}
export async function createLeonardoGeneration(request: unknown) {
  const internal = request as any;
  let path = "v2/generations", body = request;
  if (internal?.api_version === "v1") {
    const controlnets = [];
    for (const ref of internal.references) controlnets.push({initImageId: await uploadLeonardoReference(ref.image), initImageType: "UPLOADED", preprocessorId: ref.preprocessorId, strengthType: ref.strengthType});
    path = "v1/generations";
    body = {...internal.body, ...(controlnets.length ? {controlnets} : {})};
  }
  const data = await leonardo(path, body);
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
