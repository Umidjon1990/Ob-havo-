import { z } from "zod";
export const platformSchema = z.enum(["telegram", "instagram", "youtube"]);
export const formatSchema = z.enum([
  "text",
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
      telegram: z.string().max(15000).optional(),
      instagram: z.string().max(2200).optional(),
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
  count: z.union([z.literal(10), z.literal(15), z.literal(20)]),
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
  result: { post_ids?: string[] } | null;
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
  const caption =
    post.variants[platform as "telegram" | "instagram" | "youtube"] ??
    post.caption;
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
