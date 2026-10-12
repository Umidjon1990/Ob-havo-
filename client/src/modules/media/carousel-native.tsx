import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Image, Music2, Plus, Upload } from "lucide-react";
import type { MediaPost } from "@shared/media";
import { carouselNativeSchema, type CarouselNative } from "@shared/carousel-native";
import { mediaApi, type MediaData } from "./api";
import CarouselAudioStudio from "./carousel-audio";
import "./carousel-audio.css";

export const nativeCarouselDefaults = carouselNativeSchema.parse({});
export function NativeCarouselFields({value, onChange, disabled = false}: {
  value: CarouselNative; onChange: (value: CarouselNative) => void; disabled?: boolean;
}) {
  return <div className="carousel-audio-settings">
    <label className="media-field"><span>Umumiy musiqa nomi va ijrochisi</span>
      <input className="media-input" maxLength={200} value={value.music_title} disabled={disabled}
        placeholder="Instagram katalogidan tanlanadigan trek"
        onChange={e => onChange({...value, music_title: e.target.value})}/></label>
    <div className="carousel-audio-controls">
      <label className="media-field"><span>Instagram musiqa havolasi · ixtiyoriy</span>
        <input className="media-input" type="url" value={value.music_url} disabled={disabled} placeholder="https://…"
          onChange={e => onChange({...value, music_url: e.target.value})}/></label>
      <label className="media-field"><span>Musiqa kesmasi boshlanishi · soniya</span>
        <input className="media-input" type="number" min={0} max={3600} step={0.1} value={value.start_seconds} disabled={disabled}
          onChange={e => onChange({...value, start_seconds: Number(e.target.value)})}/></label>
    </div>
    <p className="media-subtle">Bu musiqa eslatmasi. Barcha rasmlar uchun bitta umumiy trek Instagram ilovasida tanlanadi; rasmlar videoga aylantirilmaydi.</p>
  </div>;
}

