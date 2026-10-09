import { mediaLibraryLimit } from "./storage-quota";
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { explainerPlanSchema, type ExplainerPlan } from '../../../shared/explainer';
import { AudioError } from './audio';

export const MSC_PACKAGE = 'msc-october-2026';
const publicationSchema = z.array(z.object({lesson_code:z.string(),cover_file:z.string().regex(/^MSC-B\d{2}-Q\d{2}-N\d{3}-S\d{2}\.jpg$/),caption:z.string().max(15000),description:z.string().max(5000),planned_at:z.string().datetime({offset:true})}));
export async function loadMscPackage() {
  const plans=z.array(explainerPlanSchema).length(9).parse(JSON.parse(await readFile(join(process.cwd(),'docs/examples/msc-october-2026.json'),'utf8')));
  const publications=publicationSchema.length(9).parse(JSON.parse(await readFile(join(process.cwd(),'docs/examples/msc-october-2026-publication.json'),'utf8')));
  return Promise.all(plans.map(async plan=>{
    const publication=publications.find(p=>p.lesson_code===plan.lesson_code);
    if(!publication)throw new AudioError(503,'Dars paketi muqovasi yoki nashr matni yetishmaydi.');
    const cover=await readFile(join(process.cwd(),'server/assets/msc-october-2026',publication.cover_file));
    if(cover.length>2*1024*1024||cover.subarray(0,3).toString('hex')!=='ffd8ff')throw new AudioError(503,'Dars muqovasi yaroqsiz.');
    return {plan,publication,cover};
  }));
}
export function chooseMscVoice(voices:{id:string;name:string;category:string}[], selected?:string) {
  const candidates=voices.filter(v=>/umidjon/i.test(v.name)&&['cloned','professional'].includes(v.category));
  if(selected){if(!candidates.some(v=>v.id===selected))throw new AudioError(422,'MSC uchun Umidjon klon ovozi kerak.');return selected;}
  if(candidates.length!==1)throw new AudioError(422,candidates.length?'Bir nechta Umidjon ovozi bor. Narratorni bir marta tanlang, keyin paket tugmasini bosing.':'Umidjon klon ovozi topilmadi. ElevenLabs ulanishini tekshiring.');
  return candidates[0].id;
}
// Do not reissue an ambiguous paid request. Everything saved before the next
// request can be resumed automatically after a server restart.
export function checkpointCanResume(job:any) {
  return job.payload?.render_version===2&&job.result?.pending_scene==null;
}
export async function startMscPackage(client:any, items:Awaited<ReturnType<typeof loadMscPackage>>, voiceId:string,
 queue:(c:any,p:any,plan:ExplainerPlan,v:string,order:number)=>Promise<any>) {
  await client.query('SELECT pg_advisory_xact_lock(761283)');
  await client.query('SELECT pg_advisory_xact_lock(761281)');
  const codes=items.map(i=>i.plan.lesson_code);
  const existing=(await client.query("SELECT * FROM media_posts WHERE variants->'explainer'->>'lesson_code'=ANY($1::text[]) ORDER BY id FOR UPDATE",[codes])).rows;
  if(new Set(existing.map((p:any)=>p.variants.explainer.lesson_code)).size!==existing.length)throw new AudioError(409,'Bir xil kodli bir nechta loyiha bor. Dublikatni tekshiring.');
  const jobs=(await client.query("SELECT * FROM media_jobs WHERE kind='explainer' AND payload->>'post_id'=ANY($1::text[]) ORDER BY created_at DESC FOR UPDATE",[existing.map((p:any)=>p.id)])).rows;
  const needed=items.filter(i=>{
    const p=existing.find((p:any)=>p.variants.explainer.lesson_code===i.plan.lesson_code);
    const j=p&&jobs.find((j:any)=>j.payload.post_id===p.id);
    return !p?.variants.explainer_video_id&&(!j||(j.status==='failed'&&checkpointCanResume(j)&&j.payload.voice_id===voiceId));
  });
  // Reserve a full video plus both scene and mixed audio before a paid batch.
  const reserve=needed.reduce((n,i)=>n+50*1024*1024+Math.ceil(i.plan.scenes.reduce((s,c)=>s+c.narration.length,0)/7)*32000+i.cover.length,0);
  const used=Number((await client.query('SELECT COALESCE(SUM(size),0) AS used FROM media_assets')).rows[0].used);
  if(used+reserve>mediaLibraryLimit())throw new AudioError(413,'Paket uchun kutubxonada yetarli joy yo‘q. Audio navbatga qo‘yilmadi.');
  const results=[];
  for(let order=0;order<items.length;order++) {
    const item=items[order];
    let post=existing.find((p:any)=>p.variants.explainer.lesson_code===item.plan.lesson_code);
    const old=post&&jobs.find((j:any)=>j.payload.post_id===post.id);
    if(post?.variants.explainer_video_id){results.push({lesson_code:item.plan.lesson_code,post_id:post.id,status:'completed',video_id:post.variants.explainer_video_id});continue;}
    if(old){
      if(old.status==='failed'&&checkpointCanResume(old)&&old.payload.voice_id===voiceId){
        await client.query("UPDATE media_jobs SET status='queued',error=NULL,started_at=NULL,completed_at=NULL WHERE id=$1",[old.id]);
        results.push({lesson_code:item.plan.lesson_code,post_id:post.id,job_id:old.id,status:'queued'});
      }else results.push({lesson_code:item.plan.lesson_code,post_id:post.id,job_id:old.id,status:old.status,error:old.error});
      continue;
    }
    if(post&&(await client.query("SELECT 1 FROM media_deliveries WHERE post_id=$1 AND status<>'cancelled'",[post.id])).rowCount)throw new AudioError(409,'Nashrga qo‘yilgan darsni o‘zgartirib bo‘lmaydi.');
    const cover=(await client.query("INSERT INTO media_assets(name,mime_type,size,data) VALUES($1,'image/jpeg',$2,$3) RETURNING id",[item.plan.lesson_code+' — muqova.jpg',item.cover.length,item.cover])).rows[0];
    // Existing edited scripts stay intact. The approved topic cover is attached
    // to the introduction only, leaving dense analysis cards unobstructed.
    const plan=explainerPlanSchema.parse(post?.variants.explainer||item.plan);
    if(!plan.scenes.some(s=>s.image_id))plan.scenes[0].image_id=cover.id;
    const variants={...post?.variants,explainer:plan,youtube_cover_id:cover.id,telegram:post?.variants.telegram||item.publication.caption,youtube:post?.variants.youtube||item.publication.description,suggested_at:post?.variants.suggested_at||item.publication.planned_at};
    if(post){post=(await client.query('UPDATE media_posts SET variants=$2,updated_at=now() WHERE id=$1 RETURNING *',[post.id,JSON.stringify(variants)])).rows[0];}
    else {post=(await client.query("INSERT INTO media_posts(title,caption,format,asset_ids,variants,production_notes) VALUES($1,$2,'video',$3,$4,$5) RETURNING *",[plan.title,item.publication.caption,JSON.stringify([cover.id]),JSON.stringify(variants),'Oktabr 2026 MSC paketi. Manba, muqova va caption tayyor. Rejalashtirish alohida; suggested_at nashr navbati emas.'])).rows[0];}
    const job=await queue(client,post,plan,voiceId,order);
    results.push({lesson_code:plan.lesson_code,post_id:post.id,job_id:job.id,status:job.status});
  }
  return {package_id:MSC_PACKAGE,lessons:results};
}
