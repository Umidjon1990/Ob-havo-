import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { postSchema, validatePublication } from "../../../shared/media";
import { carouselNativeSchema } from "../../../shared/carousel-native";

test("photo-carousel music notes cannot be mistaken for an automatically attached track", () => {
  const post = postSchema.parse({title:"Photo carousel", format:"carousel", asset_ids:[randomUUID(),randomUUID()],
    variants:{carousel_native:{music_title:"  One common track  "}}});
  assert.equal(post.variants.carousel_native?.music_title,"One common track");
  assert.match(validatePublication(post,"instagram",["image/jpeg","image/jpeg"])!,/Instagram ilovasida/);
  assert.equal(carouselNativeSchema.safeParse({music_url:"javascript:alert(1)"}).success,false);
  assert.equal(carouselNativeSchema.safeParse({start_seconds:-1}).success,false);
});

test("photo package preserves ordered original JPG/PNG bytes, captions and native music instructions", async () => {
  process.env.DATABASE_URL ||= "postgresql://local-test/not-used";
  const {packNativeCarousel} = await import("./carousel-native");
  const dir = await mkdtemp(join(tmpdir(),"photo-carousel-test-"));
  const run = promisify(execFile);
  let archive: {dir: string; path: string} | undefined;
  try {
    const assets: {id: string; mime_type: string; data: Buffer; name: string}[] = [];
    for (const [color,extension,mime] of [["red","png","image/png"],["blue","jpg","image/jpeg"]]) {
      const path = join(dir,`original.${extension}`);
      await run("ffmpeg",["-v","error","-y","-f","lavfi","-i",`color=c=${color}:s=16x20`,"-frames:v","1","-threads","1",path]);
      assets.push({id:randomUUID(),mime_type:mime,data:await readFile(path),name:"../../arbitrary user name"});
    }
    const settings = carouselNativeSchema.parse({music_title:"Common track",music_url:"https://www.instagram.com/reels/audio/example/",start_seconds:12.5});
    const post = postSchema.parse({title:"Photo package",format:"carousel",caption:"Asosiy",asset_ids:[assets[1].id,assets[0].id],
      variants:{carousel_native:settings,instagram:"Tayyor Instagram caption"}});
    archive = await packNativeCarousel(post,assets);
    const names = (await run("unzip",["-Z1",archive.path])).stdout.trim().split("\n");
    assert.deepEqual(names,["01-slayd.jpg","02-slayd.png","CAPTION.txt","MUSIQA.txt","QOLLANMA.txt"]);
    for (let i=0;i<2;i++) {
      const actual = await run("unzip",["-p",archive.path,names[i]],{encoding:"buffer"});
      assert.deepEqual(actual.stdout,assets[1-i].data,"source bytes and order preserved");
    }
    assert.equal((await run("unzip",["-p",archive.path,"CAPTION.txt"])).stdout,"Tayyor Instagram caption");
    const music = (await run("unzip",["-p",archive.path,"MUSIQA.txt"])).stdout;
    assert.ok(music.includes("Common track") && music.includes("12.5"));
    assert.match(music,/audio biriktirilmagan/);
    const guide = (await run("unzip",["-p",archive.path,"QOLLANMA.txt"])).stdout;
    assert.match(guide,/Instagram ilovasida yakunlang/);
    assert.match(guide,/avtomatik nashr rejalashtirilganini anglatmaydi/);
    await assert.rejects(() => packNativeCarousel({...post,asset_ids:[assets[0].id,assets[0].id]},assets),/alohida rasm/);
    await assert.rejects(() => packNativeCarousel(post,assets.slice(0,1)),/rasmlari topilmadi/);
  } finally {
    if (archive) await rm(archive.dir,{recursive:true,force:true});
    await rm(dir,{recursive:true,force:true});
  }
});
