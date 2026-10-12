import { z } from "zod";

export const carouselAudioSchema = z.object({
  music_id: z.string().uuid(),
  start_seconds: z.number().finite().min(0).max(3600).default(0),
  slide_seconds: z.number().finite().min(3).max(60).default(8),
  volume_percent: z.number().finite().min(1).max(100).default(30),
  fade_seconds: z.number().finite().min(0).max(2).default(0.4),
});
export const carouselAudioOutputSchema = z.object({
  source_key: z.string().max(4000),
  asset_ids: z.array(z.string().uuid()).min(2).max(10),
});
export type CarouselAudio = z.infer<typeof carouselAudioSchema>;
type CarouselSource = { format: string; asset_ids: string[]; variants: Record<string, any> };

// Bind the output to ordered source slides and every audio setting. This is
// also shared with the editor so stale videos are never presented as ready.
export function carouselAudioKey(post: CarouselSource): string | null {
  const audio = carouselAudioSchema.safeParse(post.variants.carousel_audio);
  if (post.format !== "carousel" || !audio.success) return null;
  const a = audio.data;
  return JSON.stringify(["carousel-audio-v1", post.asset_ids, a.music_id,
    a.start_seconds, a.slide_seconds, a.volume_percent, a.fade_seconds]);
}
export function carouselAudioReady(post: CarouselSource): boolean {
  const output = carouselAudioOutputSchema.safeParse(post.variants.carousel_audio_output);
  return !!output.success && output.data.source_key === carouselAudioKey(post)
    && output.data.asset_ids.length === post.asset_ids.length
    && new Set(output.data.asset_ids).size === output.data.asset_ids.length;
}

// Render metadata is server-owned. A changed image/order/setting invalidates
// it; clients cannot insert arbitrary output IDs in a create or edit request.
export function preserveCarouselAudioOutput<T extends CarouselSource>(post: T, previous?: CarouselSource): T {
  const variants = { ...post.variants };
  delete variants.carousel_audio_output;
  if (previous && carouselAudioReady(previous)
    && carouselAudioKey(post) === carouselAudioKey(previous)) {
    variants.carousel_audio_output = previous.variants.carousel_audio_output;
  }
  return { ...post, variants };
}
