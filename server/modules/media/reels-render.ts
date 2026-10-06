import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp,readFile,writeFile,copyFile,readdir,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { ReelPackage } from "../../../shared/reels";
import { reelComposition } from "./reels-composition";
import { AudioError } from "./audio";
const run=promisify(execFile);
const req=createRequire(join(process.cwd(),"package.json"));
async function probe(path:string) {
  const {stdout}=await run("ffprobe",["-v","error","-show_entries","format=duration:stream=codec_type,width,height","-of","json",path],{timeout:20000,maxBuffer:1024*1024});
  const data=JSON.parse(stdout),duration=Number(data.format?.duration);
  if(!Number.isFinite(duration)||duration<=0) throw new AudioError(422,"Media davomiyligi aniqlanmadi.");
  const video=data.streams?.find((s:any)=>s.codec_type==='video');
  return {duration,width:video?.width,height:video?.height};
}
export async function probeReel(data:Buffer) {
  const dir=await mkdtemp(join(tmpdir(),"reel-check-"));
  try {const path=join(dir,"video.mp4");await writeFile(path,data);return await probe(path);}
  finally{await rm(dir,{recursive:true,force:true});}
}
// An original, quiet instrumental bed. No downloaded music or license dependency.
export function musicWave(seconds:number) {
  const rate=44100,n=Math.ceil(seconds*rate),data=Buffer.alloc(44+n*2);
  data.write("RIFF");data.writeUInt32LE(36+n*2,4);data.write("WAVEfmt ",8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write("data",36);data.writeUInt32LE(n*2,40);
  const chords=[[196,246.94,293.66],[164.81,196,246.94],[130.81,164.81,196],[146.83,185,220]];
  for(let i=0;i<n;i++) {const t=i/rate,beat=t%0.625,bar=Math.floor(t/2.5)%4;
    const chord=chords[bar].reduce((a,f)=>a+Math.sin(2*Math.PI*f*t)*.07,0);
    const bell=Math.sin(2*Math.PI*chords[bar][Math.floor(t/.625)%3]*2*t)*Math.exp(-beat*10)*.15;
    const bass=Math.sin(2*Math.PI*chords[bar][0]/2*t)*Math.exp(-beat*12)*.1;
    const fade=Math.min(1,t/1.2,(seconds-t)/1.2);data.writeInt16LE(Math.round((chord+bell+bass)*fade*12000),44+i*2);
  }return data;
}
export function reelAudioFilters(duration:number,starts:number[],customMusic=false) {
  const sfx=starts.map((t,i)=>`anoisesrc=color=pink:d=0.22:r=44100,highpass=f=1500,lowpass=f=7000,afade=t=out:st=0:d=0.22,volume=0.026,adelay=${Math.round(t*1000)}:all=1[s${i}];`).join('');
  return `[1:a]apad,aresample=44100[n];[2:a]volume=${customMusic ? .08 : .12},afade=t=in:st=0:d=1,afade=t=out:st=${Math.max(0,duration-1)}:d=1[m];${sfx}[n][m]${starts.map((_,i)=>`[s${i}]`).join('')}amix=inputs=${2+starts.length}:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=7[a]`;
}
export async function renderReel(reel:ReelPackage,assets:Map<string,{mime_type:string,data:Buffer}>) {
  const dir=await mkdtemp(join(tmpdir(),"reels-"));
  try {
    const paths=new Map<string,string>();
    for(const [id,a]of Array.from(assets)) {const ext=a.mime_type==='video/mp4'?'mp4':a.mime_type==='audio/mpeg'?'mp3':a.mime_type==='image/jpeg'?'jpg':'png';const name=`${id}.${ext}`;await writeFile(join(dir,name),a.data);paths.set(id,name);}
    if(!reel.audio_id||!paths.has(reel.audio_id))throw new AudioError(422,"Diktor audiosi topilmadi.");
    const audioPath=join(dir,paths.get(reel.audio_id)!);const speech=await probe(audioPath);
    if(speech.duration<38||speech.duration>58) throw new AudioError(422,`Audio ${speech.duration.toFixed(1)} soniya. Video uchun ssenariyni 38–58 soniyaga moslang; tayyor audio saqlangan.`);
    const duration=Math.max(40,Math.min(60,speech.duration+2));
    if(reel.intro_id&&paths.has(reel.intro_id)) {
      const extended=`intro-extended.mp4`;
      await run("ffmpeg",["-v","error","-y","-i",join(dir,paths.get(reel.intro_id)!),"-vf","tpad=stop_mode=clone:stop_duration=16","-t","20","-an","-c:v","libx264","-preset","veryfast","-crf","18","-threads","1",join(dir,extended)],{timeout:180000});
      paths.set(reel.intro_id,extended);
    }
    await copyFile(req.resolve("gsap/dist/gsap.min.js"),join(dir,"gsap.min.js"));
    await copyFile(req.resolve("@fontsource/noto-sans/files/noto-sans-latin-ext-800-normal.woff2"),join(dir,"latin.woff2"));
    await copyFile(req.resolve("@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-arabic-400-normal.woff2"),join(dir,"arabic.woff2"));
    await writeFile(join(dir,"index.html"),reelComposition(reel,duration,paths));
    const cli=req.resolve("hyperframes/bin/hyperframes.mjs");
    const env={...process.env,HYPERFRAMES_BROWSER_PATH:process.env.HYPERFRAMES_BROWSER_PATH||(process.env.NODE_ENV==='production'?'/usr/bin/chromium':undefined)};
    await run(process.execPath,[cli,"render",dir,"--output",join(dir,"visual.mp4"),"--fps","30","--workers","1","--low-memory-mode","--video-bitrate","7M","--no-browser-gpu"],{timeout:25*60000,maxBuffer:2*1024*1024,env});
    await writeFile(join(dir,"index.html"),reelComposition(reel,duration,paths,true));
    await run(process.execPath,[cli,"snapshot",dir,"--at","0.2","--no-end","--output",join(dir,"snapshots")],{timeout:120000,maxBuffer:1024*1024,env});
    const png=(await readdir(join(dir,"snapshots"))).find(s=>s.endsWith('.png'));
    if(!png)throw new AudioError(500,"Cover yaratilmagan.");
    await run("ffmpeg",["-v","error","-y","-i",join(dir,"snapshots",png),"-frames:v","1","-q:v","2",join(dir,"cover.jpg")],{timeout:20000});
    const music=reel.music_id?assets.get(reel.music_id)?.data:undefined;
    await writeFile(join(dir,music?'music.mp3':'music.wav'),music||musicWave(duration));
    const starts=reel.scenes.slice(0,-1).map((_,i)=>reel.scenes.slice(0,i+1).reduce((n,s)=>n+s.seconds,0)*duration/reel.target_seconds);
    const filters=reelAudioFilters(duration,starts,!!music);
    await run("ffmpeg",["-v","error","-y","-i",join(dir,"visual.mp4"),"-i",audioPath,"-stream_loop","-1","-i",join(dir,music?'music.mp3':'music.wav'),"-filter_complex_threads","1","-filter_complex",filters,"-map","0:v","-map","[a]","-t",String(duration),"-c:v","copy","-c:a","aac","-b:a","192k","-ar","48000","-movflags","+faststart",join(dir,"final.mp4")],{timeout:180000,maxBuffer:1024*1024});
    const video=await readFile(join(dir,"final.mp4"));if(video.length>50*1024*1024)throw new AudioError(413,"Video 50 MB dan oshdi.");
    return {video,cover:await readFile(join(dir,"cover.jpg")),duration};
  }finally{await rm(dir,{recursive:true,force:true});}
}
