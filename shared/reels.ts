import { z } from "zod";

const uuid = z.string().uuid();
const httpsUrl = z.string().trim().url().max(2000).refine(value => {
  try { const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}, "Havola HTTPS bo‘lishi kerak.");

export const reelSceneSchema = z.object({
  kind: z.enum(["hook", "search", "meaning", "example", "sarf", "benefits", "cta"]),
  title: z.string().trim().min(1).max(70),
  body: z.string().max(180).default(""),
  arabic: z.string().max(150).default(""),
  seconds: z.number().min(3).max(20),
  visual_prompt: z.string().max(1800).default(""),
  image_id: uuid.nullable().default(null),
});
export const reelPackageSchema = z.object({
  version: z.literal(1).default(1),
  source_url: httpsUrl,
  source_notes: z.string().trim().min(10).max(6000),
  hook: z.string().trim().min(5).max(220),
  script: z.string().trim().min(10).max(2000),
  target_seconds: z.number().int().min(40).max(60).default(55),
  scenes: z.array(reelSceneSchema).min(3).max(8),
  keywords: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
  dm_text: z.string().trim().min(1).max(800),
  link_url: httpsUrl,
  require_follow: z.boolean().default(true),
  automation_enabled: z.boolean().default(true),
  voice_id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).or(z.literal("")).default(""),
  intro_id: uuid.nullable().default(null),
  music_id: uuid.nullable().default(null),
  audio_id: uuid.nullable().default(null),
  audio_fingerprint: z.string().max(64).default(""),
  video_id: uuid.nullable().default(null),
  actual_seconds: z.number().positive().max(61).optional(),
  reviewed: z.boolean().default(false),
}).superRefine((p, c) => {
  const duration = p.scenes.reduce((sum, s) => sum + s.seconds, 0);
  if (Math.abs(duration - p.target_seconds) > 0.1)
    c.addIssue({code:"custom",path:["scenes"],message:"Sahna vaqtlari umumiy davomiylikka teng bo‘lsin."});
  if (`${p.dm_text}\n${p.link_url}`.length > 1000)
    c.addIssue({code:"custom",path:["dm_text"],message:"Direct xabari havola bilan 1000 belgidan oshmasin."});
});

export const reelBriefSchema = z.object({
  topic: z.string().trim().min(3).max(1200),
  source_url: httpsUrl,
  source_notes: z.string().trim().min(10).max(6000),
  hook: z.string().trim().max(220).default(""),
  keywords: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
  dm_text: z.string().trim().min(1).max(800),
  link_url: httpsUrl,
  require_follow: z.boolean().default(true),
  target_seconds: z.number().int().min(40).max(60).default(55),
  count: z.number().int().min(1).max(12).default(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  voice_id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).or(z.literal("")).default(""),
});
export type ReelPackage = z.infer<typeof reelPackageSchema>;
export type ReelBrief = z.infer<typeof reelBriefSchema>;
export const REEL_PRODUCTION_RULES = `Instagram uchun 40–60 soniyalik professional animatsion reklama. Avval to‘liq ishlab chiqarish prompti yozing. Kuchli hook, bitta aniq foyda, amaliy misol, haqiqiy manba, izohdagi kalit so‘z va Direct orqali havola. Faqat berilgan source_notes dagi tekshirilgan imkoniyatlarni da’vo qiling; sayt URL sini o‘qiganingizni yoki tasvir yaratilganini aytmang. "Istalgan/barcha/100%" kabi universal da’volar uchun aniq dalil zarur. Yorqin premium 3D cartoon, izchil neytral erkak qahramonlar, kundalik diniy bo‘lmagan misollar. Arabcha matn RTL, harakatlar aniq va alohida qatlamda. Pop-up, slide, zoom, bounce, silliq kamera va sinxron whoosh/pop/tick. Nutq uchun Umidjon clone; ovozga mos montaj, o‘qishga vaqt. Instagram reklamasida profilga obuna va kalit so‘zli izoh CTA mumkin. Cover hook markazda katta, pastda ortiqcha bo‘sh joy yo‘q. Yaratilgan MP4, cover va kalit so‘zli javob bitta paket.`;

export function reelResponse(reel: ReelPackage) {
  return `${reel.dm_text}\n\n${reel.link_url}`;
}
export function reelPublicationError(reel: ReelPackage, platform: string, assetIds: string[], coverId?: string) {
  if (platform !== "instagram") return "Reklama Reels paketi faqat Instagram uchun.";
  if (!reel.reviewed) return "Reelsni ko‘rib chiqib, nashrga tayyorligini belgilang.";
  if (!reel.video_id || assetIds.length !== 1 || assetIds[0] !== reel.video_id) return "Yakuniy Reels videosini biriktiring.";
  if (!coverId) return "Reels uchun alohida cover tanlang.";
  if (reel.actual_seconds !== undefined && (reel.actual_seconds < 40 || reel.actual_seconds > 60.1)) return "Reels davomiyligi 40–60 soniya bo‘lsin.";
  return null;
}

export function reelDates(month: string, count: number, now = new Date()) {
  const [year, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const available = Array.from({length: days}, (_, i) => new Date(Date.UTC(year, m - 1, i + 1, 13)))
    .filter(d => d.getTime() > now.getTime() + 60000);
  if (available.length < count) return [];
  return Array.from({length:count}, (_, i) => available[Math.floor(i * available.length / count)].toISOString());
}
