import test from "node:test";
import assert from "node:assert/strict";
import { audioInput, audioCatalog, generateAudio, AudioError } from "./audio";

test("v4 uses dialogue endpoint with selected clone and preserves Uzbek/Arabic text; no automatic paid retries", async () => {
  const oldFetch = global.fetch, oldKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-secret";
  const requests: {url: string; body: any}[] = [];
  global.fetch = (async (url: any, init: any) => {
    requests.push({url: String(url), body: init?.body ? JSON.parse(init.body) : null});
    return new Response(new Uint8Array([73,68,51,4,0,0,0,0,0,0,255,251]), {status:200});
  }) as typeof fetch;
  try {
    const input = audioInput.parse({name:"Sinov", text:"O‘zbekcha: bugun 5 ta so‘z. كِتَابٌ", voice_id:"my-clone", language:"uz"});
    const audio = await generateAudio(input);
    assert.equal(audio.length, 12);
    assert.equal(requests[0].url, "https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128");
    assert.deepEqual(requests[0].body, {inputs:[{text:input.text,voice_id:"my-clone"}],model_id:"eleven_v4",language_code:"uz"});
    global.fetch = (async () => { requests.push({url:"error",body:null}); return new Response("test-secret private payload",{status:403}); }) as typeof fetch;
    await assert.rejects(generateAudio(input), e => e instanceof AudioError && e.status === 403 && !e.message.includes("test-secret"));
    assert.equal(requests.length,2);
    global.fetch = (async () => new Response(JSON.stringify({detail:{status:"missing_permissions",message:"secret payload"}}),{status:401})) as typeof fetch;
    await assert.rejects(generateAudio(input), e => e instanceof AudioError && e.status === 403 && e.message.includes("ruxsat") && !e.message.includes("secret payload"));
    assert.equal(audioInput.safeParse({...input,text:"a".repeat(2001)}).success,false);
  } finally { global.fetch=oldFetch; if(oldKey === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY=oldKey; }
});

test("catalog loads paginated account voices including professional clones and filters v4 models", async () => {
  const oldFetch = global.fetch, oldKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY="test";
  global.fetch=(async (url: any) => {
    const u=String(url);
    const data=u.endsWith("/models") ? [{model_id:"eleven_v4",name:"Eleven v4"},{model_id:"eleven_multilingual_v2"}]
      : u.includes("next_page_token") ? {voices:[{voice_id:"clone",name:"Umidjon",category:"professional"}],has_more:false}
      : {voices:[{voice_id:"uz",name:"Uzbek"}],has_more:true,next_page_token:"next"};
    return new Response(JSON.stringify(data));
  }) as typeof fetch;
  try {
    const c=await audioCatalog(); assert.equal(c.models.length,1); assert.equal(c.voices.length,2); assert.equal(c.voices[1].name,"Umidjon");
  } finally { global.fetch=oldFetch; if(oldKey===undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY=oldKey; }
});

test("model listing permission is optional when voice listing is allowed", async () => {
  const oldFetch=global.fetch, oldKey=process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY="test";
  global.fetch=(async (url:any) => String(url).endsWith("/models")
    ? new Response(JSON.stringify({detail:{status:"missing_permissions"}}),{status:401})
    : new Response(JSON.stringify({voices:[{voice_id:"clone",name:"Umidjon",category:"professional"}],has_more:false}))) as typeof fetch;
  try { const c=await audioCatalog(); assert.equal(c.models[0].id,"eleven_v4"); assert.equal(c.voices[0].name,"Umidjon"); }
  finally { global.fetch=oldFetch; if(oldKey===undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY=oldKey; }
});
