import type { Express, Request, Response } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../../db';
import { seal, unseal, requireAdmin, equalSecret } from './security';
import { appBaseUrl } from './providers';
import { syncReelAutomations } from './reel-automations';
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
// Instagram Login can return an app-scoped id and a separate professional user_id.
// Only Meta's authenticated profile response may establish that alias; never trust
// an unknown webhook id or assign it to the only account in the database.
export async function refreshInstagramIdentity(a:any){
  const r=await instagramRequest(a,'me?fields=id,user_id,username');
  const profile=Array.isArray(r.data)?r.data[0]:r;
  const profileId=external.parse(profile?.id),userId=external.parse(profile?.user_id);
  if(![profileId,userId].includes(a.external_id))throw new GrowthError('Kalit boshqa Instagram hisobiga tegishli. Hisob sozlamalarini tekshiring.',409);
  const saved=await pool.query('UPDATE media_accounts SET instagram_user_id=$2 WHERE id=$1 AND credentials=$3 AND external_id=$4 AND enabled AND verified_at IS NOT NULL RETURNING id',
    [a.id,userId,a.credentials,a.external_id]);
  if(!saved.rowCount)throw new GrowthError('Hisob sozlamalari o‘zgardi. Tekshiruvni yangilang.',409);
  return {profile_id:profileId,user_id:userId,username:typeof profile.username==='string'?profile.username:a.name};
}
// Read-only diagnosis: these API comments are never inserted into the webhook
// inbox and never trigger reply rules. Missing permissions remain unknown.
export async function inspectInstagramConnection(a:any,identity:{profile_id:string;user_id:string;username:string}){
  const errors:string[]=[];
  const read=async(path:string,label:string)=>{
    try{return await instagramRequest(a,path);}catch(e){errors.push(`${label}: ${e instanceof GrowthError?e.message:'Tekshiruv bajarilmadi.'}`);return null;}
  };
  const [permissions,media]=await Promise.all([
    read('me/permissions','Token ruxsatlari'),
    read(`${identity.user_id}/media?fields=id,caption,permalink,timestamp&limit=5`,'So‘nggi postlar'),
  ]);
  const grants=Array.isArray(permissions?.data)?permissions.data.filter((v:any)=>typeof v.permission==='string'&&typeof v.status==='string').map((v:any)=>({permission:v.permission,status:v.status})):[];
  const posts=await Promise.all((Array.isArray(media?.data)?media.data:[]).slice(0,5).filter((v:any)=>typeof v.id==='string'&&/^\d+$/.test(v.id)).map(async(v:any)=>{
    let comments:any=null,error='';
    try{comments=await instagramRequest(a,`${v.id}/comments?fields=id,text,timestamp,from&limit=10`);}
    catch(e){
      // The two API paths expose different author fields. Only a read-only
      // field-selection error permits this bounded fallback.
      if(e instanceof GrowthError&&e.message==='Instagram ruxsati yoki limiti: 100.'){
        try{comments=await instagramRequest(a,`${v.id}/comments?fields=id,text,timestamp,username&limit=10`);}
        catch(next){error=next instanceof GrowthError?next.message:'Izohlar olinmadi.';}
      }else error=e instanceof GrowthError?e.message:'Izohlar olinmadi.';
    }
    const rows=(Array.isArray(comments?.data)?comments.data:[]).filter((c:any)=>typeof c.id==='string'&&typeof c.text==='string').map((c:any)=>{
      const senderId=String(c.from?.id||''),username=String(c.from?.username||c.username||'');
      return {id:c.id,text:c.text.slice(0,5000),timestamp:typeof c.timestamp==='string'?c.timestamp:'',username,
        own:senderId||username?[identity.profile_id,identity.user_id].includes(senderId)||username.toLowerCase()===identity.username.toLowerCase():null};
    });
    return {id:v.id,title:typeof v.caption==='string'?v.caption.split('\n')[0].slice(0,100):v.id,comments:rows,error};
  }));
  return {permissions:{known:grants.length>0,grants},posts,errors};
}
function webhookSummary(body:any){
  const entries=Array.isArray(body?.entry)?body.entry.slice(0,100):[];
  return {received_at:new Date().toISOString(),entry_ids:entries.map((e:any)=>String(e?.id||'')).filter((v:string)=>/^\d{1,40}$/.test(v)),
    fields:Array.from(new Set(entries.flatMap((e:any)=>(Array.isArray(e?.changes)?e.changes:[]).map((c:any)=>String(c?.field||'').slice(0,60))))),
    entries:entries.length,matched:0,unmatched:0,parsed:0,stored:0,duplicates:0,self:0};
}
export type Incoming={key:string;kind:'comment'|'message';external_id:string;sender_id:string;media_id:string;text:string;occurred_at:Date};
const commentTime=(value:unknown)=>{const n=Number(value);return new Date(n>=1e12?n:n*1000);};
// Store a button's hidden request code in the existing durable message inbox.
// The code is still scoped to the webhook account and actual messaging sender.
function followReplyText(message:any):string{
  const payload=message.quick_reply?.payload;
  if(typeof payload==='string'&&payload.startsWith('FOLLOW_CHECK:')){
    const match=/^FOLLOW_CHECK:([A-F0-9]{10})$/.exec(payload);
    return match?`OBUNA ${match[1]}`:'INVALID_FOLLOW_CHECK';
  }
  return String(message.text).slice(0,5000);
}
export function parseInstagramEvents(entry:any):Incoming[]{
  const out:Incoming[]=[];
  for(const c of Array.isArray(entry.changes)?entry.changes:[]){const v=c?.value;
    if(c?.field!=='comments'||!v?.id||!v.from?.id||typeof v.text!=='string')continue;
    out.push({key:`comment:${v.id}`,kind:'comment',external_id:String(v.id),sender_id:String(v.from.id),media_id:String(v.media?.id||''),text:v.text.slice(0,5000),occurred_at:commentTime(entry.time)});
  }
  for(const m of Array.isArray(entry.messaging)?entry.messaging:[]){
    if(m?.message?.is_echo||m?.message?.is_deleted||!m?.message?.mid||!m?.sender?.id||!m?.message?.text)continue;
    out.push({key:`message:${m.message.mid}`,kind:'message',external_id:String(m.message.mid),sender_id:String(m.sender.id),media_id:'',text:followReplyText(m.message),occurred_at:new Date(Number(m.timestamp))});
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
    if(req.body?.object!=='instagram'||!Array.isArray(req.body.entry)){res.status(400).end();return;}
    const receipt=webhookSummary(req.body);
    const client=await pool.connect();
    try{await client.query('BEGIN');
      for(const entry of req.body.entry.slice(0,100)){
        const matches=await client.query("SELECT id,external_id,instagram_user_id FROM media_accounts WHERE platform='instagram' AND (external_id=$1 OR instagram_user_id=$1) AND enabled",[String(entry?.id||'')]);
        if(matches.rows.length!==1){receipt.unmatched++;continue;}
        const a=matches.rows[0];receipt.matched++;
        for(const event of parseInstagramEvents(entry).slice(0,100)){
          receipt.parsed++;
          if([a.external_id,a.instagram_user_id].includes(event.sender_id)){receipt.self++;continue;}
          const inserted=await client.query(`INSERT INTO media_interactions(account_id,event_key,kind,external_id,sender_id,media_id,text,occurred_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(account_id,event_key) DO NOTHING`,
            [a.id,event.key,event.kind,event.external_id,event.sender_id,event.media_id,event.text,event.occurred_at]);
          if(inserted.rowCount)receipt.stored++;else receipt.duplicates++;
        }
      }
      await client.query('UPDATE media_automation_config SET last_receipt=$1 WHERE id=1',[JSON.stringify(receipt)]);
      await client.query('COMMIT');
      console.info(`[instagram-webhook] entries=${receipt.entries} matched=${receipt.matched} unmatched=${receipt.unmatched} parsed=${receipt.parsed} stored=${receipt.stored} duplicates=${receipt.duplicates} self=${receipt.self}`);
      res.sendStatus(200);
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }));
  app.use('/api/media/growth',requireAdmin);
  app.get('/api/media/growth',wrap(async(_req,res)=>{
    const [rules,events,insights,c,receipt]=await Promise.all([
      pool.query('SELECT * FROM media_automations ORDER BY created_at DESC'),
      pool.query('SELECT i.*,a.name AS account_name FROM media_interactions i JOIN media_accounts a ON a.id=i.account_id ORDER BY i.created_at DESC LIMIT 100'),
      pool.query(`SELECT d.id,d.external_url,p.title,p.format,p.caption,i.metrics,i.errors,i.collected_at FROM media_deliveries d
        JOIN media_posts p ON p.id=d.post_id JOIN media_accounts a ON a.id=d.account_id LEFT JOIN media_insights i ON i.delivery_id=d.id
        WHERE d.status='published' AND a.platform='instagram' ORDER BY d.published_at DESC LIMIT 100`),config(),
      pool.query('SELECT last_receipt FROM media_automation_config WHERE id=1')]);
    res.json({rules:rules.rows,events:events.rows,insights:insights.rows,webhook:{configured:!!c,url:`${appBaseUrl()}/api/instagram/webhook`,last_receipt:receipt.rows[0]?.last_receipt||null}});
  }));
  app.put('/api/media/growth/webhook',wrap(async(req,res)=>{
    const input=z.object({app_secret:z.string().min(16).max(300),verify_token:z.string().min(24).max(200)}).parse(req.body);
    await pool.query("INSERT INTO media_automation_config(id,secrets) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET secrets=EXCLUDED.secrets,updated_at=now()",[seal(input)]);
    res.json({configured:true});
  }));
  app.post('/api/media/growth/subscribe',wrap(async(req,res)=>{
    const a=await account(req.body.account_id);if(!await config())throw new GrowthError('Avval webhook sirlarini saqlang.');
    const identity=await refreshInstagramIdentity(a);
    const result=await instagramRequest(a,`${identity.user_id}/subscribed_apps`,'POST',{subscribed_fields:'comments,messages'});
    if(result.success!==true)throw new GrowthError('Meta hisob obunasini tasdiqlamadi.',502);
    res.json({success:true});
  }));
  app.post('/api/media/growth/connection-check',wrap(async(req,res)=>{
    const a=await account(req.body.account_id),identity=await refreshInstagramIdentity(a);
    const r=await instagramRequest(a,`${identity.user_id}/subscribed_apps`);
    const apps=(Array.isArray(r.data)?r.data:[]).map((v:any)=>({id:String(v.id||v.application?.id||''),name:String(v.name||v.application?.name||''),
      fields:Array.isArray(v.subscribed_fields)?v.subscribed_fields.filter((f:any)=>typeof f==='string'):[]}));
    const inspection=req.body.inspect===true?await inspectInstagramConnection(a,identity):null;
    res.json({identity,apps,inspection,checked_at:new Date().toISOString()});
  }));
  app.post('/api/media/growth/rules',wrap(async(req,res)=>{
    const v=automationSchema.parse(req.body);await account(v.account_id);
    const r=await pool.query(`INSERT INTO media_automations(account_id,title,trigger,keywords,action,response,media_id,enabled,require_follow)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[v.account_id,v.title,v.trigger,JSON.stringify(v.keywords),v.action,v.response,v.media_id||'',v.enabled,v.require_follow]);res.status(201).json(r.rows[0]);
  }));
  app.put('/api/media/growth/rules/:id',wrap(async(req,res)=>{
    const v=automationSchema.parse(req.body),ruleId=id.parse(req.params.id),client=await pool.connect();
    try{await client.query('BEGIN');
      const r=await client.query(`UPDATE media_automations SET title=$3,trigger=$4,keywords=$5,action=$6,response=$7,media_id=$8,enabled=$9,require_follow=$10
        WHERE id=$1 AND account_id=$2 RETURNING *`,[ruleId,v.account_id,v.title,v.trigger,JSON.stringify(v.keywords),v.action,v.response,v.media_id||'',v.enabled,v.require_follow]);
      if(!r.rowCount)throw new GrowthError('Qoida shu hisobda topilmadi.',404);
      // An old request must never pick up a different lesson after an edit.
      await client.query("UPDATE media_follow_requests SET status='cancelled' WHERE rule_id=$1 AND status IN ('sending_prompt','awaiting_follow','checking')",[ruleId]);
      await client.query('COMMIT');res.json(r.rows[0]);
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }));
  app.patch('/api/media/growth/rules/:id',wrap(async(req,res)=>{
    const v=z.object({enabled:z.boolean()}).parse(req.body);
    const r=await pool.query('UPDATE media_automations SET enabled=$2 WHERE id=$1 RETURNING id',[id.parse(req.params.id),v.enabled]);
    if(r.rowCount&&!v.enabled)await pool.query("UPDATE media_follow_requests SET status='cancelled' WHERE rule_id=$1 AND status IN ('sending_prompt','awaiting_follow','checking')",[req.params.id]);
    if(!r.rowCount)throw new GrowthError('Qoida topilmadi.',404);res.json({ok:true});
  }));
  app.delete('/api/media/growth/rules/:id',wrap(async(req,res)=>{
    await pool.query('DELETE FROM media_automations WHERE id=$1',[id.parse(req.params.id)]);res.json({ok:true});
  }));
  app.post('/api/media/growth/events/:id/action',wrap(async(req,res)=>{
    const input=z.object({action:z.enum(['reply','private_reply','hide','delete']),response:z.string().max(1000).default('')}).parse(req.body);
    if(['reply','private_reply'].includes(input.action)&&!input.response.trim())throw new GrowthError('Javob matni kerak.');
    const e=(await pool.query("UPDATE media_interactions SET status='processing',claimed_at=now(),error=NULL WHERE id=$1 AND status NOT IN ('processing','handled','needs_review','awaiting_follow','follow_check_failed') RETURNING *",[id.parse(req.params.id)])).rows[0];
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
type ReplyRule={id?:string;action:string;response:string;require_follow?:boolean};
type FollowResult={state:'following'|'not_following'|'unknown';error?:string};
export async function readInstagramFollow(a:any,senderId:string):Promise<FollowResult>{
  try{
    const r=await instagramRequest(a,`${external.parse(senderId)}?fields=is_user_follow_business`);
    // Only Meta's explicit boolean true unlocks material. Missing fields,
    // strings and API errors are never treated as a successful follow check.
    if(r.is_user_follow_business===true)return {state:'following'};
    if(r.is_user_follow_business===false)return {state:'not_following'};
    return {state:'unknown',error:'Meta obuna holatini tasdiqlamadi.'};
  }catch(e){return {state:'unknown',error:e instanceof GrowthError?e.message:'Obuna holati tekshirilmadi.'};}
}
const followPrompt=()=>`📚 Materialni olish uchun Instagram profilimizga obuna bo‘ling.\n\nSo‘ng pastdagi “✅ Obuna bo‘ldim” tugmasini bosing. Obunangiz tasdiqlangach, havola yuboriladi.\n\nTugma ko‘rinmasa, shu Directga OBUNA deb yozing.`;
const followButton=(code:string,title='✅ Obuna bo‘ldim')=>({content_type:'text',title:Array.from(title).slice(0,20).join(''),payload:`FOLLOW_CHECK:${code}`});
const followMessage=(text:string,code:string)=>({text,quick_replies:[followButton(code)]});
async function interactionResult(eventId:string,status:string,response:string,error:string|null=null){
  await pool.query('UPDATE media_interactions SET status=$2,response=$3,error=$4 WHERE id=$1',[eventId,status,response,error]);
}
async function beginFollowRequest(a:any,e:any,rule:ReplyRule,check?:FollowResult){
  if(!rule.id)throw new GrowthError('Obuna qoidasi topilmadi.');
  const p=(await pool.query(`INSERT INTO media_follow_requests(account_id,rule_id,source_event_id,recipient_id,code,response,claimed_at)
    VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(source_event_id) DO NOTHING RETURNING *`,
    [a.id,rule.id,e.id,e.kind==='message'?external.parse(e.sender_id):null,randomBytes(5).toString('hex').toUpperCase(),rule.response])).rows[0];
  if(!p)throw new GrowthError('Bu material so‘rovi avval bajarilgan. Natijani tekshiring.',409,true);
  let sent=false;
  try{
    const text=followPrompt();
    const result=await instagramRequest(a,`${a.external_id}/messages`,'POST',{recipient:e.kind==='comment'?{comment_id:external.parse(e.external_id)}:{id:e.sender_id},message:followMessage(text,p.code)});sent=true;
    // A comment author ID need not be their messaging ID. Bind continuation
    // only to the recipient Meta returned for the accepted private reply.
    const recipient=e.kind==='message'?e.sender_id:result.recipient_id;
    if(typeof recipient!=='string'||!/^\d+$/.test(recipient))throw new GrowthError('Direct yuborildi, lekin Meta qabul qiluvchi ID sini tasdiqlamadi. Havola berilmadi.',502,true);
    const saved=await pool.query("UPDATE media_follow_requests SET recipient_id=$2,status='awaiting_follow' WHERE id=$1 AND status='sending_prompt' RETURNING id",[p.id,recipient]);
    if(!saved.rowCount)throw new GrowthError('Qoida o‘zgardi. Eski material so‘rovi bekor qilindi.',409,true);
    await interactionResult(e.id,check?.state==='unknown'?'follow_check_failed':'awaiting_follow',text,check?.error||null);
  }catch(err){
    const ambiguous=sent||err instanceof GrowthError&&err.ambiguous;
    await pool.query("UPDATE media_follow_requests SET status=$2 WHERE id=$1 AND status='sending_prompt'",[p.id,ambiguous?'needs_review':'failed']);
    if(ambiguous&&!(err instanceof GrowthError&&err.ambiguous))throw new GrowthError('Direct natijasi noaniq. Havola yuborilmadi; Instagramdagi natijani tekshiring.',502,true);
    throw err;
  }
}
async function continueFollowRequest(e:any):Promise<boolean>{
  if(e.kind!=='message')return false;
  const match=/^OBUNA(?:\s+([A-F0-9]{10}))?[.!]?$/i.exec(e.text.trim())
    ||/^(?:✅\s*)?OBUNA BO[‘’'ʼ`]?LDIM[.!]?$/i.exec(e.text.trim());if(!match)return false;
  const candidates=(await pool.query(`SELECT p.*,r.title AS rule_title FROM media_follow_requests p JOIN media_automations r ON r.id=p.rule_id
    WHERE p.account_id=$1 AND p.recipient_id=$2 AND p.status='awaiting_follow' AND p.expires_at>now()
      AND r.enabled AND r.require_follow AND ($3::text IS NULL OR p.code=$3) ORDER BY p.created_at DESC LIMIT 13`,[e.account_id,e.sender_id,match[1]?.toUpperCase()||null])).rows;
  if(!candidates.length){await interactionResult(e.id,'manual','','Faol material so‘rovi topilmadi. Postga kalit so‘zni qayta yozing.');return true;}
  const a=await account(e.account_id);
  if(!withinWindow('message',e.occurred_at)){await interactionResult(e.id,'failed','','Javob berish muddati tugagan.');return true;}
  if(candidates.length>1){
    const text='Bir nechta material so‘rovingiz bor. Kerakli material tugmasini bosing yoki uning oldingi xabaridagi “✅ Obuna bo‘ldim” tugmasidan foydalaning.';
    await instagramRequest(a,`${a.external_id}/messages`,'POST',{recipient:{id:e.sender_id},message:{text,quick_replies:candidates.map((p:any)=>followButton(p.code,p.rule_title))}});
    await interactionResult(e.id,'awaiting_follow',text);return true;
  }
  const p=(await pool.query("UPDATE media_follow_requests SET status='checking',claimed_at=now() WHERE id=$1 AND status='awaiting_follow' AND expires_at>now() RETURNING *",[candidates[0].id])).rows[0];
  if(!p){await interactionResult(e.id,'manual','','Material so‘rovi hozir tekshirilmoqda.');return true;}
  let sent=false;
  try{
    const check=await readInstagramFollow(a,e.sender_id);
    const active=(await pool.query(`SELECT 1 FROM media_follow_requests p JOIN media_automations r ON r.id=p.rule_id
      WHERE p.id=$1 AND p.status='checking' AND p.expires_at>now() AND r.enabled AND r.require_follow`,[p.id])).rowCount;
    if(!active){await interactionResult(e.id,'manual','','Qoida o‘zgardi yoki so‘rov muddati tugadi. Postga kalit so‘zni qayta yozing.');return true;}
    const text=check.state==='following'?p.response:check.state==='not_following'
      ?'Obunangiz hali tasdiqlanmadi. Instagram profilimizga obuna bo‘lib, pastdagi tugmani yana bosing. Tugma ko‘rinmasa, OBUNA deb yozing.'
      :'Obunangizni hozir tekshira olmadik. Birozdan keyin pastdagi tugmani yana bosing. Tugma ko‘rinmasa, OBUNA deb yozing.';
    await instagramRequest(a,`${a.external_id}/messages`,'POST',{recipient:{id:e.sender_id},message:check.state==='following'?{text}:followMessage(text,p.code)});sent=true;
    const status=check.state==='following'?'handled':check.state==='unknown'?'follow_check_failed':'awaiting_follow';
    await pool.query("UPDATE media_follow_requests SET status=$2 WHERE id=$1 AND status='checking'",[p.id,check.state==='following'?'delivered':'awaiting_follow']);
    await interactionResult(p.source_event_id,status,text,check.error||null);
    await interactionResult(e.id,status,text,check.error||null);
  }catch(err){
    const ambiguous=sent||err instanceof GrowthError&&err.ambiguous;
    await pool.query("UPDATE media_follow_requests SET status=$2 WHERE id=$1 AND status='checking'",[p.id,ambiguous?'needs_review':'failed']);
    await interactionResult(e.id,ambiguous?'needs_review':'failed','',err instanceof GrowthError?err.message:'Obuna jarayoni bajarilmadi.');
    await interactionResult(p.source_event_id,ambiguous?'needs_review':'failed','',err instanceof GrowthError?err.message:'Obuna jarayoni bajarilmadi.');
  }
  return true;
}
async function executeInteraction(e:any,rule:ReplyRule){
  try{
    const a=await account(e.account_id);
    if(!withinWindow(e.kind,e.occurred_at))throw new GrowthError('Javob berish muddati tugagan.');
    if(e.kind==='message'&&rule.action!=='reply')throw new GrowthError('Direct uchun bu amal mumkin emas.');
    if(rule.require_follow){
      if(e.kind==='comment'){await beginFollowRequest(a,e,rule);return;}
      const check=await readInstagramFollow(a,e.sender_id);
      if(check.state!=='following'){await beginFollowRequest(a,e,rule,check);return;}
    }
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
  if(busy)return;busy=true;let currentEvent:any;
  try{
    // A scoped Reels rule must exist before an incoming comment can fall back
    // to a global keyword rule. Keep the event queued if binding fails.
    await syncReelAutomations();
    await pool.query("UPDATE media_interactions SET status='needs_review',error='Jarayon uzilgan. Instagramdagi natijani tekshiring.' WHERE status='processing' AND claimed_at<now()-interval '10 minutes'");
    await pool.query("UPDATE media_follow_requests SET status='needs_review' WHERE status IN ('sending_prompt','checking') AND claimed_at<now()-interval '10 minutes'");
    await pool.query("UPDATE media_follow_requests SET status='expired' WHERE status='awaiting_follow' AND expires_at<=now()");
    const e=(await pool.query("UPDATE media_interactions SET status='processing',claimed_at=now() WHERE id=(SELECT id FROM media_interactions WHERE status='received' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *")).rows[0];
    if(!e)return;
    currentEvent=e;
    if(await continueFollowRequest(e))return;
    const rules=(await pool.query("SELECT * FROM media_automations WHERE account_id=$1 AND trigger=$2 AND enabled ORDER BY (media_id<>'') DESC,created_at",[e.account_id,e.kind])).rows;
    const rule=rules.find(r=>(!r.media_id||r.media_id===e.media_id)&&keywordMatch(e.text,r.keywords));
    if(!rule){await pool.query("UPDATE media_interactions SET status='manual' WHERE id=$1",[e.id]);return;}
    await executeInteraction(e,rule);
  }catch(err){
    if(currentEvent)await pool.query("UPDATE media_interactions SET status=$2,error=$3 WHERE id=$1 AND status='processing'",[currentEvent.id,err instanceof GrowthError&&err.ambiguous?'needs_review':'failed',err instanceof GrowthError?err.message:'Amal bajarilmadi.']);
    console.error('Instagram interaction processing failed.');
  }finally{busy=false;}
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
