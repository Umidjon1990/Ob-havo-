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
