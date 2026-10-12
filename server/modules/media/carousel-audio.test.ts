import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { postSchema, platformPost, validatePublication } from "../../../shared/media";
import { carouselAudioSchema, carouselAudioKey, carouselAudioReady, preserveCarouselAudioOutput } from "../../../shared/carousel-audio";

const audio = carouselAudioSchema.parse({ music_id: randomUUID(), slide_seconds: 3, start_seconds: 1, volume_percent: 25 });
const source = postSchema.parse({title:"Audio carousel",format:"carousel",caption:"Test",asset_ids:[randomUUID(),randomUUID()],variants:{carousel_audio:audio}});
test("audio settings and ordered sources invalidate server-owned outputs", () => {
  assert.equal(carouselAudioSchema.safeParse({...audio,slide_seconds:2}).success,false);
  assert.equal(carouselAudioSchema.safeParse({...audio,volume_percent:101}).success,false);
  const ready = {...source,variants:{...source.variants,carousel_audio_output:{source_key:carouselAudioKey(source)!,asset_ids:[randomUUID(),randomUUID()]}}};
  assert.equal(carouselAudioReady(ready),true);
  assert.equal(preserveCarouselAudioOutput(ready).variants.carousel_audio_output,undefined);
  assert.deepEqual(preserveCarouselAudioOutput(ready,ready).variants.carousel_audio_output,ready.variants.carousel_audio_output);
  const changed = {...ready,asset_ids:[...ready.asset_ids].reverse()};
  assert.equal(carouselAudioReady(changed),false);
  assert.equal(preserveCarouselAudioOutput(changed,ready).variants.carousel_audio_output,undefined);
  assert.equal(carouselAudioReady({...ready,variants:{...ready.variants,carousel_audio:{...audio,volume_percent:26}}}),false);
  for (const platform of ["instagram","telegram"]) {
    assert.deepEqual(platformPost(source,platform).asset_ids,[]);
    assert.deepEqual(platformPost(ready,platform).asset_ids,ready.variants.carousel_audio_output.asset_ids);
    assert.ok(validatePublication(source,platform,["image/jpeg","image/jpeg"]));
    assert.equal(validatePublication(platformPost(ready,platform),platform,["video/mp4","video/mp4"]),null);
  }
  assert.ok(validatePublication(source,"youtube",["video/mp4","video/mp4"]));
});

test("Instagram waits for video children and reuses IDs; Telegram sends a video album", async () => {
  process.env.DATABASE_URL="postgresql://local-test/not-used";
  process.env.ADMIN_PASSWORD="carousel-test-secret";
  process.env.APP_URL="https://media.test";
  process.env.TELEGRAM_BOT_TOKEN="local-test-token";
  const {publish,PublishError}=await import("./providers");
  const {seal}=await import("./security");
  const account={id:randomUUID(),platform:"instagram",external_id:"ig-test",credentials:seal({access_token:"local-test"})};
  const assets=source.asset_ids.map((id,i)=>({id,mime_type:i?"video/mp4":"image/jpeg",data:Buffer.alloc(0),size:100}));
  const nativeFetch=globalThis.fetch;
  let phase=0,creates=0,publishes=0;
  const bodies:Record<string,string>[]=[];
  let telegramBody:any;
  globalThis.fetch=(async (url:any,init:any)=>{
    const u=new URL(String(url));
    if(u.hostname==="api.telegram.org") {
      assert.ok(u.pathname.endsWith("/sendMediaGroup")); telegramBody=JSON.parse(init.body);
      return Response.json({ok:true,result:[{message_id:1,chat:{username:"test"}}]});
    }
    assert.equal(u.hostname,"graph.instagram.com");
    if(init.method==="POST") {
      const body=Object.fromEntries(new URLSearchParams(init.body));
      if(u.pathname.endsWith("/media_publish")){publishes++;assert.equal(body.creation_id,"parent");return Response.json({id:"published"});}
      bodies.push(body);creates++;
      return Response.json({id:creates===3?"parent":`child-${creates}`});
    }
    if(u.searchParams.has("fields") && u.searchParams.get("fields")==="permalink") return Response.json({permalink:"https://instagram.test/p/1"});
    if(u.pathname.endsWith("/child-2"))return Response.json({status_code:phase?"FINISHED":"IN_PROGRESS"});
    assert.ok(u.pathname.endsWith("/parent")); return Response.json({status_code:"FINISHED"});
  }) as typeof fetch;
  try {
    let saved:any={},state:any={};
    const save=async(s:any)=>{saved=structuredClone(s);};
    await assert.rejects(()=>publish(source as any,account,assets,state,save),(e:any)=>e instanceof PublishError&&e.retryable&&!e.ambiguous);
    assert.equal(creates,2);assert.equal(publishes,0);assert.deepEqual(saved.children,["child-1","child-2"]);
    assert.ok(bodies[0].image_url);assert.equal(bodies[1].media_type,"VIDEO");assert.equal(bodies[1].is_carousel_item,"true");assert.ok(bodies[1].video_url);
    phase=1;
    const result=await publish(source as any,account,assets,saved,save);
    assert.equal(creates,3);assert.equal(publishes,1);assert.equal(result.external_id,"published");
    assert.equal(bodies[2].media_type,"CAROUSEL");assert.equal(bodies[2].children,"child-1,child-2");
    await publish(source as any,{...account,platform:"telegram",external_id:"@test"},assets,{},async()=>{});
    assert.deepEqual(telegramBody.media.map((m:any)=>m.type),["photo","video"]);
    assert.equal(telegramBody.media[1].supports_streaming,true);assert.equal(telegramBody.media[0].caption,source.caption);
  } finally {globalThis.fetch=nativeFetch;}
});

