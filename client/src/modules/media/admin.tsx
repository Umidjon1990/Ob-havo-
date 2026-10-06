import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Mic,
  LayoutDashboard,
  CalendarDays,
  Files,
  FolderOpen,
  Link2,
  Brain,
  Sparkles,
  CloudSun,
  BookOpen,
  Newspaper,
  Plus,
  ArrowRight,
  LogOut,
  Check,
  Clock,
  AlertCircle,
  Video,
  Image as ImageIcon,
  MessageSquare,
  Upload,
  Search,
  ChevronLeft,
  ChevronRight,
  Copy,
  Trash2,
  ExternalLink,
  RefreshCw,
  Download,
  Send,
  Instagram,
  Youtube,
  Lock,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import LegacyAdmin from "@/modules/administration/legacy-admin";
import {
  loadMedia,
  mediaApi,
  tashkentDate,
  localInput,
  inputToIso,
  sizeLabel,
  type MediaData,
} from "./api";
import {
  deliveryLabels,
  type MediaPost,
  type MediaAccount,
  type MediaAsset,
  type MediaRule,
  type MediaReference,
  postSchema,
} from "@shared/media";
import "./media.css";
import ExplainerStudio from "./explainer-studio";
import GrowthStudio from "./growth-studio";
import ReelsStudio from "./reels-studio";
type Section =
  | "reels"
  | "growth"
  | "overview"
  | "posts"
  | "calendar"
  | "explainer"
  | "audio"
  | "assets"
  | "accounts"
  | "rules"
  | "references"
  | "weather"
  | "learning"
  | "news";
