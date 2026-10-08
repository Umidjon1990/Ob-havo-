import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { automationSchema, keywordMatch, withinWindow } from '../../../shared/media-growth';
import { postSchema, platformPost, campaignSchema } from '../../../shared/media';
process.env.DATABASE_URL ||= 'postgres://unused:unused@127.0.0.1:1/unused';
process.env.OPENAI_API_KEY ||= 'test-not-a-real-key';
const {validWebhook,parseInstagramEvents,registerGrowthRoutes}=await import('./growth');
const {probeChecks}=await import('./quality');
test('keyword matching handles Uzbek apostrophes and whole words without incidental matches',()=>{
  assert.equal(keywordMatch('Menga LUGAT kerak',['LUG‘AT']),true);
  assert.equal(keywordMatch('Lug\'at yuboring',['lug‘at']),true);
  assert.equal(keywordMatch('kurslar',['kurs']),false);
  assert.equal(keywordMatch('kitob narxi?',['kitob narxi']),true);
  assert.equal(keywordMatch('salom',['']),false);
  for(const text of ['Qomus','QOMUS','qomus','QoMuS!'])assert.equal(keywordMatch(text,['QOMUS']),true);
});
test('automation refuses empty answers and invalid message actions',()=>{
  const v={account_id:'11111111-1111-4111-8111-111111111111',title:'Lugat',trigger:'message',keywords:['lugat'],action:'reply',response:'Material: https://example.org'};
  assert.ok(automationSchema.safeParse(v).success);
  assert.equal(automationSchema.safeParse({...v,response:''}).success,false);
  assert.equal(automationSchema.safeParse({...v,action:'private_reply'}).success,false);
  assert.equal(automationSchema.safeParse({...v,action:'hide'}).success,false);
  assert.equal(automationSchema.parse(v).enabled,false);
  assert.equal(automationSchema.parse(v).require_follow,false);
  assert.ok(automationSchema.safeParse({...v,require_follow:true}).success);
  assert.equal(automationSchema.safeParse({...v,trigger:'comment',require_follow:true}).success,false);
  assert.equal(automationSchema.safeParse({...v,media_id:'333'}).success,false);
});
test('webhook validates raw bytes and rejects modified, unsigned or wrong-secret requests',()=>{
  const body=Buffer.from('{"object":"instagram"}'),secret='test-webhook-secret';
  const signature='sha256='+createHmac('sha256',secret).update(body).digest('hex');
  assert.equal(validWebhook(body,signature,secret),true);
  assert.equal(validWebhook(Buffer.from('{}'),signature,secret),false);
  assert.equal(validWebhook(body,signature,'wrong'),false);
  assert.equal(validWebhook(body,'',secret),false);
  assert.equal(validWebhook(body,'sha256=00',secret),false);
});
test('events ignore echoes, dedupe by stable provider id and preserve comment media',()=>{
  const entry={time:1791264000,changes:[{field:'comments',value:{id:'123',text:'LUGAT',from:{id:'456'},media:{id:'789'}}}],messaging:[{timestamp:1791264000000,sender:{id:'456'},message:{mid:'a',text:'Salom'}},{timestamp:1791264000000,sender:{id:'456'},message:{mid:'b',text:'Echo',is_echo:true}}]};
  const events=parseInstagramEvents(entry);assert.equal(events.length,2);assert.equal(events[0].media_id,'789');assert.equal(events[0].key,'comment:123');
  assert.equal(events[0].occurred_at.getTime(),1791264000000);
  assert.equal(parseInstagramEvents({...entry,time:1791264000000})[0].occurred_at.getTime(),1791264000000);
  assert.deepEqual(parseInstagramEvents(entry).map(e=>e.key),events.map(e=>e.key));
  assert.equal(parseInstagramEvents({messaging:[{sender:{id:'1'},message:{mid:'z',text:'x'}}]}).length,0);
});
test('follow button payload selects the request independently of visible title',()=>{
  const message={mid:'tap-1',text:'✅ Obuna bo‘ldim',quick_reply:{payload:'FOLLOW_CHECK:ABCDEF1234'}};
  const entry={messaging:[{timestamp:Date.now(),sender:{id:'900'},message}]};
  const tap=parseInstagramEvents(entry)[0];
  assert.equal(tap.text,'OBUNA ABCDEF1234');assert.equal(tap.sender_id,'900');assert.equal(tap.key,'message:tap-1');
  assert.equal(parseInstagramEvents({messaging:[{...entry.messaging[0],message:{...message,quick_reply:{payload:'FOLLOW_CHECK:broken'}}}]})[0].text,'INVALID_FOLLOW_CHECK');
});
test('reply windows reject expired and future events at exact boundaries',()=>{
  const now=1791264000000;
  assert.equal(withinWindow('comment',new Date(now-6*86400000),now),true);
  assert.equal(withinWindow('comment',new Date(now-7*86400000),now),false);
  assert.equal(withinWindow('message',new Date(now-86400000),now),false);
  assert.equal(withinWindow('message',new Date(now+120000),now),false);
});
test('platform packages keep independent media without modifying master, and monthly counts accept 8/12',()=>{
  const p=postSchema.parse({title:'Test',format:'video',asset_ids:['11111111-1111-4111-8111-111111111111'],variants:{telegram_asset_ids:['22222222-2222-4222-8222-222222222222']}});
  assert.equal(platformPost(p,'telegram').asset_ids[0],'22222222-2222-4222-8222-222222222222');assert.equal(platformPost(p,'instagram').asset_ids[0],p.asset_ids[0]);assert.equal(p.asset_ids[0],'11111111-1111-4111-8111-111111111111');
  for(const count of [8,12,30])assert.ok(campaignSchema.safeParse({topic:'Arab tili',count,month:'2026-11',format:'video'}).success);
  assert.equal(campaignSchema.safeParse({topic:'Arab tili',count:32,month:'2026-11',format:'video'}).success,false);
});
test('quality separates resolution recommendations from missing video errors',()=>{
  const p={streams:[{codec_type:'video',codec_name:'h264',width:720,height:1280},{codec_type:'audio',codec_name:'aac'}]};
  assert.equal(probeChecks('video/mp4',p,'telegram').find(c=>c.label==='Tasvir aniqligi')?.level,'pass');
  assert.equal(probeChecks('video/mp4',p,'instagram').find(c=>c.label==='Tasvir aniqligi')?.level,'warning');
  assert.ok(probeChecks('video/mp4',{streams:[]},'instagram').some(c=>c.level==='error'));
});
test('admin growth endpoints reject unauthenticated writes without contacting Instagram',async()=>{
  const express=(await import('express')).default,app=express();app.use(express.json());registerGrowthRoutes(app);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  try{const port=(server.address() as any).port;const r=await fetch(`http://127.0.0.1:${port}/api/media/growth/rules`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,401);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('durable webhook deduplication, approved Direct answer and missing-metric isolation', {skip:!process.env.MEDIA_TEST_PGLITE_PATH},async()=>{
  const {PGlite}=await import(process.env.MEDIA_TEST_PGLITE_PATH!);const db=new PGlite();
  const {pool}=await import('../../db');const {ensureMediaTables}=await import('./schema');
  const {seal,hashToken}=await import('./security');const {processInteractions,processInsights}=await import('./growth');
  const query=async(text:string,values?:any[])=>{
    if(!values&&text.trim().split(';').filter(Boolean).length>1){await db.exec(text);return {rows:[],rowCount:0};}
    const r=await db.query(text,values);return {...r,rowCount:r.affectedRows||r.rows?.length||0};
  };
  (pool as any).query=query;(pool as any).connect=async()=>({query,release(){}});
  process.env.ADMIN_PASSWORD='test-password';process.env.APP_URL='https://example.org';
  await ensureMediaTables(pool);await ensureMediaTables(pool);
  assert.ok((await pool.query("SELECT 1 FROM media_rules WHERE seed_key='visual-cartoon-v2'")).rowCount);
  const a=(await pool.query("INSERT INTO media_accounts(platform,name,external_id,credentials,verified_at) VALUES('instagram','Test','111',$1,now()) RETURNING id",[seal({access_token:'test-ig-token'})])).rows[0];
  const secret='test-webhook-secret';await pool.query('INSERT INTO media_automation_config(id,secrets) VALUES(1,$1)',[seal({app_secret:secret,verify_token:'long-verify-token-for-tests'})]);
  await pool.query("INSERT INTO media_automations(account_id,title,trigger,keywords,action,response,enabled) VALUES($1,'Lugat','comment',$2,'private_reply','https://example.org/material',true)",[a.id,JSON.stringify(['lugat'])]);
  await pool.query("INSERT INTO media_automations(account_id,title,trigger,keywords,action,response,enabled) VALUES($1,'Kurs','message',$2,'reply','Tasdiqlangan dars jadvali',true)",[a.id,JSON.stringify(['kurs'])]);
  const express=(await import('express')).default,app=express();app.use(express.json({verify(req,_res,b){(req as any).rawBody=b;}}));registerGrowthRoutes(app);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const origin=`http://127.0.0.1:${(server.address() as any).port}`,nativeFetch=globalThis.fetch;const sent:any[]=[];
  let profileId='111',subscriptionSuccess=true;
  globalThis.fetch=(async(url:any,init:any)=>{
    if(String(url).startsWith(origin))return nativeFetch(url,init);
    if(String(url).includes('me?fields=id,user_id,username'))return Response.json({id:profileId,user_id:'777',username:'Test'});
    if(String(url).includes('/777/subscribed_apps'))return Response.json(init?.method==='POST'?{success:subscriptionSuccess}:{data:[{id:'meta-app',name:'Test app',subscribed_fields:['comments','messages']}]});
    if(init?.method==='POST'){sent.push(JSON.parse(init.body));return Response.json({message_id:'sent'});}
    if(String(url).includes('metric=views'))return Response.json({error:{code:100}},{status:400});
    return Response.json({data:[{values:[{value:12}]}]});
  }) as any;
  try{
    const payload=JSON.stringify({object:'instagram',entry:[{id:'111',time:Math.floor(Date.now()/1000),changes:[{field:'comments',value:{id:'444',text:'LUG‘AT',from:{id:'222'},media:{id:'333'}}}]}]});
    const headers={'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+createHmac('sha256',secret).update(payload).digest('hex')};
    assert.equal((await nativeFetch(`${origin}/api/instagram/webhook`,{method:'POST',headers:{'Content-Type':'application/json'},body:payload})).status,403);
    for(let i=0;i<2;i++)assert.equal((await nativeFetch(`${origin}/api/instagram/webhook`,{method:'POST',headers,body:payload})).status,200);
    assert.equal((await pool.query('SELECT * FROM media_interactions')).rows.length,1);
    await processInteractions();await processInteractions();assert.equal(sent.length,1);assert.deepEqual(sent[0].recipient,{comment_id:'444'});
    const msg=JSON.stringify({object:'instagram',entry:[{id:'111',messaging:[{timestamp:Date.now(),sender:{id:'222'},message:{mid:'dm-1',text:'KURS haqida'}}]}]});
    await nativeFetch(`${origin}/api/instagram/webhook`,{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+createHmac('sha256',secret).update(msg).digest('hex')},body:msg});
    await processInteractions();assert.equal(sent.length,2);assert.equal(sent[1].message.text,'Tasdiqlangan dars jadvali');
    const p=(await pool.query("INSERT INTO media_posts(title,caption,format) VALUES('Test','Hook','video') RETURNING id")).rows[0];
    const d=(await pool.query("INSERT INTO media_deliveries(post_id,account_id,scheduled_at,status,external_id,published_at) VALUES($1,$2,now(),'published','999',now()) RETURNING id",[p.id,a.id])).rows[0];
    await pool.query("INSERT INTO media_jobs(kind,payload) VALUES('instagram_insights',$1)",[{account_id:a.id}]);await processInsights();
    const metrics=(await pool.query('SELECT * FROM media_insights WHERE delivery_id=$1',[d.id])).rows[0];assert.equal(metrics.metrics.saved,12);assert.equal(metrics.metrics.views,undefined);assert.ok(metrics.errors.views);

    // A real Meta profile can establish the professional ID without changing the
    // publishing ID, token, or reply rules. An unrelated token cannot bind it.
    const session='test-admin-session-for-webhook-diagnostics';
    await pool.query("INSERT INTO media_sessions(token_hash,expires_at) VALUES($1,now()+interval '1 hour')",[hashToken(session)]);
    const adminHeaders={'Content-Type':'application/json',Authorization:`Bearer ${session}`};
    const checkUrl=`${origin}/api/media/growth/connection-check`;
    assert.equal((await nativeFetch(checkUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account_id:a.id})})).status,401);
    profileId='999';
    assert.equal((await nativeFetch(checkUrl,{method:'POST',headers:adminHeaders,body:JSON.stringify({account_id:a.id})})).status,409);
    assert.equal((await pool.query('SELECT instagram_user_id FROM media_accounts WHERE id=$1',[a.id])).rows[0].instagram_user_id,null);
    profileId='111';
    const checked=await nativeFetch(checkUrl,{method:'POST',headers:adminHeaders,body:JSON.stringify({account_id:a.id})});
    assert.equal(checked.status,200);const connection=await checked.json();assert.equal(connection.identity.user_id,'777');assert.deepEqual(connection.apps[0].fields,['comments','messages']);
    const bound=(await pool.query('SELECT * FROM media_accounts WHERE id=$1',[a.id])).rows[0];assert.equal(bound.external_id,'111');assert.equal(bound.instagram_user_id,'777');assert.ok(bound.credentials);
    async function callback(entry:any){
      const raw=JSON.stringify({object:'instagram',entry:[entry]});
      const h={'Content-Type':'application/json','X-Hub-Signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')};
      const r=await nativeFetch(`${origin}/api/instagram/webhook`,{method:'POST',headers:h,body:raw});assert.equal(r.status,200);
    }
    const comment={id:'777',time:Math.floor(Date.now()/1000),changes:[{field:'comments',value:{id:'555',text:'Salom: private test text',from:{id:'222'},media:{id:'333'}}}]};
    await callback(comment);await callback(comment);
    assert.equal((await pool.query("SELECT 1 FROM media_interactions WHERE external_id='555'")).rowCount,1);
    let receipt=(await pool.query('SELECT last_receipt FROM media_automation_config')).rows[0].last_receipt;
    assert.equal(receipt.matched,1);assert.equal(receipt.stored,0);assert.equal(receipt.duplicates,1);
    assert.equal(JSON.stringify(receipt).includes('private test text'),false);assert.equal(JSON.stringify(receipt).includes('222'),false);
    await callback({id:'888',time:comment.time,changes:comment.changes});
    receipt=(await pool.query('SELECT last_receipt FROM media_automation_config')).rows[0].last_receipt;assert.equal(receipt.unmatched,1);assert.equal(receipt.stored,0);
    await callback({...comment,changes:[{field:'comments',value:{...comment.changes[0].value,id:'556',from:{id:'777'}}}]});
    assert.equal((await pool.query("SELECT 1 FROM media_interactions WHERE external_id='556'")).rowCount,0);
    receipt=(await pool.query('SELECT last_receipt FROM media_automation_config')).rows[0].last_receipt;assert.equal(receipt.self,1);
    const panel=await nativeFetch(`${origin}/api/media/growth`,{headers:adminHeaders});const panelData=await panel.json();assert.equal(panel.status,200);assert.equal(panelData.webhook.last_receipt.self,1);
    assert.equal(JSON.stringify(panelData).includes(secret),false);assert.equal(JSON.stringify(panelData).includes('test-ig-token'),false);
    subscriptionSuccess=false;
    assert.equal((await nativeFetch(`${origin}/api/media/growth/subscribe`,{method:'POST',headers:adminHeaders,body:JSON.stringify({account_id:a.id})})).status,502);
    subscriptionSuccess=true;
    assert.equal((await nativeFetch(`${origin}/api/media/growth/subscribe`,{method:'POST',headers:adminHeaders,body:JSON.stringify({account_id:a.id})})).status,200);
    assert.equal(sent.length,2);
  }finally{globalThis.fetch=nativeFetch;await new Promise<void>(r=>server.close(()=>r()));await db.close();}
});
test('automatic preflight reads a real vertical MP4 and rejects corrupt media',async()=>{
  const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const run=promisify(execFile);
  const {mkdtemp,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {automaticQuality}=await import('./quality');const dir=await mkdtemp(join(tmpdir(),'growth-test-'));try{
    const file=join(dir,'test.mp4');await run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=720x1280:r=24','-t','0.2','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-y',file],{timeout:20000});
    const checks=await automaticQuality([{mime_type:'video/mp4',data:await readFile(file)}],'telegram');assert.equal(checks.some(c=>c.level==='error'),false);assert.equal(checks.find(c=>c.label==='Vertikal format')?.level,'pass');
    assert.ok((await automaticQuality([{mime_type:'video/mp4',data:Buffer.from('invalid')}],'instagram')).some(c=>c.level==='error'));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('connection inspection is read-only and separates API comments from webhook receipt',async()=>{
  const {inspectInstagramConnection}=await import('./growth'),{seal}=await import('./security');
  process.env.ADMIN_PASSWORD||='test-password';
  const a={id:'11111111-1111-4111-8111-111111111111',platform:'instagram',external_id:'111',enabled:true,verified_at:new Date(),credentials:seal({access_token:'test-inspection-token'})};
  const original=globalThis.fetch,requests:string[]=[];let permissionFails=false;
  globalThis.fetch=(async(url:any,init:any)=>{
    assert.equal(init.method,'GET');requests.push(String(url));
    if(String(url).includes('me/permissions'))return permissionFails?Response.json({error:{code:100}},{status:400}):Response.json({data:[{permission:'instagram_business_manage_comments',status:'granted'}]});
    if(String(url).includes('/777/media?'))return Response.json({data:[{id:'333',caption:'Hook\nLesson',timestamp:new Date().toISOString()}]});
    if(String(url).includes('timestamp,from'))return Response.json({error:{code:100}},{status:400});
    if(String(url).includes('timestamp,username'))return Response.json({data:[{id:'444',text:'Salom 2',username:'student'},{id:'445',text:'Own comment',username:'Teacher'}]});
    throw new Error('Unexpected diagnostic API request');
  }) as any;
  try{
    const identity={profile_id:'111',user_id:'777',username:'teacher'};
    const result=await inspectInstagramConnection(a,identity);
    assert.equal(result.permissions.known,true);assert.equal(result.posts[0].title,'Hook');assert.equal(result.posts[0].comments[0].own,false);assert.equal(result.posts[0].comments[1].own,true);
    assert.equal(requests.length,4);assert.equal(JSON.stringify(result).includes('test-inspection-token'),false);
    permissionFails=true;
    const partial=await inspectInstagramConnection(a,identity);assert.equal(partial.permissions.known,false);assert.equal(partial.posts[0].comments.length,2);assert.ok(partial.errors.some(e=>e.startsWith('Token ruxsatlari:')));
  }finally{globalThis.fetch=original;}
});


test('post-scoped rules and strict follow gate bind Meta recipient, never release on unknown, and deliver once', {skip:!process.env.MEDIA_TEST_PGLITE_PATH},async()=>{
  const {PGlite}=await import(process.env.MEDIA_TEST_PGLITE_PATH!);const db=new PGlite();
  const {pool}=await import('../../db'),{ensureMediaTables}=await import('./schema');
  const {seal,hashToken}=await import('./security'),{processInteractions}=await import('./growth');
  const query=async(text:string,values?:any[])=>{
    if(!values&&text.trim().split(';').filter(Boolean).length>1){await db.exec(text);return {rows:[],rowCount:0};}
    const r=await db.query(text,values);return {...r,rowCount:r.affectedRows||r.rows?.length||0};
  };
  (pool as any).query=query;(pool as any).connect=async()=>({query,release(){}});
  process.env.ADMIN_PASSWORD='test-password';await ensureMediaTables(pool);await ensureMediaTables(pool);
  const a=(await pool.query("INSERT INTO media_accounts(platform,name,external_id,credentials,verified_at) VALUES('instagram','Test','111',$1,now()) RETURNING id",[seal({access_token:'test-follow-token'})])).rows[0];
  const b=(await pool.query("INSERT INTO media_accounts(platform,name,external_id,credentials,verified_at) VALUES('instagram','Other','777',$1,now()) RETURNING id",[seal({access_token:'test-other-token'})])).rows[0];
  await pool.query("INSERT INTO media_automations(account_id,title,trigger,keywords,action,response,enabled) VALUES($1,'General','comment',$2,'private_reply','General response',true)",[a.id,JSON.stringify(['lugat'])]);
  const session='test-follow-session';await pool.query("INSERT INTO media_sessions(token_hash,expires_at) VALUES($1,now()+interval '1 hour')",[hashToken(session)]);
  const express=(await import('express')).default,app=express();app.use(express.json());registerGrowthRoutes(app);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const origin=`http://127.0.0.1:${(server.address() as any).port}`,nativeFetch=globalThis.fetch,sent:any[]=[],reads:string[]=[];
  let follow:any=false,apiError=false,missingRecipient=false,ambiguousSend=false;
  globalThis.fetch=(async(url:any,init:any)=>{
    if(String(url).startsWith(origin))return nativeFetch(url,init);
    if(String(url).includes('fields=is_user_follow_business')){
      reads.push(String(url));return apiError?Response.json({error:{code:230}},{status:400}):Response.json({is_user_follow_business:follow});
    }
    assert.equal(init.method,'POST');
    const body=JSON.parse(init.body);sent.push(body);
    if(ambiguousSend)throw new Error('Connection interrupted after send');
    return Response.json({...(!missingRecipient?{recipient_id:'900'}:{}),message_id:'sent'});
  }) as any;
  const adminHeaders={'Content-Type':'application/json',Authorization:`Bearer ${session}`};
  const call=(path:string,method:string,body:any)=>nativeFetch(`${origin}/api/media/growth${path}`,{method,headers:adminHeaders,body:JSON.stringify(body)});
  const response='Private lesson: https://example.org/gated-lesson';
  const ruleInput={account_id:a.id,title:'Specific lesson',trigger:'comment',keywords:['lugat'],action:'private_reply',response,media_id:'333',enabled:true,require_follow:true};
  let n=0;
  const event=async(kind:'comment'|'message',text:string,sender='900',media='333',accountId=a.id)=>{
    const row=(await pool.query(`INSERT INTO media_interactions(account_id,event_key,kind,external_id,sender_id,media_id,text,occurred_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,now()) RETURNING *`,[accountId,`test:${++n}`,kind,String(400+n),sender,kind==='comment'?media:'',text])).rows[0];
    await processInteractions();return (await pool.query('SELECT * FROM media_interactions WHERE id=$1',[row.id])).rows[0];
  };
  const pending=async(sourceId:string)=>(await pool.query('SELECT * FROM media_follow_requests WHERE source_event_id=$1',[sourceId])).rows[0];
  try{
    const created=await call('/rules','POST',ruleInput);assert.equal(created.status,201);const rule=await created.json();assert.equal(rule.require_follow,true);
    assert.equal((await call(`/rules/${rule.id}`,'PUT',{...ruleInput,account_id:b.id})).status,404);
    const source=await event('comment','LUG‘AT','222');assert.equal(source.status,'awaiting_follow');assert.equal(sent.length,1);assert.equal(reads.length,0);
    assert.ok(!sent[0].message.text.includes('https:'));assert.deepEqual(sent[0].recipient,{comment_id:source.external_id});
    const p=await pending(source.id);assert.equal(p.recipient_id,'900');assert.equal(sent[0].message.quick_replies[0].payload,`FOLLOW_CHECK:${p.code}`);assert.equal(sent[0].message.text.includes(p.code),false);assert.notEqual(p.recipient_id,source.sender_id);
    // A stolen code or even the original comment-author ID cannot unlock a DM.
    await event('message',`OBUNA ${p.code}`,'222');await event('message',`OBUNA ${p.code}`,'901');await event('message',`OBUNA ${p.code}`,'900','',b.id);
    assert.equal(sent.length,1);assert.equal(reads.length,0);
    const tapText=(code:string)=>parseInstagramEvents({messaging:[{timestamp:Date.now(),sender:{id:'900'},message:{mid:'tap',text:'✅ Obuna bo‘ldim',quick_reply:{payload:`FOLLOW_CHECK:${code}`}}}]})[0].text;
    let e=await event('message',tapText(p.code));assert.equal(e.status,'awaiting_follow');assert.equal(sent.at(-1).message.text.includes(response),false);
    for(const value of [undefined,'true',1]){
      follow=value;e=await event('message',`OBUNA ${p.code}`);assert.equal(e.status,'follow_check_failed');assert.equal(sent.at(-1).message.text.includes('https:'),false);
    }
    apiError=true;e=await event('message','OBUNA');assert.equal(e.status,'follow_check_failed');assert.ok(e.error.includes('230'));assert.equal(sent.at(-1).message.text.includes('https:'),false);apiError=false;
    follow=true;e=await event('message',tapText(p.code));assert.equal(e.status,'handled');assert.equal(sent.at(-1).message.text,response);assert.equal(sent.at(-1).message.quick_replies,undefined);assert.deepEqual(sent.at(-1).recipient,{id:'900'});
    assert.ok(reads.every(url=>url.includes('/900?fields=')));assert.equal((await pending(source.id)).status,'delivered');
    const count=sent.length;await event('message',tapText(p.code));await processInteractions();assert.equal(sent.length,count);
    const wrongPost=await event('comment','LUGAT','222','444');assert.equal(wrongPost.response,'General response');
    const scope=(await call(`/rules/${rule.id}`,'PATCH',{enabled:false}));assert.equal(scope.status,200);
    let saved=(await pool.query('SELECT * FROM media_automations WHERE id=$1',[rule.id])).rows[0];assert.equal(saved.require_follow,true);assert.equal(saved.media_id,'333');
    await call(`/rules/${rule.id}`,'PATCH',{enabled:true});
    const multi1=await event('comment','LUGAT','222'),multi2=await event('comment','LUGAT','222');
    const request1=await pending(multi1.id),request2=await pending(multi2.id);
    await event('message','OBUNA');assert.equal(sent.at(-1).message.quick_replies.length,2);
    assert.deepEqual(new Set(sent.at(-1).message.quick_replies.map((v:any)=>v.payload)),new Set([`FOLLOW_CHECK:${request1.code}`,`FOLLOW_CHECK:${request2.code}`]));
    await event('message',tapText(request1.code));assert.equal((await pending(multi1.id)).status,'delivered');assert.equal((await pending(multi2.id)).status,'awaiting_follow');
    await event('message',tapText(request2.code));
    const oldSource=await event('comment','LUGAT','222'),old=await pending(oldSource.id);
    assert.equal((await call(`/rules/${rule.id}`,'PUT',{...ruleInput,title:'Edited lesson',response:'https://example.org/new-lesson'})).status,200);
    assert.equal((await pending(oldSource.id)).status,'cancelled');const before=sent.length;await event('message',`OBUNA ${old.code}`);assert.equal(sent.length,before);
    const expiredSource=await event('comment','LUGAT','222'),expired=await pending(expiredSource.id);
    await pool.query("UPDATE media_follow_requests SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);const expiredCount=sent.length;await event('message',`OBUNA ${expired.code}`);assert.equal(sent.length,expiredCount);assert.equal((await pending(expiredSource.id)).status,'expired');
    const disabledSource=await event('comment','LUGAT','222'),disabled=await pending(disabledSource.id);
    await call(`/rules/${rule.id}`,'PATCH',{enabled:false});const disabledCount=sent.length;await event('message',`OBUNA ${disabled.code}`);assert.equal(sent.length,disabledCount);
    await call(`/rules/${rule.id}`,'PATCH',{enabled:true});
    missingRecipient=true;const missing=await event('comment','LUGAT','222');assert.equal(missing.status,'needs_review');assert.equal((await pending(missing.id)).status,'needs_review');assert.equal(sent.at(-1).message.text.includes('https:'),false);missingRecipient=false;
    ambiguousSend=true;const ambiguous=await event('comment','LUGAT','222');assert.equal(ambiguous.status,'needs_review');const afterAmbiguous=sent.length;await processInteractions();assert.equal(sent.length,afterAmbiguous);ambiguousSend=false;
    const dmCreated=await call('/rules','POST',{...ruleInput,title:'DM lesson',trigger:'message',action:'reply',keywords:['dars'],media_id:''});assert.equal(dmCreated.status,201);
    follow=false;const dm=await event('message','DARS');assert.equal(dm.status,'awaiting_follow');assert.equal(sent.at(-1).message.text.includes('https:'),false);
    follow=true;await event('message','DARS');assert.equal(sent.at(-1).message.text,response);
    // Editing/deleting rules cannot release their old material requests.
    await call(`/rules/${rule.id}`,'DELETE',{});assert.equal((await pool.query('SELECT * FROM media_follow_requests WHERE rule_id=$1',[rule.id])).rows.length,0);
  }finally{globalThis.fetch=nativeFetch;await new Promise<void>(r=>server.close(()=>r()));await db.close();}
});
