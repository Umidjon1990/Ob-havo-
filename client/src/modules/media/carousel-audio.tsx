import { useEffect, useRef, useState } from "react";
import { Music2, Plus, RefreshCw, Upload, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import type { MediaPost, MediaAsset } from "@shared/media";
import { carouselAudioSchema, carouselAudioKey, type CarouselAudio } from "@shared/carousel-audio";
import { mediaApi, type MediaData } from "./api";
import "./carousel-audio.css";

const defaults = { start_seconds:0, slide_seconds:8, volume_percent:30, fade_seconds:0.4 };
export function CarouselAudioFields({value, assets, onChange, disabled=false}: {
  value?:CarouselAudio; assets:MediaAsset[]; onChange:(value:CarouselAudio|undefined)=>void; disabled?:boolean;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (audio.current && value) audio.current.volume = value.volume_percent / 100; }, [value?.volume_percent]);
  function change(key:keyof CarouselAudio, n:number) { if (value) onChange({...value,[key]:n}); }
  return <div className="carousel-audio-settings">
    <label className="media-field"><span>Fon musiqasi · MP3</span>
      <select className="media-input" disabled={disabled} value={value?.music_id || ""}
        onChange={e => onChange(e.target.value ? {...defaults,...value,music_id:e.target.value} : undefined)}>
        <option value="">Musiqasiz foto-karusel</option>
        {assets.filter(a=>a.mime_type === "audio/mpeg").map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
    {value && <>
      <div className="carousel-audio-controls">
        <label className="media-field"><span>Musiqa boshlanishi · soniya</span>
          <input className="media-input" type="number" min={0} max={3600} step={0.1} value={value.start_seconds}
            disabled={disabled} onChange={e=>change("start_seconds",Number(e.target.value))}/></label>
        <label className="media-field"><span>Har slayd · soniya</span>
          <input className="media-input" type="number" min={3} max={60} step={0.5} value={value.slide_seconds}
            disabled={disabled} onChange={e=>change("slide_seconds",Number(e.target.value))}/></label>
        <label className="media-field"><span>Ovoz balandligi · {value.volume_percent}%</span>
          <input type="range" min={1} max={100} value={value.volume_percent} disabled={disabled}
            onChange={e=>change("volume_percent",Number(e.target.value))}/></label>
        <label className="media-field"><span>Yumshoq kirish va chiqish · soniya</span>
          <input className="media-input" type="number" min={0} max={2} step={0.1} value={value.fade_seconds}
            disabled={disabled} onChange={e=>change("fade_seconds",Number(e.target.value))}/></label>
      </div>
      <audio ref={audio} controls preload="metadata" key={value.music_id} src={`/api/media/assets/${value.music_id}`}
        aria-label="Tanlangan musiqa kesmasini tinglash"
        onPlay={e=>{const a=e.currentTarget;a.volume=value.volume_percent/100;
          if (a.currentTime<value.start_seconds || a.currentTime>=value.start_seconds+value.slide_seconds) a.currentTime=value.start_seconds;}}
        onTimeUpdate={e=>{if(e.currentTarget.currentTime>=value.start_seconds+value.slide_seconds) e.currentTarget.pause();}}/>
      <p className="media-subtle">Musiqa har bir suriladigan video slaydga biriktiriladi. Slayd almashtirilganda kesma qayta boshlanadi. Tayyor videoda ovozning kirishi va chiqishi yumshatiladi.</p>
    </>}
  </div>;
}

type Status = {ready:boolean; output_ids:string[]; updated_at:string;
  job:{id:string;status:string;error:string|null}|null};
export default function CarouselAudioStudio({data,onSaved,onNew,initialPostId="",onSchedule}: {
  data:MediaData; onSaved:()=>Promise<unknown>; onNew:()=>void; initialPostId?:string; onSchedule:(post:MediaPost)=>void;
}) {
  const posts = data.posts.filter(p=>p.format === "carousel");
  const [id,setId] = useState(initialPostId || posts.find(p=>!p.deliveries.some(d=>d.status!=="cancelled"))?.id || posts[0]?.id || "");
  const post = posts.find(p=>p.id===id);
  const [audio,setAudio] = useState<CarouselAudio>();
  const [status,setStatus] = useState<Status|null>(null);
  const [busy,setBusy] = useState(false),[error,setError] = useState(""),[message,setMessage] = useState("");
  const [slide,setSlide] = useState(0);
  const selectedRef = useRef(id); selectedRef.current=id;
  useEffect(()=>{if(initialPostId) setId(initialPostId);},[initialPostId]);
  useEffect(()=>{
    const parsed = carouselAudioSchema.safeParse(post?.variants.carousel_audio);
    setAudio(parsed.success?parsed.data:undefined);setSlide(0);setStatus(null);setError("");setMessage("");
  },[id]);
  const localKey = post && audio ? carouselAudioKey({...post,variants:{...post.variants,carousel_audio:audio}}) : null;
  const savedKey = post ? carouselAudioKey(post) : null;
  const dirty = localKey !== savedKey;
  const preparing = status?.job?.status === "queued" || status?.job?.status === "running"
    || data.jobs.some(j=>j.kind==="carousel_audio" && j.payload?.post_id===id && ["queued","running"].includes(j.status));
  const locked = !!post?.deliveries.some(d=>d.status!=="cancelled");
  const ready = !!status?.ready && !dirty;
  async function reload(target:string) {
    const next = await mediaApi<Status>(`/posts/${target}/carousel-audio`);
    if(selectedRef.current===target) setStatus(next);
  }
  useEffect(()=>{
    if(!id)return;
    let cancelled=false;
    const poll=()=>void mediaApi<Status>(`/posts/${id}/carousel-audio`).then(s=>{
      if(!cancelled){setStatus(s);if(s.ready && !status?.ready) void onSaved();}
    }).catch(e=>{if(!cancelled)setError(e.message);});
    poll(); const timer=setInterval(poll,4000);
    return()=>{cancelled=true;clearInterval(timer);};
  },[id,!!status?.ready]);
  async function save(render:boolean) {
    if(!post)return;
    setBusy(true);setError("");setMessage("");
    try {
      const saved = await mediaApi<{updated_at:string}>(`/posts/${post.id}/carousel-audio`,"PUT",
        {audio:audio?carouselAudioSchema.parse(audio):null,updated_at:post.updated_at});
      if(render) await mediaApi(`/posts/${post.id}/carousel-audio/render`,"POST",{updated_at:saved.updated_at});
      await onSaved(); await reload(post.id);
      setMessage(render ? "Karusel tayyorlash navbatiga qo‘yildi. Sahifani yopishingiz mumkin." : "Musiqa sozlamalari saqlandi.");
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function upload(files:File[], music:boolean) {
    setBusy(true);setError("");setMessage("");
    try {
      let musicId="";
      for(const file of files){
        if(file.size>50*1024*1024)throw new Error("Har bir fayl 50 MB dan oshmasin.");
        const r=await fetch("/api/media/assets",{method:"POST",headers:{"Content-Type":music?"audio/mpeg":file.type,
          "X-File-Name":encodeURIComponent(file.name)},body:file,credentials:"same-origin"});
        const a=await r.json();if(!r.ok)throw new Error(a.error||"Fayl yuklanmadi.");musicId=a.id;
      }
      await onSaved();
      if(music && musicId)setAudio({...defaults,...audio,music_id:musicId});
      setMessage(music ? "MP3 yuklandi va tanlandi. Endi karuselni tayyorlang." : "Rasmlar yuklandi. Yangi karusel ochib, slaydlarni tartib bilan tanlang.");
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const outputs=ready?status!.output_ids:[];
  const previewId=outputs[slide] || post?.asset_ids[slide];
  return <div className="carousel-audio-studio">
    <div className="media-page-header"><div><h1>Audioli karusel</h1>
      <p className="media-subtle">Rasmlar, fon musiqasi va suriladigan slaydlar — bitta tayyor post.</p></div>
      <button className="media-btn" onClick={onNew} disabled={busy}><Plus size={16}/> Yangi karusel</button></div>
    <div className="media-panel carousel-audio-intro"><Music2 size={25}/><div>
      <strong>Rasmlarni tanlang → musiqa qo‘shing → oldindan ko‘ring → vaqtni belgilang.</strong>
      <p>Har rasm 4:5 o‘lchamdagi alohida musiqali videoga aylanadi. Instagram va Telegramda slaydlarni yon tomonga surish mumkin.</p>
    </div></div>
    {error && <div className="media-alert" role="alert">{error}</div>}
    {message && <div className="media-alert carousel-audio-success" role="status">{message}</div>}
    <div className="carousel-audio-layout">
      <div className="media-panel">
        <label className="media-field"><span>Karusel posti</span>
          <select className="media-input" value={id} onChange={e=>setId(e.target.value)} disabled={busy}>
            <option value="">Karusel tanlang</option>{posts.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}
          </select></label>
        <div className="carousel-audio-upload-row">
          <label className="media-btn secondary"><Upload size={15}/> Slayd rasmlarini yuklash
            <input type="file" accept="image/jpeg,image/png" multiple disabled={busy} onChange={e=>{void upload(Array.from(e.target.files||[]),false);e.target.value="";}}/></label>
          <label className="media-btn secondary"><Music2 size={15}/> MP3 yuklash
            <input type="file" accept="audio/mpeg,.mp3" disabled={busy||locked||preparing} onChange={e=>{const f=e.target.files?.[0];if(f)void upload([f],true);e.target.value="";}}/></label>
        </div>
        {!post ? <p className="media-subtle">Rasmlarni yuklang, so‘ng “Yangi karusel” orqali sarlavha va slaydlar tartibini saqlang.</p> : <>
          <p className="media-subtle">{post.asset_ids.length} ta manba slayd · {post.title}</p>
          {locked && <div className="media-alert">Bu post rejalashtirilgan yoki yuborilgan. Tahrirlash uchun nusxa yarating.</div>}
          <CarouselAudioFields value={audio} assets={data.assets} onChange={setAudio} disabled={busy||locked||preparing}/>
          {preparing && <p role="status" className="carousel-audio-status"><RefreshCw className="animate-spin" size={17}/> Musiqali slaydlar tayyorlanmoqda…</p>}
          {status?.job?.status==="failed" && <div className="media-alert" role="alert">{status.job.error}</div>}
          {ready && <p className="carousel-audio-status"><CheckCircle2 size={18}/> Musiqali karusel tayyor · {outputs.length} slayd</p>}
          {dirty && <p className="media-subtle">Sozlamalar o‘zgargan. Yangi variantni saqlab, qayta tayyorlang.</p>}
          <div className="media-actions">
            <button className="media-btn" disabled={busy||locked||preparing||ready||!audio||post.asset_ids.length<2||post.asset_ids.length>10}
              onClick={()=>void save(true)}><Music2 size={16}/>{busy?"Bajarilmoqda…":ready?"Musiqali variant tayyor":"Saqlash va tayyorlash"}</button>
            <button className="media-btn secondary" disabled={busy||locked||preparing} onClick={()=>void save(false)}>Sozlamalarni saqlash</button>
            {ready && <button className="media-btn secondary" disabled={busy||locked} onClick={()=>onSchedule(post)}>Vaqtni belgilash</button>}
          </div>
        </>}
      </div>
      <div className="media-panel carousel-audio-preview">
        <h2>Oldindan ko‘rish</h2>
        {previewId ? <>
          <div className="carousel-audio-frame">{outputs.length ?
            <video key={previewId} controls playsInline preload="metadata" src={`/api/media/assets/${previewId}`} aria-label={`${slide+1}-musiqali slayd`}/> :
            <img src={`/api/media/assets/${previewId}`} alt={`${slide+1}-manba slayd`}/>}</div>
          <div className="carousel-audio-pagination">
            <button className="media-btn secondary small" aria-label="Oldingi slayd" disabled={slide===0} onClick={()=>setSlide(s=>s-1)}><ChevronLeft size={18}/></button>
            <span>{slide+1} / {post?.asset_ids.length}</span>
            <button className="media-btn secondary small" aria-label="Keyingi slayd" disabled={slide>=(post?.asset_ids.length||0)-1} onClick={()=>setSlide(s=>s+1)}><ChevronRight size={18}/></button>
          </div>
          <p className="media-subtle">{outputs.length?"Videoni yoqib, rasm va musiqa kesmasini tekshiring.":"Manba rasmlari. Musiqali variant tayyor bo‘lgach shu yerda ko‘rinadi."}</p>
        </> : <div className="media-empty"><Music2 size={35}/><p>Tanlangan karusel shu yerda ko‘rinadi.</p></div>}
      </div>
    </div>
  </div>;
}