function PhotoCarouselStudio({data, onSaved, onNew, onEdit, initialPostId}: {
  data: MediaData; onSaved: () => Promise<unknown>; onNew: () => void; onEdit: (post: MediaPost) => void; initialPostId?: string;
}) {
  const posts = data.posts.filter(p => p.format === "carousel" && !p.variants.carousel_audio);
  const [id, setId] = useState(posts.some(p => p.id === initialPostId) ? initialPostId! : posts.find(p => p.variants.carousel_native)?.id || "");
  const post = posts.find(p => p.id === id);
  const [settings, setSettings] = useState<CarouselNative>(nativeCarouselDefaults);
  const [slide, setSlide] = useState(0), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => {if (initialPostId && posts.some(p => p.id === initialPostId)) setId(initialPostId);}, [initialPostId]);
  useEffect(() => {
    setSettings(carouselNativeSchema.parse(post?.variants.carousel_native || {})); setSlide(0); setError(""); setMessage("");
  }, [id, JSON.stringify(post?.variants.carousel_native), JSON.stringify(post?.asset_ids)]);
  const locked = !!post?.deliveries.some(d => d.status !== "cancelled")
    || data.jobs.some(j => j.payload?.post_id === id && ["queued", "running"].includes(j.status));
  const dirty = !!post && JSON.stringify(settings) !== JSON.stringify(carouselNativeSchema.parse(post.variants.carousel_native || {}));
  const pictures = !!post && post.asset_ids.length >= 2 && post.asset_ids.length <= 10
    && post.asset_ids.every(id => data.assets.some(a => a.id === id && ["image/jpeg", "image/png"].includes(a.mime_type)));
  const ready = !!post?.variants.carousel_native && pictures && !dirty;
  const caption = post?.variants.instagram ?? post?.caption ?? "";
  async function save() {
    if (!post) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const normalized = carouselNativeSchema.parse(settings);
      await mediaApi(`/posts/${post.id}/carousel-native`, "PUT", {settings: normalized, updated_at: post.updated_at});
      setSettings(normalized);
      await onSaved(); setMessage("Foto-karusel paketi tayyor. Umumiy musiqani Instagram ilovasida qo‘shing.");
    } catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  async function upload(files: File[]) {
    setBusy(true); setError(""); setMessage("");
    try {
      for (const file of files) {
        if (!['image/jpeg','image/png'].includes(file.type) || file.size > 50 * 1024 * 1024) throw new Error("50 MB gacha JPG yoki PNG rasm tanlang.");
        const response = await fetch("/api/media/assets", {method: "POST", credentials: "same-origin",
          headers: {"Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name)}, body: file});
        const result = await response.json(); if (!response.ok) throw new Error(result.error || "Rasm yuklanmadi.");
      }
      await onSaved(); setMessage("Rasmlar yuklandi. Yangi foto-karusel ochib, ularni kerakli tartibda tanlang.");
    } catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  return <div className="carousel-audio-studio">
    <div className="media-page-header"><p className="media-subtle">Asl rasmlar → tayyor caption → Instagram ilovasida bitta umumiy musiqa.</p>
      <button className="media-btn" onClick={onNew} disabled={busy}><Plus size={16}/> Yangi foto-karusel</button></div>
    <div className="media-panel carousel-audio-intro"><Music2 size={25}/><div>
      <strong>Rasmlar suriladi, umumiy musiqa Instagram ilovasida ijro etiladi.</strong>
      <p>Panel asl rasmlar va captionni tartibli paketda tayyorlaydi. “Musiqa qo‘shish” va nashrni yakunlash Instagram ilovasida bajariladi. Bu paket avtomatik Instagram nashriga yuborilmaydi.</p>
    </div></div>
    {error && <div className="media-alert" role="alert">{error}</div>}
    {message && <div className="media-alert carousel-audio-success" role="status">{message}</div>}
    <div className="carousel-audio-layout">
      <div className="media-panel">
        <label className="media-field"><span>Foto-karusel posti</span>
          <select className="media-input" value={id} disabled={busy} onChange={e => setId(e.target.value)}>
            <option value="">Foto-karusel tanlang</option>{posts.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select></label>
        <div className="carousel-audio-upload-row"><label className="media-btn secondary"><Upload size={15}/> Asl rasmlarni yuklash
          <input type="file" accept="image/jpeg,image/png" multiple disabled={busy} onChange={e => {const files=Array.from(e.target.files || []); if(files.length) void upload(files); e.target.value="";}}/></label>
        </div>
        {!post ? <p className="media-subtle">2–10 ta rasm yuklang, so‘ng “Yangi foto-karusel” orqali sarlavha, caption va rasmlar tartibini saqlang.</p> : <>
          <p className="media-subtle">{post.asset_ids.length} ta asl rasm · {post.title}</p>
          {!pictures && <div className="media-alert">Foto-karusel uchun 2–10 ta JPG/PNG rasm tanlang.</div>}
          {locked && <div className="media-alert">Bu post tayyorlanmoqda yoki rejalashtirilgan. Yangi qoralama yoki nusxa yarating.</div>}
          <NativeCarouselFields value={settings} onChange={setSettings} disabled={locked || busy}/>
          <label className="media-field"><span>Instagram caption</span><textarea className="media-input" readOnly value={caption} rows={5}/></label>
          {ready && <p className="carousel-audio-status"><Image size={18}/> Foto-karusel paketi tayyor · {post.asset_ids.length} rasm</p>}
          <p className="media-subtle">ZIP ichida: raqamlangan asl rasmlar, CAPTION.txt, MUSIQA.txt va QOLLANMA.txt. Umumiy audio Instagramda qo‘shiladi.</p>
          <div className="media-actions">
            <button className="media-btn" disabled={busy || locked || !pictures} onClick={() => void save()}>{busy ? "Saqlanmoqda…" : "Foto-karuselni saqlash"}</button>
            {ready && <a className="media-btn secondary" href={`/api/media/posts/${post.id}/carousel-native/package`} download><Download size={16}/> Foto-karusel paketini olish</a>}
            <button className="media-btn secondary" disabled={busy || locked} onClick={() => onEdit(post)}>Matn va tartibni tahrirlash</button>
          </div>
        </>}
      </div>
      <div className="media-panel carousel-audio-preview"><h2>Asl rasmlarni ko‘rish</h2>
        {post?.asset_ids[slide] && pictures ? <>
          <div className="carousel-audio-frame"><img src={`/api/media/assets/${post.asset_ids[slide]}`} alt={`${slide + 1}-foto slayd`}/></div>
          <div className="carousel-audio-pagination">
            <button className="media-btn secondary small" aria-label="Oldingi foto" disabled={!slide} onClick={() => setSlide(s => s-1)}><ChevronLeft size={18}/></button>
            <span>{slide + 1} / {post.asset_ids.length}</span>
            <button className="media-btn secondary small" aria-label="Keyingi foto" disabled={slide >= post.asset_ids.length - 1} onClick={() => setSlide(s => s+1)}><ChevronRight size={18}/></button>
          </div><p className="media-subtle">Rasmli karusel. Bitta umumiy musiqa Instagram ilovasida tanlanadi.</p>
        </> : <div className="media-empty"><Image size={35}/><p>Foto-karusel rasmlari shu yerda ko‘rinadi.</p></div>}
      </div>
    </div>
  </div>;
}

export default function CarouselStudio(props: {
  data: MediaData; onSaved: () => Promise<unknown>; onNew: () => void; onEdit: (post: MediaPost) => void;
  initialPostId?: string; onSchedule: (post: MediaPost) => void;
}) {
  const [mode, setMode] = useState("photo");
  useEffect(() => {
    if (props.initialPostId) setMode(props.data.posts.find(p => p.id === props.initialPostId)?.variants.carousel_audio ? "video" : "photo");
  }, [props.initialPostId]);
  return <div className="carousel-audio-studio">
    <label className="media-field"><span>Karusel tayyorlash usuli</span>
      <select className="media-input" value={mode} onChange={e => setMode(e.target.value)}>
        <option value="photo">Instagram foto-karusel · umumiy musiqa ilovada</option>
        <option value="video">Musiqali video slaydlar · kesma har slaydda qayta boshlanadi</option>
      </select></label>
    {mode === "photo" ? <PhotoCarouselStudio {...props}/> : <CarouselAudioStudio {...props}/>}
  </div>;
}
