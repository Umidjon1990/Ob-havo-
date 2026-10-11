import { z } from "zod";

export const studioFormats = { "9:16": [1080, 1920], "16:9": [1920, 1080], "1:1": [1440, 1440] } as const;
export const studioShotSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  title: z.string().trim().min(1).max(140),
  prompt: z.string().trim().max(2000).default(""),
  video_prompt: z.string().trim().max(1500).default(""),
  duration: z.number().min(2).max(60).default(5),
  subtitle: z.string().max(500).default(""),
  image_asset_id: z.string().uuid().nullable().default(null),
  video_asset_id: z.string().uuid().nullable().default(null),
  approved: z.boolean().default(false),
}).strict();
export const studioProjectSchema = z.object({
  name: z.string().trim().min(1).max(140),
  brief: z.string().max(12000).default(""),
  script: z.string().max(12000).default(""),
  script_locked: z.boolean().default(false),
  style_bible: z.string().max(6000).default(""),
  format: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  reference_asset_ids: z.array(z.string().uuid()).max(20).default([]),
  sample_asset_id: z.string().uuid().nullable().default(null),
  audio_asset_id: z.string().uuid().nullable().default(null),
  music_asset_id: z.string().uuid().nullable().default(null),
  shots: z.array(studioShotSchema).max(32).default([]),
}).strict().superRefine((p, ctx) => {
  if (new Set(p.shots.map(s => s.id)).size !== p.shots.length)
    ctx.addIssue({ code: "custom", path: ["shots"], message: "Kadr ID lari takrorlanmasin." });
  if (p.shots.reduce((total, s) => total + s.duration, 0) > 180)
    ctx.addIssue({ code: "custom", path: ["shots"], message: "Jami davomiylik 180 soniyadan oshmasin." });
});
export type StudioProjectInput = z.infer<typeof studioProjectSchema>;
export type StudioProject = StudioProjectInput & { id: string; version: number; created_at: string; updated_at: string };
const paid = { paid_authorized: z.literal(true), idempotency_key: z.string().regex(/^[a-zA-Z0-9_-]{8,120}$/) };
const base = { project_id: z.string().uuid() };
export const studioJobSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, ...paid, kind: z.literal("image"), shot_id: z.string(), mode: z.enum(["FAST", "ULTRA"]).default("FAST"), quantity: z.number().int().min(1).max(8).default(1), seed: z.number().int().min(0).max(2147483647).optional(), content_reference_asset_id: z.string().uuid().optional(), style_reference_asset_id: z.string().uuid().optional() }).strict(),
  z.object({ ...base, ...paid, kind: z.literal("video"), shot_id: z.string(), duration: z.union([z.literal(5), z.literal(10)]).default(5) }).strict(),
  z.object({ ...base, ...paid, kind: z.literal("audio"), voice_id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), language: z.enum(["uz", "ar"]), model: z.enum(["eleven_v4", "eleven_v4_turbo"]).default("eleven_v4") }).strict(),
  z.object({ ...base, ...paid, kind: z.literal("plan") }).strict(),
  z.object({ ...base, kind: z.literal("render"), idempotency_key: paid.idempotency_key, burn_subtitles: z.boolean().default(true) }).strict(),
]);
export type StudioJobInput = z.infer<typeof studioJobSchema>;
export type StudioCost = { amount: number; unit: "USD" | "credits" } | null;
export type StudioJob = { id: string; project_id: string; kind: StudioJobInput["kind"]; status: string; payload: Record<string, any>; generation_id: string | null; cost: StudioCost; result: Record<string, any> | null; error: string | null; created_at: string };
export const studioCommandSchema = z.object({
  command_id: paid.idempotency_key,
  operation: z.enum(["project.create", "project.update", "project.read", "job.queue", "job.read", "job.resume", "asset.link", "asset.import"]),
  data: z.record(z.unknown()),
}).strict();

export function waterStoryTemplate(): StudioProjectInput {
  const lock = "Match the approved father-daughter reference: identical faces, ages, proportions and wardrobe. Father: short black hair, light stubble, dark navy long sleeves. Daughter: 5–7, cream hijab covering hair and neck, pale pink floral long-sleeve dress. Cinematic Storybook Hybrid: painted 3D depth, restrained 2D linework, hand-painted textures, subtle cel shading, natural eyes and anatomy. Same cozy living room, sofa, wooden coffee table, lamp and curtains. Warm lamp light and cool blue evening window light. Father left, daughter right. One clear water glass. No text, watermark, extra limbs or duplicated people. Keep heads, hands and glass inside frame.";
  return studioProjectSchema.parse({
    name: "Bir stakan suv",
    brief: "Tasdiqlangan ota-qiz sahnalari uchun Lucid Origin sinovi. To‘liq tasdiqlangan ssenariy alohida kiritiladi; uning matni bu shablonda qayta yozilmaydi.",
    style_bible: lock,
    shots: [
      ["offer", "Suv taklif qilish", "Medium two-shot. Tired father sits distracted with slumped shoulders, relaxed brows and hands on lap, not angry. Daughter offers the water glass with BOTH hands and a small hopeful smile."],
      ["rejection", "Suvni rad etish", "Medium two-shot. Father looks at daughter with tense brows and a restrained dismissive hand gesture. She holds the glass with BOTH hands; smile fades and eyes lower. No physical aggression. Neither looks at camera."],
      ["leaving", "Qizning ketishi", "Medium-wide shot. Glass stands on coffee table. Daughter in three-quarter rear view turns and steps toward doorway with lowered shoulders. Father remains seated and watches with growing regret."],
      ["reconciliation", "Yarashish", "Medium-wide shot. Father KNEELS ON FLOOR at his standing daughter's eye level and gently embraces her, soft and apologetic. She leans into him. Glass stays on coffee table."],
    ].map(([id, title, scene]) => ({ id, title, prompt: `${lock}\n${scene}`, video_prompt: "Preserve faces, clothing, room and glass. Subtle natural body motion, slow cinematic camera. No dialogue, no lip movement, no added characters.", duration: 5 })),
  });
}
