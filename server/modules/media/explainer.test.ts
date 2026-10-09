import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainerPlanSchema } from '../../../shared/explainer';
import { sceneHtml } from './explainer-render';
const scene={title:'Sinov',arabic:'فِي رَأْيِي',translation:'Mening fikrimcha',narration:'Qisqa izoh.'};
test('explainer enforces narrator and scene limits',()=>{
 assert.equal(explainerPlanSchema.safeParse({title:'Test',scenes:[scene]}).success,false);
 assert.equal(explainerPlanSchema.safeParse({title:'Test',scenes:Array.from({length:8},()=>({...scene,narration:'a'.repeat(300)}))}).success,false);
 assert.equal(explainerPlanSchema.safeParse({title:'Test',scenes:[scene,scene]}).success,true);
});
test('scene text is escaped and Arabic uses its own RTL layer',()=>{
 const html=sceneHtml(explainerPlanSchema.parse({title:'Test',scenes:[{...scene,title:'<script>alert(1)</script>'},scene]}).scenes[0],0,2);
 assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(html.includes('lang="ar"'));
 assert.ok(html.includes('direction:rtl'));
 assert.ok(html.includes("default-src 'none'"));
});

test('MSC October plans preserve all source sentences and support 19 scenes',async()=>{
 const {readFile}=await import('node:fs/promises');
 const plans=JSON.parse(await readFile('docs/examples/msc-october-2026.json','utf8'));
 assert.equal(plans.length,9);
 for(const raw of plans){const p=explainerPlanSchema.parse(raw);assert.equal(p.scenes.length,19);assert.equal(p.profile,'msc');}
 const p=structuredClone(plans[0]);p.scenes[2].arabic+=' حَذْفٌ';assert.equal(explainerPlanSchema.safeParse(p).success,false);
 const missing=structuredClone(plans[0]);missing.scenes[10].pairs.pop();assert.equal(explainerPlanSchema.safeParse(missing).success,false);
 const reordered=structuredClone(plans[0]);[reordered.scenes[6],reordered.scenes[10]]=[reordered.scenes[10],reordered.scenes[6]];assert.equal(explainerPlanSchema.safeParse(reordered).success,false);
});
test('MSC analysis renders escaped two-column RTL text and labeled new examples',()=>{
 const s={...scene,stage:'analysis' as const,pairs:[['فِي رَأْيِي','<b>fikrimcha</b>']] as [string,string][]};
 const html=sceneHtml(s as any,1,19,undefined,true);
 assert.ok(html.includes('width:1080px;height:1920px'));
 assert.ok(html.includes('SO‘ZMA-SO‘Z'));assert.ok(html.includes('UMUMIY TARJIMA'));
 assert.ok(html.includes('&lt;b&gt;'));assert.ok(!html.includes('<b>fikrimcha</b>'));
 const phrase=sceneHtml({...s,stage:'phrases',pairs:[['أ','a'],['ب','b']]} as any,14,19,undefined,true);
 assert.ok(phrase.includes('KITOBDAGI QO‘LLANISH'));assert.ok(phrase.includes('YANGI MISOL · MUALLIFLIK'));
});
