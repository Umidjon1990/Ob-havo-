import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://unused:unused@127.0.0.1:1/unused';
process.env.OPENAI_API_KEY ||= 'test-not-a-real-key';
const {pool}=await import('../../db');
const {registerExplainerRoutes}=await import('./explainer');
const endpoints=new Map<string,any>();
registerExplainerRoutes({get:()=>{},post:(path:string,fn:any)=>endpoints.set(path,fn)} as any,(fn:any)=>fn);
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const plan={title:'Sinov',scenes:[{title:'A',narration:'Izoh'},{title:'B',narration:'Yakun'}]};
const res={status:()=>res,json:(x:any)=>x};
test('batch preserves user lesson order and rejects duplicates atomically',async()=>{
 const original=pool.connect;const inserts:any[]=[];const sqls:string[]=[];
 (pool as any).connect=async()=>({release(){},async query(sql:string,args:any[]=[]){sqls.push(sql);
  if(sql.startsWith('SELECT * FROM media_posts'))return {rows:[{id:a,variants:{explainer:plan}},{id:b,variants:{explainer:plan}}]};
  if(sql.startsWith('SELECT 1'))return {rows:[],rowCount:sql.includes('media_jobs')&&inserts.length>1?1:0};
  if(sql.startsWith('SELECT id,mime_type'))return {rows:[]};
  if(sql.startsWith('INSERT INTO media_jobs')){const p=JSON.parse(args[0]);inserts.push(p);return {rows:[{id:p.post_id,status:'queued'}]};}return {rows:[]};
 }});
 try{await endpoints.get('/api/media/explainer/batch')({body:{post_ids:[b,a,b],voice_id:'selected',approved:true}},res);assert.deepEqual(inserts.map(p=>[p.post_id,p.queue_order]),[[b,0],[a,1]]);
 await assert.rejects(()=>endpoints.get('/api/media/explainer/batch')({body:{post_ids:[a,b],voice_id:'selected',approved:true}},res),/avval navbatga/);assert.equal(sqls.at(-1),'ROLLBACK');}
 finally{pool.connect=original;}
});
test('resume refuses an unresolved paid speech call',async()=>{
 const original=pool.connect;const calls:string[]=[];
 (pool as any).connect=async()=>({release(){},async query(sql:string){calls.push(sql);return {rows:[{status:'failed',payload:{render_version:2},result:{pending_scene:3}}]};}});
 try{await assert.rejects(()=>endpoints.get('/api/media/explainer/jobs/:id/resume')({params:{id:a},body:{approved:true}},res),/natijasi noma’lum/);assert.ok(!calls.some(s=>s.startsWith('UPDATE')));assert.equal(calls.at(-1),'ROLLBACK');}
 finally{pool.connect=original;}
});
