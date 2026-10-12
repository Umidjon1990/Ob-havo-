import { z } from "zod";

// These are posting notes, not proof that Instagram music has been attached.
export const carouselNativeSchema = z.object({
  music_title: z.string().trim().max(200).default(""),
  music_url: z.string().trim().max(1000).refine(v => !v || /^https:\/\/\S+$/.test(v), "HTTPS havola kiriting.").default(""),
  start_seconds: z.number().finite().min(0).max(3600).default(0),
});
export type CarouselNative = z.infer<typeof carouselNativeSchema>;
export const nativeCarouselPublicationMessage = "Foto-karuselga umumiy musiqani Instagram ilovasida qo‘shib, nashrni o‘sha yerda yakunlang. Bu paket avtomatik nashrga yuborilmaydi.";
