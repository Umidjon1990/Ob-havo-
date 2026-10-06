import test from "node:test";
import assert from "node:assert/strict";
import { reelPackageSchema,reelDates,reelPublicationError } from "../../../shared/reels";
import { qomusReel } from "../../../shared/reels-qomus";
import { reelComposition } from "./reels-composition";
import { keywordMatch } from "../../../shared/media-growth";
test("Reels source URLs, timeline and platform readiness are validated",()=>{
  assert.equal(reelPackageSchema.safeParse({...qomusReel,link_url:'http://invalid.test'}).success,false);
  assert.equal(reelPackageSchema.safeParse({...qomusReel,source_url:'not a URL'}).success,false);
  assert.equal(reelPackageSchema.safeParse({...qomusReel,scenes:qomusReel.scenes.map(s=>({...s,seconds:3}))}).success,false);
  const id='00000000-0000-4000-8000-000000000001';
  const ready={...qomusReel,reviewed:true,video_id:id,actual_seconds:48};
  assert.equal(reelPublicationError(ready,'instagram',[id],id),null);
  assert.ok(reelPublicationError(ready,'telegram',[id],id));
  assert.ok(reelPublicationError({...ready,reviewed:false},'instagram',[id],id));
  assert.ok(reelPublicationError(ready,'instagram',[id]));
  assert.ok(reelPublicationError({...ready,actual_seconds:70},'instagram',[id],id));
});
test("batch dates keep exactly 12 future Tashkent dates and do not silently drop drafts",()=>{
  const dates=reelDates('2028-10',12,new Date('2028-10-06T12:00:00Z'));
  assert.equal(dates.length,12);assert.equal(new Set(dates).size,12);
  assert.ok(dates.every(d=>new Date(d)>new Date('2028-10-06T12:00:00Z')&&d.endsWith('T13:00:00.000Z')));
  assert.deepEqual(reelDates('2028-10',12,new Date('2028-10-29')),[]);
});
test("composition escapes user text and uses deterministic animated HyperFrames timeline",()=>{
  const html=reelComposition({...qomusReel,hook:'</script><script>alert(1)</script>'},48,new Map());
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(html.includes('window.__timelines={root:tl}'));
  assert.ok(html.includes('data-width="1080"'));
  assert.ok(html.includes('direction:rtl'));
  assert.ok(keywordMatch('Qomus!',['QOMUS']));assert.ok(!keywordMatch('qomuscha',['QOMUS']));
});
test("published Reels bind real Meta ID once, preserving disabled and deleted rules",{skip:!process.env.MEDIA_TEST_PGLITE_PATH},async()=>{
  process.env.DATABASE_URL='postgresql://test/no-network';process.env.OPENAI_API_KEY='test';
  const {pool}=await import('../../db');const {PGlite}=await import(process.env.MEDIA_TEST_PGLITE_PATH!);const db=new PGlite();
  const query=async(sql:string,values?:any[])=>{if(!values&&sql.trim().split(';').filter(Boolean).length>1){await db.exec(sql);return{rows:[],rowCount:0};}const r=await db.query(sql,values);return{...r,rowCount:r.affectedRows||r.rows?.length||0};};
  (pool as any).query=query;(pool as any).connect=async()=>({query,release(){}});
  try {
    const {ensureMediaTables}=await import('./schema');await ensureMediaTables(pool);await ensureMediaTables(pool);
    const {syncReelAutomations}=await import('./reel-automations');
    const a=(await query("INSERT INTO media_accounts(platform,name,external_id,enabled,verified_at) VALUES('instagram','test','123456789',true,now()) RETURNING id")).rows[0] as any;
    const p=(await query("INSERT INTO media_posts(title,caption,format,asset_ids,variants) VALUES('Qomus','','video','[]',$1) RETURNING id",[{reels:qomusReel}])).rows[0] as any;
    const d=(await query("INSERT INTO media_deliveries(post_id,account_id,scheduled_at,status,external_id) VALUES($1,$2,now(),'scheduled','179123456789') RETURNING id",[p.id,a.id])).rows[0] as any;
    await syncReelAutomations();assert.equal((await query('SELECT * FROM media_automations')).rows.length,0);
    await query("UPDATE media_deliveries SET status='published',published_at=now() WHERE id=$1",[d.id]);
    await syncReelAutomations();await syncReelAutomations();
    const rules=(await query('SELECT * FROM media_automations')).rows as any[];assert.equal(rules.length,1);
    assert.equal(rules[0].media_id,'179123456789');assert.equal(rules[0].require_follow,true);assert.equal(rules[0].source_delivery_id,d.id);assert.deepEqual(rules[0].keywords,['QOMUS']);assert.ok(rules[0].response.endsWith('https://www.al-qomus.uz/'));
    await query('UPDATE media_automations SET enabled=false WHERE id=$1',[rules[0].id]);await syncReelAutomations();assert.equal(((await query('SELECT enabled FROM media_automations')).rows[0] as any).enabled,false);
    await query('DELETE FROM media_automations WHERE id=$1',[rules[0].id]);await syncReelAutomations();assert.equal((await query('SELECT * FROM media_automations')).rows.length,0);
  }finally {await db.close();await pool.end();}
});
