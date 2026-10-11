import express, { type Express, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { pool } from "../../db";
import { studioCommandSchema, studioJobSchema, studioProjectSchema, waterStoryTemplate, type StudioJob, type StudioProject, type StudioProjectInput } from "../../../shared/ai-studio";
import { requireAdmin, assetSignature } from "./security";
import { appBaseUrl } from "./providers";
import { mediaLibraryLimit } from "./storage-quota";
import { audioInput, generateAudio, AudioError } from "./audio";
import { StudioError, leonardoBody, createLeonardoGeneration, getLeonardoGeneration, downloadLeonardoOutput, type StudioImage } from "./studio-leonardo";
import { renderStudio, validateRender } from "./studio-render";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
type Sql = Pool | PoolClient;
const uuid = z.string().uuid();
const columns = "name,brief,script,script_locked,style_bible,format,reference_asset_ids,sample_asset_id,audio_asset_id,music_asset_id,shots";
const jobColumns = "id,project_id,kind,status,payload,generation_id,cost,result,error,created_at,completed_at";
export function studioReadiness() {
  return { version: 1, leonardo: !!process.env.LEONARDO_API_KEY?.trim(), elevenlabs: !!process.env.ELEVENLABS_API_KEY?.trim(), openai: !!(process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY), command_bridge: true, video_model: "kling-2.6", image_model: "lucid-origin" };
}
export function projectAssetIds(p: StudioProjectInput) {
  return Array.from(new Set([...p.reference_asset_ids, p.sample_asset_id, p.audio_asset_id, p.music_asset_id, ...p.shots.flatMap(s => [s.image_asset_id,s.video_asset_id])].filter(Boolean) as string[]));
}
async function checkProjectAssets(sql: Sql, p: StudioProjectInput) {
  const ids = projectAssetIds(p);
  if (!ids.length) return;
  const assets = (await sql.query("SELECT id,mime_type FROM media_assets WHERE id=ANY($1::uuid[])",[ids])).rows;
  if (assets.length !== ids.length) throw new StudioError(400,"Loyihadagi media fayl topilmadi.");
  const mime = (id: string | null) => assets.find(a => a.id === id)?.mime_type;
  if (p.reference_asset_ids.some(id => !["image/jpeg","image/png"].includes(mime(id)))) throw new StudioError(400,"Reference uchun JPG yoki PNG tanlang.");
  if (p.sample_asset_id && mime(p.sample_asset_id) !== "video/mp4") throw new StudioError(400,"Namuna uchun MP4 tanlang.");
  for (const id of [p.audio_asset_id,p.music_asset_id]) if (id && mime(id) !== "audio/mpeg") throw new StudioError(400,"Ovoz va musiqa uchun MP3 tanlang.");
  for (const s of p.shots) {
    if (s.image_asset_id && !["image/jpeg","image/png"].includes(mime(s.image_asset_id))) throw new StudioError(400,"Kadr rasmi JPG yoki PNG bo‘lsin.");
    if (s.video_asset_id && mime(s.video_asset_id) !== "video/mp4") throw new StudioError(400,"Kadr videosi MP4 bo‘lsin.");
  }
}
async function projectById(sql: Sql, id: string, lock = false): Promise<StudioProject> {
  const p = (await sql.query(`SELECT * FROM studio_projects WHERE id=$1${lock ? " FOR UPDATE" : ""}`,[uuid.parse(id)])).rows[0];
  if (!p) throw new StudioError(404,"Loyiha topilmadi.");
  return p;
}
export async function createStudioProject(sql: Sql, input: unknown) {
  const p = studioProjectSchema.parse(input);
  await checkProjectAssets(sql,p);
  return (await sql.query(`INSERT INTO studio_projects(${columns}) VALUES(${Array.from({length:11},(_,i)=>`$${i+1}`).join(",")}) RETURNING *`,projectValues(p))).rows[0] as StudioProject;
}
function projectValues(p: StudioProjectInput) { return [p.name,p.brief,p.script,p.script_locked,p.style_bible,p.format,JSON.stringify(p.reference_asset_ids),p.sample_asset_id,p.audio_asset_id,p.music_asset_id,JSON.stringify(p.shots)]; }
export function checkScriptLock(previous: StudioProject, next: StudioProjectInput, unlock: boolean) {
  if (previous.script_locked && (next.script !== previous.script || !next.script_locked) && !unlock) throw new StudioError(409,"Ssenariy qulflangan. O‘zgartirish uchun qulfni ochish alohida tasdiqlanishi kerak.");
}
export async function updateStudioProject(sql: Sql, id: string, input: unknown) {
  const b = z.object({project:studioProjectSchema,version:z.number().int().positive(),unlock_script:z.boolean().default(false)}).strict().parse(input);
  const old = await projectById(sql,id,true);
  if (old.version !== b.version) throw new StudioError(409,"Loyiha yangilangan. Avval so‘nggi nusxasini yuklang.");
  checkScriptLock(old,b.project,b.unlock_script);
  await checkProjectAssets(sql,b.project);
  const values = projectValues(b.project);
  return (await sql.query(`UPDATE studio_projects SET ${columns.split(",").map((key,i)=>`${key}=$${i+1}`).join(",")},version=version+1,updated_at=now() WHERE id=$12 RETURNING *`,[...values,id])).rows[0] as StudioProject;
}
async function loadProjectAssets(p: StudioProjectInput, extra: string[] = []) {
  const ids = Array.from(new Set([...projectAssetIds(p),...extra]));
  const rows = ids.length ? (await pool.query("SELECT id,mime_type,data FROM media_assets WHERE id=ANY($1::uuid[])",[ids])).rows : [];
  return new Map<string, StudioImage>(rows.map(a => [a.id,{mime_type:a.mime_type,data:a.data}]));
}
export async function queueStudioJob(sql: Sql, value: unknown): Promise<StudioJob> {
  const input = studioJobSchema.parse(value);
  const existing = (await sql.query(`SELECT ${jobColumns} FROM studio_jobs WHERE idempotency_key=$1`,[input.idempotency_key])).rows[0];
  if (existing) {
    if (JSON.stringify(studioJobSchema.parse(existing.payload.request)) !== JSON.stringify(input)) throw new StudioError(409,"Bu buyruq ID si boshqa vazifa uchun ishlatilgan.");
    return existing;
  }
  const project = await projectById(sql,input.project_id);
  const ready = studioReadiness();
  if ((input.kind === "image" || input.kind === "video") && !ready.leonardo) throw new StudioError(503,"Leonardo API kaliti hali sozlanmagan. Loyiha qoralama sifatida saqlanadi.");
  if (input.kind === "audio" && !ready.elevenlabs) throw new StudioError(503,"ElevenLabs API kaliti sozlanmagan.");
  if (input.kind === "plan" && !ready.openai) throw new StudioError(503,"OpenAI API kaliti sozlanmagan.");
  if (input.kind === "audio") audioInput.parse({ name:project.name,text:project.script,...input });
  if (input.kind === "image" || input.kind === "video" || input.kind === "render") {
    const extra = input.kind === "image" ? [input.content_reference_asset_id,input.style_reference_asset_id].filter(Boolean) as string[] : [];
    const assets = await loadProjectAssets(project,extra);
    if (input.kind === "render") validateRender(project,assets); else leonardoBody(input,project,assets);
  }
  const active = Number((await sql.query("SELECT count(*) AS count FROM studio_jobs WHERE status IN ('queued','running','provider_pending')")).rows[0].count);
  if (active >= 50) throw new StudioError(429,"Studio navbati to‘la. Mavjud vazifalar tugashini kuting.");
  const used = Number((await sql.query("SELECT COALESCE(SUM(size),0) AS used FROM media_assets")).rows[0].used);
  const reserve = (input.kind === "render" ? 150 : input.kind === "image" ? 50 * input.quantity : 50) * 1024 * 1024;
  if (used + reserve > mediaLibraryLimit()) throw new StudioError(413,"Studio natijalari uchun kutubxonada yetarli joy yo‘q.");
  const payload = { request:input, project, paid_authorized: "paid_authorized" in input && input.paid_authorized };
  const row = (await sql.query(`INSERT INTO studio_jobs(project_id,kind,idempotency_key,payload) VALUES($1,$2,$3,$4) ON CONFLICT(idempotency_key) DO NOTHING RETURNING ${jobColumns}`,[project.id,input.kind,input.idempotency_key,JSON.stringify(payload)])).rows[0];
  return row || queueStudioJob(sql,input);
}
async function saveOutputs(job: any, outputs: {name:string;mime_type:string;data:Buffer}[], detail: any = {}) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(761281)");
    const found = (await c.query("SELECT status,claim_id FROM studio_jobs WHERE id=$1 FOR UPDATE",[job.id])).rows[0];
    if (found?.status !== "running" || found.claim_id !== job.claim_id) throw new StudioError(409,"Vazifa egaligi o‘zgardi.");
    const used = Number((await c.query("SELECT COALESCE(SUM(size),0) AS used FROM media_assets")).rows[0].used);
    if (used + outputs.reduce((n,a)=>n+a.data.length,0) > mediaLibraryLimit()) throw new StudioError(413,"Natijalar yaratildi, ammo saqlash joyi yetmaydi. Generatsiya ID si saqlangan.");
    const assets:any[] = [];
    for (const a of outputs) assets.push((await c.query("INSERT INTO media_assets(name,mime_type,size,data) VALUES($1,$2,$3,$4) RETURNING id,name,mime_type,size,created_at",[a.name,a.mime_type,a.data.length,a.data])).rows[0]);
    const p = await projectById(c,job.project_id,true);
    const shotId = job.payload.request.shot_id;
    const shot = p.shots.find(s=>s.id===shotId), snapshot = job.payload.project.shots.find((s:any)=>s.id===shotId);
    let attached = false;
    if (shot && snapshot && assets[0]) {
      const unchanged = job.kind === "image" ? shot.prompt === snapshot.prompt && shot.image_asset_id === snapshot.image_asset_id : shot.video_prompt === snapshot.video_prompt && shot.image_asset_id === snapshot.image_asset_id && shot.video_asset_id === snapshot.video_asset_id;
      if (unchanged) {
        if (job.kind === "image") { shot.image_asset_id=assets[0].id; shot.video_asset_id=null; shot.approved=false; }
        else { shot.video_asset_id=assets[0].id; shot.approved=false; }
        await c.query("UPDATE studio_projects SET shots=$2,version=version+1,updated_at=now() WHERE id=$1",[p.id,JSON.stringify(p.shots)]); attached=true;
      }
    }
    if (job.kind === "audio" && p.script === job.payload.project.script && p.audio_asset_id === job.payload.project.audio_asset_id) {
      await c.query("UPDATE studio_projects SET audio_asset_id=$2,version=version+1,updated_at=now() WHERE id=$1",[p.id,assets[0].id]);attached=true;
    }
    await c.query("UPDATE studio_jobs SET status='completed',result=$2,error=NULL,completed_at=now(),claimed_at=NULL WHERE id=$1",[job.id,JSON.stringify({assets,attached,...detail})]);
    await c.query("COMMIT");
  } catch(e) { await c.query("ROLLBACK");throw e; } finally {c.release();}
}
async function planStudio(project: StudioProject) {
  const { openai } = await import("../../lib/openai");
  const content: any[] = [{type:"text",text:JSON.stringify({brief:project.brief,approved_script:project.script,script_locked:project.script_locked,style_bible:project.style_bible,format:project.format})}];
  if (project.sample_asset_id) {
    const sample = (await pool.query("SELECT data FROM media_assets WHERE id=$1",[project.sample_asset_id])).rows[0];
    if (!sample) throw new StudioError(400,"Namuna video topilmadi.");
    const dir = await mkdtemp(join(tmpdir(),"studio-analysis-"));
    try {
      const path=join(dir,"sample.mp4");await writeFile(path,sample.data);
      const probe=await promisify(execFile)("ffprobe",["-v","error","-show_entries","format=duration:stream=codec_type,width,height","-of","json",path],{timeout:20000});
      const info=JSON.parse(probe.stdout);const duration=Number(info.format?.duration);
      if (!Number.isFinite(duration)||duration<=0) throw new StudioError(400,"Namuna video o‘qilmadi.");
      content.push({type:"text",text:`Real sample metadata: ${JSON.stringify(info)}. Visual evidence follows; sample audio was not transcribed.`});
      for (let i=0;i<4;i++) {
        const frame=join(dir,`frame-${i}.jpg`);
        await promisify(execFile)("ffmpeg",["-hide_banner","-loglevel","error","-y","-ss",String(duration*(i+0.5)/4),"-i",path,"-frames:v","1","-vf","scale=512:-2",frame],{timeout:30000});
        content.push({type:"image_url",image_url:{url:`data:image/jpeg;base64,${(await readFile(frame)).toString("base64")}`,detail:"low"}});
      }
    } finally {await rm(dir,{recursive:true,force:true});}
  }
  const response=await openai.chat.completions.create({model:process.env.MEDIA_TEXT_MODEL||"gpt-5",response_format:{type:"json_object"},max_completion_tokens:7000,messages:[{role:"system",content:"You are a cinematic production director. Return JSON with script:string, sample_analysis:string, shots:array. Each shot: id, title, prompt (English, <=2000 chars including all identity and style instructions), video_prompt (English <=1500), duration (2..60), subtitle. Total duration <=180, 1..32 shots. Preserve approved_script EXACTLY if supplied; never revise locked text. Keep father-daughter identities, clothes, room and action consistent with the brief and style bible. No claim to have heard sample audio. If no sample is supplied, say no sample was analyzed. This is a draft, no images or videos have been generated."},{role:"user",content}]},{timeout:180000,maxRetries:0});
  const output=z.object({script:z.string().max(12000),sample_analysis:z.string().max(8000),shots:z.array(z.record(z.unknown())).min(1).max(32)}).parse(JSON.parse(response.choices[0]?.message?.content||"{}"));
  const candidate=studioProjectSchema.parse({...projectInput(project),script:project.script_locked?project.script:output.script,shots:output.shots});
  return {draft:candidate,sample_analysis:output.sample_analysis,usage:response.usage||null,cost_known:false};
}
export function projectInput(p: StudioProject): StudioProjectInput {return studioProjectSchema.parse(Object.fromEntries(columns.split(",").map(k=>[k,(p as any)[k]])));}
let studioBusy=false;
export async function processStudioJobs() {
  if (studioBusy) return;studioBusy=true;
  let job:any;
  try {
    await pool.query("UPDATE studio_jobs SET status=CASE WHEN generation_id IS NOT NULL THEN 'provider_pending' WHEN kind='render' THEN 'queued' ELSE 'needs_review' END,error='Jarayon uzildi. Pullik so‘rov avtomatik qayta yuborilmadi.',claim_id=NULL,claimed_at=NULL WHERE status='running' AND claimed_at<now()-interval '20 minutes'");
    const claim=randomUUID();
    job=(await pool.query("UPDATE studio_jobs SET status='running',claim_id=$1,claimed_at=now() WHERE id=(SELECT id FROM studio_jobs WHERE status IN ('queued','provider_pending') AND poll_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *",[claim])).rows[0];
    if (!job) return;
    const request=studioJobSchema.parse(job.payload.request), project=job.payload.project as StudioProject;
    const heartbeat=async()=>{await pool.query("UPDATE studio_jobs SET claimed_at=now() WHERE id=$1 AND claim_id=$2",[job.id,claim]);};
    const timer=setInterval(()=>void heartbeat().catch(()=>{}),30000);timer.unref();
    try {
      if (request.kind === "image" || request.kind === "video") {
        if (!job.generation_id) {
          const extra=request.kind === "image" ? [request.content_reference_asset_id,request.style_reference_asset_id].filter(Boolean) as string[] : [];
          const body=leonardoBody(request,project,await loadProjectAssets(project,extra));
          const generated=await createLeonardoGeneration(body);
          job.generation_id=generated.id;
          await pool.query("UPDATE studio_jobs SET generation_id=$2,cost=$3 WHERE id=$1 AND claim_id=$4",[job.id,generated.id,generated.cost?JSON.stringify(generated.cost):null,claim]);
        }
        const result=await getLeonardoGeneration(job.generation_id,request.kind);
        if (result.cost) await pool.query("UPDATE studio_jobs SET cost=$2 WHERE id=$1 AND claim_id=$3",[job.id,JSON.stringify(result.cost),claim]);
        if (["FAILED","ERROR"].includes(result.status)) throw new StudioError(502,"Leonardo generatsiyasi bajarilmadi. Hisob tarixini tekshiring.");
        if (!["COMPLETE","COMPLETED","SUCCESS"].includes(result.status)) {
          if (Date.now()-new Date(job.created_at).getTime()>2*3600000) throw new StudioError(504,"Leonardo generatsiyasi uzoq kutilmoqda. ID saqlangan; keyin holatini qayta tekshiring.");
          await pool.query("UPDATE studio_jobs SET status='provider_pending',poll_at=now()+interval '15 seconds',claimed_at=NULL WHERE id=$1 AND claim_id=$2",[job.id,claim]);return;
        }
        const expected=request.kind === "image"?request.quantity:1;
        if (result.outputs.length !== expected) throw new StudioError(502,"Leonardo natijalari soni mos emas. ID saqlangan; qayta generatsiya qilmang.");
        await pool.query("UPDATE studio_jobs SET result=$2 WHERE id=$1 AND claim_id=$3",[job.id,JSON.stringify({remote_outputs:result.outputs}),claim]);
        const outputs=[];
        for (let i=0;i<result.outputs.length;i++) {
          await heartbeat();const a=await downloadLeonardoOutput(result.outputs[i].url,request.kind);
          outputs.push({ ...a,name:`${project.name}-${request.shot_id}-${i+1}.${a.mime_type==="video/mp4"?"mp4":a.mime_type==="image/png"?"png":"jpg"}` });
        }
        await saveOutputs(job,outputs,{provider_image_ids:result.outputs.map(a=>a.id)});
      } else if (request.kind === "audio") {
        const input=audioInput.parse({...request,name:project.name,text:project.script});
        await saveOutputs(job,[{name:`${project.name}-narration.mp3`,mime_type:"audio/mpeg",data:await generateAudio(input)}],{voice_id:request.voice_id,cost_known:false});
      } else if (request.kind === "plan") {
        const result=await planStudio(project);
        await pool.query("UPDATE studio_jobs SET status='completed',result=$2,completed_at=now(),error=NULL,claimed_at=NULL WHERE id=$1 AND claim_id=$3",[job.id,JSON.stringify(result),claim]);
      } else {
        const result=await renderStudio(project,await loadProjectAssets(project),request.burn_subtitles,heartbeat);
        await saveOutputs(job,[{name:`${project.name}.mp4`,mime_type:"video/mp4",data:result.video},{name:`${project.name}-cover.jpg`,mime_type:"image/jpeg",data:result.cover},{name:`${project.name}.zip`,mime_type:"application/zip",data:result.zip}],{duration:result.duration,subtitles:result.srt});
      }
    } finally {clearInterval(timer);}
  } catch(e) {
    if (job) {
      const known=e instanceof StudioError || e instanceof AudioError;
      const pending=job.generation_id && (!known || (e instanceof StudioError && [429,500,503].includes(e.status)));
      const status=pending?"provider_pending":job.generation_id || (e instanceof StudioError&&e.ambiguous) || (e instanceof AudioError&&[502,504].includes(e.status)) || (!known && job.kind!=="render")?"needs_review":"failed";
      await pool.query("UPDATE studio_jobs SET status=$2,error=$3,poll_at=now()+interval '60 seconds',claimed_at=NULL WHERE id=$1 AND claim_id=$4",[job.id,status,known?e.message:"Studio vazifasi tugamadi. Pullik generatsiya avtomatik takrorlanmadi.",job.claim_id]).catch(()=>{});
    }
    console.info("AI Studio worker:",e instanceof Error?e.name:"Unknown");
  } finally {studioBusy=false;}
}
export async function resumeStudioJob(sql: Sql,id:string) {
  const job=(await sql.query("SELECT * FROM studio_jobs WHERE id=$1",[uuid.parse(id)])).rows[0];
  if (!job) throw new StudioError(404,"Vazifa topilmadi.");
  if (!job.generation_id) throw new StudioError(409,"Generatsiya ID si yo‘q. Hisob tarixini tekshirmasdan pullik so‘rov qayta yuborilmaydi.");
  if (!["failed","needs_review"].includes(job.status)) throw new StudioError(409,"Bu vazifani hozir qayta tekshirib bo‘lmaydi.");
  return (await sql.query(`UPDATE studio_jobs SET status='provider_pending',error=NULL,poll_at=now() WHERE id=$1 RETURNING ${jobColumns}`,[id])).rows[0];
}
async function assetLink(sql:Sql,id:string) {
  if (!(await sql.query("SELECT id FROM media_assets WHERE id=$1",[uuid.parse(id)])).rows.length) throw new StudioError(404,"Fayl topilmadi.");
  const expires=String(Date.now()+15*60000);
  return {id,url:`${appBaseUrl()}/api/media/assets/${id}/public?expires=${expires}&sig=${assetSignature(id,expires)}`,expires_at:Number(expires)};
}
export function allowedStudioImportUrl(value:string) {
  try {
    const u=new URL(value);
    return u.protocol==="https:"&&!u.username&&!u.password&&(!u.port||u.port==="443")&&(/^(oaisd[a-z0-9-]+)\.blob\.core\.windows\.net$/.test(u.hostname)||/^(sdmntpr[a-z0-9-]+)\.oaiusercontent\.com$/.test(u.hostname)||/^(oaisd[a-z0-9-]+)\.s3\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname));
  } catch {return false;}
}
function validStudioBytes(mime:string,data:Buffer) {
  return data.length&& (mime==="image/png"?data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==="image/jpeg"?data[0]===255&&data[1]===216&&data[2]===255:mime==="video/mp4"?data.subarray(4,8).toString()==="ftyp":mime==="audio/mpeg"?(data.subarray(0,3).toString()==="ID3" || (data[0]===255&&(data[1]&224)===224)):false);
}
async function importStudioAsset(sql:Sql,input:unknown) {
  const b=z.object({name:z.string().min(1).max(180),mime_type:z.enum(["image/jpeg","image/png","video/mp4","audio/mpeg"]),url:z.string().url().max(16000)}).strict().parse(input);
  if (!allowedStudioImportUrl(b.url)) throw new StudioError(400,"Import uchun tasdiqlangan fayl omborining HTTPS havolasi kerak.");
  const r=await fetch(b.url,{redirect:"error",signal:AbortSignal.timeout(120000)});
  if (!r.ok||!r.body)throw new StudioError(400,"Fayl havolasi ochilmadi yoki muddati tugagan.");
  const chunks:Uint8Array[]=[];let size=0;
  if(Number(r.headers.get("content-length"))>50*1024*1024)throw new StudioError(413,"Fayl 50 MB dan katta.");
  for await (const part of r.body as any){size+=part.length;if(size>50*1024*1024)throw new StudioError(413,"Fayl 50 MB dan katta.");chunks.push(part);}
  const data=Buffer.concat(chunks);
  if(!validStudioBytes(b.mime_type,data))throw new StudioError(400,"Import faylining ichki formati mos emas.");
  await sql.query("SELECT pg_advisory_xact_lock(761281)");
  const used=Number((await sql.query("SELECT COALESCE(SUM(size),0) AS used FROM media_assets")).rows[0].used);
  if(used+size>mediaLibraryLimit())throw new StudioError(413,"Media kutubxonasi to‘la.");
  return (await sql.query("INSERT INTO media_assets(name,mime_type,size,data) VALUES($1,$2,$3,$4) RETURNING id,name,mime_type,size,created_at",[b.name,b.mime_type,size,data])).rows[0];
}
async function executeStudioCommand(sql:Sql,command:z.infer<typeof studioCommandSchema>) {
  const d=command.data;
  switch(command.operation) {
    case "project.create": return createStudioProject(sql,d.template === "water-story" ? waterStoryTemplate() : d);
    case "project.update": return updateStudioProject(sql,uuid.parse(d.id),{project:d.project,version:d.version,unlock_script:d.unlock_script});
    case "project.read": return d.id ? projectById(sql,uuid.parse(d.id)) : (await sql.query("SELECT * FROM studio_projects ORDER BY updated_at DESC LIMIT 50")).rows;
    case "job.queue": return queueStudioJob(sql,d);
    case "job.resume": return resumeStudioJob(sql,uuid.parse(d.id));
    case "asset.link": return assetLink(sql,uuid.parse(d.id));
    case "asset.import": return importStudioAsset(sql,d);
    case "job.read": return (await sql.query(`SELECT ${jobColumns} FROM studio_jobs ${d.id?"WHERE id=$1":d.project_id?"WHERE project_id=$1":""} ORDER BY created_at DESC LIMIT 50`,d.id?[uuid.parse(d.id)]:d.project_id?[uuid.parse(d.project_id)]:[])).rows;
  }
}
// Only the authenticated Railway project owner can set this environment variable.
// Commands are bounded data, never executable code. The receipt and mutations
// commit together; redeploying cannot enqueue the same paid operation twice.
export async function processStudioCommand() {
  const raw=process.env.MEDIA_STUDIO_COMMAND_JSON;
  if (!raw || raw.length>60000) return;
  let command:z.infer<typeof studioCommandSchema>;
  try {command=studioCommandSchema.parse(JSON.parse(raw));} catch {console.info("AI Studio command rejected: invalid input.");return;}
  const c=await pool.connect();
  try {
    await c.query("BEGIN");await c.query("SELECT pg_advisory_xact_lock(761299)");
    if ((await c.query("SELECT 1 FROM studio_commands WHERE command_id=$1",[command.command_id])).rows.length) {await c.query("COMMIT");return;}
    let receipt:any;
    await c.query("SAVEPOINT studio_command");
    try {receipt={ok:true,result:await executeStudioCommand(c,command)};}
    catch(e) {await c.query("ROLLBACK TO SAVEPOINT studio_command");receipt={ok:false,error:e instanceof StudioError?e.message:"Buyruq ma’lumotlarini tekshiring."};}
    await c.query("INSERT INTO studio_commands(command_id,operation,receipt) VALUES($1,$2,$3)",[command.command_id,command.operation,JSON.stringify(receipt)]);
    await c.query("COMMIT");
    const logged=receipt.ok&&(command.operation==="project.create"||command.operation==="project.update")?{ok:true,result:{id:receipt.result.id,name:receipt.result.name,version:receipt.result.version,shot_count:receipt.result.shots.length}}:receipt.ok&&command.operation==="job.queue"?{ok:true,result:{id:receipt.result.id,project_id:receipt.result.project_id,kind:receipt.result.kind,status:receipt.result.status}}:receipt;
    console.info("AI_STUDIO_RECEIPT",JSON.stringify({command_id:command.command_id,operation:command.operation,...logged}));
  } catch {await c.query("ROLLBACK").catch(()=>{});console.info("AI Studio command could not connect to database.");}
  finally {c.release();}
}
const handle=(fn:(req:Request,res:Response)=>Promise<unknown>)=>async(req:Request,res:Response)=>{
  try {await fn(req,res);}catch(e){if(e instanceof StudioError || e instanceof AudioError) res.status(e.status>=500?503:e.status).json({error:e.message});else if(e instanceof z.ZodError) res.status(400).json({error:"Studio ma’lumotlarini tekshiring.",details:e.issues.map(i=>`${i.path.join(".")}: ${i.message}`)});else {console.info("AI Studio request:",e instanceof Error?e.name:"Unknown");res.status(500).json({error:"Studio amali bajarilmadi."});}}
};
export function registerStudioRoutes(app:Express) {
  const prefix="/api/media/studio";
  app.use(prefix,requireAdmin);
  app.get(`${prefix}/status`,handle(async(_req,res)=>res.json(studioReadiness())));
  app.get(`${prefix}/template`,handle(async(_req,res)=>res.json(waterStoryTemplate())));
  app.get(`${prefix}/projects`,handle(async(_req,res)=>res.json((await pool.query("SELECT * FROM studio_projects ORDER BY updated_at DESC LIMIT 100")).rows)));
  app.post(`${prefix}/projects`,handle(async(req,res)=>res.status(201).json(await createStudioProject(pool,req.body))));
  app.get(`${prefix}/projects/:id`,handle(async(req,res)=>res.json(await projectById(pool,req.params.id))));
  app.put(`${prefix}/projects/:id`,handle(async(req,res)=>{
    const c=await pool.connect();try{await c.query("BEGIN");const p=await updateStudioProject(c,req.params.id,req.body);await c.query("COMMIT");res.json(p);}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
  }));
  app.get(`${prefix}/jobs`,handle(async(req,res)=>res.json((await pool.query(`SELECT ${jobColumns} FROM studio_jobs ${req.query.project_id?"WHERE project_id=$1":""} ORDER BY created_at DESC LIMIT 100`,req.query.project_id?[uuid.parse(req.query.project_id)]:[])).rows)));
  app.post(`${prefix}/jobs`,handle(async(req,res)=>res.status(202).json(await queueStudioJob(pool,req.body))));
  app.post(`${prefix}/jobs/:id/resume`,handle(async(req,res)=>res.json(await resumeStudioJob(pool,req.params.id))));
  app.get(`${prefix}/commands`,handle(async(_req,res)=>res.json((await pool.query("SELECT * FROM studio_commands ORDER BY created_at DESC LIMIT 50")).rows)));
  app.post(`${prefix}/assets`,express.raw({type:["image/jpeg","image/png","video/mp4","audio/mpeg"],limit:"50mb"}),handle(async(req,res)=>{
    const data=req.body,mime=String(req.headers["content-type"]||"").split(";")[0];
    const name=z.string().min(1).max(180).parse(decodeURIComponent(String(req.headers["x-file-name"]||"reference")));
    const valid=Buffer.isBuffer(data)&&validStudioBytes(mime,data);
    if (!valid) throw new StudioError(400,"JPG, PNG, MP4 yoki MP3 formati mos emas.");
    const c=await pool.connect();try{await c.query("BEGIN");await c.query("SELECT pg_advisory_xact_lock(761281)");const used=Number((await c.query("SELECT COALESCE(SUM(size),0) AS used FROM media_assets")).rows[0].used);if(used+data.length>mediaLibraryLimit())throw new StudioError(413,"Media kutubxonasi to‘la.");const a=(await c.query("INSERT INTO media_assets(name,mime_type,size,data) VALUES($1,$2,$3,$4) RETURNING id,name,mime_type,size,created_at",[name,mime,data.length,data])).rows[0];await c.query("COMMIT");res.status(201).json(a);}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
  }));
}
