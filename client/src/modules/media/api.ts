import type {
  MediaAccount,
  MediaAsset,
  MediaPost,
  MediaReference,
  MediaRule,
  MediaJob,
} from "@shared/media";
export async function mediaApi<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(`/api/media${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    credentials: "same-origin",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 401) window.dispatchEvent(new Event("media-auth-expired"));
    throw new Error(data.error || "So‘rov bajarilmadi.");
  }
  return data;
}
export type Overview = {
  counts: Record<string, number>;
  storage: { bytes: string; files: number; limit_bytes?:number };
  capabilities: { openai: boolean; telegram: boolean; youtube_oauth: boolean };
  timezone: string;
};
export type MediaData = {
  posts: MediaPost[];
  accounts: MediaAccount[];
  assets: MediaAsset[];
  rules: MediaRule[];
  references: MediaReference[];
  jobs: MediaJob[];
  overview: Overview;
};
export async function loadMedia(): Promise<MediaData> {
  const [posts, accounts, assets, rules, references, jobs, overview] =
    await Promise.all([
      mediaApi<MediaPost[]>("/posts"),
      mediaApi<MediaAccount[]>("/accounts"),
      mediaApi<MediaAsset[]>("/assets"),
      mediaApi<MediaRule[]>("/rules"),
      mediaApi<MediaReference[]>("/references"),
      mediaApi<MediaJob[]>("/jobs"),
      mediaApi<Overview>("/overview"),
    ]);
  return { posts, accounts, assets, rules, references, jobs, overview };
}
export function tashkentDate(value: string) {
  return new Intl.DateTimeFormat("uz-UZ", {
    timeZone: "Asia/Tashkent",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
export function localInput(value?: string) {
  const d = value ? new Date(value) : new Date(Date.now() + 3600000);
  return new Date(d.getTime() + 5 * 3600000).toISOString().slice(0, 16);
}
export function inputToIso(value: string) {
  return new Date(`${value}:00+05:00`).toISOString();
}
export function sizeLabel(bytes: number) {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}
