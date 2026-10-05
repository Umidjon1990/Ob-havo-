import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import type { ExplainerPlan } from "../../../shared/explainer";
const run = promisify(execFile);
const runtimeRequire = createRequire(join(process.cwd(), "package.json"));
const escape = (s:string) => s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function sceneHtml(scene:ExplainerPlan["scenes"][number], index:number, count:number, image?:{mime_type:string;data:Buffer}) {
  const arabic=readFileSync(join(process.cwd(),"server/assets/fonts/NotoNaskhArabic-Regular.ttf")).toString("base64");
  const latin=readFileSync(runtimeRequire.resolve("@fontsource/noto-sans/files/noto-sans-latin-ext-600-normal.woff2")).toString("base64");
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><style>
  @font-face{font-family:Arabic;src:url(data:font/ttf;base64,${arabic})} @font-face{font-family:Latin;src:url(data:font/woff2;base64,${latin})}
  *{box-sizing:border-box}body{margin:0;width:720px;height:1280px;background:#f6f1e8;color:#133e3a;font-family:Latin,sans-serif;padding:68px 48px;display:flex;flex-direction:column;gap:26px}header{font-size:20px;letter-spacing:2px;color:#247b6a;display:flex;justify-content:space-between}h1{font-size:${scene.title.length>50?32:40}px;line-height:1.35;margin:12px 0 0}.art{height:290px;flex-shrink:0;background:#e1ece5;border-radius:34px;display:flex;align-items:center;justify-content:center;overflow:hidden}.art img{width:100%;height:100%;object-fit:contain}.icon{width:170px;height:170px;border-radius:50%;background:#247b6a;color:white;display:flex;align-items:center;justify-content:center;font-size:90px}.ar{font-family:Arabic;font-size:${scene.arabic.length>100?32:scene.arabic.length>60?40:54}px;line-height:1.5;direction:rtl;text-align:center;background:white;border-radius:28px;padding:24px 16px;overflow-wrap:anywhere}.uz{font-size:${scene.translation.length>90?24:29}px;line-height:1.45;text-align:center}.foot{margin-top:auto;font-size:19px;color:#527870}progress{width:100%;height:8px;accent-color:#247b6a}</style></head><body><header><span>ZAMONAVIY TA’LIM</span><span>${index+1} / ${count}</span></header><h1>${escape(scene.title)}</h1><div class="art">${image ? `<img src="data:${image.mime_type};base64,${image.data.toString("base64")}">` : `<div class="icon">${index===0 ? "?" : index===count-1 ? "✓" : index}</div>`}</div>${scene.arabic ? `<div class="ar" lang="ar">${escape(scene.arabic)}</div>` : ""}<div class="uz">${escape(scene.translation)}</div><div class="foot">Fikr bildiring · Mashq qiling · Esda saqlang</div><progress value="${index+1}" max="${count}"></progress></body></html>`;
}
export async function renderExplainer(plan:ExplainerPlan, images:Map<string,{mime_type:string;data:Buffer}>, speech:(text:string,index:number)=>Promise<Buffer>, heartbeat:()=>Promise<void>, music?:Buffer) {
  const dir=await mkdtemp(join(tmpdir(),"explainer-"));
  let browser:Awaited<ReturnType<typeof puppeteer.launch>>|undefined;
  const timings:{start:number;duration:number;title:string}[]=[];
  try {
    await run("ffmpeg",["-version"],{timeout:10000});
    await run("ffprobe",["-version"],{timeout:10000});
    browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
    const page=await browser.newPage(); await page.setViewport({width:720,height:1280,deviceScaleFactor:1});
    await page.setRequestInterception(true);
    page.on("request",r => /^(data:|about:)/.test(r.url()) ? void r.continue() : void r.abort());
    let start=0;
    for(let i=0;i<plan.scenes.length;i++) {
      await heartbeat(); const scene=plan.scenes[i];
      const audio=await speech(scene.narration,i); const mp3=join(dir,`speech-${i}.mp3`);
      await writeFile(mp3,audio);
      const probe=await run("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",mp3]);
      const spoken=Number(probe.stdout.trim()); if(!Number.isFinite(spoken)||spoken<=0||spoken>90) throw new Error("Audio duration");
      const duration=Math.max(3,spoken+0.5); timings.push({start,duration,title:scene.title}); start+=duration;
      if(start>180) throw new Error("Video duration");
      await page.setContent(sceneHtml(scene,i,plan.scenes.length,scene.image_id ? images.get(scene.image_id) : undefined),{waitUntil:"load"});
      await page.evaluate(()=>document.fonts.ready);
      if(await page.evaluate(()=>document.body.scrollHeight>1280)) throw new Error("Scene text does not fit. Shorten the scene."); const png=join(dir,`scene-${i}.png`); await writeFile(png,await page.screenshot({type:"png"}));
      const motion=scene.motion==="pop" ? "1+0.025*exp(-on/10)*abs(sin(on/3))+0.00008*on" : "min(1.035,1+on*0.00015)";
      const xpos=scene.motion==="slide" ? "(iw-iw/zoom)*min(1,on/24)" : "iw/2-iw/zoom/2";
      const vf=`zoompan=z='${motion}':x='${xpos}':y='ih/2-ih/zoom/2':d=${Math.ceil(duration*24)}:s=720x1280:fps=24,fade=t=in:st=0:d=0.18:color=0xf6f1e8,format=yuv420p`;
      const args=["-hide_banner","-loglevel","error","-y","-threads","1","-i",png,"-i",mp3];
      let af="[1:a]apad,aresample=44100[a]";
      if(scene.sfx!=="none") {
        const effect=scene.sfx==="whoosh" ? "anoisesrc=color=pink:duration=0.22:sample_rate=44100,afade=t=out:st=0:d=0.22,volume=0.035" : `sine=frequency=${scene.sfx==="tick" ? 1400 : 700}:duration=${scene.sfx==="typing"?"0.45":"0.10"}:sample_rate=44100,afade=t=out:st=0:d=${scene.sfx==="typing"?"0.45":"0.10"},volume='${scene.sfx==="typing"?"0.035*lt(mod(t,0.09),0.025)":"0.035"}':eval=frame`;
        af=`[1:a]apad,aresample=44100[n];${effect}[s];[n][s]amix=inputs=2:duration=first:normalize=0[a]`;
      }
      await run("ffmpeg",[...args,"-filter_complex_threads","1","-filter_complex",`[0:v]${vf}[v];${af}`,"-map","[v]","-map","[a]","-t",duration.toFixed(3),"-c:v","libx264","-preset","veryfast","-crf","24","-threads","1","-c:a","aac","-b:a","128k","-movflags","+faststart",join(dir,`clip-${i}.mp4`)],{timeout:240000,maxBuffer:1024*1024});
    }
    await writeFile(join(dir,"concat.txt"),plan.scenes.map((_,i)=>`file 'clip-${i}.mp4'`).join("\n"));
    const joined=join(dir,"joined.mp4");
    await run("ffmpeg",["-hide_banner","-loglevel","error","-y","-f","concat","-safe","0","-i",join(dir,"concat.txt"),"-c","copy","-movflags","+faststart",joined],{timeout:120000});
    const narration=join(dir,"narration.mp3");
    await run("ffmpeg",["-hide_banner","-loglevel","error","-y","-i",joined,"-vn","-c:a","libmp3lame","-b:a","128k",narration]);
    let final=joined;
    if(music) {
      await writeFile(join(dir,"music.mp3"),music); final=join(dir,"final.mp4");
      await run("ffmpeg",["-hide_banner","-loglevel","error","-y","-i",joined,"-stream_loop","-1","-i",join(dir,"music.mp3"),"-filter_complex","[1:a]volume=0.07[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]","-map","0:v","-map","[a]","-c:v","copy","-c:a","aac","-b:a","128k","-movflags","+faststart",final],{timeout:120000});
    }
    const video=await readFile(final); if(video.length>50*1024*1024) throw new Error("Video exceeds 50 MB");
    return {video,audio:await readFile(narration),timings,duration:start};
  } finally { await browser?.close().catch(()=>{}); await rm(dir,{recursive:true,force:true}); }
}
