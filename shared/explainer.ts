import { z } from "zod";
export const explainerSceneSchema = z.object({
  title: z.string().trim().min(1).max(100),
  arabic: z.string().max(1000).default(""),
  translation: z.string().max(1200).default(""),
  narration: z.string().trim().min(1).max(2000),
  stage: z.enum(["intro","question","answer","translation","analysis","phrases","outro"]).optional(),
  pairs: z.array(z.tuple([z.string().min(1).max(400),z.string().min(1).max(400)])).max(12).optional(),
  note: z.string().max(600).optional(),
  image_id: z.string().uuid().nullable().default(null),
  motion: z.enum(["pop", "slide", "zoom"]).default("pop"),
  sfx: z.enum(["pop", "whoosh", "tick", "typing", "none"]).default("pop"),
});
export const explainerPlanSchema = z.object({
  title: z.string().trim().min(1).max(100),
  profile: z.enum(["short","msc"]).optional(),
  lesson_code: z.string().regex(/^MSC-B\d{2}-Q\d{2}-N\d{3}-S\d{2}$/).optional(),
  source_question: z.string().max(1000).optional(),
  source_answer: z.string().max(6000).optional(),
  source_post_id: z.string().uuid().nullable().default(null),
  music_id: z.string().uuid().nullable().default(null),
  scenes: z.array(explainerSceneSchema).min(2).max(40),
}).superRefine((p,c) => {
  const msc = p.profile === "msc";
  const limit = msc ? 40000 : 2000;
  if (p.scenes.reduce((n,s) => n+s.narration.length,0)>limit)
    c.addIssue({code:"custom",message:`Jami narrator matni ${limit} belgidan oshmasin.`,path:["scenes"]});
  if (!msc && (p.scenes.length>8 || p.scenes.some(s=>s.narration.length>600 || s.arabic.length>240 || s.translation.length>240)))
    c.addIssue({code:"custom",message:"Qisqa explainer: 2–8 sahna, narrator 600, ekran matni 240 belgigacha.",path:["scenes"]});
  if (msc) {
    if (!p.lesson_code || !p.source_question || !p.source_answer)
      c.addIssue({code:"custom",message:"MSC ish kodi va asl savol-javob kerak."});
    const order = ["intro","question","answer","translation","analysis","phrases","outro"];
    let previous = -1;
    for (const [i,s] of Array.from(p.scenes.entries())) {
      const rank = order.indexOf(s.stage||"");
      if (rank<previous || rank<0) c.addIssue({code:"custom",message:"MSC sahnalari tartibi buzilgan.",path:["scenes",i,"stage"]});
      previous=rank;
      if(s.stage==="analysis" && !s.pairs?.length) c.addIssue({code:"custom",message:"Tahlilda so‘zma-so‘z bo‘laklar kerak.",path:["scenes",i,"pairs"]});
      if(s.stage==="phrases" && s.pairs?.length!==2) c.addIssue({code:"custom",message:"Kitobdagi qo‘llanish va yangi misol kerak.",path:["scenes",i,"pairs"]});
    }
    for(const stage of order) if(!p.scenes.some(s=>s.stage===stage)) c.addIssue({code:"custom",message:`MSC: ${stage} bosqichi yetishmaydi.`,path:["scenes"]});
    const normalize=(s:string)=>s.replace(new RegExp("[\\s\\p{P}]","gu"),"");
    if(normalize(p.scenes.filter(s=>s.stage==="answer").map(s=>s.arabic).join(" "))!==normalize(p.source_answer||""))
      c.addIssue({code:"custom",message:"To‘liq arabcha javob asl manbaga mos emas.",path:["source_answer"]});
    if(normalize(p.scenes.filter(s=>s.stage==="question").map(s=>s.arabic).join(" "))!==normalize(p.source_question||""))
      c.addIssue({code:"custom",message:"Arabcha savol asl manbaga mos emas.",path:["source_question"]});
    const analysis=p.scenes.filter(s=>s.stage==="analysis");
    if(normalize(analysis.map(s=>s.arabic).join(" "))!==normalize(p.source_answer||"")) c.addIssue({code:"custom",message:"Barcha javob gaplari tahlil qilinishi kerak.",path:["scenes"]});
    for(const s of analysis) if(normalize((s.pairs||[]).map(p=>p[0]).join(" "))!==normalize(s.arabic)) c.addIssue({code:"custom",message:"Tahlilda arabcha bo‘lak tarjimasiz qolgan.",path:["scenes"]});
  }
});
export type ExplainerPlan = z.infer<typeof explainerPlanSchema>;
export const EXPLAINER_RULES = `O‘zbek auditoriyasi uchun sodda ta’limiy explainer. Hook → tushuntirish → arabcha misollar → kichik sinov → postdagi mashqqa chaqiriq. Har sahnada bitta fikr. Narrator Umidjon klon ovozi, ElevenLabs v4, til uz; arabcha matn ham shu ovozda o‘qiladi. Arabcha harakatlar va RTL saqlansin; ma’no va talaffuz tekshirilsin. Postdagi rasmlar/iconlar qayta ishlatilsin. Yangi tasvir rejasida sifatli 3D cartoon, Disney animatsiyasi uslubi, faqat neytral erkak yoki o‘g‘il bolalar, ayol qahramonlarsiz; misollar dunyoviy. Arabcha matn rasm ichida generatsiya qilinmaydi, alohida matn qatlamidir. Pop-up, slide, zoom; whoosh, pop, tick, typing SFX nutqni bosmasin. Narration arabcha ibora va misollarni asl arab yozuvida o‘qish, o‘zbekcha tarjima va qisqa izohni qamrasin; lotincha transliteratsiya bilan almashtirmang. Har sahna title <=100, arabic va translation <=240, narration <=600 belgi. Narration ichida montaj ko‘rsatmalari bo‘lmasin; ular motion va sfx maydonlarida. Umumiy narrator matni 2000 belgidan oshmasin. Ssenariy tasdiqlanmaguncha audio/video yaratilmaydi. Nashr alohida rejalashtiriladi.`;

export const MSC_RULES = `Milliy sertifikat og‘zaki darsi: asl savol-javobni o‘zgartirma. Kirish → savol → to‘liq arabcha javob → to‘liq o‘zbekcha tarjima → barcha gaplar tahlili → foydali iboralar → yakun. Har sahnada stage shu tartibda intro/question/answer/translation/analysis/phrases/outro. Tahlilda pairs: [[arabcha bo‘lak, o‘zbekcha ma’no]]; barcha arabcha bo‘laklar gapni to‘liq qoplasin. Iboralar pairs: kitobdagi qo‘llanish va boshqa mavzudagi yangi mualliflik misoli. note vazifani tushuntirsin. Alohida mashq yoki test qo‘shma. 2–40 sahna, har narration 2000 belgigacha; manbani qisqartirma. Umidjon klon ovozi, 1080×1920, 30 fps. Asl source_question, source_answer, lesson_code kerak. Arabcha RTL, tahlilda ikki ustun: SO‘ZMA-SO‘Z va UMUMIY TARJIMA.`;
