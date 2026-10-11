import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { StudioProject } from "../../../shared/ai-studio";
import { studioFormats } from "../../../shared/ai-studio";
import { StudioError, type StudioImage } from "./studio-leonardo";
const run = promisify(execFile);
const time = (seconds: number, ass = false) => {
  const ticks = Math.round(seconds * (ass ? 100 : 1000));
  const divisor = ass ? 100 : 1000;
  return `${String(Math.floor(ticks / divisor / 3600)).padStart(ass ? 1 : 2,"0")}:${String(Math.floor(ticks / divisor / 60) % 60).padStart(2,"0")}:${String(Math.floor(ticks / divisor) % 60).padStart(2,"0")}${ass ? "." : ","}${String(ticks % divisor).padStart(ass ? 2 : 3,"0")}`;
};
export function studioCaptions(project: StudioProject) {
  let start = 0;
  const lines: string[] = [], assLines: string[] = [];
  for (const shot of project.shots) {
    const end = start + shot.duration;
    if (shot.subtitle.trim()) {
      lines.push(`${lines.length + 1}\n${time(start)} --> ${time(end)}\n${shot.subtitle.trim()}\n`);
      const text = shot.subtitle.replace(/\\/g,"＼").replace(/[{}]/g,"").replace(/\r?\n/g,"\\N");
      assLines.push(`Dialogue: 0,${time(start,true)},${time(end,true)},Default,,0,0,0,,${text}`);
    }
    start = end;
  }
  const [width, height] = studioFormats[project.format];
  const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVu Sans,${Math.round(width * 0.044)},&H00FFFFFF,&H00FFFFFF,&H00202020,&H80000000,-1,0,0,0,100,100,0,0,3,2,0,2,60,60,${Math.round(height * 0.09)},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${assLines.join("\n")}\n`;
  return { srt: lines.join("\n"), ass, duration: start };
}
export function validateRender(project: StudioProject, assets: Map<string, StudioImage>) {
  if (!project.shots.length) throw new StudioError(400, "Montaj uchun kadrlar kerak.");
  for (const s of project.shots) {
    if (!s.approved) throw new StudioError(400, `«${s.title}» kadri tasdiqlanmagan.`);
    const a = assets.get(s.video_asset_id || s.image_asset_id || "");
    if (!a || !(s.video_asset_id ? a.mime_type === "video/mp4" : ["image/jpeg","image/png"].includes(a.mime_type))) throw new StudioError(400, `«${s.title}» kadri uchun mos media tanlang.`);
  }
  for (const id of [project.audio_asset_id, project.music_asset_id]) if (id && assets.get(id)?.mime_type !== "audio/mpeg") throw new StudioError(400, "Ovoz va musiqa uchun MP3 tanlang.");
}
export async function renderStudio(project: StudioProject, assets: Map<string, StudioImage>, burnSubtitles: boolean, heartbeat: () => Promise<void>) {
  validateRender(project, assets);
  const dir = await mkdtemp(join(tmpdir(), "ai-studio-"));
  const [width, height] = studioFormats[project.format];
  const captions = studioCaptions(project);
  const ff = async (args: string[]) => run("ffmpeg", ["-hide_banner","-loglevel","error","-y","-threads","1",...args], {timeout: 600000, maxBuffer: 1024 * 1024});
  try {
    await run("ffmpeg", ["-version"], {timeout:10000});
    if (project.audio_asset_id) {
      await writeFile(join(dir,"narration.mp3"), assets.get(project.audio_asset_id)!.data);
      const probe = await run("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",join(dir,"narration.mp3")], {timeout:15000});
      if (Number(probe.stdout.trim()) > captions.duration + 0.2) throw new StudioError(400,"Ovoz kadrlar yig‘indisidan uzun. Kadr davomiyliklarini audioga moslang; ovoz kesilmadi.");
    }
    for (let i = 0; i < project.shots.length; i++) {
      await heartbeat();
      const shot = project.shots[i], asset = assets.get(shot.video_asset_id || shot.image_asset_id!)!;
      const source = join(dir, `source-${i}.${asset.mime_type === "video/mp4" ? "mp4" : asset.mime_type === "image/png" ? "png" : "jpg"}`);
      await writeFile(source, asset.data);
      const fit = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x0b1220,setsar=1`;
      const motion = shot.video_asset_id ? `fps=30,${fit},tpad=stop_mode=clone:stop_duration=60` : `${fit},zoompan=z='min(1.035,1+on*0.00012)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${Math.ceil(shot.duration*30)}:s=${width}x${height}:fps=30`;
      await ff(["-i",source,"-filter_threads","1","-vf",`${motion},format=yuv420p`,"-an","-t",String(shot.duration),"-c:v","libx264","-preset","veryfast","-crf","23","-threads","1",join(dir,`clip-${i}.mp4`)]);
    }
    await heartbeat();
    await writeFile(join(dir,"concat.txt"), project.shots.map((_,i) => `file 'clip-${i}.mp4'`).join("\n"));
    await ff(["-f","concat","-safe","0","-i",join(dir,"concat.txt"),"-c","copy",join(dir,"joined.mp4")]);
    await writeFile(join(dir,"subtitles.ass"),captions.ass);
    await writeFile(join(dir,"subtitles.srt"),captions.srt);
    const args = ["-i",join(dir,"joined.mp4")];
    let audioFilter = "", next = 1;
    const narration = project.audio_asset_id ? next++ : null;
    if (narration) args.push("-i",join(dir,"narration.mp3"));
    const music = project.music_asset_id ? next++ : null;
    if (music) { await writeFile(join(dir,"music.mp3"),assets.get(project.music_asset_id!)!.data); args.push("-stream_loop","-1","-i",join(dir,"music.mp3")); }
    if (narration && music) audioFilter = `[${narration}:a]apad,asplit=2[n][side];[${music}:a]volume=0.12[m];[m][side]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[duck];[n][duck]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=${Math.max(0,captions.duration-0.6)}:d=0.6[a]`;
    else if (narration || music) audioFilter = `[${narration || music}:a]${narration ? "apad" : "volume=0.1"},afade=t=out:st=${Math.max(0,captions.duration-0.6)}:d=0.6[a]`;
    else audioFilter = "anullsrc=r=44100:cl=stereo[a]";
    const subtitle = burnSubtitles && captions.srt ? `,ass=filename='${join(dir,"subtitles.ass")}'` : "";
    const videoFilter = `[0:v]fade=t=in:st=0:d=0.2,fade=t=out:st=${Math.max(0,captions.duration-0.6)}:d=0.6${subtitle}[v]`;
    const budgetBitrate = Math.floor(40 * 1024 * 1024 * 8 / captions.duration);
    await ff([...args,"-filter_complex_threads","1","-filter_complex",`${videoFilter};${audioFilter}`,"-map","[v]","-map","[a]","-t",String(captions.duration),"-c:v","libx264","-preset","veryfast","-crf","22","-maxrate",String(budgetBitrate),"-bufsize",String(budgetBitrate*2),"-threads","1","-c:a","aac","-b:a","128k","-movflags","+faststart",join(dir,"video.mp4")]);
    await ff(["-i",join(dir,"video.mp4"),"-ss","0.5","-frames:v","1",join(dir,"cover.jpg")]);
    await writeFile(join(dir,"project.json"), JSON.stringify(project,null,2));
    await run("zip", ["-q","-j",join(dir,"package.zip"),join(dir,"video.mp4"),join(dir,"cover.jpg"),join(dir,"subtitles.srt"),join(dir,"project.json")], {timeout:30000});
    for (const name of ["video.mp4","package.zip"]) if ((await stat(join(dir,name))).size > 50*1024*1024) throw new StudioError(413,"Tayyor fayl 50 MB dan katta. Davomiylikni qisqartiring.");
    return {video:await readFile(join(dir,"video.mp4")),cover:await readFile(join(dir,"cover.jpg")),zip:await readFile(join(dir,"package.zip")),duration:captions.duration,srt:captions.srt};
  } finally { await rm(dir,{recursive:true,force:true}); }
}
