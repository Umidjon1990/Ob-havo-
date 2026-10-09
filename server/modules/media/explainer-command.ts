import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {pool} from '../../db';
import {audioCatalog,AudioError} from './audio';
import {loadMscPackage,chooseMscVoice,startMscPackage} from './explainer-package';
import {queueExplainer} from './explainer';
import {queueMscPublication} from './explainer-publication';
export const commandSchema=z.object({command_id:z.literal('MSC-OCTOBER-2026-PREPARE-SCHEDULE-V1'),operation:z.literal('prepare_and_schedule'),approved:z.literal(true),authorized_at:z.literal('2026-10-09'),source:z.literal('User explicitly requested preparation and Telegram/YouTube scheduling through server code')});
export async function executeMscCommand(c:any, command:z.infer<typeof commandSchema>, prepare:()=>Promise<{items:Awaited<ReturnType<typeof loadMscPackage>>;voice:string}>, queue:typeof queueExplainer, publish:typeof queueMscPublication) {
  const previous=(await c.query("SELECT id,status,error FROM media_jobs WHERE kind='msc_command' AND payload->>'command_id'=$1",[command.command_id])).rows[0];
  const quotaBlocked=previous?.status==='failed'&&previous.error==='Paket uchun kutubxonada yetarli joy yo‘q. Audio navbatga qo‘yilmadi.';
  if(previous&&!quotaBlocked)return {duplicate:true};
  let job=previous;
  if(quotaBlocked)await c.query("UPDATE media_jobs SET status='running',error=NULL,completed_at=NULL WHERE id=$1",[previous.id]);
  else job=(await c.query("INSERT INTO media_jobs(kind,status,payload) VALUES('msc_command','running',$1) RETURNING id",[JSON.stringify(command)])).rows[0];
  const {items,voice}=await prepare();
  const result=await startMscPackage(c,items,voice,queue);
  const publicationId=await publish(c,result.lessons.map(l=>l.post_id));
  await c.query("UPDATE media_jobs SET status='completed',completed_at=now(),result=$2 WHERE id=$1",[job.id,JSON.stringify({post_ids:result.lessons.map(l=>l.post_id),publication_job_id:publicationId})]);
  return {duplicate:false,count:result.lessons.length};
}
// An owner-authorized command is shipped with this deployment. The database
// receipt and job inserts commit together. No browser cookies or tokens enter
// this path; provider credentials remain inside the existing application.
export async function processMscCommand() {
  let command:z.infer<typeof commandSchema>;
  try{command=commandSchema.parse(JSON.parse(await readFile(join(process.cwd(),'docs/examples/msc-october-2026-command.json'),'utf8')));}catch{return;}
  const c=await pool.connect();let locked=false;
  try{
    locked=Boolean((await c.query('SELECT pg_try_advisory_lock(761285) AS locked')).rows[0].locked);if(!locked)return;
    await c.query('BEGIN');
    const result=await executeMscCommand(c,command,async()=>{const items=await loadMscPackage();const {voices}=await audioCatalog();return {items,voice:chooseMscVoice(voices)};},queueExplainer,queueMscPublication);
    await c.query('COMMIT');if(!result.duplicate)console.info('MSC command accepted:',result.count,'lessons queued; publication waits for final videos.');
  }catch(e){
    await c.query('ROLLBACK').catch(()=>{});
    const message=e instanceof AudioError?e.message:'MSC buyrug‘i navbatga qo‘yilmadi. Paket va ulanishni tekshiring.';
    const existing=await c.query("UPDATE media_jobs SET status='failed',error=$2,completed_at=now() WHERE kind='msc_command' AND payload->>'command_id'=$1",[command.command_id,message]).catch(()=>null);
    if(!existing?.rowCount)await c.query("INSERT INTO media_jobs(kind,status,payload,error,completed_at) VALUES('msc_command','failed',$1,$2,now())",[JSON.stringify(command),message]).catch(()=>{});
    console.info('MSC command blocked:',message);
  }finally{if(locked)await c.query('SELECT pg_advisory_unlock(761285)').catch(()=>{});c.release();}
}
