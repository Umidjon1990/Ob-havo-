import { useEffect, useState, type FormEvent } from "react";
import { ArrowUp, ArrowDown, ExternalLink, Plus, RefreshCw, Youtube } from "lucide-react";
import type { MediaAccount, MediaPost, YouTubePlaylistCatalog, YouTubePlaylistItem, YouTubePlaylist } from "@shared/media";
import { mediaApi } from "./api";

const privacyLabels = { public: "Ommaviy", unlisted: "Faqat havola orqali", private: "Shaxsiy" };
const activeAccounts = (accounts: MediaAccount[]) => accounts.filter(a => a.platform === "youtube" && a.enabled && a.verified_at);
const path = (accountId: string) => `/accounts/${accountId}/youtube/playlists`;
function PermissionNotice() {
  return <div className="media-alert">Playlist yaratish va tartiblash ruxsati yetishmaydi. <a href="/admin?section=accounts" className="underline">Platformalar</a> bo‘limida YouTube’ni Google orqali qayta ulang va playlist boshqaruviga ruxsat bering.</div>;
}
function usePlaylists(accountId: string, revision: number) {
  const [catalog, setCatalog] = useState<YouTubePlaylistCatalog | null>(null),
    [error, setError] = useState(""), [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setCatalog(null); setError(""); setLoading(!!accountId);
    if (accountId) void mediaApi<YouTubePlaylistCatalog>(path(accountId))
      .then(result => { if (!cancelled) setCatalog(result); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accountId, revision]);
  return { catalog, error, loading };
}

export function YouTubePlaylistFields({ accounts, value, onChange, disabled = false }: {
  accounts: MediaAccount[];
  value?: MediaPost["variants"]["youtube_playlist"];
  onChange: (value: MediaPost["variants"]["youtube_playlist"]) => void;
  disabled?: boolean;
}) {
  const available = activeAccounts(accounts);
  const [accountId, setAccountId] = useState(value?.account_id || available[0]?.id || ""),
    [revision, setRevision] = useState(0);
  const { catalog, error, loading } = usePlaylists(accountId, revision);
  return <div className="media-panel my-4">
    <h3>YouTube playlist</h3>
    {!available.length && <p className="media-subtle">Avval Platformalar bo‘limida YouTube kanalini ulang va tekshiring.</p>}
    <label className="media-field"><span>Playlist uchun YouTube hisobi</span>
      <select className="media-input" value={accountId} disabled={disabled || !available.length}
        onChange={e => { setAccountId(e.target.value); onChange(undefined); }}>
        {!available.some(a => a.id === accountId) && <option value={accountId}>{value ? "Saqlangan hisob hozir faol emas" : "YouTube hisobi yo‘q"}</option>}
        {available.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
    {error && <div className="media-alert" role="alert">{error}</div>}
    {catalog?.can_manage === false && <PermissionNotice />}
    <label className="media-field"><span>Videoni qo‘shish uchun playlist</span>
      <select className="media-input" value={value?.playlist_id || ""} disabled={disabled || loading || !catalog}
        onChange={e => {
          const selected = catalog?.playlists.find(p => p.id === e.target.value);
          onChange(selected ? { account_id: accountId, playlist_id: selected.id, title: selected.title } : undefined);
        }}>
        <option value="">Playlistga qo‘shilmasin</option>
        {value && !catalog?.playlists.some(p => p.id === value.playlist_id) && <option value={value.playlist_id}>{value.title || value.playlist_id} · saqlangan tanlov</option>}
        {catalog?.playlists.map(p => <option key={p.id} value={p.id}>{p.title} · {p.item_count} ta video</option>)}
      </select>
      <small>{loading ? "Playlistlar olinmoqda…" : "Nashr vaqtida video tanlangan playlistga qo‘shiladi."}</small>
    </label>
    {value && <label className="media-field"><span>Playlistdagi video o‘rni</span>
      <input className="media-input" type="number" min={1} max={10000} step={1} disabled={disabled}
        placeholder="Bo‘sh qoldirilsa oxiriga" value={value.position ?? ""}
        onChange={e => onChange({ ...value, position: e.target.value ? Number(e.target.value) : undefined })} />
      <small>1 — boshiga. Bo‘sh — oxiriga. Videolar kam bo‘lsa oxiriga qo‘shiladi. YouTube’da tartib Manual (qo‘lda) bo‘lishi kerak.</small>
    </label>}
    <div className="media-actions">
      <button className="media-btn secondary small" type="button" disabled={disabled || loading || !accountId} onClick={() => setRevision(r => r + 1)}><RefreshCw size={12} /> Yangilash</button>
      <a className="media-btn secondary small" href="/admin?section=playlists" target="_blank" rel="noreferrer"><Plus size={12} /> Playlist yaratish / boshqarish</a>
    </div>
  </div>;
}

export default function YouTubePlaylists({ accounts }: { accounts: MediaAccount[] }) {
  const available = activeAccounts(accounts);
  const [accountId, setAccountId] = useState(available[0]?.id || ""),
    [revision, setRevision] = useState(0), [playlistId, setPlaylistId] = useState(""),
    [items, setItems] = useState<YouTubePlaylistItem[]>([]), [itemsLoading, setItemsLoading] = useState(false),
    [title, setTitle] = useState(""), [description, setDescription] = useState(""),
    [privacy, setPrivacy] = useState<YouTubePlaylist["privacy"]>("private"),
    [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const { catalog, error: catalogError, loading } = usePlaylists(accountId, revision);
  useEffect(() => {
    if (!available.some(a => a.id === accountId)) {
      setAccountId(available[0]?.id || "");
      setPlaylistId("");
    }
  }, [accounts, accountId]);
  const selected = catalog?.playlists.find(p => p.id === playlistId);
  const canManage = !!catalog && catalog.can_manage !== false;
  useEffect(() => {
    let cancelled = false;
    setItems([]); setItemsLoading(!!playlistId); setError("");
    if (accountId && playlistId) void mediaApi<YouTubePlaylistItem[]>(`${path(accountId)}/${playlistId}/items`)
      .then(result => { if (!cancelled) setItems(result); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setItemsLoading(false); });
    return () => { cancelled = true; };
  }, [accountId, playlistId, revision]);
  async function create(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      const result = await mediaApi<YouTubePlaylist>(path(accountId), "POST", { title, description, privacy });
      setTitle(""); setDescription(""); setPlaylistId(result.id); setRevision(r => r + 1);
      setSuccess(`“${result.title}” playlist yaratildi.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function move(itemId: string, position: number) {
    setBusy(true); setError(""); setSuccess("");
    try {
      await mediaApi(`${path(accountId)}/${playlistId}/items/${itemId}`, "PATCH", { position });
      setRevision(r => r + 1); setSuccess("Video o‘rni YouTube’da saqlandi va tekshirildi.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <div className="media-panel">
      <div className="media-form-grid">
        <label className="media-field"><span>YouTube hisobi</span>
          <select className="media-input" value={accountId} disabled={busy || !available.length}
            onChange={e => { setAccountId(e.target.value); setPlaylistId(""); setError(""); setSuccess(""); }}>
            {!available.length && <option value="">Faol YouTube hisobi yo‘q</option>}
            {available.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <div className="media-actions items-center"><button className="media-btn secondary" disabled={busy || loading || !accountId} onClick={() => setRevision(r => r + 1)}><RefreshCw size={14} /> Playlistlarni yangilash</button></div>
      </div>
      {!available.length && <p className="media-subtle">Platformalar bo‘limida YouTube kanalini ulang va tekshiring.</p>}
      {loading && <p className="media-subtle">Playlistlar olinmoqda…</p>}
      {catalogError && <div className="media-alert" role="alert">{catalogError}</div>}
      {catalog?.can_manage === false && <PermissionNotice />}
      {error && <div className="media-alert" role="alert">{error}</div>}
      {success && <div className="media-alert media-success" role="status">{success}</div>}
    </div>
    <div className="media-card-grid mt-4">
      <section className="media-panel"><h2><Youtube size={18} className="inline mr-2" />Yangi playlist</h2>
        <form onSubmit={e => void create(e)}><fieldset disabled={busy || !canManage}>
          <label className="media-field"><span>Playlist nomi</span><input className="media-input" required maxLength={150} value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label className="media-field"><span>Playlist tavsifi</span><textarea className="media-input" maxLength={5000} value={description} onChange={e => setDescription(e.target.value)} /></label>
          <label className="media-field"><span>Playlist ko‘rinishi</span><select className="media-input" value={privacy} onChange={e => setPrivacy(e.target.value as typeof privacy)}>{Object.entries(privacyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button className="media-btn" type="submit"><Plus size={14} />{busy ? "Bajarilmoqda…" : "YouTube’da playlist yaratish"}</button>
        </fieldset></form>
      </section>
      <section className="media-panel"><h2>Playlistlar va video tartibi</h2>
        <label className="media-field"><span>Boshqariladigan playlist</span><select className="media-input" value={playlistId} disabled={busy || loading || !catalog}
          onChange={e => { setPlaylistId(e.target.value); setSuccess(""); }}>
          <option value="">Playlist tanlang</option>
          {catalog?.playlists.map(p => <option key={p.id} value={p.id}>{p.title} · {p.item_count} ta video</option>)}
        </select></label>
        {catalog && !catalog.playlists.length && <p className="media-subtle">Bu kanalda playlist topilmadi. Yangi playlist yarating.</p>}
        {selected && <p className="media-subtle mb-4">{privacyLabels[selected.privacy]} · <a href={selected.url} target="_blank" rel="noreferrer" className="underline">YouTube’da ochish <ExternalLink size={12} className="inline" /></a></p>}
        {itemsLoading ? <p className="media-subtle">Videolar olinmoqda…</p> : playlistId && !items.length && !error && <p className="media-subtle">Playlist hozir bo‘sh. Kontentning YouTube oynasida uni tanlang — video nashr vaqtida qo‘shiladi.</p>}
        {items.map(item => <PlaylistItemRow key={item.id} item={item} count={items.length} disabled={busy || itemsLoading || loading || !canManage} onMove={position => void move(item.id, position)} />)}
        {!!items.length && <p className="media-subtle mt-4">O‘rinlar 1 dan boshlanadi. Tartiblash uchun YouTube playlist sozlamasida Manual (qo‘lda) tartibni tanlang.</p>}
      </section>
    </div>
  </>;
}
function PlaylistItemRow({ item, count, disabled, onMove }: { item: YouTubePlaylistItem; count: number; disabled: boolean; onMove: (position: number) => void }) {
  const [position, setPosition] = useState(String(item.position));
  useEffect(() => setPosition(String(item.position)), [item.position]);
  const target = Number(position), valid = Number.isInteger(target) && target >= 1 && target <= count;
  return <div className="media-list-item block">
    <a href={item.url} target="_blank" rel="noreferrer" className="break-words">{item.position}. {item.title}</a>
    <div className="media-actions items-center mt-3">
      <button className="media-icon-button" aria-label={`${item.title} yuqoriga`} disabled={disabled || item.position <= 1} onClick={() => onMove(item.position - 1)}><ArrowUp size={14} /></button>
      <button className="media-icon-button" aria-label={`${item.title} pastga`} disabled={disabled || item.position >= count} onClick={() => onMove(item.position + 1)}><ArrowDown size={14} /></button>
      <input className="media-input" style={{ width: 80 }} aria-label={`${item.title} yangi o‘rni`} type="number" min={1} max={count} step={1} value={position} disabled={disabled} onChange={e => setPosition(e.target.value)} />
      <button className="media-btn secondary small" disabled={disabled || !valid || target === item.position} onClick={() => onMove(target)}>Joyini saqlash</button>
    </div>
  </div>;
}
