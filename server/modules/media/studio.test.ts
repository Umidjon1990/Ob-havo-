import test from "node:test";
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { studioProjectSchema, studioJobSchema, waterStoryTemplate, type StudioProject } from "../../../shared/ai-studio";
import { leonardoBody, generationResult, providerCost, allowedLeonardoUrl, createLeonardoGeneration, recoverLeonardoGeneration, StudioError } from "./studio-leonardo";
import { studioCaptions, renderStudio, validateRender } from "./studio-render";
const projectId="bd728f8c-4046-4ad9-825a-56f02b4a16a0",assetId="58d23429-4b7b-430c-9e4e-d3628737318a";
const project={...waterStoryTemplate(),id:projectId,version:1,created_at:"2026-10-11T00:00:00Z",updated_at:"2026-10-11T00:00:00Z"} as StudioProject;
test("studio rejects unapproved paid calls, duplicate shot identities, excessive time and long prompts",()=>{
  assert.equal(studioJobSchema.safeParse({kind:"image",project_id:projectId,shot_id:"offer",idempotency_key:"safe-test"}).success,false);
  assert.equal(studioProjectSchema.safeParse({...waterStoryTemplate(),shots:[project.shots[0],project.shots[0]]}).success,false);
  assert.equal(studioProjectSchema.safeParse({...waterStoryTemplate(),shots:project.shots.map(s=>({...s,duration:60}))}).success,false);
  assert.equal(studioProjectSchema.safeParse({...waterStoryTemplate(),shots:[{...project.shots[0],prompt:"x".repeat(2001)}]}).success,false);
  assert.equal(waterStoryTemplate().script,"");
});
test("Leonardo request preserves private cinematic references and Kling requires approved start frame",()=>{
  const images=new Map([[assetId,{mime_type:"image/png",data:Buffer.from([137,80,78,71,13,10,26,10])}]]);
  const input=studioJobSchema.parse({kind:"image",project_id:projectId,shot_id:"offer",idempotency_key:"request-test",paid_authorized:true,content_reference_asset_id:assetId,style_reference_asset_id:assetId});
  const body=leonardoBody(input as any,project,images) as any;
  assert.equal(body.model,"lucid-origin");assert.equal(body.public,false);assert.equal(body.parameters.height,1920);assert.equal(body.parameters.width,1080);assert.equal(body.parameters.prompt_enhance,"OFF");assert.equal(body.parameters.guidances.content.length,1);assert.equal(body.parameters.guidances.style[0].image.type,"BASE64");
  const video=studioJobSchema.parse({kind:"video",project_id:projectId,shot_id:"offer",idempotency_key:"video-test",paid_authorized:true});
  assert.throws(()=>leonardoBody(video as any,project,images),/tasdiqlangan/);
  const ready={...project,shots:project.shots.map(s=>({...s,approved:true,image_asset_id:assetId}))};
  const vb=leonardoBody(video as any,ready,images) as any;assert.equal(vb.model,"kling-2.6");assert.equal(vb.parameters.motion_has_audio,false);
});
test("polling distinguishes pending images, motion outputs and unknown versus dollar costs",()=>{
  assert.deepEqual(generationResult({generations_by_pk:{status:"PENDING",generated_images:[]}},"image").outputs,[]);
  assert.equal(generationResult({generations_by_pk:{status:"COMPLETE",generated_images:[{id:"one",url:"still",motionMP4URL:"motion"}]}},"video").outputs[0].url,"motion");
  assert.deepEqual(providerCost({cost:{amount:0.035,unit:"dollars"}}),{amount:0.035,unit:"USD"});assert.equal(providerCost({}),null);assert.equal(providerCost({cost:{amount:3}}),null);
  assert.equal(allowedLeonardoUrl("https://cdn.leonardo.ai/image.png"),true);assert.equal(allowedLeonardoUrl("https://cdn.leonardo.ai.attacker.test/a"),false);assert.equal(allowedLeonardoUrl("http://127.0.0.1/a"),false);
});
test("Lightning uploads binary private references without API credentials and submits exactly one v1 generation",async()=>{
  const nativeFetch=globalThis.fetch,key=process.env.LEONARDO_API_KEY;process.env.LEONARDO_API_KEY="private-lightning-test";
  const images=new Map([[assetId,{mime_type:"image/png",data:Buffer.from([137,80,78,71,13,10,26,10])}]]);
  const request=studioJobSchema.parse({kind:"image",project_id:projectId,shot_id:"offer",image_model:"lightning-xl",quantity:1,seed:1777912760,idempotency_key:"lightning-test",paid_authorized:true,character_reference_asset_id:assetId,content_reference_asset_id:assetId,style_reference_asset_id:assetId});
  const body=leonardoBody(request as any,project,images) as any;
  assert.equal(body.body.width,720);assert.equal(body.body.height,1280);assert.equal(body.body.presetStyle,"PHOTOGRAPHY");assert.equal(body.body.alchemy,true);assert.equal(body.body.enhancePrompt,false);assert.equal(body.body.public,false);
  assert.throws(()=>leonardoBody({...request,quantity:5} as any,project,images),/4 rasm/);
  assert.throws(()=>leonardoBody(request as any,{...project,shots:[{...project.shots[0],prompt:"x".repeat(1501)}]},images),/1500/);
  let uploads=0,generations=0;
  globalThis.fetch=(async(url:any,init:any)=>{
    if(String(url).endsWith("v1/init-image"))return Response.json({uploadInitImage:{id:assetId,url:"https://references.s3.us-east-1.amazonaws.com/",fields:JSON.stringify({key:"private-reference",policy:"signed-policy"})}});
    if(String(url)==="https://references.s3.us-east-1.amazonaws.com/"){
      uploads++;assert.equal(init.headers,undefined);assert.equal(init.redirect,"error");assert.ok(init.body instanceof FormData);assert.equal(init.body.get("policy"),"signed-policy");assert.ok(init.body.get("file") instanceof Blob);assert.equal((await init.body.get("file").arrayBuffer()).byteLength,8);return new Response(null,{status:204});
    }
    assert.equal(String(url),"https://cloud.leonardo.ai/api/rest/v1/generations");generations++;
    const payload=JSON.parse(init.body);assert.equal(payload.num_images,1);assert.equal(payload.modelId,"b24e16ff-06e3-43eb-8d33-4416c2d75876");assert.equal(payload.references,undefined);assert.equal(payload.api_version,undefined);assert.equal(payload.controlnets.length,3);assert.deepEqual(payload.controlnets.map((r:any)=>r.preprocessorId),[133,100,67]);assert.equal(payload.controlnets[0].initImageType,"UPLOADED");assert.equal(payload.seed,1777912760);
    return Response.json({sdGenerationJob:{generationId:projectId,apiCreditCost:25}});
  }) as typeof fetch;
  try {
    assert.deepEqual(await createLeonardoGeneration(body),{id:projectId,cost:{amount:25,unit:"credits"}});assert.equal(uploads,3);assert.equal(generations,1);
    globalThis.fetch=(async()=>{throw new Error("private-lightning-test");}) as typeof fetch;
    await assert.rejects(()=>createLeonardoGeneration(body),e=>e instanceof StudioError&&!e.ambiguous&&!e.message.includes("private-lightning-test"));
    assert.equal(generations,1);
  } finally {globalThis.fetch=nativeFetch;if(key===undefined)delete process.env.LEONARDO_API_KEY;else process.env.LEONARDO_API_KEY=key;}
});
test("paid Leonardo timeout never blindly retries or exposes provider credentials",async()=>{
  const original=globalThis.fetch,key=process.env.LEONARDO_API_KEY;process.env.LEONARDO_API_KEY="private-test-key";let calls=0;
  globalThis.fetch=(async()=>{calls++;throw new Error("private-test-key");}) as typeof fetch;
  try{await assert.rejects(()=>createLeonardoGeneration({}),e=>e instanceof StudioError&&e.ambiguous&&!e.message.includes("private-test-key"));assert.equal(calls,1);}finally{globalThis.fetch=original;if(key===undefined)delete process.env.LEONARDO_API_KEY;else process.env.LEONARDO_API_KEY=key;}
});
test("v2 generation receipts retain nested IDs and dollar costs without another paid request",async()=>{
  const original=globalThis.fetch,key=process.env.LEONARDO_API_KEY;process.env.LEONARDO_API_KEY="receipt-test";let calls=0;
  try {
    for (const envelope of [{generate:{generationId:projectId,cost:{amount:"0.012",unit:"DOLLARS"}}},{generation:{id:projectId,cost:{amount:"0.012",unit:"DOLLARS"}}},{id:projectId,cost:{amount:"0.012",unit:"DOLLARS"}}]) {
      globalThis.fetch=(async()=>{calls++;return Response.json(envelope);}) as typeof fetch;
      assert.deepEqual(await createLeonardoGeneration({model:"lucid-origin"}),{id:projectId,cost:{amount:0.012,unit:"USD"}});
    }
    assert.equal(calls,3);
  } finally {globalThis.fetch=original;if(key===undefined)delete process.env.LEONARDO_API_KEY;else process.env.LEONARDO_API_KEY=key;}
});
test("lost receipt reconciliation uses only GET and rejects duplicate or unrelated generations",async()=>{
  const original=globalThis.fetch,key=process.env.LEONARDO_API_KEY;process.env.LEONARDO_API_KEY="recovery-test";let calls=0;
  const found={id:projectId,prompt:"private water scene",public:false,createdAt:"2026-10-11T17:32:04Z",cost:{amount:0.012,unit:"DOLLARS"}};
  let generations=[found,{...found,id:assetId,prompt:"different scene"},{...found,id:assetId,createdAt:"2026-10-10T17:32:04Z"}];
  globalThis.fetch=(async(url:any,init:any)=>{calls++;assert.equal(init.method,"GET");return Response.json(String(url).endsWith("/me")?{user_details:[{user:{id:assetId}}]}:{generations});}) as typeof fetch;
  try {
    assert.deepEqual(await recoverLeonardoGeneration(found.prompt,"2026-10-11T17:32:03Z"),{id:projectId,cost:{amount:0.012,unit:"USD"}});
    generations=[found,{...found,id:assetId}];await assert.rejects(()=>recoverLeonardoGeneration(found.prompt,found.createdAt),/2 ta/);
    generations=[{...found,public:true}];await assert.rejects(()=>recoverLeonardoGeneration(found.prompt,found.createdAt),/0 ta/);
    assert.equal(calls,6);
  } finally {globalThis.fetch=original;if(key===undefined)delete process.env.LEONARDO_API_KEY;else process.env.LEONARDO_API_KEY=key;}
});
test("provider rejection reports its endpoint and balance cause without leaking key, prompt or URL",async()=>{
  const nativeFetch=globalThis.fetch,key=process.env.LEONARDO_API_KEY;process.env.LEONARDO_API_KEY="private-error-test";let calls=0;
  globalThis.fetch=(async()=>{calls++;return Response.json({error:"Insufficient API credits private-error-test private scene prompt https://private.test/?sig=secret"},{status:400});}) as typeof fetch;
  try {await assert.rejects(()=>createLeonardoGeneration({model:"lucid-origin",parameters:{prompt:"private scene prompt"}}),e=>e instanceof StudioError&&e.status===400&&!e.ambiguous&&e.message.includes("v2/generations")&&e.message.includes("kredit yetarli emas")&&!e.message.includes("private-error-test")&&!e.message.includes("private scene prompt")&&!e.message.includes("sig=secret"));assert.equal(calls,1);}finally{globalThis.fetch=nativeFetch;if(key===undefined)delete process.env.LEONARDO_API_KEY;else process.env.LEONARDO_API_KEY=key;}
});
test("real FFmpeg render exports a vertical MP4, captions and a complete archive",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"studio-test-")),run=promisify(execFile);
  try{
    const frame=join(dir,"frame.png");await run("ffmpeg",["-v","error","-y","-f","lavfi","-i","color=c=0x224d44:s=108x192","-frames:v","1",frame]);
    const audioId="3ab202f3-849a-4d01-8d6f-63be7b5ba70a",musicId="e4c742da-0bc8-49d9-8b9b-98a9d006f903";
    await run("ffmpeg",["-v","error","-y","-f","lavfi","-i","sine=frequency=440:duration=1","-c:a","libmp3lame",join(dir,"audio.mp3")]);
    const p={...project,audio_asset_id:audioId,music_asset_id:musicId,shots:[{...project.shots[0],duration:2,subtitle:"Ota va qiz",image_asset_id:assetId,approved:true}]};
    assert.throws(()=>validateRender({...p,shots:p.shots.map(s=>({...s,approved:false}))},new Map()),/tasdiqlanmagan/);
    assert.match(studioCaptions(p).srt,/00:00:00,000 --> 00:00:02,000/);
    const audio=await readFile(join(dir,"audio.mp3"));
    const result=await renderStudio(p,new Map([[assetId,{mime_type:"image/png",data:await readFile(frame)}],[audioId,{mime_type:"audio/mpeg",data:audio}],[musicId,{mime_type:"audio/mpeg",data:audio}]]),true,async()=>{});
    await writeFile(join(dir,"video.mp4"),result.video);await writeFile(join(dir,"package.zip"),result.zip);
    const info=JSON.parse((await run("ffprobe",["-v","error","-show_entries","stream=width,height,codec_type:format=duration","-of","json",join(dir,"video.mp4")])).stdout);
    assert.equal(info.streams.find((s:any)=>s.codec_type==="video").width,1080);assert.equal(info.streams.find((s:any)=>s.codec_type==="video").height,1920);assert.ok(info.streams.some((s:any)=>s.codec_type==="audio"));assert.ok(Math.abs(Number(info.format.duration)-2)<0.1);
    assert.deepEqual((await run("unzip",["-Z1",join(dir,"package.zip")])).stdout.trim().split("\n").sort(),["cover.jpg","project.json","subtitles.srt","video.mp4"].sort());
    assert.ok(result.cover.length>100);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test("durable studio API and Railway bridge survive replay, preserve script locks and recover provider outputs",{skip:!process.env.MEDIA_TEST_PGLITE_PATH},async()=>{
  process.env.DATABASE_URL="postgresql://local-test/not-used";process.env.OPENAI_API_KEY="local-test";process.env.ADMIN_PASSWORD="test-secret";process.env.LEONARDO_API_KEY="local-test-leonardo";
  const {PGlite}=await import(process.env.MEDIA_TEST_PGLITE_PATH!);const db=new PGlite();
  const {pool}=await import("../../db");const oldQuery=pool.query,oldConnect=pool.connect,nativeFetch=globalThis.fetch;
  const query=async(sql:string,args?:any[])=>{if(sql.includes("pg_advisory"))return {rows:[],rowCount:1};if(!args&&sql.trim().split(";").filter(Boolean).length>1){await db.exec(sql);return {rows:[],rowCount:0};}const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};
  pool.query=query as any;pool.connect=(async()=>({query,release(){}})) as any;
  const express=(await import("express")).default;const app=express();app.use(express.json());
  const studio=await import("./studio");const {ensureMediaTables}=await import("./schema");await ensureMediaTables(pool);await ensureMediaTables(pool);studio.registerStudioRoutes(app);
  const {hashToken}=await import("./security");await query("INSERT INTO media_sessions(token_hash,expires_at) VALUES($1,now()+interval '1 hour')",[hashToken("test-session")]);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.on("listening",resolve));const base=`http://127.0.0.1:${(server.address() as any).port}/api/media/studio`;
  let creates=0,polls=0;
  globalThis.fetch=(async(url:any,init:any)=>{
    if(String(url).startsWith(base))return nativeFetch(url,init);
    if(String(url).includes("v2/generations")){creates++;return Response.json({generationId:"be728f8c-4046-4ad9-825a-56f02b4a16a0",cost:{amount:0.035,unit:"USD"}});}
    if(String(url).includes("v1/generations")){polls++;return Response.json({generations_by_pk:{status:polls===1?"PENDING":"COMPLETE",generated_images:polls===1?[]:[{id:assetId,url:"https://cdn.leonardo.ai/test.png"}]}});}
    if(String(url)==="https://cdn.leonardo.ai/test.png")return new Response(Buffer.from([137,80,78,71,13,10,26,10]),{headers:{"Content-Type":"image/png"}});
    throw new Error("Unexpected external request");
  }) as typeof fetch;
  try{
    assert.equal((await fetch(`${base}/projects`)).status,401);
    const headers={Authorization:"Bearer test-session","Content-Type":"application/json"};
    assert.equal((await fetch(`${base}/projects`,{method:"POST",headers:{...headers,Origin:"https://evil.test"},body:JSON.stringify(waterStoryTemplate())})).status,403);
    process.env.MEDIA_STUDIO_COMMAND_JSON=JSON.stringify({command_id:"water-story-bootstrap-test",operation:"project.create",data:{template:"water-story"}});await studio.processStudioCommand();await studio.processStudioCommand();
    assert.equal((await query("SELECT count(*) AS count FROM studio_projects")).rows[0].count,1);
    let p=(await query("SELECT * FROM studio_projects")).rows[0] as StudioProject;
    p=await studio.updateStudioProject(pool,p.id,{project:{...studio.projectInput(p),script:"Tasdiqlangan matn",script_locked:true},version:p.version});
    await assert.rejects(()=>studio.updateStudioProject(pool,p.id,{project:{...studio.projectInput(p),script:"Changed"},version:p.version}),/qulflangan/);
    const request={kind:"image",project_id:p.id,shot_id:"offer",idempotency_key:"durable-image-test",paid_authorized:true};
    const first=await studio.queueStudioJob(pool,request);const duplicate=await studio.queueStudioJob(pool,request);assert.equal(first.id,duplicate.id);
    await studio.processStudioJobs();assert.equal(creates,1);
    assert.equal((await query("SELECT status FROM studio_jobs WHERE id=$1",[first.id])).rows[0].status,"provider_pending");
    await query("UPDATE studio_jobs SET poll_at=now() WHERE id=$1",[first.id]);await studio.processStudioJobs();await studio.processStudioJobs();assert.equal(creates,1);
    const done=(await query("SELECT * FROM studio_jobs WHERE id=$1",[first.id])).rows[0];assert.equal(done.status,"completed");assert.equal(done.cost.unit,"USD");assert.equal(done.result.assets.length,1);
    p=(await query("SELECT * FROM studio_projects WHERE id=$1",[p.id])).rows[0];assert.equal(p.script,"Tasdiqlangan matn");assert.equal(p.shots[0].approved,false);assert.equal(p.shots[0].image_asset_id,done.result.assets[0].id);
    assert.equal((await fetch(`${base}/status`,{headers})).status,200);
    const workingFetch=globalThis.fetch;
    globalThis.fetch=(async(url:any,init:any)=>{if(String(url).includes("v2/generations")){creates++;throw new Error("Lost paid response");}return workingFetch(url,init);}) as typeof fetch;
    const ambiguous=await studio.queueStudioJob(pool,{...request,shot_id:"rejection",idempotency_key:"ambiguous-image-test"});
    await studio.processStudioJobs();await studio.processStudioJobs();assert.equal(creates,2);
    assert.equal((await query("SELECT status FROM studio_jobs WHERE id=$1",[ambiguous.id])).rows[0].status,"needs_review");
    await assert.rejects(()=>studio.resumeStudioJob(pool,ambiguous.id),/ID si yo‘q/);
    await query("UPDATE studio_jobs SET status='running',claimed_at=now()-interval '21 minutes' WHERE id=$1",[ambiguous.id]);await studio.processStudioJobs();assert.equal(creates,2);
    assert.equal((await query("SELECT status FROM studio_jobs WHERE id=$1",[ambiguous.id])).rows[0].status,"needs_review");
    assert.equal(studio.allowedStudioImportUrl("https://oaisdmntpr.blob.core.windows.net/test?sig=example"),true);assert.equal(studio.allowedStudioImportUrl("https://127.0.0.1/secret"),false);
    const beforeAssets=Number((await query("SELECT count(*) AS count FROM media_assets")).rows[0].count);
    const reference={name:"private-reference.png",mime_type:"image/png",data_base64:Buffer.from([137,80,78,71,13,10,26,10]).toString("base64")};
    process.env.MEDIA_STUDIO_REFERENCE_1=reference.data_base64;
    const data={project:{name:"Private one-shot test",shots:[{id:"offer",title:"Offer",prompt:"Father arrives and daughter offers water."}]},shot_id:"offer",image_model:"lightning-xl",paid_authorized:true,references:[{name:reference.name,mime_type:reference.mime_type,role:"character",data_env:"MEDIA_STUDIO_REFERENCE_1"},{...reference,role:"content"},{...reference,role:"style"}]};
    process.env.MEDIA_STUDIO_COMMAND_JSON=JSON.stringify({command_id:"inline-image-test",operation:"image.test",data});await studio.processStudioCommand();await studio.processStudioCommand();
    const receipt=(await query("SELECT receipt FROM studio_commands WHERE command_id=$1",["inline-image-test"])).rows[0].receipt;assert.equal(receipt.ok,true);assert.equal(receipt.result.reference_assets.length,3);
    assert.equal(Number((await query("SELECT count(*) AS count FROM media_assets")).rows[0].count),beforeAssets+3);assert.equal(Number((await query("SELECT count(*) AS count FROM studio_projects")).rows[0].count),2);
    const inlineJob=(await query("SELECT * FROM studio_jobs WHERE id=$1",[receipt.result.job_id])).rows[0];assert.equal(inlineJob.payload.request.quantity,1);assert.equal(inlineJob.payload.request.image_model,"lightning-xl");assert.ok(inlineJob.payload.request.character_reference_asset_id);assert.ok(!JSON.stringify(receipt).includes("data_base64"));assert.equal(creates,2);
    process.env.MEDIA_STUDIO_COMMAND_JSON=JSON.stringify({command_id:"invalid-inline-test",operation:"image.test",data:{...data,references:[{...reference,role:"character",data_base64:Buffer.from("invalid png").toString("base64")}]}});await studio.processStudioCommand();
    assert.equal((await query("SELECT receipt FROM studio_commands WHERE command_id=$1",["invalid-inline-test"])).rows[0].receipt.ok,false);assert.equal(Number((await query("SELECT count(*) AS count FROM media_assets")).rows[0].count),beforeAssets+3);assert.equal(creates,2);
    process.env.MEDIA_STUDIO_COMMAND_JSON=JSON.stringify({command_id:"invalid-env-test",operation:"image.test",data:{...data,references:[{name:reference.name,mime_type:reference.mime_type,role:"character",data_env:"LEONARDO_API_KEY"}]}});await studio.processStudioCommand();
    assert.equal((await query("SELECT receipt FROM studio_commands WHERE command_id=$1",["invalid-env-test"])).rows[0].receipt.ok,false);assert.equal(Number((await query("SELECT count(*) AS count FROM media_assets")).rows[0].count),beforeAssets+3);delete process.env.MEDIA_STUDIO_REFERENCE_1;
    const oneShot=(await query("SELECT * FROM studio_projects WHERE id=$1",[receipt.result.project_id])).rows[0];
    process.env.MEDIA_STUDIO_COMMAND_JSON=JSON.stringify({command_id:"atomic-update-image-test",operation:"project.update",data:{id:oneShot.id,version:oneShot.version,project:{...studio.projectInput(oneShot),shots:oneShot.shots.map((s:any)=>({...s,prompt:"Short revised water scene."}))},image_job:{shot_id:"offer",image_model:"lightning-xl",paid_authorized:true,character_reference_asset_id:inlineJob.payload.request.character_reference_asset_id}}});await studio.processStudioCommand();await studio.processStudioCommand();
    const atomic=(await query("SELECT receipt FROM studio_commands WHERE command_id=$1",["atomic-update-image-test"])).rows[0].receipt;assert.equal(atomic.ok,true);assert.equal(atomic.result.version,2);assert.equal(atomic.result.queued_job.status,"queued");
    assert.equal((await query("SELECT count(*) AS count FROM studio_jobs WHERE idempotency_key=$1",["atomic-update-image-test"])).rows[0].count,1);assert.equal((await query("SELECT version FROM studio_projects WHERE id=$1",[oneShot.id])).rows[0].version,2);assert.equal(creates,2);
  }finally{globalThis.fetch=nativeFetch;pool.query=oldQuery;pool.connect=oldConnect;await new Promise<void>(resolve=>server.close(()=>resolve()));await db.close();delete process.env.MEDIA_STUDIO_COMMAND_JSON;}
});