test("authenticated API renders real audio slides, blocks premature publishing and recovers local work", {skip:!process.env.MEDIA_TEST_PGLITE_PATH}, async () => {
  process.env.DATABASE_URL="postgresql://local-test/not-used";
  process.env.OPENAI_API_KEY="local-test-placeholder";
  process.env.ADMIN_PASSWORD="carousel-test-secret";
  process.env.APP_URL="https://media.test";
  const {PGlite}=await import(process.env.MEDIA_TEST_PGLITE_PATH!);
  const db=new PGlite();
  const {pool}=await import("../../db");
  const oldQuery=pool.query,oldConnect=pool.connect,nativeFetch=globalThis.fetch;
  const query=async(sql:string,args?:any[])=>{
    if(sql.includes("pg_try_advisory_lock")) return {rows:[{locked:true}],rowCount:1};
    if(sql.includes("pg_advisory")) return {rows:[],rowCount:1};
    if(!args&&sql.trim().split(";").filter(Boolean).length>1){await db.exec(sql);return {rows:[],rowCount:0};}
    const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows?.length||0};
  };
  pool.query=query as any;pool.connect=(async()=>({query,release(){}})) as any;
  const {ensureMediaTables}=await import("./schema");await ensureMediaTables(pool);
  const {hashToken}=await import("./security");
  await query("INSERT INTO media_sessions(token_hash,expires_at) VALUES($1,now()+interval '1 hour')",[hashToken("carousel-test-session")]);
  const express=(await import("express")).default;
  const {registerMediaRoutes}=await import("./routes");
  const {processCarouselAudio}=await import("./carousel-audio");
  const {renderCarouselAudio}=await import("./carousel-audio-render");
  const app=express();app.use(express.json());registerMediaRoutes(app);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.on("listening",r));
  const origin=`http://127.0.0.1:${(server.address() as any).port}`;
  globalThis.fetch=(async(url:any,init:any)=>{if(String(url).startsWith(origin))return nativeFetch(url,init);throw new Error("External calls blocked");}) as typeof fetch;
  const request=async(path:string,method="GET",body?:any,extra:Record<string,string>={})=>{
    const r=await fetch(origin+path,{method,headers:{Authorization:"Bearer carousel-test-session","Content-Type":"application/json",...extra},...(body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)})});
    return {status:r.status,data:await r.json() as any};
  };
  const dir=await mkdtemp(join(tmpdir(),"carousel-test-")),run=promisify(execFile);
  try {
    assert.equal((await nativeFetch(origin+`/api/media/posts/${randomUUID()}/carousel-audio`)).status,401);
    const images:Buffer[]=[];
    for(const color of ["red","blue"]){
      const path=join(dir,`${color}.png`);
      await run("ffmpeg",["-v","error","-y","-f","lavfi","-i",`color=c=${color}:s=160x200`,"-frames:v","1","-threads","1",path]);images.push(await readFile(path));
    }
    const musicPath=join(dir,"test.mp3");
    await run("ffmpeg",["-v","error","-y","-f","lavfi","-i","sine=frequency=660:duration=5","-c:a","libmp3lame",musicPath]);
    const music=await readFile(musicPath);
    const assetIds:string[]=[];
    for(let i=0;i<3;i++){
      const r=await request("/api/media/assets","POST",i===2?music:images[i],{"Content-Type":i===2?"audio/mpeg":"image/png","X-File-Name":i===2?"test.mp3":`slide-${i}.png`});
      assert.equal(r.status,201);assetIds.push(r.data.id);
    }
    const input={...source,asset_ids:assetIds.slice(0,2),variants:{carousel_audio:{...audio,music_id:assetIds[2]}}};
    let post=(await request("/api/media/posts","POST",input)).data;
    const path=`/api/media/posts/${post.id}/carousel-audio`;
    const account=(await query("INSERT INTO media_accounts(platform,name,external_id,verified_at) VALUES('instagram','Test','ig-local',now()) RETURNING id")).rows[0] as any;
    const schedule=()=>request(`/api/media/posts/${post.id}/schedule`,"POST",{account_ids:[account.id],scheduled_at:new Date(Date.now()+600000).toISOString()});
    assert.equal((await schedule()).status,400);
    assert.equal((await request(path,"PUT",{audio:input.variants.carousel_audio,updated_at:"2000-01-01T00:00:00.000Z"})).status,409);
    const queued=await request(path+"/render","POST",{updated_at:post.updated_at});assert.equal(queued.status,202);
    assert.equal((await request(path+"/render","POST",{updated_at:post.updated_at})).data.id,queued.data.id);
    assert.equal((await request(`/api/media/posts/${post.id}`,"PATCH",input)).status,409);
    assert.equal((await request(`/api/media/posts/${post.id}`,"DELETE")).status,409);
    assert.equal((await request(`/api/media/assets/${assetIds[2]}`,"DELETE")).status,409);
    assert.equal((await schedule()).status,409);
    // Simulate an interrupted local render. Recovery creates one ordered output set.
    await query("UPDATE media_jobs SET status='running',started_at=now()-interval '21 minutes' WHERE id=$1",[queued.data.id]);
    await processCarouselAudio();
    const status=(await request(path)).data;assert.equal(status.ready,true,JSON.stringify(status));assert.equal(status.job.status,"completed");assert.equal(status.output_ids.length,2);
    const outputs=(await query("SELECT * FROM media_assets WHERE id=ANY($1::uuid[])",[status.output_ids])).rows as any[];
    for(let i=0;i<2;i++){
      const path=join(dir,`output-${i}.mp4`);await writeFile(path,outputs.find(o=>o.id===status.output_ids[i]).data);
      const info=JSON.parse((await run("ffprobe",["-v","error","-show_streams","-show_format","-of","json",path])).stdout);
      const video=info.streams.find((s:any)=>s.codec_type==="video"),sound=info.streams.find((s:any)=>s.codec_type==="audio");
      assert.equal(video.codec_name,"h264");assert.equal(video.width,1080);assert.equal(video.height,1350);assert.equal(sound.codec_name,"aac");
      assert.ok(Math.abs(Number(info.format.duration)-3)<0.1);
      const frame=await run("ffmpeg",["-v","error","-i",path,"-frames:v","1","-vf","scale=1:1","-f","rawvideo","-pix_fmt","rgb24","pipe:1"],{encoding:"buffer"});
      assert.ok(i===0?frame.stdout[0]>frame.stdout[2]+100:frame.stdout[2]>frame.stdout[0]+100,"source slide order preserved");
      const pcm=await run("ffmpeg",["-v","error","-i",path,"-map","0:a:0","-f","f32le","-ac","1","pipe:1"],{encoding:"buffer",maxBuffer:2*1024*1024});
      let energy=0;for(let k=0;k<pcm.stdout.length;k+=4)energy+=pcm.stdout.readFloatLE(k)**2;
      const rms=Math.sqrt(energy/(pcm.stdout.length/4));assert.ok(rms>0.005&&rms<0.03,`audible music at selected volume: ${rms}`);
    }
    post=(await query("SELECT * FROM media_posts WHERE id=$1",[post.id])).rows[0];
    assert.equal((await request(path+"/render","POST",{updated_at:post.updated_at})).data.reused,true);
    await processCarouselAudio();assert.equal((await query("SELECT count(*)::int AS n FROM media_assets WHERE mime_type='video/mp4'")).rows[0].n,2);
    assert.equal((await schedule()).status,200);
    assert.equal((await request(path,"PUT",{audio:input.variants.carousel_audio,updated_at:post.updated_at})).status,409);
    await query("UPDATE media_deliveries SET status='cancelled' WHERE post_id=$1",[post.id]);
    const changed={...input.variants.carousel_audio,volume_percent:40};
    const saved=await request(path,"PUT",{audio:changed,updated_at:post.updated_at});assert.equal(saved.status,200);
    assert.equal((await request(path)).data.ready,false);assert.equal((await schedule()).status,400);
    await assert.rejects(()=>renderCarouselAudio(images.map(data=>({mime_type:"image/png",data})),music,{...changed,start_seconds:4}),/kesmasi fayldan uzun/);
    await assert.rejects(()=>renderCarouselAudio(images.map(data=>({mime_type:"image/png",data})),Buffer.from("broken mp3"),changed),/MP3 faylini/);

    // Native photo music is completed in Instagram. The package must not be
    // silently scheduled as a video carousel or reported as a published post.
    post=(await query("SELECT * FROM media_posts WHERE id=$1",[post.id])).rows[0];
    const nativePath=`/api/media/posts/${post.id}/carousel-native`;
    const nativeSettings={music_title:"One common Instagram track",music_url:"",start_seconds:0};
    assert.equal((await nativeFetch(origin+nativePath+"/package")).status,401);
    assert.equal((await request(nativePath,"PUT",{settings:nativeSettings,updated_at:post.updated_at},{Origin:"https://evil.test"})).status,403);
    assert.equal((await request(nativePath,"PUT",{settings:nativeSettings,updated_at:"2000-01-01T00:00:00.000Z"})).status,409);
    const nativeSaved=await request(nativePath,"PUT",{settings:nativeSettings,updated_at:post.updated_at});assert.equal(nativeSaved.status,200);
    post=(await query("SELECT * FROM media_posts WHERE id=$1",[post.id])).rows[0];
    assert.equal(post.variants.carousel_audio,undefined);assert.equal(post.variants.carousel_audio_output,undefined);
    assert.equal(post.variants.carousel_native.music_title,nativeSettings.music_title);
    const blocked=await schedule();assert.equal(blocked.status,400);assert.match(blocked.data.error,/Instagram ilovasida/);
    assert.equal((await request(path+"/render","POST",{updated_at:post.updated_at})).status,422);
    const {publish}=await import("./providers");
    await assert.rejects(()=>publish(post,{id:account.id,platform:"instagram",external_id:"ig-local",credentials:null},[],{},async()=>{}),/Instagram ilovasida/);
    const download=await fetch(origin+nativePath+"/package",{headers:{Authorization:"Bearer carousel-test-session"}});
    assert.equal(download.status,200);assert.match(download.headers.get("content-disposition")!,/instagram-foto-karusel.zip/);
    const zipPath=join(dir,"native-api.zip");await writeFile(zipPath,Buffer.from(await download.arrayBuffer()));
    const files=(await run("unzip",["-Z1",zipPath])).stdout;
    assert.ok(files.includes("01-slayd.png")&&files.includes("02-slayd.png")&&!files.includes(".mp4"));
    const original=(await run("unzip",["-p",zipPath,"01-slayd.png"],{encoding:"buffer"})).stdout;
    assert.deepEqual(original,images[0]);
    assert.equal((await query("SELECT count(*)::int AS n FROM media_jobs WHERE kind='carousel_audio'")).rows[0].n,1);
    const legacy=await request(path,"PUT",{audio:changed,updated_at:post.updated_at});assert.equal(legacy.status,200);
    post=(await query("SELECT * FROM media_posts WHERE id=$1",[post.id])).rows[0];assert.equal(post.variants.carousel_native,undefined);
  } finally {
    globalThis.fetch=nativeFetch;pool.query=oldQuery;pool.connect=oldConnect;
    await new Promise<void>(r=>server.close(()=>r()));await db.close();await rm(dir,{recursive:true,force:true});
  }
});
