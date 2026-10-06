import { z } from 'zod';
export const automationSchema = z.object({
  account_id: z.string().uuid(), title: z.string().trim().min(1).max(100),
  trigger: z.enum(['comment','message']), keywords: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
  action: z.enum(['reply','private_reply','hide']), response: z.string().trim().max(1000).default(''),
  media_id: z.string().regex(/^\d+$/).optional().or(z.literal('')),
  enabled: z.boolean().default(false),
  require_follow: z.boolean().default(false),
}).superRefine((v,c)=>{
  if(v.action!=='hide' && !v.response) c.addIssue({code:'custom',path:['response'],message:'Tasdiqlangan javob matni kerak.'});
  if(v.trigger==='message' && v.action!=='reply') c.addIssue({code:'custom',message:'Direct uchun faqat javob berish mumkin.'});
  if(v.require_follow && !(v.trigger==='message'&&v.action==='reply'||v.trigger==='comment'&&v.action==='private_reply'))
    c.addIssue({code:'custom',path:['require_follow'],message:'Obuna sharti faqat Directga material yuborishda ishlaydi.'});
  if(v.trigger==='message' && v.media_id) c.addIssue({code:'custom',path:['media_id'],message:'Direct qoidasi postga bog‘lanmaydi.'});
});
export function keywordMatch(text: string, keywords: string[]) {
  const normalize = (value:string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[’‘'`ʼ]/g,'').split(new RegExp('[^\\p{L}\\p{N}]+','u')).filter(Boolean).join(' ');
  const normalized = ` ${normalize(text)} `;
  return keywords.some(k=>!!normalize(k)&&normalized.includes(` ${normalize(k)} `));
}
export function withinWindow(kind: string, occurred: string|Date, now=Date.now()) {
  const age=now-new Date(occurred).getTime();
  return Number.isFinite(age) && age>=-60000 && age<(kind==='comment'?7*86400000:86400000);
}
