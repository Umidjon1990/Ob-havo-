import test from 'node:test';
import assert from 'node:assert/strict';
import {loadMscPackage,chooseMscVoice,checkpointCanResume,startMscPackage} from './explainer-package';

test('shipped package has nine ordered source scripts, valid covers, captions and Tashkent slots',async()=>{
 const items=await loadMscPackage();assert.equal(items.length,9);
 assert.deepEqual(items.map(i=>i.plan.lesson_code),[7,8,9].flatMap(n=>[1,2,3].map(s=>`MSC-B01-Q01-N00${n}-S0${s}`)));
 for(const item of items){assert.equal(item.plan.scenes.length,19);assert.ok(item.publication.planned_at.endsWith('14:00:00+05:00'));assert.equal((item.publication.caption.match(/href=/g)||[]).length,18);assert.ok(item.cover.length<2*1024*1024);}
});
test('automatic voice requires a unique Umidjon clone and ambiguous paid calls never resume',()=>{
 const a={id:'a',name:'Umidjon',category:'cloned'},b={...a,id:'b'};
 assert.equal(chooseMscVoice([a]),'a');assert.throws(()=>chooseMscVoice([a,b]),/Bir nechta/);assert.equal(chooseMscVoice([a,b],'b'),'b');assert.throws(()=>chooseMscVoice([{...a,category:'premade'}]),/topilmadi/);
 assert.ok(checkpointCanResume({payload:{render_version:2},result:{audio_scenes:[{scene:0,audio_id:'saved'}],pending_scene:null}}));
 assert.ok(!checkpointCanResume({payload:{render_version:2},result:{pending_scene:0}}));assert.ok(!checkpointCanResume({payload:{}}));
});
test('one command reuses imported scripts, binds media, preserves order and is idempotent after lost response',async()=>{
 const items=await loadMscPackage();const posts:any[]=[{id:'existing',variants:{explainer:structuredClone(items[0].plan)}}],jobs:any[]=[],covers:any[]=[];
 const client={async query(sql:string,args:any[]=[]):Promise<any>{
  if(sql.startsWith('SELECT * FROM media_posts'))return {rows:posts};
  if(sql.startsWith('SELECT * FROM media_jobs'))return {rows:jobs};
  if(sql.includes('SUM(size)'))return {rows:[{used:0}]};
  if(sql.startsWith('SELECT 1'))return {rowCount:0,rows:[]};
  if(sql.startsWith('INSERT INTO media_assets')){const a={id:`cover-${covers.length}`};covers.push(a);return {rows:[a]};}
  if(sql.startsWith('UPDATE media_jobs')){const j=jobs.find(j=>j.id===args[0]);j.status='queued';return {rows:[]};}
  if(sql.startsWith('UPDATE media_posts')){const p=posts.find(p=>p.id===args[0]);p.variants=JSON.parse(args[1]);return {rows:[p]};}
  if(sql.startsWith('INSERT INTO media_posts')){const p={id:`post-${posts.length}`,variants:JSON.parse(args[3])};posts.push(p);return {rows:[p]};}
  return {rows:[]};
 }};
 const queue=async(_c:any,p:any,plan:any,v:string,order:number)=>{const j={id:`job-${jobs.length}`,status:'queued',payload:{post_id:p.id,plan,voice_id:v,queue_order:order}};jobs.push(j);return j;};
 const first=await startMscPackage(client,items,'clone',queue);assert.equal(first.lessons.length,9);assert.equal(posts.length,9);assert.equal(posts[0].id,'existing');assert.equal(covers.length,9);
 assert.deepEqual(jobs.map(j=>j.payload.queue_order),[0,1,2,3,4,5,6,7,8]);assert.ok(posts.every(p=>p.variants.youtube_cover_id&&p.variants.explainer.scenes[0].image_id));
 const second=await startMscPackage(client,items,'clone',queue);assert.deepEqual(JSON.parse(JSON.stringify(second.lessons)),first.lessons);assert.equal(covers.length,9);assert.equal(jobs.length,9);
 jobs[0].status='failed';jobs[0].payload.render_version=2;jobs[0].result={pending_scene:null,audio_scenes:[{scene:0,audio_id:'saved'}]};
 jobs[1].status='failed';jobs[1].payload.render_version=2;jobs[1].result={pending_scene:0};
 const resumed=await startMscPackage(client,items,'clone',queue);assert.equal(resumed.lessons[0].status,'queued');assert.equal(resumed.lessons[1].status,'failed');assert.equal(jobs.length,9);assert.equal(covers.length,9);
});
