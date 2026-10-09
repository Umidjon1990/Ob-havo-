import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://unused:unused@127.0.0.1:1/unused';
process.env.OPENAI_API_KEY ||= 'test-not-a-real-key';
const {pool}=await import('../../db');
const {seal}=await import('./security');
const {loadMscPackage}=await import('./explainer-package');
const {publicationVariants,missingPublicationAccounts,processMscPublication}=await import('./explainer-publication');
const {platformPost,postSchema,validatePublication}=await import('../../../shared/media');
const {executeMscCommand,commandSchema}=await import('./explainer-command');

test('Telegram uses a single rich article with all links, YouTube keeps video format, cancellations remain cancelled',async()=>{
 const item=(await loadMscPackage())[0];const video='11111111-1111-4111-8111-000000000001';
 const variants=publicationVariants({variants:{telegram:item.publication.caption},caption:''},video,video,4);
 const post=postSchema.parse({title:'Dars',format:'video',asset_ids:[video],variants});
 assert.equal(platformPost(post,'telegram').format,'article');assert.equal(platformPost(post,'youtube').format,'video');
 assert.equal(validatePublication(platformPost(post,'telegram'),'telegram',['video/mp4']),null);
 assert.equal((variants.telegram.match(/href=/g)||[]).length,18);assert.ok(variants.telegram.includes(`{{asset:${video}}}`));
 assert.deepEqual(missingPublicationAccounts([{account_id:'tg',status:'published'}],['tg','yt']),['yt']);
 assert.throws(()=>missingPublicationAccounts([{account_id:'tg',status:'cancelled'}],['tg','yt']),/Bekor/);
});
test('an existing deployment command receipt prevents any preparation or paid queue calls',async()=>{
 let called=0;
 const c={query:async()=>({rows:[{id:'receipt'}]})};
 const command=commandSchema.parse({command_id:'MSC-OCTOBER-2026-PREPARE-SCHEDULE-V1',operation:'prepare_and_schedule',approved:true,authorized_at:'2026-10-09',source:'User explicitly requested preparation and Telegram/YouTube scheduling through server code'});
 const result=await executeMscCommand(c,command,async()=>{called++;throw Error('must not run');},async()=>{called++;},async()=>{called++;});
 assert.deepEqual(result,{duplicate:true});assert.equal(called,0);
});
test('automatic scheduling waits for real videos, rejects the other Telegram channel and reconciles 18 deliveries without duplication',async()=>{
 const originalConnect=pool.connect,originalQuery=pool.query,originalFetch=globalThis.fetch;
 const savedEnv={MEDIA_ENCRYPTION_KEY:process.env.MEDIA_ENCRYPTION_KEY,GOOGLE_CLIENT_ID:process.env.GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET:process.env.GOOGLE_CLIENT_SECRET,TELEGRAM_BOT_TOKEN:process.env.TELEGRAM_BOT_TOKEN,YOUTUBE_CHANNEL_ID:process.env.YOUTUBE_CHANNEL_ID};
 Object.assign(process.env,{MEDIA_ENCRYPTION_KEY:'test-encryption',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',TELEGRAM_BOT_TOKEN:'test',YOUTUBE_CHANNEL_ID:'UCU-0JeoKAGUIYCNMtiyc2Tg'});
 const items=await loadMscPackage();const id=(n:number)=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
 const posts=items.map((i,n)=>({id:id(n+1),title:i.plan.title,caption:i.publication.caption,format:'video',asset_ids:[id(n+20)],variants:{explainer:i.plan,explainer_video_id:id(n+20),telegram:i.publication.caption,youtube:i.publication.description}}));
 const job:any={id:'command',status:'queued',payload:{post_ids:posts.map(p=>p.id)}};
 const accounts=[{id:id(80),platform:'telegram',external_id:'wrong',enabled:true,verified_at:'now'},{id:id(81),platform:'youtube',external_id:'UCU-0JeoKAGUIYCNMtiyc2Tg',enabled:true,verified_at:'now',credentials:seal({refresh_token:'test-refresh',scope:'https://www.googleapis.com/auth/youtube.force-ssl'})}];
 const deliveries:any[]=[];let apiCalls=0;
 const query=async(sql:string,args:any[]=[]):Promise<any>=>{
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
  if(sql.startsWith('SELECT * FROM media_jobs'))return {rows:['queued','running'].includes(job.status)?[job]:[]};
  if(sql.startsWith('SELECT 1 FROM media_jobs'))return {rows:[],rowCount:0};
  if(sql.startsWith('SELECT * FROM media_posts'))return {rows:posts.filter(p=>args[0].includes(p.id))};
  if(sql.startsWith('SELECT * FROM media_accounts'))return {rows:args.length?accounts.filter(a=>args[0].includes(a.id)):accounts};
  if(sql.startsWith('SELECT account_id,status'))return {rows:deliveries.filter(d=>d.post_id===args[0])};
  if(sql.startsWith('SELECT 1 FROM media_deliveries'))return {rows:[],rowCount:deliveries.filter(d=>d.post_id===args[0]&&args[1].includes(d.account_id)).length};
  if(sql.startsWith('SELECT id,mime_type'))return {rows:args[0].map((id:string)=>({id,mime_type:'video/mp4'}))};
  if(sql.startsWith('UPDATE media_posts')){posts.find(p=>p.id===args[0])!.variants=JSON.parse(args[1]);return {rows:[]};}
  if(sql.startsWith('INSERT INTO media_deliveries')){deliveries.push({post_id:args[0],account_id:args[1],scheduled_at:args[2],status:'scheduled'});return {rows:[]};}
  if(sql.startsWith('UPDATE media_jobs')){job.status=sql.includes("status='completed'")?'completed':sql.includes("status='failed'")?'failed':'running';job.error=args[1];return {rows:[]};}
  return {rows:[]};
 };
 (pool as any).query=query;(pool as any).connect=async()=>({query,release(){}});
 globalThis.fetch=(async(input:any)=>{apiCalls++;const url=String(input);let body:any;
  if(url.endsWith('/getChat'))body={ok:true,result:{id:-100123,type:'channel',title:'Requested'}};
  else if(url.endsWith('/getMe'))body={ok:true,result:{id:42}};
  else if(url.endsWith('/getChatMember'))body={ok:true,result:{status:'administrator',can_post_messages:true}};
  else if(url.includes('oauth2.googleapis.com'))body={access_token:'test-access',scope:'https://www.googleapis.com/auth/youtube.force-ssl'};
  else if(url.includes('/channels?'))body={items:[{id:'UCU-0JeoKAGUIYCNMtiyc2Tg',snippet:{title:'Umidjon'}}]};
  else if(url.includes('/playlists?'))body={items:[{id:'PLbs1Yk6LVu5Q',snippet:{channelId:'UCU-0JeoKAGUIYCNMtiyc2Tg',title:'MSC'},status:{privacyStatus:'public'},contentDetails:{itemCount:3}}]};
  else throw Error('Unexpected provider call');
  return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
 }) as any;
 try{
  const video=posts[0].variants.explainer_video_id;delete (posts[0].variants as any).explainer_video_id;
  await processMscPublication();assert.equal(apiCalls,0);assert.equal(deliveries.length,0);assert.equal(job.status,'queued');posts[0].variants.explainer_video_id=video;
  await processMscPublication();assert.equal(job.status,'failed');assert.match(job.error,/Platformalar/);assert.equal(deliveries.length,0);
  accounts[0].external_id='-100123';job.status='queued';await processMscPublication();assert.equal(job.status,'completed');assert.equal(deliveries.length,18);
  assert.ok(deliveries.every(d=>d.scheduled_at.endsWith('14:00:00+05:00')));
  assert.deepEqual(posts.map(p=>(p.variants as any).youtube_playlist.position),[4,5,6,7,8,9,10,11,12]);
  job.status='running';await processMscPublication();assert.equal(job.status,'completed');assert.equal(deliveries.length,18);
 }finally{pool.connect=originalConnect;pool.query=originalQuery;globalThis.fetch=originalFetch;for(const [key,value] of Object.entries(savedEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
