import { z } from "zod";
export const explainerSceneSchema = z.object({
  title: z.string().trim().min(1).max(100),
  arabic: z.string().max(240).default(""),
  translation: z.string().max(240).default(""),
  narration: z.string().trim().min(1).max(600),
  image_id: z.string().uuid().nullable().default(null),
  motion: z.enum(["pop", "slide", "zoom"]).default("pop"),
  sfx: z.enum(["pop", "whoosh", "tick", "typing", "none"]).default("pop"),
});
export const explainerPlanSchema = z.object({
  title: z.string().trim().min(1).max(100),
  source_post_id: z.string().uuid().nullable().default(null),
  music_id: z.string().uuid().nullable().default(null),
  scenes: z.array(explainerSceneSchema).min(2).max(8),
}).superRefine((p,c) => {
  if (p.scenes.reduce((n,s) => n+s.narration.length,0)>2000)
    c.addIssue({code:z.ZodIssueCode.custom,message:"Jami narrator matni 2000 belgidan oshmasin.",path:["scenes"]});
});
export type ExplainerPlan = z.infer<typeof explainerPlanSchema>;
export const EXPLAINER_RULES = `O‘zbek auditoriyasi uchun sodda ta’limiy explainer. Hook → tushuntirish → arabcha misollar → kichik sinov → postdagi mashqqa chaqiriq. Har sahnada bitta fikr. Narrator Umidjon klon ovozi, ElevenLabs v4, til uz; arabcha matn ham shu ovozda o‘qiladi. Arabcha harakatlar va RTL saqlansin; ma’no va talaffuz tekshirilsin. Postdagi rasmlar/iconlar qayta ishlatilsin. Yangi tasvir rejasida sifatli 3D cartoon, Disney animatsiyasi uslubi, faqat neytral erkak yoki o‘g‘il bolalar, ayol qahramonlarsiz; misollar dunyoviy. Arabcha matn rasm ichida generatsiya qilinmaydi, alohida matn qatlamidir. Pop-up, slide, zoom; whoosh, pop, tick, typing SFX nutqni bosmasin. Narration arabcha ibora va misollarni asl arab yozuvida o‘qish, o‘zbekcha tarjima va qisqa izohni qamrasin; lotincha transliteratsiya bilan almashtirmang. Har sahna title <=100, arabic va translation <=240, narration <=600 belgi. Narration ichida montaj ko‘rsatmalari bo‘lmasin; ular motion va sfx maydonlarida. Umumiy narrator matni 2000 belgidan oshmasin. Ssenariy tasdiqlanmaguncha audio/video yaratilmaydi. Nashr alohida rejalashtiriladi.`;
