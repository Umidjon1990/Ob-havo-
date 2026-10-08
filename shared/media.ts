import { z } from "zod";
import { explainerPlanSchema } from "./explainer";
import { reelPackageSchema, reelPublicationError } from "./reels";
export const platformSchema = z.enum(["telegram", "instagram", "youtube"]);
export const formatSchema = z.enum([
  "text",
  "article",
  "image",
  "video",
  "carousel",
  "stickman",
]);
export const postSchema = z.object({
  title: z.string().trim().min(1).max(100),
  caption: z.string().max(15000).default(""),
  format: formatSchema,
  asset_ids: z.array(z.string().uuid()).max(10).default([]),
  variants: z
    .object({
      reels: reelPackageSchema.optional(),
      explainer: explainerPlanSchema.optional(),
      explainer_audio_id: z.string().uuid().optional(),
      explainer_video_id: z.string().uuid().optional(),
      telegram: z.string().max(15000).optional(),
      instagram: z.string().max(2200).optional(),
      telegram_asset_ids: z.array(z.string().uuid()).min(1).max(10).optional(),
      instagram_asset_ids: z.array(z.string().uuid()).min(1).max(10).optional(),
      youtube_asset_ids: z.array(z.string().uuid()).min(1).max(1).optional(),
      instagram_cover_id: z.string().uuid().optional(),
      youtube_cover_id: z.string().uuid().optional(),
      youtube: z.string().max(5000).optional(),
      suggested_at: z.string().datetime({ offset: true }).optional(),
      youtube_privacy: z.enum(["public", "unlisted", "private"]).optional(),
      youtube_made_for_kids: z.boolean().optional(),
      youtube_synthetic_media: z.boolean().optional(),
    })
    .default({}),
  production_notes: z.string().max(30000).default(""),
});
export const ruleSchema = z.object({
  title: z.string().trim().min(1).max(150),
  content: z.string().trim().min(1).max(10000),
  scope: z.enum(["brand", "video", "image", "carousel", "stickman", "project"]),
  active: z.boolean().default(true),
});
export const campaignSchema = z.object({
  topic: z.string().trim().min(3).max(3000),
  count: z.number().int().min(1).max(31),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  format: formatSchema,
  reference_ids: z.array(z.string().uuid()).max(10).default([]),
});
export type MediaPost = z.infer<typeof postSchema> & {
  id: string;
  created_at: string;
  updated_at: string;
  deliveries: MediaDelivery[];
};
export type MediaDelivery = {
  id: string;
  post_id: string;
  account_id: string;
  account_name: string;
  platform: string;
  status: string;
  scheduled_at: string;
  error: string | null;
  external_url: string | null;
  external_id?: string | null;
  attempts: number;
  published_at: string | null;
};
export type MediaAccount = {
  id: string;
  platform: "telegram" | "instagram" | "youtube";
  name: string;
  external_id: string;
  enabled: boolean;
  verified_at: string | null;
  has_credentials: boolean;
};
export type MediaAsset = {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  created_at: string;
};
export type MediaRule = z.infer<typeof ruleSchema> & {
  id: string;
  version: number;
};
export type MediaReference = {
  id: string;
  title: string;
  url: string;
  notes: string;
  scope: string;
};
export type MediaJob = {
  id: string;
  status: string;
  kind: string;
  error: string | null;
  created_at: string;
  payload?: { post_id?: string };
  result: { post_ids?: string[]; post_id?: string; duration?: number; timings?: {start:number;duration:number;title:string}[] } | null;
};
export const deliveryLabels: Record<string, string> = {
  scheduled: "Rejalashtirilgan",
  publishing: "Yuborilmoqda",
  published: "Yuborilgan",
  failed: "Xato",
  needs_review: "Tekshirish kerak",
  cancelled: "Bekor qilingan",
};
export function validatePublication(
  post: z.infer<typeof postSchema>,
  platform: string,
  mimes: string[],
) {
  if (post.variants.reels) {
    const error = reelPublicationError(post.variants.reels, platform, post.asset_ids, post.variants.instagram_cover_id);
    if (error) return error;
  }
  const caption =
    post.variants[platform as "telegram" | "instagram" | "youtube"] ??
    post.caption;
  if (post.format === "article") {
    if (platform !== "telegram" || !caption.trim())
      return "Article uchun Telegram va HTML mazmun kerak.";
    const refs = Array.from(caption.matchAll(/\{\{asset:([a-f0-9-]+)\}\}/g), m => m[1]);
    if (refs.some(id => !post.asset_ids.includes(id)))
      return "Article ichidagi media fayl postga biriktirilmagan.";
    if (post.asset_ids.some(id => !refs.includes(id)))
      return "Biriktirilgan Article faylini {{asset:ID}} bilan HTML ichida ishlating.";
    if (mimes.some(m => !["image/jpeg", "image/png", "audio/mpeg", "video/mp4"].includes(m)))
      return "Article uchun JPG, PNG, MP3 yoki MP4 kerak.";
    return null;
  }
  if (platform === "telegram" && caption.length > (mimes.length ? 1024 : 4096))
    return `Telegram matni ${mimes.length ? 1024 : 4096} belgidan oshmasin.`;
  if (platform === "instagram" && caption.length > 2200)
    return "Instagram matni 2200 belgidan oshmasin.";
  if (platform === "youtube" && caption.length > 5000)
    return "YouTube tavsifi 5000 belgidan oshmasin.";
  if (
    post.format === "text" &&
    (platform !== "telegram" || mimes.length || !caption.trim())
  )
    return "Matnli post uchun Telegram va bo‘sh bo‘lmagan matn kerak.";
  if (
    post.format === "carousel" &&
    (mimes.length < 2 ||
      mimes.length > 10 ||
      mimes.some((m) => m !== "image/jpeg"))
  )
    return "Karuselga 2–10 ta JPG rasm kerak.";
  if (
    post.format === "image" &&
    (mimes.length !== 1 || !["image/jpeg", "image/png"].includes(mimes[0]))
  )
    return "Rasmli postga bitta JPG yoki PNG kerak.";
  if (
    ["video", "stickman"].includes(post.format) &&
    (mimes.length !== 1 || mimes[0] !== "video/mp4")
  )
    return "Video uchun bitta MP4 fayl kerak.";
  if (platform === "instagram" && mimes.some((m) => m === "image/png"))
    return "Instagram uchun JPG yuklang.";
  if (
    platform === "youtube" &&
    (!["video", "stickman"].includes(post.format) || mimes.length !== 1)
  )
    return "YouTube uchun bitta tayyor MP4 video tanlang.";
  return null;
}
export function suggestedDates(month: string, count: number, now = new Date()) {
  const [year, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) =>
    new Date(
      Date.UTC(year, m - 1, 1 + Math.floor((i * days) / count), 13, 0),
    ).toISOString(),
  ).filter((d) => new Date(d) > now);
}

export function platformPost<T extends {asset_ids: string[]; variants: Record<string, any>}>(post:T, platform:string):T {
  return {...post,asset_ids:post.variants[`${platform}_asset_ids`] ?? post.asset_ids};
}
