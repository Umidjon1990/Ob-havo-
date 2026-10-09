import test, { after, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";
process.env.MEDIA_ENCRYPTION_KEY ||= "playlist-test-key";
process.env.GOOGLE_CLIENT_ID = "playlist-test-client";
process.env.GOOGLE_CLIENT_SECRET = "playlist-test-secret";
process.env.OPENAI_API_KEY ||= "unused-test-key";
process.env.YOUTUBE_CHANNEL_ID = "UCU-0JeoKAGUIYCNMtiyc2Tg";
const { pool } = await import("../../db");
const { publish, seal, youtubeAccess, PublishError } = await import("./providers");
const { postSchema } = await import("../../../shared/media");
const { attachYouTubePlaylist, createYouTubePlaylist, listYouTubePlaylists, listYouTubePlaylistItems,
  moveYouTubePlaylistItem, playlistWriteGranted, youtubePlaylistInput } = await import("./youtube-playlists");
const originalFetch = globalThis.fetch, originalQuery = pool.query;
afterEach(() => { globalThis.fetch = originalFetch; pool.query = originalQuery; });
after(() => pool.end());
const channelId = process.env.YOUTUBE_CHANNEL_ID,
  accountId = "11111111-1111-4111-8111-111111111111", playlistId = "PL_test_lessons_12345";
const binding = { account_id: accountId, playlist_id: playlistId, title: "Darslar", position: 2 };
const account = { id: accountId, platform: "youtube", external_id: channelId, enabled: true,
  verified_at: "2026-10-09", credentials: seal({ refresh_token: "test-refresh" }) };
const video = { id: "22222222-2222-4222-8222-222222222222", mime_type: "video/mp4", size: 3, data: Buffer.from([1, 2, 3]) };
const post = { ...postSchema.parse({ title: "Test dars", format: "video", asset_ids: [video.id], variants: { youtube_playlist: binding } }),
  id: "post", created_at: "", updated_at: "", deliveries: [] };
const writeScope = "https://www.googleapis.com/auth/youtube.force-ssl";
const readScope = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";
function item(id: string, videoId: string, position: number) {
  return { id, snippet: { playlistId, resourceId: { kind: "youtube#video", videoId }, position, title: videoId } };
}
function fakeYouTube(options: { scope?: string; loseInsert?: boolean; insertApplied?: boolean; rejectInsert?: boolean; manualSort?: boolean; foreignOwner?: boolean; failVerification?: boolean } = {}) {
  const requests: { url: string; method: string; body?: any }[] = [];
  const items = [item("one", "older-video", 0), item("two", "later-video", 1)];
  let lost = false, rejected = false, verificationFailed = false;
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input)), method = init?.method || "GET";
    const body = typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : undefined;
    requests.push({ url: url.href, method, body });
    if (url.href === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "test-access", scope: options.scope ?? writeScope });
    if (url.pathname.endsWith("/channels")) return Response.json({ items: [{ id: channelId }] });
    if (url.pathname.endsWith("/playlists")) {
      const playlist = { id: playlistId, snippet: { channelId: options.foreignOwner ? "other-channel" : channelId, title: "Darslar" },
        status: { privacyStatus: "private" }, contentDetails: { itemCount: items.length } };
      return Response.json(method === "POST" ? playlist : { items: [playlist] });
    }
    if (url.pathname.endsWith("/playlistItems")) {
      if (method === "GET") {
        if (options.failVerification && url.searchParams.has("id") && !verificationFailed) {
          verificationFailed = true; throw new Error("read interrupted");
        }
        const found = items.filter(i => (!url.searchParams.has("id") || i.id === url.searchParams.get("id")) &&
          (!url.searchParams.has("videoId") || i.snippet.resourceId.videoId === url.searchParams.get("videoId")));
        return Response.json({ items: found });
      }
      if (options.manualSort) return Response.json({ error: { errors: [{ reason: "manualSortRequired" }] } }, { status: 400 });
      if (method === "POST" && options.rejectInsert && !rejected) {
        rejected = true;
        return Response.json({ error: { errors: [{ reason: "playlistItemsNotAccessible" }] } }, { status: 403 });
      }
      if (method === "POST") {
        const created = item("new-item", body.snippet.resourceId.videoId, body.snippet.position ?? items.length);
        if (!(options.loseInsert && options.insertApplied === false && !lost)) items.splice(created.snippet.position, 0, created);
        items.forEach((i, p) => { i.snippet.position = p; });
        if (options.loseInsert && !lost) { lost = true; throw new Error("insert response lost"); }
        return Response.json(created);
      }
      const index = items.findIndex(i => i.id === body.id), moved = items.splice(index, 1)[0];
      items.splice(body.snippet.position, 0, moved); items.forEach((i, p) => { i.snippet.position = p; });
      return Response.json(moved);
    }
    if (method === "POST" && url.searchParams.get("uploadType") === "resumable")
      return Response.json({}, { headers: { location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test" } });
    if (method === "PUT" && url.pathname.includes("/upload/")) return Response.json({ id: "new-video", status: { privacyStatus: "public" } });
    throw new Error(`Unexpected request: ${method} ${url.href}`);
  }) as typeof fetch;
  return { requests, items };
}
test("playlist scopes distinguish reading/uploading from playlist management and preserve unknown legacy scopes", () => {
  assert.equal(playlistWriteGranted(readScope), false);
  assert.equal(playlistWriteGranted(writeScope), true);
  assert.equal(playlistWriteGranted("https://www.googleapis.com/auth/youtube"), true);
  assert.equal(playlistWriteGranted(undefined), null);
});
test("draft schema keeps the channel binding and one-based order, rejecting invalid positions and IDs", () => {
  assert.deepEqual(postSchema.parse(post).variants.youtube_playlist, binding);
  for (const position of [0, -1, 1.5, 10001]) assert.equal(postSchema.safeParse({ ...post, variants: { youtube_playlist: { ...binding, position } } }).success, false);
  assert.equal(postSchema.safeParse({ ...post, variants: { youtube_playlist: { ...binding, playlist_id: "bad/url" } } }).success, false);
  assert.equal(youtubePlaylistInput.parse({ title: " Darslar " }).privacy, "private");
});
test("legacy credentials retain their stored permission state when refresh omits scope", async () => {
  globalThis.fetch = (async () => Response.json({ access_token: "test-access" })) as typeof fetch;
  assert.equal((await youtubeAccess({ ...account, credentials: seal({ refresh_token: "test-refresh", scope: readScope }) })).playlist_write, false);
});
test("listing follows pagination and excludes playlists belonging to another channel", async () => {
  const pages: string[] = [];
  globalThis.fetch = (async input => {
    const url = new URL(String(input)); pages.push(url.searchParams.get("pageToken") || "first");
    assert.equal(url.searchParams.get("mine"), "true");
    const make = (id: string, owner: string) => ({ id, snippet: { title: id, channelId: owner }, status: { privacyStatus: "private" } });
    return Response.json(url.searchParams.has("pageToken") ? { items: [make("PL_second", channelId)] } : { items: [make("PL_first", channelId), make("PL_foreign", "other")], nextPageToken: "next" });
  }) as typeof fetch;
  assert.deepEqual((await listYouTubePlaylists("test", channelId)).map(p => p.id), ["PL_first", "PL_second"]);
  assert.deepEqual(pages, ["first", "next"]);
});
test("creating a playlist checks the token's channel, applies privacy and reads back the created resource", async () => {
  const { requests } = fakeYouTube();
  const result = await createYouTubePlaylist("test", channelId, { title: "Darslar", description: "Tartibli darslar", privacy: "private" });
  assert.equal(result.id, playlistId);
  const writes = requests.filter(r => r.method === "POST");
  assert.equal(writes.length, 1); assert.equal(writes[0].body.status.privacyStatus, "private");
  assert.ok(requests.at(-1)?.url.includes("id="));
});
test("moving a playlist item uses its identity and zero-based API position, then confirms the resulting order", async () => {
  const { requests, items } = fakeYouTube();
  const result = await moveYouTubePlaylistItem("test", channelId, playlistId, "two", 1);
  assert.equal(result.position, 1); assert.equal(items[0].id, "two");
  assert.deepEqual(requests.find(r => r.method === "PUT")?.body,
    { id: "two", snippet: { playlistId, resourceId: { kind: "youtube#video", videoId: "later-video" }, position: 0 } });
  assert.deepEqual((await listYouTubePlaylistItems("test", playlistId, channelId)).map(i => i.position), [1, 2]);
});
test("a foreign playlist, wrong item or out-of-range order cannot produce a write", async () => {
  let mock = fakeYouTube({ foreignOwner: true });
  await assert.rejects(moveYouTubePlaylistItem("test", channelId, playlistId, "two", 1), /tegishli emas/);
  assert.equal(mock.requests.some(r => r.method === "PUT"), false);
  mock = fakeYouTube();
  await assert.rejects(moveYouTubePlaylistItem("test", channelId, playlistId, "missing", 1), /topilmadi/);
  await assert.rejects(moveYouTubePlaylistItem("test", channelId, playlistId, "two", 3), /sonidan oshmasin/);
  assert.equal(mock.requests.some(r => r.method === "PUT"), false);
});
test("publication uploads once, inserts at the selected position, saves receipt and completes without duplicate writes", async () => {
  const { requests, items } = fakeYouTube(), state: Record<string, any> = {}, saves: Record<string, any>[] = [];
  const save = async () => { saves.push(structuredClone(state)); };
  assert.equal((await publish(post, account, [video], state, save)).external_id, "new-video");
  assert.equal(items[1].snippet.resourceId.videoId, "new-video");
  assert.equal(state.youtube_playlist.completed, true); assert.equal(state.youtube_playlist.position, 2);
  assert.ok(saves.some(s => s.youtube_video_id && s.youtube_playlist?.insert_started && !s.youtube_playlist?.id));
  await publish(post, account, [video], state, save);
  assert.equal(requests.filter(r => r.url.includes("uploadType=resumable")).length, 1);
  assert.equal(requests.filter(r => r.method === "POST" && r.url.includes("/playlistItems")).length, 1);
});
test("a lost insert response recovers the existing playlist entry and uploaded video instead of duplicating either", async () => {
  const { requests, items } = fakeYouTube({ loseInsert: true }), state: Record<string, any> = {};
  await assert.rejects(publish(post, account, [video], state, async () => {}), (e: any) => e instanceof PublishError && e.ambiguous && /Video yuklandi/.test(e.message));
  assert.equal(state.youtube_video_id, "new-video"); assert.equal(state.youtube_playlist.insert_started, true);
  await publish(post, account, [video], state, async () => {});
  assert.equal(state.youtube_playlist.completed, true);
  assert.equal(items.filter(i => i.snippet.resourceId.videoId === "new-video").length, 1);
  assert.equal(requests.filter(r => r.url.includes("uploadType=resumable")).length, 1);
  assert.equal(requests.filter(r => r.method === "POST" && r.url.includes("/playlistItems")).length, 1);
});
test("an unconfirmed insert remains in review and never sends another blind insert", async () => {
  const { requests } = fakeYouTube({ loseInsert: true, insertApplied: false }), state: Record<string, any> = {};
  await assert.rejects(attachYouTubePlaylist("test", binding, channelId, "new-video", state, async () => {}));
  await assert.rejects(attachYouTubePlaylist("test", binding, channelId, "new-video", state, async () => {}), (e: any) => e.ambiguous);
  assert.equal(requests.filter(r => r.method === "POST").length, 1);
});
test("a definite playlist rejection can be retried without reuploading the already saved video", async () => {
  const { requests } = fakeYouTube({ rejectInsert: true }), state: Record<string, any> = {};
  await assert.rejects(publish(post, account, [video], state, async () => {}), /Video yuklandi/);
  assert.equal(state.youtube_playlist.insert_started, false);
  await publish(post, account, [video], state, async () => {});
  assert.equal(state.youtube_playlist.completed, true);
  assert.equal(requests.filter(r => r.url.includes("uploadType=resumable")).length, 1);
});
test("a failed read-back retains the playlist item ID and recovers without a second insert", async () => {
  const { requests } = fakeYouTube({ failVerification: true }), state: Record<string, any> = {};
  await assert.rejects(attachYouTubePlaylist("test", binding, channelId, "new-video", state, async () => {}));
  assert.equal(state.youtube_playlist.id, "new-item");
  await attachYouTubePlaylist("test", binding, channelId, "new-video", state, async () => {});
  assert.equal(state.youtube_playlist.completed, true);
  assert.equal(requests.filter(r => r.method === "POST").length, 1);
});
test("an existing video is moved rather than reinserted, while a future position appends to a short playlist", async () => {
  let mock = fakeYouTube();
  await attachYouTubePlaylist("test", { ...binding, position: 1 }, channelId, "later-video", {}, async () => {});
  assert.equal(mock.items[0].snippet.resourceId.videoId, "later-video");
  assert.equal(mock.requests.some(r => r.method === "POST"), false);
  mock = fakeYouTube();
  await attachYouTubePlaylist("test", { ...binding, position: 9 }, channelId, "new-video", {}, async () => {});
  assert.equal(mock.items[2].snippet.resourceId.videoId, "new-video");
});
test("missing playlist scope and a mismatched account stop publication before uploading any video", async () => {
  let mock = fakeYouTube({ scope: readScope });
  await assert.rejects(publish(post, account, [video], {}, async () => {}), /qayta ulang/);
  assert.equal(mock.requests.some(r => r.url.includes("uploadType=resumable")), false);
  mock = fakeYouTube();
  await assert.rejects(publish(post, { ...account, id: "other-account" }, [video], {}, async () => {}), /boshqa YouTube hisobiga/);
  assert.equal(mock.requests.some(r => r.url.includes("uploadType=resumable")), false);
});
test("manual sorting errors explain the required YouTube setting and do not mark the playlist step completed", async () => {
  fakeYouTube({ manualSort: true }); const state: Record<string, any> = {};
  await assert.rejects(publish(post, account, [video], state, async () => {}), /Manual/);
  assert.equal(state.youtube_video_id, "new-video"); assert.notEqual(state.youtube_playlist.completed, true);
});
test("a playlist channel mismatch rejects scheduling before inserting any deliveries", async () => {
  const originalConnect = pool.connect, queries: string[] = [];
  const { schedulePublications } = await import("./scheduling");
  pool.connect = (async () => ({
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("FROM media_accounts")) return { rows: [{ ...account, id: "other-account" }], rowCount: 1 };
      if (sql.includes("FROM media_posts")) return { rows: [post], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }, release() {},
  })) as any;
  try {
    await assert.rejects(schedulePublications([{ post_id: post.id, scheduled_at: new Date(Date.now() + 600000).toISOString() }], ["other-account"]), /hisobi mos emas/);
    assert.ok(queries.includes("ROLLBACK"));
    assert.equal(queries.some(q => q.includes("INSERT INTO media_deliveries")), false);
  } finally { pool.connect = originalConnect; }
});
test("mounted admin routes block unauthenticated writes, expose read-only capability and request the new OAuth scope", async () => {
  const express = (await import("express")).default;
  const { registerMediaRoutes } = await import("./routes");
  const { hashToken } = await import("./security");
  process.env.APP_URL = "https://example.test";
  const token = "playlist-test-admin-session";
  pool.query = (async (sql: string, values?: any[]) => {
    if (sql.includes("FROM media_sessions")) return { rows: [{ ok: 1 }], rowCount: values?.[0] === hashToken(token) ? 1 : 0 };
    if (sql.includes("FROM media_accounts")) return { rows: [account], rowCount: 1 };
    if (sql.includes("INSERT INTO media_oauth_states")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  }) as any;
  const app = express(); app.use(express.json()); registerMediaRoutes(app);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`, nativeFetch = originalFetch;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  try {
    const mock = fakeYouTube({ scope: readScope });
    const endpoint = `${origin}/api/media/accounts/${accountId}/youtube/playlists`;
    assert.equal((await nativeFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Darslar" }) })).status, 401);
    assert.equal(mock.requests.length, 0);
    const catalog = await nativeFetch(endpoint, { headers });
    assert.equal(catalog.status, 200); assert.equal((await catalog.json()).can_manage, false);
    const create = await nativeFetch(endpoint, { method: "POST", headers, body: JSON.stringify({ title: "Darslar" }) });
    assert.equal(create.status, 400); assert.match((await create.json()).error, /qayta ulang/);
    assert.equal(mock.requests.some(r => r.method === "POST" && r.url.includes("/youtube/v3/")), false);
    const oauth = await nativeFetch(`${origin}/api/media/oauth/youtube/start`, { headers });
    assert.equal(oauth.status, 200);
    assert.ok(new URL((await oauth.json()).url).searchParams.get("scope")?.includes(writeScope));
    const writing = fakeYouTube();
    const created = await nativeFetch(endpoint, { method: "POST", headers, body: JSON.stringify({ title: "Darslar" }) });
    assert.equal(created.status, 201); assert.equal((await created.json()).id, playlistId);
    const moved = await nativeFetch(`${endpoint}/${playlistId}/items/two`, { method: "PATCH", headers, body: JSON.stringify({ position: 1 }) });
    assert.equal(moved.status, 200); assert.equal((await moved.json()).position, 1);
    assert.equal(writing.requests.filter(r => r.method === "PUT").length, 1);
  } finally { await new Promise<void>(r => server.close(() => r())); }
});
