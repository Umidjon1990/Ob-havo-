import { z } from "zod";
import type { MediaPost, YouTubePlaylist, YouTubePlaylistItem } from "../../../shared/media";
import { PublishError } from "./publish-error";

const base = "https://www.googleapis.com/youtube/v3";
export const youtubePlaylistId = z.string().regex(/^[A-Za-z0-9_-]{10,150}$/);
export const youtubePlaylistInput = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().max(5000).default(""),
  privacy: z.enum(["public", "unlisted", "private"]).default("private"),
});
export function playlistWriteGranted(scope?: string): boolean | null {
  if (typeof scope !== "string") return null;
  const scopes = scope.split(/\s+/);
  return ["youtube", "youtube.force-ssl", "youtubepartner"].some(s =>
    scopes.includes(`https://www.googleapis.com/auth/${s}`));
}

async function request(token: string, path: string, body?: unknown, method = "GET") {
  const unsafe = method === "POST";
  let response: Response, data: any;
  try {
    response = await fetch(`${base}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    data = await response.json();
  } catch {
    throw new PublishError(unsafe
      ? "Playlist amali natijasi noaniq. Qayta yaratishdan oldin ro‘yxatni yangilab tekshiring."
      : "YouTube playlist javobi olinmadi. Qayta tekshiring.", !unsafe, unsafe);
  }
  if (!response.ok || data.error) {
    const reason = data.error?.errors?.[0]?.reason;
    if (reason === "manualSortRequired")
      throw new PublishError("Tartiblash uchun YouTube’da playlist tartibini Manual (qo‘lda) qilib belgilang.");
    if (reason === "insufficientPermissions" || data.error?.status === "PERMISSION_DENIED" && !reason)
      throw new PublishError("Playlist ruxsati yetishmaydi. Platformalar bo‘limida YouTube’ni Google orqali qayta ulang.");
    if (response.status === 401)
      throw new PublishError("YouTube kirish ruxsati tugagan. Google orqali qayta ulang.");
    if (response.status === 429 || reason === "quotaExceeded" || reason === "rateLimitExceeded")
      throw new PublishError("YouTube limiti. Keyinroq qayta urinib ko‘ring.", true);
    if (response.status >= 500)
      throw new PublishError("YouTube playlist xizmati vaqtincha ishlamayapti. Natijani tekshiring.", !unsafe, unsafe);
    throw new PublishError(`Playlist yoki YouTube ruxsatini tekshiring (kod: ${response.status}).`);
  }
  return data;
}
function playlistView(p: any): YouTubePlaylist {
  return {
    id: p.id, title: p.snippet.title, description: p.snippet.description || "",
    privacy: p.status?.privacyStatus || "private", item_count: p.contentDetails?.itemCount || 0,
    url: `https://www.youtube.com/playlist?list=${encodeURIComponent(p.id)}`,
  };
}
function itemView(item: any): YouTubePlaylistItem {
  return {
    id: item.id, video_id: item.snippet.resourceId.videoId, title: item.snippet.title || "Video",
    position: item.snippet.position + 1,
    url: `https://youtu.be/${encodeURIComponent(item.snippet.resourceId.videoId)}`,
  };
}
async function allPages(token: string, resource: string, params: Record<string, string>) {
  const items: any[] = [];
  let pageToken = "";
  const seen = new Set<string>();
  do {
    const q = new URLSearchParams({ ...params, maxResults: "50", ...(pageToken ? { pageToken } : {}) });
    const data = await request(token, `${resource}?${q}`);
    items.push(...(data.items || []));
    pageToken = data.nextPageToken || "";
    if (pageToken && (seen.has(pageToken) || seen.size >= 200))
      throw new PublishError("Playlist ro‘yxati to‘liq olinmadi. Keyinroq yangilab tekshiring.");
    seen.add(pageToken);
  } while (pageToken);
  return items;
}
export async function listYouTubePlaylists(token: string, channelId: string) {
  const items = await allPages(token, "playlists", { part: "snippet,status,contentDetails", mine: "true" });
  return items.filter(p => p.snippet?.channelId === channelId).map(playlistView);
}
export async function ownedYouTubePlaylist(token: string, id: string, channelId: string) {
  const q = new URLSearchParams({ part: "snippet,status,contentDetails", id });
  const data = await request(token, `playlists?${q}`);
  const playlist = data.items?.find((p: any) => p.id === id);
  if (!playlist || playlist.snippet?.channelId !== channelId)
    throw new PublishError("Playlist tanlangan YouTube kanaliga tegishli emas yoki topilmadi.");
  return playlistView(playlist);
}
export async function createYouTubePlaylist(token: string, channelId: string, input: z.infer<typeof youtubePlaylistInput>) {
  const channels = await request(token, "channels?part=id&mine=true");
  if (!channels.items?.some((c: any) => c.id === channelId))
    throw new PublishError("Google ulanishi tanlangan YouTube kanaliga mos emas.");
  const data = await request(token, "playlists?part=snippet,status,contentDetails", {
    snippet: { title: input.title, description: input.description },
    status: { privacyStatus: input.privacy },
  }, "POST");
  if (!data.id || data.snippet?.channelId !== channelId)
    throw new PublishError("Playlist yaratish natijasini ro‘yxatdan tekshiring.", false, true);
  try {
    return await ownedYouTubePlaylist(token, data.id, channelId);
  } catch {
    throw new PublishError(`Playlist yaratildi: https://www.youtube.com/playlist?list=${encodeURIComponent(data.id)}. Tasdiqlash javobi olinmadi; yana yaratishdan oldin ro‘yxatni yangilang.`, false, true);
  }
}
export async function listYouTubePlaylistItems(token: string, playlistId: string, channelId: string) {
  await ownedYouTubePlaylist(token, playlistId, channelId);
  const items = await allPages(token, "playlistItems", { part: "snippet", playlistId });
  return items.map(itemView).sort((a, b) => a.position - b.position);
}
async function readItem(token: string, id: string, playlistId: string, videoId?: string) {
  const q = new URLSearchParams({ part: "snippet", id });
  const data = await request(token, `playlistItems?${q}`);
  const item = data.items?.find((i: any) => i.id === id);
  if (!item || item.snippet?.playlistId !== playlistId || !item.snippet.resourceId?.videoId ||
    videoId && item.snippet.resourceId.videoId !== videoId)
    throw new PublishError("Playlist yozuvi topilmadi yoki tanlangan playlistga mos emas.");
  return item;
}
async function setPosition(token: string, item: any, playlistId: string, position: number) {
  await request(token, "playlistItems?part=snippet", {
    id: item.id,
    snippet: { playlistId, resourceId: { kind: "youtube#video", videoId: item.snippet.resourceId.videoId }, position },
  }, "PUT");
  const confirmed = await readItem(token, item.id, playlistId, item.snippet.resourceId.videoId);
  if (confirmed.snippet.position !== position)
    throw new PublishError("YouTube video tartibini tasdiqlamadi. Playlistni yangilab tekshiring.", true);
  return confirmed;
}
export async function moveYouTubePlaylistItem(token: string, channelId: string, playlistId: string, itemId: string, position: number) {
  const playlist = await ownedYouTubePlaylist(token, playlistId, channelId);
  if (position > playlist.item_count)
    throw new PublishError("Video o‘rni playlistdagi videolar sonidan oshmasin.");
  const item = await readItem(token, itemId, playlistId);
  return itemView(await setPosition(token, item, playlistId, position - 1));
}

export async function attachYouTubePlaylist(
  token: string, binding: NonNullable<MediaPost["variants"]["youtube_playlist"]>, channelId: string,
  videoId: string, state: Record<string, any>, save: (state: Record<string, any>) => Promise<void>,
) {
  const previous = state.youtube_playlist;
  if (previous?.playlist_id === binding.playlist_id && previous.video_id === videoId && previous.completed) return;
  const playlist = await ownedYouTubePlaylist(token, binding.playlist_id, channelId);
  const q = new URLSearchParams({ part: "snippet", playlistId: binding.playlist_id, videoId, maxResults: "50" });
  const existing = await request(token, `playlistItems?${q}`);
  let item = existing.items?.find((i: any) => i.snippet?.resourceId?.videoId === videoId);
  const saved = previous?.playlist_id === binding.playlist_id && previous.video_id === videoId ? previous : {};
  if (!item && saved.id) item = await readItem(token, saved.id, binding.playlist_id, videoId);
  if (!item && saved.insert_started)
    throw new PublishError("Qo‘shish natijasi noaniq. Videoni playlistda tekshiring; takroriy yozuv yuborilmadi.", false, true);
  if (!item) {
    // Persist the intent before an insert. A lost response is recovered with a
    // videoId lookup; it must never lead to a second blind insert.
    state.youtube_playlist = { playlist_id: binding.playlist_id, video_id: videoId, insert_started: true };
    await save(state);
    try {
      item = await request(token, "playlistItems?part=snippet", {
        snippet: {
          playlistId: binding.playlist_id, resourceId: { kind: "youtube#video", videoId },
          ...(binding.position ? { position: Math.min(binding.position - 1, playlist.item_count) } : {}),
        },
      }, "POST");
      if (!item.id) throw new PublishError("Playlistga qo‘shish natijasini tekshiring.", false, true);
    } catch (e) {
      if (e instanceof PublishError && !e.ambiguous) {
        state.youtube_playlist.insert_started = false;
        await save(state);
      }
      throw e;
    }
  }
  state.youtube_playlist = { playlist_id: binding.playlist_id, video_id: videoId, id: item.id };
  await save(state);
  const current = await ownedYouTubePlaylist(token, binding.playlist_id, channelId);
  const target = binding.position ? Math.min(binding.position - 1, Math.max(0, current.item_count - 1)) : undefined;
  if (target !== undefined && item.snippet?.position !== target)
    item = await setPosition(token, item, binding.playlist_id, target);
  else item = await readItem(token, item.id, binding.playlist_id, videoId);
  if (target !== undefined && item.snippet.position !== target)
    throw new PublishError("Playlistdagi video o‘rnini qayta tekshiring.", true);
  state.youtube_playlist = { ...state.youtube_playlist, position: item.snippet.position + 1, completed: true };
  await save(state);
}