const nav = [
  ["reels", "Reels studiyasi", Video],
  ["growth", "Instagram agent", MessageSquare],
  ["overview", "Umumiy ko‘rinish", LayoutDashboard],
  ["posts", "Kontentlar", Files],
  ["calendar", "Nashr taqvimi", CalendarDays],
  ["assets", "Media kutubxonasi", FolderOpen],
  ["audio", "Audio yaratish", Mic],
  ["explainer", "Explainer video", Video],
  ["accounts", "Platformalar", Link2],
  ["rules", "Agent xotirasi", Brain],
  ["references", "Namunalar", Sparkles],
  ["weather", "Ob-havo", CloudSun],
  ["learning", "Haftalik testlar", BookOpen],
  ["news", "Arabcha yangiliklar", Newspaper],
] as const;
const formats: Record<string, string> = {
  text: "Matnli post",
  article: "Telegram Article",
  image: "Rasmli post",
  video: "Reels / Shorts",
  carousel: "Karusel",
  stickman: "3D Stickman",
};
const scopes: Record<string, string> = {
  brand: "Umumiy brend",
  video: "Video",
  image: "Rasm",
  carousel: "Karusel",
  stickman: "Stickman",
  project: "Alohida loyiha",
};
const platformIcon = { telegram: Send, instagram: Instagram, youtube: Youtube };
function Button({
  children,
  onClick,
  secondary = false,
  small = false,
  disabled = false,
  type = "button",
  danger = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  small?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  danger?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`media-btn ${secondary ? "secondary" : ""} ${small ? "small" : ""} ${danger ? "danger" : ""}`}
    >
      {children}
    </button>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="media-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="media-empty">
      <FolderOpen size={34} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="media-modal sm:max-w-2xl">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
function Preview({ post, assets }: { post: MediaPost; assets: MediaAsset[] }) {
  const a = assets.find((a) => a.id === post.asset_ids[0]);
  return (
    <div className="media-post-preview">
      {a?.mime_type.startsWith("image/") ? (
        <img
          src={`/api/media/assets/${a.id}`}
          alt={post.title}
          loading="lazy"
        />
      ) : a?.mime_type.startsWith("video/") ? (
        <video src={`/api/media/assets/${a.id}`} muted preload="metadata" />
      ) : post.format === "text" ? (
        <MessageSquare size={36} />
      ) : ["video", "stickman"].includes(post.format) ? (
        <Video size={38} />
      ) : (
        <ImageIcon size={38} />
      )}
    </div>
  );
}
function PostCard({
  p,
  data,
  onEdit,
  onSchedule,
  onCopy,
}: {
  p: MediaPost;
  data: MediaData;
  onEdit: () => void;
  onSchedule: () => void;
  onCopy: () => void;
}) {
  const active = p.deliveries.filter((d) => d.status !== "cancelled");
  const status = active.length
    ? active.find((d) => d.status === "failed" || d.status === "needs_review")
        ?.status || active[0].status
    : "draft";
  return (
    <article className="media-post-card">
      <Preview post={p} assets={data.assets} />
      <div className="media-post-body">
        <div className="media-post-meta">
          <span className="media-chip">{formats[p.format]}</span>
          <span className={`media-chip ${status}`}>
            {deliveryLabels[status] || "Qoralama"}
          </span>
        </div>
        <h3>{p.title}</h3>
        <p className="media-post-caption" dir="auto">
          {p.caption}
        </p>
        <div className="media-actions">
          {active.map((d) => (
            <span key={d.id} className={`media-chip ${d.status}`}>
              {d.platform} · {deliveryLabels[d.status]}
            </span>
          ))}
        </div>
        <div className="media-actions">
          <Button secondary small onClick={onEdit}>
            {active.length ? "Ko‘rish" : "Tahrirlash"}
          </Button>
          <Button small onClick={onSchedule}>
            <Clock size={12} /> Rejalash
          </Button>
          <button
            aria-label="Post nusxasini yaratish"
            className="media-icon-button"
            onClick={onCopy}
          >
            <Copy size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
export default function MediaAdmin() {
  const [auth, setAuth] = useState<"loading" | "login" | "ready">("loading");
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState("");
  const initial = new URLSearchParams(window.location.search).get("section");
  const [section, setSection] = useState<Section>(
    nav.some((n) => n[0] === initial) ? (initial as Section) : "overview",
  );
  const [data, setData] = useState<MediaData | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState("");
  const [editPost, setEditPost] = useState<MediaPost | null | undefined>(),
    [schedule, setSchedule] = useState<MediaPost[] | null>(null),
    [campaign, setCampaign] = useState(false),
    [account, setAccount] = useState(false),
    [rule, setRule] = useState<MediaRule | null | undefined>(),
    [reference, setReference] = useState(false);
  const [history, setHistory] = useState<any[] | null>(null),
    [confirm, setConfirm] = useState<{
      text: string;
      action: () => Promise<unknown>;
    } | null>(null);
  const refresh = async () => setData(await loadMedia());
  useEffect(() => {
    const headers: Record<string, string> = {};
    const token = localStorage.getItem("admin_token");
    if (token) headers.Authorization = `Bearer ${token}`;
    fetch("/api/admin/verify", { method: "POST", headers })
      .then((r) => {
        setAuth(r.ok ? "ready" : "login");
        if (!r.ok) localStorage.removeItem("admin_token");
      })
      .catch(() => {
        setError("Serverga ulanib bo‘lmadi. Qayta urinib ko‘ring.");
        setAuth("login");
      });
    const expire = () => {
      setAuth("login");
      setData(null);
      setEditPost(undefined);
      setSchedule(null);
      setCampaign(false);
      setAccount(false);
      setRule(undefined);
      setReference(false);
    };
    window.addEventListener("media-auth-expired", expire);
    return () => window.removeEventListener("media-auth-expired", expire);
  }, []);
  useEffect(() => {
    if (auth !== "ready") return;
    void refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => void refresh().catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [auth]);
  const go = (s: Section) => {
    setSection(s);
    setSearch("");
    const u = new URL(window.location.href);
    u.searchParams.set("section", s);
    u.searchParams.delete("oauth");
    window.history.replaceState({}, "", u);
  };
  async function run(fn: () => Promise<unknown>, message = "Saqlandi.") {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await fn();
      await refresh();
      setSuccess(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Amal bajarilmadi.");
    } finally {
      setBusy(false);
    }
  }
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Kirish bajarilmadi.");
      localStorage.setItem("admin_token", d.token);
      setPassword("");
      setAuth("ready");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      localStorage.removeItem("admin_token");
      setData(null);
      setAuth("login");
    } finally {
      setBusy(false);
    }
  }
  const copyPost = (p: MediaPost) =>
    run(
      () =>
        mediaApi("/posts", "POST", {
          ...p,
          title: `${p.title.slice(0, 90)} (nusxa)`,
          variants: { ...p.variants, suggested_at: undefined },
        }),
      "Post nusxasi yaratildi.",
    );
  const title = nav.find((n) => n[0] === section)?.[1] || "";
  const descriptions: Record<Section, string> = {
    reels: "Instagram reklama videolari, cover, klon ovoz va kalit so‘zli Direct.",
    growth: "Auditoriya bilan muloqot, natijalar va sifat nazorati.",
    overview: "Barcha ishlaringiz bir joyda. Navbatdagi kontentdan boshlaymiz.",
    posts: "G‘oyadan tayyor postgacha. Har bir platformaga mos matn va media.",
    calendar: "Nashrlar sanasi va har bir kanaldagi natija. Toshkent vaqti.",
    explainer: "Post → ssenariy → klon ovoz → audioga mos video.",
    audio: "ElevenLabs v4 · O‘zbekcha va arabcha · Shaxsiy va boshqa ovozlar.",
    assets: "Yaratilgan rasm, video va audiolaringiz uchun doimiy saqlash.",
    accounts: "Instagram, Telegram va YouTube ulanishlarini boshqaring.",
    rules: "Keyingi topshiriqlarda qayta aytishingiz shart bo‘lmagan talablar.",
    references: "Yoqqan Reels va postlardan olingan usullarni saqlang.",
    weather: "Ob-havo boti, kanallar va mavjud yuborish sozlamalari.",
    learning: "Tinglash, o‘qish, ovozlar va mavjud haftalik yuborish jadvali.",
    news: "Mavjud arabcha yangiliklar boti va uning alohida kanallari.",
  };
  if (auth === "loading")
    return (
      <div className="media-app media-login">
        <RefreshCw className="animate-spin" /> Kirish tekshirilmoqda…
      </div>
    );
  if (auth === "login")
    return (
      <div className="media-app media-login">
        <form className="media-login-card" onSubmit={login}>
          <div className="media-mark">Z</div>
          <h1>Zamonaviy Media Agent</h1>
          <p>
            Kontentlaringiz, nashrlar va ta’lim loyihalari uchun shaxsiy
            boshqaruv.
          </p>
          {error && (
            <div role="alert" className="media-alert">
              {error}
            </div>
          )}
          <Field label="Login">
            <input
              autoComplete="username"
              className="media-input"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="Parol">
            <input
              autoComplete="current-password"
              className="media-input"
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy}>
            <Lock size={15} />
            {busy ? "Kirilmoqda…" : "Panelga kirish"}
            <ArrowRight size={14} />
          </Button>
          <div className="media-subtle" style={{ marginTop: 24 }}>
            <a href="/">Ob-havo sahifasi</a> ·{" "}
            <a href="/tests">Testlar arxivi</a>
          </div>
        </form>
      </div>
    );
  const counts = data?.overview.counts || {};
  const pendingPosts =
    data?.posts.filter(
      (p) =>
        p.variants.suggested_at &&
        new Date(p.variants.suggested_at) > new Date() &&
        !p.deliveries.some((d) => d.status !== "cancelled"),
    ) || [];
  return (
    <div className="media-app">
      <aside className="media-sidebar">
        <div className="media-brand">
          <div className="media-mark">Z</div>
          <div>
            <strong>Zamonaviy</strong>
            <small>Media Agent</small>
          </div>
        </div>
        <nav className="media-nav" aria-label="Boshqaruv bo‘limlari">
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={section === id ? "active" : ""}
              onClick={() => go(id)}
              aria-current={section === id ? "page" : undefined}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="media-sidebar-foot">
          <span>Shaxsiy ish maydoni</span>
          <br />
          <a href="/" target="_blank" rel="noreferrer">
            Ob-havo sahifasi ↗
          </a>
          <br />
          <a href="/tests" target="_blank" rel="noreferrer">
            Testlar arxivi ↗
          </a>
        </div>
      </aside>
      <main className="media-main">
        <header className="media-topbar">
          <div>
            <small>SHAXSIY BOSHQARUV</small>
            <br />
            <span>Salom, Umidjon</span>
          </div>
          <div className="media-actions">
            <span className="media-chip">
              <Clock size={12} /> Toshkent · UTC+5
            </span>
            <Button
              secondary
              small
              onClick={() => void logout()}
              disabled={busy}
            >
              <LogOut size={13} /> Chiqish
            </Button>
          </div>
        </header>
        <div className="media-heading">
          <div>
            <h1>{title}</h1>
            <p>{descriptions[section]}</p>
          </div>
          {["overview", "posts", "calendar"].includes(section) && (
            <Button onClick={() => setEditPost(null)}>
              <Plus size={16} /> Yangi kontent
            </Button>
          )}
          {section === "accounts" && (
            <Button onClick={() => setAccount(true)}>
              <Plus size={16} /> Hisob ulash
            </Button>
          )}
          {section === "rules" && (
            <Button onClick={() => setRule(null)}>
              <Plus size={16} /> Talab qo‘shish
            </Button>
          )}
          {section === "references" && (
            <Button onClick={() => setReference(true)}>
              <Plus size={16} /> Namuna qo‘shish
            </Button>
          )}
        </div>
        {error && (
          <div role="alert" className="media-alert">
            {error}
            <button className="ml-3 underline" onClick={() => setError("")}>
              Yopish
            </button>
          </div>
        )}
        {success && (
          <div role="status" className="media-alert media-success">
            {success}
          </div>
        )}
        {!data ? (
          <div className="media-panel">
            <RefreshCw className="animate-spin" /> Panel ma’lumotlari
            yuklanmoqda…
            <Button secondary onClick={() => void run(refresh, "Yangilandi.")}>
              Qayta yuklash
            </Button>
          </div>
        ) : (
          <>
            {section === "overview" && (
              <>
                <section className="media-banner">
                  <div>
                    <div className="media-kicker">
                      Sizning ijodiy yordamchingiz
                    </div>
                    <h2>
                      Bir g‘oya. Uch platforma.
                      <br />
                      Hammasi bitta rejada.
                    </h2>
                    <p>
                      Kontent tayyorlang, platformalarni tanlang va vaqtini
                      belgilang. Agent nashrlarni navbat bilan yuboradi, siz esa
                      natijalarni shu yerda ko‘rasiz.
                    </p>
                    <div className="media-actions" style={{ marginTop: 20 }}>
                      <Button onClick={() => setCampaign(true)}>
                        <Sparkles size={15} /> Oylik AI reja
                      </Button>
                      <Button secondary onClick={() => go("calendar")}>
                        Taqvimni ko‘rish <ArrowRight size={14} />
                      </Button>
                    </div>
                  </div>
                  <div className="media-banner-art">
                    <Sparkles size={60} strokeWidth={1.2} />
                  </div>
                </section>
                <div className="media-stats">
                  {[
                    [
                      "Qoralamalar",
                      data.posts.filter(
                        (p) =>
                          !p.deliveries.some((d) => d.status !== "cancelled"),
                      ).length,
                      "Tayyorlash uchun",
                      Files,
                    ],
                    [
                      "Rejalashtirilgan",
                      counts.scheduled || 0,
                      "Navbatdagi nashrlar",
                      CalendarDays,
                    ],
                    [
                      "Yuborilgan",
                      counts.published || 0,
                      "Platformalar bo‘yicha",
                      Check,
                    ],
                    [
                      "E’tibor kerak",
                      (counts.failed || 0) + (counts.needs_review || 0),
                      "Xato yoki noaniq natija",
                      AlertCircle,
                    ],
                  ].map(([label, value, note, Icon]) => {
                    const I = Icon as typeof Files;
                    return (
                      <div className="media-stat" key={String(label)}>
                        <div className="media-stat-top">
                          {String(label)}
                          <I size={17} />
                        </div>
                        <strong>{String(value)}</strong>
                        <small>{String(note)}</small>
                      </div>
                    );
                  })}
                </div>
                <div className="media-grid-two">
                  <section className="media-panel">
                    <div className="media-toolbar">
                      <h2>So‘nggi kontentlar</h2>
                      <button
                        className="text-xs text-emerald-700"
                        onClick={() => go("posts")}
                      >
                        Barchasi →
                      </button>
                    </div>
                    {data.posts.length ? (
                      data.posts.slice(0, 5).map((p) => (
                        <div key={p.id} className="media-list-item">
                          <div>
                            <span className="media-chip">
                              {formats[p.format]}
                            </span>
                            <h3>{p.title}</h3>
                            <span className="media-subtle">
                              {p.variants.suggested_at
                                ? tashkentDate(p.variants.suggested_at)
                                : "Sana belgilanmagan"}
                            </span>
                          </div>
                          <Button
                            small
                            secondary
                            onClick={() => setEditPost(p)}
                          >
                            Ochish <ArrowRight size={12} />
                          </Button>
                        </div>
                      ))
                    ) : (
                      <Empty
                        title="Birinchi g‘oyadan boshlaymiz"
                        description="Tayyor video yoki rasmingizni yuklang, yoki agentga oylik kontent rejasini tayyorlating."
                        action={
                          <Button onClick={() => setEditPost(null)}>
                            Kontent yaratish
                          </Button>
                        }
                      />
                    )}
                  </section>
                  <section className="media-panel">
                    <h2>Ishni boshlash</h2>
                    {[
                      [
                        "1",
                        "Platformani ulang",
                        "Bot huquqi va hisob ulanishini tekshiring.",
                        "accounts",
                      ],
                      [
                        "2",
                        "Kontent tayyorlang",
                        "Media, matn va platforma variantlarini kiriting.",
                        "posts",
                      ],
                      [
                        "3",
                        "Vaqtni belgilang",
                        "Agent har bir platformaga alohida yuboradi.",
                        "calendar",
                      ],
                    ].map(([num, label, note, s]) => (
                      <div key={num} className="media-step">
                        <span>{num}</span>
                        <div>
                          <h3>{label}</h3>
                          <p>{note}</p>
                          <button onClick={() => go(s as Section)}>
                            Bo‘limga o‘tish →
                          </button>
                        </div>
                      </div>
                    ))}
                    <p className="media-subtle mt-5">
                      Mavjud ob-havo va haftalik test jarayonlari o‘z
                      sozlamalari bilan davom etadi.
                    </p>
                  </section>
                </div>
              </>
            )}
            {section === "posts" && (
              <>
                <div className="media-toolbar">
                  <input
                    className="media-input media-search"
                    aria-label="Kontent qidirish"
                    placeholder="Sarlavha yoki matn bo‘yicha qidirish…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="media-actions">
                    <Button secondary onClick={() => setCampaign(true)}>
                      <Sparkles size={14} /> Oylik AI reja
                    </Button>
                    {pendingPosts.length > 0 && (
                      <Button
                        secondary
                        onClick={() => setSchedule(pendingPosts)}
                      >
                        <CalendarDays size={14} /> Oylik rejani nashrga qo‘yish
                      </Button>
                    )}
                  </div>
                </div>
                {data.jobs
                  .filter(
                    (j) =>
                      j.status === "queued" ||
                      j.status === "running" ||
                      j.status === "failed",
                  )
                  .map((j) => (
                    <div className="media-alert" key={j.id}>
                      {j.status === "running" || j.status === "queued"
                        ? `AI reja tayyorlanmoqda. ${j.result?.post_ids?.length || 0} ta qoralama saqlandi.`
                        : j.error}
                    </div>
                  ))}
                <div className="media-card-grid">
                  {data.posts
                    .filter((p) =>
                      (p.title + " " + p.caption)
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((p) => (
                      <PostCard
                        key={p.id}
                        p={p}
                        data={data}
                        onEdit={() => setEditPost(p)}
                        onSchedule={() => setSchedule([p])}
                        onCopy={() => void copyPost(p)}
                      />
                    ))}
                </div>
                {!data.posts.length && (
                  <div className="media-panel">
                    <Empty
                      title="Kontentlar shu yerda jamlanadi"
                      description="Reels, Shorts, karusel, rasmli va matnli postlarni bitta joydan tayyorlang."
                      action={
                        <Button onClick={() => setEditPost(null)}>
                          <Plus size={15} /> Birinchi post
                        </Button>
                      }
                    />
                  </div>
                )}
              </>
            )}
            {section === "calendar" && (
              <Calendar
                posts={data.posts}
                onOpen={(p) => setEditPost(p)}
                onAction={(id, action) =>
                  void run(
                    () => mediaApi(`/deliveries/${id}/${action}`, "POST"),
                    "Nashr holati yangilandi.",
                  )
                }
                onResolve={(id) =>
                  setConfirm({
                    text: "Platformada tekshirdingizmi? Ushbu nashr yuborilmagan deb belgilaysiz. Keyin qayta yuborish mumkin.",
                    action: () =>
                      mediaApi(`/deliveries/${id}/resolve`, "POST", {
                        published: false,
                      }),
                  })
                }
                onPublished={(id) =>
                  void run(
                    () =>
                      mediaApi(`/deliveries/${id}/resolve`, "POST", {
                        published: true,
                      }),
                    "Nashr yuborilgan deb belgilandi.",
                  )
                }
                busy={busy}
              />
            )}
            {section === "growth" && <GrowthStudio data={data} onSaved={refresh} />}
            {section === "reels" && <ReelsStudio data={data} onSaved={refresh} />}
            {section === "audio" && <AudioStudio onSaved={refresh} />}
            {section === "explainer" && <ExplainerStudio data={data} onSaved={refresh} />}
            {section === "assets" && (
              <>
                <div className="media-upload">
                  <Upload size={32} />
                  <h2 className="font-semibold">
                    Tayyor media fayllarni yuklang
                  </h2>
                  <p className="media-subtle">
                    JPG, PNG, MP4 va MP3 · Har bir fayl 50 MB gacha ·{" "}
                    {sizeLabel(Number(data.overview.storage.bytes))} / 1 GB
                  </p>
                  <input
                    aria-label="Media fayl yuklash"
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,video/mp4,audio/mpeg"
                    disabled={busy}
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      void run(async () => {
                        for (const f of files) {
                          if (f.size > 50 * 1024 * 1024)
                            throw new Error(`${f.name}: fayl 50 MB dan katta.`);
                          const r = await fetch("/api/media/assets", {
                            method: "POST",
                            headers: {
                              "Content-Type": f.type,
                              "X-File-Name": encodeURIComponent(f.name),
                            },
                            body: f,
                          });
                          const d = await r.json();
                          if (!r.ok)
                            throw new Error(d.error || "Fayl yuklanmadi.");
                        }
                      }, "Fayllar kutubxonaga yuklandi.");
                      e.target.value = "";
                    }}
                  />
                  {busy && (
                    <p className="media-subtle mt-3">
                      Yuklanmoqda, sahifani yopmang…
                    </p>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.assets.map((a) => (
                    <div className="media-file" key={a.id}>
                      {a.mime_type.startsWith("image/") ? (
                        <img src={`/api/media/assets/${a.id}`} alt="" />
                      ) : a.mime_type.startsWith("video/") ? (
                        <Video size={25} />
                      ) : (
                        <MessageSquare size={25} />
                      )}
                      <div>
                        <strong>{a.name}</strong>
                        <small>
                          {sizeLabel(a.size)} · {tashkentDate(a.created_at)}
                        </small>
                      </div>
                      <a
                        href={`/api/media/assets/${a.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="media-icon-button"
                        aria-label="Faylni ochish"
                      >
                        <ExternalLink size={14} />
                      </a>
                      <AssetDownload asset={a} />
                      <button
                        className="media-icon-button"
                        aria-label="Faylni o‘chirish"
                        onClick={() =>
                          setConfirm({
                            text: `${a.name} faylini kutubxonadan o‘chirasizmi?`,
                            action: () => mediaApi(`/assets/${a.id}`, "DELETE"),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            {section === "accounts" && (
              <>
                <div className="media-alert">
                  Telegram uchun mavjud bot ishlatiladi. Instagram professional
                  hisob tokeni bilan ulanadi. YouTube uchun Google OAuth
                  sozlamalari va hisob egasining kirishi kerak.
                </div>
                {new URLSearchParams(window.location.search).get("oauth") ===
                  "failed" && (
                  <div className="media-alert">
                    YouTube ulanmadi. Google ilova ruxsatlari va callback
                    manzilini tekshiring.
                  </div>
                )}
                <div className="media-card-grid">
                  {(["telegram", "instagram", "youtube"] as const).map(
                    (platform) => {
                      const Icon = platformIcon[platform];
                      const accounts = data.accounts.filter(
                        (a) => a.platform === platform,
                      );
                      return (
                        <section className="media-panel" key={platform}>
                          <div className="media-actions items-center">
                            <div className="media-account-icon">
                              <Icon size={22} />
                            </div>
                            <h2 className="capitalize">{platform}</h2>
                          </div>
                          {accounts.map((a) => (
                            <div className="media-list-item" key={a.id}>
                              <div>
                                <h3>{a.name}</h3>
                                <p className="media-subtle break-all">
                                  {a.external_id}
                                </p>
                                <span
                                  className={`media-chip ${a.verified_at && a.enabled ? "good" : ""}`}
                                >
                                  {!a.enabled
                                    ? "Pauzada"
                                    : a.verified_at
                                      ? "Tekshirilgan"
                                      : "Tekshirilmagan"}
                                </span>
                                <div className="media-actions mt-3">
                                  <Button
                                    small
                                    secondary
                                    disabled={busy}
                                    onClick={() =>
                                      void run(
                                        () =>
                                          mediaApi(
                                            `/accounts/${a.id}/verify`,
                                            "POST",
                                          ),
                                        "Hisob tekshirildi.",
                                      )
                                    }
                                  >
                                    <RefreshCw size={12} /> Tekshirish
                                  </Button>
                                  <Button
                                    small
                                    secondary
                                    disabled={busy}
                                    onClick={() =>
                                      void run(
                                        () =>
                                          mediaApi(
                                            `/accounts/${a.id}`,
                                            "PATCH",
                                            { enabled: !a.enabled },
                                          ),
                                        a.enabled
                                          ? "Hisob pauzaga qo‘yildi."
                                          : "Hisob yoqildi.",
                                      )
                                    }
                                  >
                                    {a.enabled ? "Pauza" : "Yoqish"}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                          {!accounts.length && (
                            <p className="media-subtle my-6">
                              Hali hisob ulanmagan.
                            </p>
                          )}
                          {platform === "youtube" ? (
                            <>
                              <Button
                                secondary
                                disabled={
                                  busy ||
                                  !data.overview.capabilities.youtube_oauth
                                }
                                onClick={() =>
                                  void run(async () => {
                                    const r = await mediaApi<{ url: string }>(
                                      "/oauth/youtube/start",
                                    );
                                    window.location.assign(r.url);
                                  }, "YouTube kirishiga o‘tilmoqda.")
                                }
                              >
                                <Youtube size={14} /> Google orqali ulash
                              </Button>
                              {!data.overview.capabilities.youtube_oauth && (
                                <p className="media-subtle mt-3">
                                  GOOGLE_CLIENT_ID va GOOGLE_CLIENT_SECRET
                                  kerak. Callback:
                                  <br />
                                  <code className="break-all text-[10px]">
                                    {window.location.origin}
                                    /api/media/oauth/youtube/callback
                                  </code>
                                </p>
                              )}
                              <p className="media-subtle mt-3">
                                Google tekshiruvidan o‘tmagan API loyihasi
                                videoni private holatda cheklashi mumkin.
                              </p>
                            </>
                          ) : (
                            <Button secondary onClick={() => setAccount(true)}>
                              <Plus size={14} /> Hisob qo‘shish
                            </Button>
                          )}
                        </section>
                      );
                    },
                  )}
                </div>
                <section className="media-panel mt-6">
                  <h2>Metricool — qo‘shimcha variant</h2>
                  <p className="media-subtle mt-3">
                    Bepul hisobdagi nashrlarni alohida boshqarish mumkin. Hozir
                    bu panel Metricoolga ulanmagan. Bir postni ikki tizimda bir
                    vaqtda rejalashtirmang.
                  </p>
                  <a
                    className="media-btn secondary mt-4"
                    href="https://app.metricool.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Metricoolni ochish <ExternalLink size={13} />
                  </a>
                </section>
              </>
            )}
            {section === "rules" && (
              <>
                <div className="media-alert media-success">
                  Faol umumiy va mos formatdagi talablar AI reja tuzilishidan
                  oldin o‘qiladi. O‘zgarishlar versiya bilan saqlanadi. Alohida
                  loyiha talabi umumiy brendga avtomatik o‘tmaydi.
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {data.rules.map((r) => (
                    <section className="media-panel media-rule" key={r.id}>
                      <div className="media-toolbar">
                        <span className="media-scope">
                          {scopes[r.scope]} · v{r.version}
                        </span>
                        <span
                          className={`media-chip ${r.active ? "good" : ""}`}
                        >
                          {r.active ? "Faol" : "Pauzada"}
                        </span>
                      </div>
                      <h2>{r.title}</h2>
                      <p>{r.content}</p>
                      <div className="media-actions">
                        <Button small secondary onClick={() => setRule(r)}>
                          Tahrirlash
                        </Button>
                        <Button
                          small
                          secondary
                          onClick={() =>
                            void run(
                              async () =>
                                setHistory(
                                  await mediaApi<any[]>(
                                    `/rules/${r.id}/history`,
                                  ),
                                ),
                              "Versiyalar ochildi.",
                            )
                          }
                        >
                          Tarix
                        </Button>
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )}
            {section === "references" && (
              <>
                <div className="media-alert media-success">
                  Havola va o‘zingiz tasdiqlagan tahlilni saqlang: hook, ritm,
                  kadr, matn, kamera, musiqa va SFX. AI tanlangan namunaning shu
                  xulosalarini ishlatadi; havoladagi videoni avtomatik ko‘rib
                  chiqmaydi.
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {data.references.map((r) => (
                    <section className="media-panel" key={r.id}>
                      <span className="media-scope">{scopes[r.scope]}</span>
                      <h2 className="mt-3">{r.title}</h2>
                      <p className="media-subtle whitespace-pre-wrap my-4">
                        {r.notes}
                      </p>
                      <div className="media-actions">
                        {r.url && (
                          <a
                            className="media-btn secondary small"
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Namunani ochish <ExternalLink size={12} />
                          </a>
                        )}
                        <Button
                          small
                          secondary
                          danger
                          onClick={() =>
                            setConfirm({
                              text: "Ushbu namuna yozuvini o‘chirasizmi?",
                              action: () =>
                                mediaApi(`/references/${r.id}`, "DELETE"),
                            })
                          }
                        >
                          O‘chirish
                        </Button>
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )}
            {["weather", "learning", "news"].includes(section) && (
              <LegacyAdmin
                key={section}
                section={section as "weather" | "learning" | "news"}
                embedded
              />
            )}
          </>
        )}
      </main>
      {data && editPost !== undefined && (
        <PostEditor
          post={editPost}
          assets={data.assets}
          busy={busy}
          onClose={() => setEditPost(undefined)}
          onSave={async (body) => {
            await mediaApi(
              editPost ? `/posts/${editPost.id}` : "/posts",
              editPost ? "PATCH" : "POST",
              body,
            );
            await refresh();
            setEditPost(undefined);
            setSuccess("Kontent saqlandi.");
          }}
          onDelete={
            editPost
              ? () =>
                  setConfirm({
                    text: "Ushbu qoralamani o‘chirasizmi?",
                    action: async () => {
                      await mediaApi(`/posts/${editPost.id}`, "DELETE");
                      setEditPost(undefined);
                    },
                  })
              : undefined
          }
        />
      )}
      {data && schedule && (
        <ScheduleModal
          posts={schedule}
          accounts={data.accounts}
          onClose={() => setSchedule(null)}
          onSave={async (accounts, time) => {
            await mediaApi("/schedule", "POST", {
              account_ids: accounts,
              items: schedule.map((p) => ({
                post_id: p.id,
                scheduled_at:
                  schedule.length > 1 ? p.variants.suggested_at : time,
              })),
            });
            await refresh();
            setSchedule(null);
            setSuccess(`${schedule.length} ta post rejalashtirildi.`);
          }}
        />
      )}
      {data && campaign && (
        <CampaignModal
          references={data.references}
          available={data.overview.capabilities.openai}
          onClose={() => setCampaign(false)}
          onSave={async (body) => {
            await mediaApi("/campaigns", "POST", body);
            await refresh();
            setCampaign(false);
            go("posts");
            setSuccess(
              "AI reja navbatga qo‘shildi. Tayyor qoralamalar shu yerda paydo bo‘ladi.",
            );
          }}
        />
      )}
      {account && (
        <AccountModal
          onClose={() => setAccount(false)}
          onSave={async (body) => {
            await mediaApi("/accounts", "POST", body);
            await refresh();
            setAccount(false);
            setSuccess("Hisob qo‘shildi. Endi “Tekshirish”ni bosing.");
          }}
        />
      )}
      {rule !== undefined && (
        <RuleModal
          rule={rule}
          onClose={() => setRule(undefined)}
          onSave={async (body) => {
            await mediaApi(
              rule ? `/rules/${rule.id}` : "/rules",
              rule ? "PUT" : "POST",
              body,
            );
            await refresh();
            setRule(undefined);
            setSuccess("Doimiy talab saqlandi.");
          }}
        />
      )}
      {reference && (
        <ReferenceModal
          onClose={() => setReference(false)}
          onSave={async (body) => {
            await mediaApi("/references", "POST", body);
            await refresh();
            setReference(false);
            setSuccess("Namuna xulosasi saqlandi.");
          }}
        />
      )}
      {history && (
        <Modal
          title="Oldingi versiyalar"
          description="Har bir tahrirdan oldingi holat saqlanadi."
          onClose={() => setHistory(null)}
        >
          {history.length ? (
            history.map((r) => (
              <div className="media-panel mb-3" key={r.id}>
                <span className="media-chip">v{r.version}</span>
                <h3 className="font-semibold my-2">{r.title}</h3>
                <p className="media-subtle whitespace-pre-wrap">{r.content}</p>
              </div>
            ))
          ) : (
            <p className="media-subtle">Qoida hali tahrirlanmagan.</p>
          )}
        </Modal>
      )}
      {confirm && (
        <ConfirmModal
          text={confirm.text}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await confirm.action();
            await refresh();
            setConfirm(null);
            setSuccess("Amal bajarildi.");
          }}
        />
      )}
    </div>
  );
}
function FormShell({
  onSubmit,
  children,
  label = "Saqlash",
  readOnly = false,
}: {
  onSubmit: () => Promise<unknown>;
  children: ReactNode;
  label?: string;
  readOnly?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      {error && (
        <div className="media-alert" role="alert">
          {error}
        </div>
      )}
      <fieldset disabled={busy}>
        {children}
        {!readOnly && (
          <div className="media-actions">
            <Button type="submit" disabled={busy}>
              {busy ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}{" "}
              {busy ? "Bajarilmoqda…" : label}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
function PostEditor({
  post,
  assets,
  onClose,
  onSave,
  onDelete,
}: {
  post: MediaPost | null;
  assets: MediaAsset[];
  busy: boolean;
  onClose: () => void;
  onSave: (body: unknown) => Promise<unknown>;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(post?.title || ""),
    [caption, setCaption] = useState(post?.caption || ""),
    [format, setFormat] = useState(post?.format || "video"),
    [selected, setSelected] = useState<string[]>(post?.asset_ids || []),
    [notes, setNotes] = useState(post?.production_notes || ""),
    [variants, setVariants] = useState(post?.variants || {}),
    [variant, setVariant] = useState<"telegram" | "instagram" | "youtube">(
      "telegram",
    );
  const locked = !!post?.deliveries.some((d) => d.status !== "cancelled");
  function download() {
    const text = `${title}\n\nAsosiy matn:\n${caption}\n\nPlatforma variantlari:\n${JSON.stringify(variants, null, 2)}\n\nIshlab chiqarish rejasi:\n${notes}`;
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "zamonaviy-kontent-paketi.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Modal
      title={post ? "Kontent tafsilotlari" : "Yangi kontent"}
      description="Matn, media va har bir platformaga mos variantlarni tayyorlang."
      onClose={onClose}
    >
      {locked && (
        <div className="media-alert">
          Post rejalashtirilgan yoki yuborilgan. Tahrirlash uchun rejani bekor
          qiling yoki kontentlar bo‘limida nusxa yarating.
        </div>
      )}
      <FormShell
        readOnly={locked}
        onSubmit={() =>
          onSave(
            postSchema.parse({
              title,
              caption,
              format,
              asset_ids: selected,
              production_notes: notes,
              variants,
            }),
          )
        }
      >
        <fieldset disabled={locked}>
          <Field label="Sarlavha">
            <input
              required
              maxLength={100}
              className="media-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Kontent formati">
            <select
              className="media-input"
              value={format}
              onChange={(e) => setFormat(e.target.value as typeof format)}
            >
              {Object.entries(formats).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          {format === "article" && (
            <div className="media-alert">Telegram Article: quyidagi maydonga sarlavha, jadval va details bloklari bilan HTML kiriting. Media uchun <code>{'src="{{asset:ID}}"'}</code> yozing va faylni pastda belgilang. Faqat Telegramga yuboriladi.</div>
          )}
          <Field label="Asosiy post matni">
            <textarea
              className="media-input"
              dir="auto"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </Field>
          <div className="media-field">
            <span>Platformaga mos matn</span>
            <div className="media-actions">
              {(["telegram", "instagram", "youtube"] as const).map((v) => (
                <Button
                  key={v}
                  small
                  secondary={v !== variant}
                  onClick={() => setVariant(v)}
                >
                  {v}
                </Button>
              ))}
            </div>
            <textarea
              aria-label={`${variant} matni`}
              dir="auto"
              className="media-input"
              placeholder="Bo‘sh qoldirilsa asosiy matn ishlatiladi."
              value={variants[variant] || ""}
              onChange={(e) =>
                setVariants({
                  ...variants,
                  [variant]: e.target.value || undefined,
                })
              }
            />
          </div>
          {variant === "instagram" && ["video", "stickman"].includes(format) && (
            <Field label="Instagram Reels muqovasi">
              <select className="media-input" value={variants.instagram_cover_id || ""}
                onChange={(e) => setVariants({ ...variants, instagram_cover_id: e.target.value || undefined })}>
                <option value="">Videodan avtomatik muqova</option>
                {assets.filter((a) => a.mime_type === "image/jpeg" && a.size <= 8 * 1024 * 1024).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
          )}
          {variant === "youtube" && (
            <>
              <Field label="YouTube ko‘rinishi">
                <select
                  className="media-input"
                  value={variants.youtube_privacy || "public"}
                  onChange={(e) =>
                    setVariants({
                      ...variants,
                      youtube_privacy: e.target.value as
                        "public" | "unlisted" | "private",
                    })
                  }
                >
                  <option value="public">Ommaviy</option>
                  <option value="unlisted">Faqat havola orqali</option>
                  <option value="private">Shaxsiy</option>
                </select>
              </Field>
              <label className="media-check">
                <input
                  type="checkbox"
                  checked={variants.youtube_made_for_kids || false}
                  onChange={(e) =>
                    setVariants({
                      ...variants,
                      youtube_made_for_kids: e.target.checked,
                    })
                  }
                />{" "}
                Ushbu video bolalar uchun mo‘ljallangan
              </label>
              <label className="media-check">
                <input
                  type="checkbox"
                  checked={variants.youtube_synthetic_media || false}
                  onChange={(e) =>
                    setVariants({
                      ...variants,
                      youtube_synthetic_media: e.target.checked,
                    })
                  }
                />{" "}
                Realistik AI tasvir yoki ovoz mavjud
              </label>
            </>
          )}
          <div className="media-field">
            <span>Media fayllar · {selected.length} ta tanlandi</span>
            <small>
              Fayllarni avval Media kutubxonasiga yuklang. Karusel uchun tanlash
              tartibi slaydlar tartibidir.
            </small>
            <div className="max-h-40 overflow-auto">
              {assets
                .filter((a) => a.mime_type !== "audio/mpeg" || format === "article")
                .map((a) => (
                  <label className="media-check" key={a.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(a.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, a.id]
                            : selected.filter((id) => id !== a.id),
                        )
                      }
                    />
                    {a.name} <small>{sizeLabel(a.size)}</small>
                  </label>
                ))}
            </div>
            {selected.map((id, i) => (
              <div className="media-actions items-center" key={id}>
                <small className="media-subtle">
                  {i + 1}. {assets.find((a) => a.id === id)?.name}
                </small>
                <button
                  type="button"
                  className="media-icon-button"
                  aria-label="Oldinga siljitish"
                  disabled={i === 0}
                  onClick={() => {
                    const s = [...selected];
                    [s[i - 1], s[i]] = [s[i], s[i - 1]];
                    setSelected(s);
                  }}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  className="media-icon-button"
                  aria-label="Orqaga siljitish"
                  disabled={i === selected.length - 1}
                  onClick={() => {
                    const s = [...selected];
                    [s[i + 1], s[i]] = [s[i], s[i + 1]];
                    setSelected(s);
                  }}
                >
                  <ArrowDown size={12} />
                </button>
              </div>
            ))}
          </div>
          <Field
            label="Ssenariy va montaj ko‘rsatmalari"
            hint="Higgsfield / HyperFrames, ovoz, kadrlar, pop-up, animatsiya va SFX rejasi."
          >
            <textarea
              className="media-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ minHeight: 160 }}
            />
          </Field>
        </fieldset>
        {locked && (
          <p className="media-subtle">Bu oynada saqlash bloklangan.</p>
        )}
      </FormShell>
      <div className="media-actions">
        <Button secondary onClick={download}>
          <Download size={14} /> Kontent paketini olish
        </Button>
        {onDelete && !locked && (
          <Button secondary danger onClick={onDelete}>
            <Trash2 size={14} /> Qoralamani o‘chirish
          </Button>
        )}
      </div>
    </Modal>
  );
}
function ScheduleModal({
  posts,
  accounts,
  onClose,
  onSave,
}: {
  posts: MediaPost[];
  accounts: MediaAccount[];
  onClose: () => void;
  onSave: (accounts: string[], time: string) => Promise<unknown>;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [time, setTime] = useState(localInput(posts[0]?.variants.suggested_at));
  return (
    <Modal
      title={
        posts.length > 1
          ? "Oylik nashrlarni rejalashtirish"
          : "Nashrni rejalashtirish"
      }
      description={`${posts.length} ta post. Har bir tanlangan platforma uchun nashr holati alohida saqlanadi.`}
      onClose={onClose}
    >
      <FormShell
        label="Nashrga rejalashtirish"
        onSubmit={() => {
          if (!selected.length)
            throw new Error("Kamida bitta tayyor hisobni tanlang.");
          return onSave(selected, inputToIso(time));
        }}
      >
        <div className="media-field">
          <span>Qaysi hisoblarda chiqsin?</span>
          {accounts
            .filter((a) => a.enabled && a.verified_at)
            .map((a) => (
              <label className="media-check" key={a.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, a.id]
                        : selected.filter((id) => id !== a.id),
                    )
                  }
                />
                {a.name} <span className="media-chip">{a.platform}</span>
              </label>
            ))}
          {!accounts.some((a) => a.enabled && a.verified_at) && (
            <div className="media-alert">
              Avval Platformalar bo‘limida hisob ulang va “Tekshirish”ni bosing.
            </div>
          )}
        </div>
        {posts.length === 1 ? (
          <Field
            label="Nashr sanasi va vaqti"
            hint="Asia/Tashkent · UTC+5. Rejalashtirilgandan keyin agent o‘zi yuboradi."
          >
            <input
              required
              type="datetime-local"
              className="media-input"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </Field>
        ) : (
          <div className="max-h-64 overflow-auto">
            {posts.map((p) => (
              <div className="media-list-item" key={p.id}>
                <span className="text-xs">{p.title}</span>
                <span className="media-subtle">
                  {tashkentDate(p.variants.suggested_at!)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="media-alert media-success">
          Media fayllar tayyor va biriktirilgan bo‘lishi kerak. Reels/Shorts
          uchun MP4; Instagram karuseli uchun 2–10 ta JPG.
        </div>
      </FormShell>
    </Modal>
  );
}
function CampaignModal({
  references,
  available,
  onClose,
  onSave,
}: {
  references: MediaReference[];
  available: boolean;
  onClose: () => void;
  onSave: (body: unknown) => Promise<unknown>;
}) {
  const next = new Date();
  next.setUTCMonth(next.getUTCMonth() + 1);
  const [topic, setTopic] = useState(""),
    [count, setCount] = useState(10),
    [month, setMonth] = useState(next.toISOString().slice(0, 7)),
    [format, setFormat] = useState("video"),
    [refs, setRefs] = useState<string[]>([]);
  return (
    <Modal
      title="Bir oylik AI kontent reja"
      description="Agent faol talablaringiz asosida matn, ssenariy va platforma variantlarini qoralama sifatida tayyorlaydi."
      onClose={onClose}
    >
      <FormShell
        label="AI rejani tayyorlash"
        onSubmit={() => {
          if (!available) throw new Error("OpenAI kaliti sozlanmagan.");
          return onSave({ topic, count, month, format, reference_ids: refs });
        }}
      >
        <Field
          label="Mavzu va maqsad"
          hint="Masalan: Arab tili boshlovchilari uchun xatolar, oddiy qoidalar va qo‘llanma reklamasi."
        >
          <textarea
            required
            minLength={3}
            className="media-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Postlar soni">
            <select
              className="media-input"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              {[8, 10, 12, 15, 20, 30].map((n) => (
                <option key={n} value={n}>
                  {n} ta post
                </option>
              ))}
            </select>
          </Field>
          <Field label="Oy">
            <input
              required
              type="month"
              className="media-input"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Asosiy format">
          <select
            className="media-input"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            {Object.entries(formats).map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {references.length > 0 && (
          <div className="media-field">
            <span>Qo‘llanadigan namuna xulosalari</span>
            {references.map((r) => (
              <label className="media-check" key={r.id}>
                <input
                  type="checkbox"
                  checked={refs.includes(r.id)}
                  onChange={(e) =>
                    setRefs(
                      e.target.checked
                        ? [...refs, r.id]
                        : refs.filter((id) => id !== r.id),
                    )
                  }
                />
                {r.title}
              </label>
            ))}
          </div>
        )}
        <div className="media-alert">
          Bu amal OpenAI API sarfini ishlatadi. Tayyor rasm/video generatsiyasi
          bu bosqichga kirmaydi: ishlab chiqarish paketini olib, yaratilgan
          mediani yuklaysiz. Qoralamalar tekshiruvdan keyin alohida nashrga
          qo‘yiladi.
        </div>
      </FormShell>
    </Modal>
  );
}
function AccountModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (body: unknown) => Promise<unknown>;
}) {
  const [platform, setPlatform] = useState("telegram"),
    [name, setName] = useState(""),
    [id, setId] = useState(""),
    [token, setToken] = useState("");
  return (
    <Modal
      title="Platforma hisobini ulash"
      description="Hisobni saqlang, so‘ng ulanish va nashr huquqini tekshiring."
      onClose={onClose}
    >
      <FormShell
        onSubmit={() =>
          onSave({
            platform,
            name,
            external_id: id,
            ...(platform === "instagram" ? { access_token: token } : {}),
          })
        }
      >
        <Field label="Platforma">
          <select
            className="media-input"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="telegram">Telegram</option>
            <option value="instagram">Instagram</option>
          </select>
        </Field>
        <Field label="Siz uchun hisob nomi">
          <input
            required
            className="media-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Zamonaviy Ta’lim"
          />
        </Field>
        <Field
          label={
            platform === "telegram"
              ? "Kanal @username yoki chat ID"
              : "Instagram professional hisob ID"
          }
          hint={
            platform === "telegram"
              ? "Mavjud botni kanalga post yuborish huquqi bilan admin qiling."
              : "Instagram Login API bilan olingan professional hisobning raqamli IDsi."
          }
        >
          <input
            required
            className="media-input"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
        </Field>
        {platform === "instagram" && (
          <Field
            label="Instagram API token"
            hint="instagram_business_basic va instagram_business_content_publish ruxsatlari kerak. Token shifrlanib saqlanadi."
          >
            <input
              required
              type="password"
              autoComplete="off"
              className="media-input"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </Field>
        )}
      </FormShell>
    </Modal>
  );
}
function RuleModal({
  rule,
  onClose,
  onSave,
}: {
  rule: MediaRule | null;
  onClose: () => void;
  onSave: (body: unknown) => Promise<unknown>;
}) {
  const [title, setTitle] = useState(rule?.title || ""),
    [content, setContent] = useState(rule?.content || ""),
    [scope, setScope] = useState(rule?.scope || "brand"),
    [active, setActive] = useState(rule?.active ?? true);
  return (
    <Modal
      title={rule ? "Doimiy talabni tahrirlash" : "Doimiy talab qo‘shish"}
      description="Qoida doirasi uning qaysi kelgusi ishlarga qo‘llanishini belgilaydi."
      onClose={onClose}
    >
      <FormShell
        onSubmit={() =>
          onSave({
            title,
            content,
            scope,
            active,
            ...(rule ? { version: rule.version } : {}),
          })
        }
      >
        <Field label="Talab nomi">
          <input
            required
            className="media-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Qo‘llanish doirasi">
          <select
            className="media-input"
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
          >
            {Object.entries(scopes).map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Aniq talab">
          <textarea
            required
            className="media-input"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </Field>
        <label className="media-check">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />{" "}
          Keyingi mos topshiriqlarda qo‘llansin
        </label>
      </FormShell>
    </Modal>
  );
}
function ReferenceModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (body: unknown) => Promise<unknown>;
}) {
  const [title, setTitle] = useState(""),
    [url, setUrl] = useState(""),
    [notes, setNotes] = useState(""),
    [scope, setScope] = useState("video");
  return (
    <Modal
      title="Namuna va tahlil"
      description="Siz yoqtirgan usullarni dalil bilan saqlang. Doimiy qoida uchun Agent xotirasiga ham kiriting."
      onClose={onClose}
    >
      <FormShell onSubmit={() => onSave({ title, url, notes, scope })}>
        <Field label="Namuna nomi">
          <input
            required
            className="media-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Reels yoki post havolasi">
          <input
            type="url"
            className="media-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <Field label="Format">
          <select
            className="media-input"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            {Object.entries(scopes).map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Tahlil va olinadigan usullar"
          hint="Hook, ritm, matn, o‘qish vaqti, kamera, musiqa, SFX. Nima yoqdi, nimani qo‘llash kerak?"
        >
          <textarea
            required
            className="media-input"
            style={{ minHeight: 180 }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </FormShell>
    </Modal>
  );
}
function ConfirmModal({
  text,
  onClose,
  onConfirm,
}: {
  text: string;
  onClose: () => void;
  onConfirm: () => Promise<unknown>;
}) {
  return (
    <Modal title="Amalni tekshiring" description={text} onClose={onClose}>
      <FormShell onSubmit={onConfirm} label="Tasdiqlash">
        <Button secondary onClick={onClose}>
          Bekor qilish
        </Button>
      </FormShell>
    </Modal>
  );
}
function Calendar({
  posts,
  onOpen,
  onAction,
  onResolve,
  onPublished,
  busy,
}: {
  posts: MediaPost[];
  onOpen: (p: MediaPost) => void;
  onAction: (id: string, action: string) => void;
  onResolve: (id: string) => void;
  onPublished: (id: string) => void;
  busy: boolean;
}) {
  const [month, setMonth] = useState(
    new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 7),
  );
  const [year, m] = month.split("-").map(Number),
    days = new Date(Date.UTC(year, m, 0)).getUTCDate(),
    first = (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7;
  const deliveries = posts
    .flatMap((p) => p.deliveries.map((d) => ({ ...d, post: p })))
    .filter((d) => d.status !== "cancelled");
  const monthEvents = deliveries.filter((d) =>
    new Date(new Date(d.scheduled_at).getTime() + 5 * 3600000)
      .toISOString()
      .startsWith(month),
  );
  const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
  function change(delta: number) {
    setMonth(
      new Date(Date.UTC(year, m - 1 + delta, 1)).toISOString().slice(0, 7),
    );
  }
  return (
    <>
      <div className="media-toolbar">
        <div className="media-actions items-center">
          <button
            className="media-icon-button"
            aria-label="Oldingi oy"
            onClick={() => change(-1)}
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="month"
            aria-label="Taqvim oyi"
            className="media-input"
            style={{ width: 165 }}
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
          <button
            className="media-icon-button"
            aria-label="Keyingi oy"
            onClick={() => change(1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <span className="media-subtle">
          {monthEvents.length} ta platforma nashri · Toshkent vaqti
        </span>
      </div>
      <div className="media-calendar">
        {["Dush", "Sesh", "Chor", "Pay", "Jum", "Shan", "Yak"].map((d) => (
          <div className="media-calendar-label" key={d}>
            {d}
          </div>
        ))}
        {Array.from({ length: first }, (_, i) => (
          <div className="media-calendar-day" key={`blank${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          const items = monthEvents.filter((d) =>
            new Date(new Date(d.scheduled_at).getTime() + 5 * 3600000)
              .toISOString()
              .startsWith(date),
          );
          return (
            <div
              className={`media-calendar-day ${date === today ? "today" : ""}`}
              key={date}
            >
              <span>{i + 1}</span>
              {items.map((d) => (
                <button
                  className={`media-calendar-event ${d.status}`}
                  key={d.id}
                  onClick={() => onOpen(d.post)}
                  title={`${d.post.title} · ${d.account_name} · ${deliveryLabels[d.status]}`}
                >
                  {d.platform} ·{" "}
                  {new Date(new Date(d.scheduled_at).getTime() + 5 * 3600000)
                    .toISOString()
                    .slice(11, 16)}
                  <br />
                  {d.post.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <section className="media-panel mt-6">
        <h2>Nashrlar va natijalar</h2>
        {!deliveries.length && (
          <Empty
            title="Taqvim hozircha bo‘sh"
            description="Kontentlar bo‘limida tayyor postni tanlab, Rejalash tugmasini bosing."
          />
        )}
        {[...deliveries]
          .sort(
            (a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at),
          )
          .slice(0, 100)
          .map((d) => (
            <div className="media-list-item" key={d.id}>
              <div>
                <h3>{d.post.title}</h3>
                <p className="media-subtle">
                  {d.account_name} · {d.platform} ·{" "}
                  {tashkentDate(d.scheduled_at)}
                </p>
                <div className="media-actions mt-2">
                  <span className={`media-chip ${d.status}`}>
                    {deliveryLabels[d.status]}
                  </span>
                  {d.external_url && (
                    <a
                      href={d.external_url}
                      target="_blank"
                      rel="noreferrer"
                      className="media-chip good"
                    >
                      Nashrni ochish ↗
                    </a>
                  )}
                </div>
                {d.error && <p className="media-subtle mt-2">{d.error}</p>}
              </div>
              <div className="media-actions items-center">
                {["scheduled", "failed"].includes(d.status) && (
                  <Button
                    small
                    secondary
                    disabled={busy}
                    onClick={() => onAction(d.id, "cancel")}
                  >
                    Bekor qilish
                  </Button>
                )}
                {d.status === "failed" && (
                  <Button
                    small
                    disabled={busy}
                    onClick={() => onAction(d.id, "retry")}
                  >
                    Qayta urinish
                  </Button>
                )}
                {d.status === "needs_review" && (
                  <>
                    <Button
                      small
                      secondary
                      disabled={busy}
                      onClick={() => onResolve(d.id)}
                    >
                      Tekshirdim, yuborilmagan
                    </Button>
                    <Button
                      small
                      disabled={busy}
                      onClick={() => onPublished(d.id)}
                    >
                      Tekshirdim, yuborilgan
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
      </section>
    </>
  );
}


type AudioCatalog = { models: { id: string; name: string }[]; voices: { id: string; name: string; category: string; labels: Record<string, string> }[] };
function AssetDownload({ asset }: { asset: MediaAsset }) {
  const [downloading, setDownloading] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  async function prepare() {
    if (downloading) return;
    setDownloading(true); setError(""); setUrl("");
    try {
      const result = await mediaApi<{ url: string }>(`/assets/${asset.id}/download-link`, "POST");
      setUrl(result.url);
    } catch (e) { setError((e as Error).message); }
    finally { setDownloading(false); }
  }
  return <span><Button secondary small disabled={downloading} onClick={() => void prepare()}><Download size={14} />{downloading ? "Tayyorlanmoqda…" : "Yuklab olish havolasi"}</Button>{url && <a className="media-btn secondary" href={url} download={asset.name}>Faylni yuklab olish</a>}{error && <span role="alert" className="media-alert">{error}</span>}</span>;
}

function AudioStudio({ onSaved }: { onSaved: () => Promise<unknown> }) {
  const [catalog, setCatalog] = useState<AudioCatalog | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("Lug‘at audiosi");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [language, setLanguage] = useState("uz");
  const [model, setModel] = useState("eleven_v4");
  const [result, setResult] = useState<MediaAsset | null>(null);
  async function reload() {
    setLoading(true); setError("");
    try {
      const c = await mediaApi<AudioCatalog>("/audio/catalog");
      setCatalog(c);
      setVoice(previous => c.voices.some(v => v.id === previous) ? previous : c.voices.find(v => /umidjon/i.test(v.name))?.id || "");
      setModel(previous => c.models.some(m => m.id === previous) ? previous : c.models[0]?.id || "");
    } catch(e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);
  async function submit(e: FormEvent) {
    e.preventDefault(); if(busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const asset = await mediaApi<MediaAsset>("/audio/generate", "POST", { name, text, voice_id: voice, language, model });
      setResult(asset);
      await onSaved();
    } catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const voices = [...(catalog?.voices || [])].sort((a,b) => Number(!["cloned","professional"].includes(a.category)) - Number(!["cloned","professional"].includes(b.category)) || a.name.localeCompare(b.name));
  return <section className="media-panel">
    <div className="media-actions"><h2>Audio yaratish</h2><Button secondary small disabled={loading || busy} onClick={() => void reload()}><RefreshCw size={15} /> Ovozlarni yangilash</Button></div>
    <p className="media-subtle">Hisobingizdagi klon va boshqa ovozlar ElevenLabs’dan olinadi. Har bir yaratish hisobingizdagi kreditni sarflaydi.</p>
    {error && <div role="alert" className="media-alert">{error}</div>}
    {loading && <p role="status">Modellar va ovozlar yuklanmoqda…</p>}
    {catalog && !catalog.models.length && <p className="media-alert">Bu API hisobida v4 modeli ko‘rinmadi. ElevenLabs model ruxsatlarini tekshiring.</p>}
    <form onSubmit={submit} className="space-y-4 mt-4">
      <Field label="Audio nomi"><input className="media-input" required maxLength={170} value={name} onChange={e => setName(e.target.value)} disabled={busy} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Til"><select className="media-input" value={language} onChange={e => setLanguage(e.target.value)} disabled={busy}><option value="uz">O‘zbekcha</option><option value="ar">Arabcha</option></select></Field>
        <Field label="Model"><select className="media-input" required value={model} onChange={e => setModel(e.target.value)} disabled={busy || loading}>{catalog?.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
      </div>
      <Field label="Ovoz" hint="Klon ovozlar ro‘yxat boshida. Boshqa o‘zbek ovozi hisobingizga qo‘shilgan bo‘lsa, yangilash orqali chiqadi."><select className="media-input" required value={voice} onChange={e => setVoice(e.target.value)} disabled={busy || loading}><option value="">Ovozni tanlang</option>{voices.map(v => <option key={v.id} value={v.id}>{v.name}{["professional","cloned"].includes(v.category) ? " · Klon" : ""}{v.labels.language ? ` · ${v.labels.language}` : ""}</option>)}</select></Field>
      <Field label="O‘qiladigan matn" hint={`${text.length} / 2000 belgi. Arabcha harakatlar va o‘zbekcha matn saqlanadi.`}><textarea className="media-input" rows={7} dir="auto" required maxLength={2000} value={text} onChange={e => setText(e.target.value)} disabled={busy} /></Field>
      <Button type="submit" disabled={busy || loading || !model || !voice || !catalog?.models.length}>{busy ? "Audio yaratilmoqda… Sahifani yopmang" : "Audio yaratish va saqlash"}</Button>
    </form>
    {result && <div className="mt-5 space-y-3" role="status"><strong>{result.name} · Kutubxonaga saqlandi</strong><audio controls src={`/api/media/assets/${result.id}`} className="w-full" /><AssetDownload asset={result} /><p className="media-subtle">Telegram Article tahririda shu audioni tanlang va HTML ichida quyidagi manzilni ishlating:</p><code>{`<audio src="{{asset:${result.id}}}"></audio>`}</code></div>}
  </section>;
}
