import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { carouselAudioSchema, type CarouselAudio } from "../../../shared/carousel-audio";
import { AudioError } from "./audio";

const run = promisify(execFile);
export const carouselOutputLimit = 100 * 1024 * 1024;
type Image = { mime_type: string; data: Buffer };

export async function renderCarouselAudio(
  images: Image[], music: Buffer, settings: CarouselAudio,
  heartbeat: () => Promise<void> = async () => {},
) {
  const config = carouselAudioSchema.parse(settings);
  if (images.length < 2 || images.length > 10
    || images.some(image => !["image/jpeg", "image/png"].includes(image.mime_type)))
    throw new AudioError(422, "Audioli karusel uchun 2–10 ta JPG yoki PNG rasm tanlang.");
  const dir = await mkdtemp(join(tmpdir(), "carousel-audio-"));
  const ff = (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-threads", "1", ...args],
    { timeout: 240000, maxBuffer: 1024 * 1024 });
  try {
    const musicPath = join(dir, "music.mp3");
    await writeFile(musicPath, music);
    let duration: number;
    try {
      const probe = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", musicPath],
        { timeout: 20000, maxBuffer: 1024 * 1024 });
      const info = JSON.parse(probe.stdout);
      duration = Number(info.format?.duration);
      if (!info.streams?.some((s: any) => s.codec_type === "audio") || !Number.isFinite(duration)) throw new Error();
    } catch { throw new AudioError(422, "MP3 faylini o‘qib bo‘lmadi. Boshqa musiqa faylini tanlang."); }
    if (config.start_seconds + config.slide_seconds > duration + 0.05)
      throw new AudioError(422, `Tanlangan musiqa kesmasi fayldan uzun. Musiqa: ${duration.toFixed(1)} soniya.`);

    // Decode the selected excerpt once. Each swipeable video starts with this
    // same excerpt; no claim of uninterrupted native Instagram music is made.
    const fade = Math.min(config.fade_seconds, config.slide_seconds / 2);
    const audioFilter = `volume=${config.volume_percent / 100}`
      + (fade ? `,afade=t=in:st=0:d=${fade},afade=t=out:st=${config.slide_seconds - fade}:d=${fade}` : "");
    await ff(["-ss", String(config.start_seconds), "-i", musicPath, "-t", String(config.slide_seconds),
      "-vn", "-af", audioFilter, "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", join(dir, "excerpt.m4a")]);
    const videos: Buffer[] = [];
    let total = 0;
    for (let i = 0; i < images.length; i++) {
      await heartbeat();
      const source = join(dir, `slide-${i}.${images[i].mime_type === "image/png" ? "png" : "jpg"}`);
      const output = join(dir, `slide-${i}.mp4`);
      await writeFile(source, images[i].data);
      try {
        // Preserve every edge of the source instead of cropping readable text.
        await ff(["-loop", "1", "-framerate", "30", "-i", source, "-i", join(dir, "excerpt.m4a"),
          "-map", "0:v:0", "-map", "1:a:0", "-t", String(config.slide_seconds),
          "-vf", "scale=1080:1350:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p",
          "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-crf", "20", "-threads", "1",
          "-c:a", "copy", "-movflags", "+faststart", output]);
      } catch { throw new AudioError(422, `${i + 1}-slaydni tayyorlab bo‘lmadi. Rasm faylini tekshiring.`); }
      const video = await readFile(output);
      total += video.length;
      if (video.length > 50 * 1024 * 1024 || total > carouselOutputLimit)
        throw new AudioError(413, "Audioli karusel juda katta. Slayd davomiyligini qisqartiring.");
      videos.push(video);
    }
    await heartbeat();
    return videos;
  } finally { await rm(dir, { recursive: true, force: true }); }
}
