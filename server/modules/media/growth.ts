import type { Express, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../../db';
import { seal, unseal, requireAdmin, equalSecret } from './security';
import { appBaseUrl } from './providers';
import { automationSchema, keywordMatch, withinWindow } from '../../../shared/media-growth';
const id = z.string().uuid();
const external = z.string().regex(/^\d+$/);
const wrap=(fn:(req:Request,res:Response)=>Promise<any>)=>async(req:Request,res:Response)=>{
  try { await fn(req,res); } catch(e) {
    res.status(e instanceof z.ZodError?400: e instanceof GrowthError? e.status:500)
      .json({error:e instanceof GrowthError?e.message:e instanceof z.ZodError?'Maydonlarni tekshiring.':'Amal bajarilmadi.'});
  }
};
class GrowthError extends Error { constructor(message:string, public status=400, public ambiguous=false){super(message);} }
export function validWebhook(body:Buffer, signature:string, secret:string) {
  if(!secret || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected=createHmac('sha256',secret).update(body).digest();
  return timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex'));
}
async function config(){
  const r=await pool.query('SELECT secrets FROM media_automation_config WHERE id=1');
  return r.rows[0]?unseal<{app_secret:string;verify_token:string}>(r.rows[0].secrets):null;
}
export async function instagramRequest(account:any,path:string,method='GET',body?:unknown){
  if(account.platform!=='instagram'||!account.enabled||!account.verified_at||!account.credentials)
    throw new GrowthError('Instagram hisobini ulang va tekshiring.');
  const {access_token}=unseal<{access_token:string}>(account.credentials);
  let r:globalThis.Response;
  try { r=await fetch(`https://graph.instagram.com/${process.env.INSTAGRAM_API_VERSION||'v23.0'}/${path}`,{
    method, headers:{Authorization:`Bearer ${access_token}`,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),
  }); }catch{throw new GrowthError('Instagram javobi noaniq. Natijani tekshiring.',502,method!=='GET');}
  let data:any;try{data=await r.json();}catch{throw new GrowthError('Instagram javobi olinmadi.',502,method!=='GET');}
  if(!r.ok||data.error)throw new GrowthError(`Instagram ruxsati yoki limiti: ${Number(data.error?.code)||r.status}.`,502,r.status>=500&&method!=='GET');
  return data;
}
async function account(accountId:string){
  const r=await pool.query("SELECT * FROM media_accounts WHERE id=$1 AND platform='instagram'",[id.parse(accountId)]);
  if(!r.rows[0])throw new GrowthError('Instagram hisob topilmadi.',404);return r.rows[0];
}
export type Incoming={key:string;kind:'comment'|'message';external_id:string;sender_id:string;media_id:string;text:string;occurred_at:Date};
export function parseInstagramEvents(entry:any):Incoming[]{
  const out:Incoming[]=[];
  for(const c of entry.changes||[]){const v=c.value;
    if(c.field!=='comments'||!v?.id||!v.from?.id||typeof v.text!=='string')continue;
    out.push({key:`comment:${v.id}`,kind:'comment',external_id:String(v.id),sender_id:String(v.from.id),media_id:String(v.media?.id||''),text:v.text.slice(0,5000),occurred_at:new Date(Number(entry.time)*1000)});
  }
  for(const m of entry.messaging||[]){
    if(m.message?.is_echo||m.message?.is_deleted||!m.message?.mid||!m.sender?.id||!m.message?.text)continue;
    out.push({key:`message:${m.message.mid}`,kind:'message',external_id:String(m.message.mid),sender_id:String(m.sender.id),media_id:'',text:String(m.message.text).slice(0,5000),occurred_at:new Date(Number(m.timestamp))});
  }return out.filter(e=>Number.isFinite(e.occurred_at.getTime()));
}
export function registerGrowthRoutes(app:Express){
  // Public callback is signature-checked before any data is persisted.
  app.get('/api/instagram/webhook',wrap(async(req,res)=>{
    const c=await config();
    if(!c||req.query['hub.mode']!=='subscribe'||!equalSecret(String(req.query['hub.verify_token']||''),c.verify_token)){res.status(403).end();return;}
    res.type('text/plain').send(String(req.query['hub.challenge']||''));
  }));
  app.post('/api/instagram/webhook',wrap(async(req,res)=>{
    const c=await config();
    if(!c||!Buffer.isBuffer(req.rawBody)||!validWebhook(req.rawBody,String(req.headers['x-hub-signature-256']||''),c.app_secret)){res.status(403).end();return;}
    if(req.body.object!=='instagram'){res.status(400).end();return;}
    const client=await pool.connect();
    try{await client.query('BEGIN');
      for(const entry of (req.body.entry||[]).slice(0,100)){
        const a=(await client.query("SELECT id,external_id FROM media_accounts WHERE platform='instagram' AND external_id=$1 AND enabled",[String(entry.id)])).rows[0];
        if(!a)continue;
        for(const event of parseInstagramEvents(entry).slice(0,100)){
          if(event.sender_id===a.external_id)continue;
          await client.query(`INSERT INTO media_interactions(account_id,event_key,kind,external_id,sender_id,media_id,text,occurred_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(account_id,event_key) DO NOTHING`,
            [a.id,event.key,event.kind,event.external_id,event.sender_id,event.media_id,event.text,event.occurred_at]);
        }
      }await client.query('COMMIT');res.sendStatus(200);
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }));
  app.use('/api/media/growth',requireAdmin);
  app.get('/api/media/growth',wrap(async(_req,res)=>{
    const [rules,events,insights,c]=await Promise.all([
      pool.query('SELECT * FROM media_automations ORDER BY created_at DESC'),
      pool.query('SELECT i.*,a.name AS account_name FROM media_interactions i JOIN media_accounts a ON a.id=i.account_id ORDER BY i.created_at DESC LIMIT 100'),
      pool.query(`SELECT d.id,d.external_url,p.title,p.format,p.caption,i.metrics,i.errors,i.collected_at FROM media_deliveries d
        JOIN media_posts p ON p.id=d.post_id JOIN media_accounts a ON a.id=d.account_id LEFT JOIN media_insights i ON i.delivery_id=d.id
        WHERE d.status='published' AND a.platform='instagram' ORDER BY d.published_at DESC LIMIT 100`),config()]);
    res.json({rules:rules.rows,events:events.rows,insights:insights.rows,webhook:{configured:!!c,url:`${appBaseUrl()}/api/instagram/webhook`}});
  }));
  app.put('/api/media/growth/webhook',wrap(async(req,res)=>{
    const input=z.object({app_secret:z.string().min(16).max(300),verify_token:z.string().min(24).max(200)}).parse(req.body);
    await pool.query("INSERT INTO media_automation_config(id,secrets) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET secrets=EXCLUDED.secrets,updated_at=now()",[seal(input)]);
    res.json({configured:true});
  }));
  app.post('/api/media/growth/subscribe',wrap(async(req,res)=>{
    const a=await account(req.body.account_id);if(!await config())throw new GrowthError('Avval webhook sirlarini saqlang.');
    const result=await instagramRequest(a,`${a.external_id}/subscribed_apps`,'POST',{subscribed_fields:'comments,messages'});
    res.json({success:result.success===true});
  }));
  app.post('/api/media/growth/rules',wrap(async(req,res)=>{
    const v=automationSchema.parse(req.body);await account(v.account_id);
    const r=await pool.query(`INSERT INTO media_automations(account_id,title,trigger,keywords,action,response,media_id,enabled)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[v.account_id,v.title,v.trigger,JSON.stringify(v.keywords),v.action,v.response,v.media_id||'',v.enabled]);res.status(201).json(r.rows[0]);
  }));
  app.patch('/api/media/growth/rules/:id',wrap(async(req,res)=>{
    const v=z.object({enabled:z.boolean()}).parse(req.body);
    const r=await pool.query('UPDATE media_automations SET enabled=$2 WHERE id=$1 RETURNING id',[id.parse(req.params.id),v.enabled]);
    if(!r.rowCount)throw new GrowthError('Qoida topilmadi.',404);res.json({ok:true});
  }));
  app.delete('/api/media/growth/rules/:id',wrap(async(req,res)=>{
    await pool.query('DELETE FROM media_automations WHERE id=$1',[id.parse(req.params.id)]);res.json({ok:true});
  }));
  app.post('/api/media/growth/events/:id/action',wrap(async(req,res)=>{
    const input=z.object({action:z.enum(['reply','private_reply','hide','delete']),response:z.string().max(1000).default('')}).parse(req.body);
    if(['reply','private_reply'].includes(input.action)&&!input.response.trim())throw new GrowthError('Javob matni kerak.');
    const e=(await pool.query("UPDATE media_interactions SET status='processing',claimed_at=now(),error=NULL WHERE id=$1 AND status NOT IN ('processing','handled','needs_review') RETURNING *",[id.parse(req.params.id)])).rows[0];
    if(!e)throw new GrowthError('Bu xabar ko‘rib chiqilgan yoki bajarilmoqda.',409);
    await executeInteraction(e,input);res.json({ok:true});
  }));
  app.post('/api/media/growth/insights/sync',wrap(async(req,res)=>{
    const a=await account(req.body.account_id);
    const client=await pool.connect();
    try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(761282)');
      if((await client.query("SELECT 1 FROM media_jobs WHERE kind='instagram_insights' AND status IN ('queued','running')")).rowCount)throw new GrowthError('Statistika olinmoqda. Tugashini kuting.',409);
      const job=await client.query("INSERT INTO media_jobs(kind,payload) VALUES('instagram_insights',$1) RETURNING id",[{account_id:a.id}]);
      await client.query('COMMIT');res.status(202).json({id:job.rows[0].id,status:'queued'});
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }));
}
async function executeInteraction(e:any,rule:{action:string;response:string}){
  try{
    const a=await account(e.account_id);
    if(!withinWindow(e.kind,e.occurred_at))throw new GrowthError('Javob berish muddati tugagan.');
    if(e.kind==='message'&&rule.action!=='reply')throw new GrowthError('Direct uchun bu amal mumkin emas.');
    if(e.kind==='message')await instagramRequest(a,`${a.external_id}/messages`,'POST',{recipient:{id:e.sender_id},message:{text:rule.response}});
    else if(rule.action==='private_reply')await instagramRequest(a,`${a.external_id}/messages`,'POST',{recipient:{comment_id:e.external_id},message:{text:rule.response}});
    else if(rule.action==='reply')await instagramRequest(a,`${external.parse(e.external_id)}/replies`,'POST',{message:rule.response});
    else if(rule.action==='hide')await instagramRequest(a,external.parse(e.external_id),'POST',{hide:true});
    else if(rule.action==='delete')await instagramRequest(a,external.parse(e.external_id),'DELETE');
    await pool.query("UPDATE media_interactions SET status='handled',response=$2,error=NULL WHERE id=$1",[e.id,rule.response||rule.action]);
  }catch(err){await pool.query('UPDATE media_interactions SET status=$2,error=$3 WHERE id=$1',[e.id,err instanceof GrowthError&&err.ambiguous?'needs_review':'failed',err instanceof GrowthError?err.message:'Amal bajarilmadi.']);throw err;}
}
let busy=false;
export async function processInteractions(){
  if(busy)return;busy=true;
  try{
    await pool.query("UPDATE media_interactions SET status='needs_review',error='Jarayon uzilgan. Instagramdagi natijani tekshiring.' WHERE status='processing' AND claimed_at<now()-interval '10 minutes'");
    const e=(await pool.query("UPDATE media_interactions SET status='processing',claimed_at=now() WHERE id=(SELECT id FROM media_interactions WHERE status='received' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *")).rows[0];
    if(!e)return;
    const rules=(await pool.query('SELECT * FROM media_automations WHERE account_id=$1 AND trigger=$2 AND enabled ORDER BY created_at',[e.account_id,e.kind])).rows;
    const rule=rules.find(r=>(!r.media_id||r.media_id===e.media_id)&&keywordMatch(e.text,r.keywords));
    if(!rule){await pool.query("UPDATE media_interactions SET status='manual' WHERE id=$1",[e.id]);return;}
    await executeInteraction(e,rule);
  }catch{console.error('Instagram interaction processing failed.');}finally{busy=false;}
}

let insightsBusy=false;
export async function processInsights(){
  if(insightsBusy)return;insightsBusy=true;let job:any;
  try{
    await pool.query("UPDATE media_jobs SET status='failed',error='Statistika jarayoni uzildi. Qayta so‘rang.' WHERE kind='instagram_insights' AND status='running' AND started_at<now()-interval '10 minutes'");
    job=(await pool.query("UPDATE media_jobs SET status='running',started_at=now() WHERE id=(SELECT id FROM media_jobs WHERE kind='instagram_insights' AND status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *")).rows[0];
    if(!job)return;
    const a=await account(job.payload.account_id);
    const deliveries=(await pool.query("SELECT id,external_id FROM media_deliveries WHERE account_id=$1 AND status='published' AND external_id IS NOT NULL ORDER BY published_at DESC LIMIT 30",[a.id])).rows;
    for(const d of deliveries){
      await pool.query("UPDATE media_jobs SET started_at=now() WHERE id=$1",[job.id]);
      const metrics:Record<string,number>={},errors:Record<string,string>={};
      // Query separately: a metric unavailable for one media type must not discard the rest.
      for(const metric of ['views','reach','likes','comments','saved','shares']){
        try{const r=await instagramRequest(a,`${external.parse(d.external_id)}/insights?metric=${metric}`);const n=r.data?.[0]?.values?.[0]?.value??r.data?.[0]?.total_value?.value;if(typeof n==='number')metrics[metric]=n;else errors[metric]='Ma’lumot yo‘q.';}
        catch(e){errors[metric]=e instanceof GrowthError?e.message:'Olinmadi.';}
      }
      await pool.query('INSERT INTO media_insights(delivery_id,metrics,errors) VALUES($1,$2,$3) ON CONFLICT(delivery_id) DO UPDATE SET metrics=EXCLUDED.metrics,errors=EXCLUDED.errors,collected_at=now()',[d.id,metrics,errors]);
    }

    await pool.query("UPDATE media_jobs SET status='completed',completed_at=now(),result=$2 WHERE id=$1",[job.id,{count:deliveries.length}]);
  }catch{if(job)await pool.query("UPDATE media_jobs SET status='failed',error='Instagram ruxsatlari va ulanishni tekshiring.' WHERE id=$1",[job.id]);}finally{insightsBusy=false;}
}
