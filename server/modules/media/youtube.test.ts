import test, { after } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";
process.env.MEDIA_ENCRYPTION_KEY ||= "youtube-test-key";
process.env.GOOGLE_CLIENT_ID = "youtube-test-client";
process.env.GOOGLE_CLIENT_SECRET = "youtube-test-secret";
process.env.YOUTUBE_CHANNEL_ID = "UCU-0JeoKAGUIYCNMtiyc2Tg";
const { pool } = await import("../../db");
const { publish, seal } = await import("./providers");
const { postSchema } = await import("../../../shared/media");
const originalFetch = globalThis.fetch, originalQuery = pool.query;
after(() => { globalThis.fetch = originalFetch; pool.query = originalQuery; });
const cover = { id: "11111111-1111-4111-8111-111111111111", mime_type: "image/jpeg", size: 3, data: Buffer.from([1, 2, 3]) };
const video = { id: "22222222-2222-4222-8222-222222222222", mime_type: "video/mp4", size: 3, data: Buffer.from([4, 5, 6]) };
const post = { ...postSchema.parse({ title: "Odamlar nima deydi?", format: "video", asset_ids: [video.id], variants: { youtube_cover_id: cover.id } }), id: "post", created_at: "", updated_at: "", deliveries: [] };
const account = { id: "account", platform: "youtube", external_id: process.env.YOUTUBE_CHANNEL_ID, credentials: seal({ refresh_token: "test-refresh" }) };
function mocked(state: Record<string, any>, rejectThumbnail = false) {
  const requests: { url: string; method: string }[] = [];
  pool.query = (async () => ({ rows: [cover] })) as any;
  globalThis.fetch = (async (input, init) => {
    const url = String(input), method = init?.method || "GET";
    requests.push({ url, method });
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
    if (url === "https://oauth2.googleapis.com/token") return json({ access_token: "test-access" });
    if (url.includes("/thumbnails/set")) {
      assert.equal(state.youtube_video_id, "test-video", "video identity must be saved before the thumbnail request");
      assert.match(url, /videoId=test-video/);
      assert.deepEqual(Buffer.from(init?.body as Uint8Array), cover.data);
      return rejectThumbnail ? json({ error: { code: 403 } }, 403) : json({ items: [{ default: { url: "https://example.test/thumbnail.jpg" } }] });
    }
    if (method === "POST" && url.includes("uploadType=resumable")) return json({}, 200, { location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test" });
    if (method === "PUT") return json({ id: "test-video", status: { privacyStatus: "public" } });
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  return requests;
}
test("YouTube uploads a video and its chosen thumbnail and resumes without duplicating either", async () => {
  const state: Record<string, any> = {}, requests = mocked(state);
  const saved: Record<string, any>[] = [];
  const save = async (value: Record<string, any>) => { saved.push({ ...value }); };
  const result = await publish(post, account, [video], state, save);
  assert.equal(result.external_id, "test-video");
  assert.equal(result.note, undefined);
  assert.equal(state.youtube_thumbnail_asset_id, cover.id);
  assert.ok(saved.some(s => s.youtube_video_id === "test-video" && !s.youtube_thumbnail_asset_id));
  await publish(post, account, [video], state, save);
  assert.equal(requests.filter(r => r.url.includes("uploadType=resumable")).length, 1);
  assert.equal(requests.filter(r => r.method === "PUT").length, 1);
  assert.equal(requests.filter(r => r.url.includes("/thumbnails/set")).length, 1);
});
test("a rejected thumbnail preserves the published video and only retries the thumbnail", async () => {
  const state: Record<string, any> = {}, first = mocked(state, true), save = async () => {};
  const result = await publish(post, account, [video], state, save);
  assert.equal(result.external_id, "test-video");
  assert.match(result.note || "", /muqova tasdiqlanmadi/);
  assert.equal(state.youtube_thumbnail_asset_id, undefined);
  assert.equal(first.filter(r => r.method === "PUT").length, 1);
  const resumed = mocked(state);
  await publish(post, account, [video], state, save);
  assert.equal(resumed.filter(r => r.url.includes("uploadType=resumable") || r.method === "PUT").length, 0);
  assert.equal(resumed.filter(r => r.url.includes("/thumbnails/set")).length, 1);
});
test("the other YouTube channel is blocked before uploading media", async () => {
  const requests = mocked({});
  await assert.rejects(publish(post, { ...account, external_id: "UC3ZRFYsx-7KVSvIAuD15CWg" }, [video], {}, async () => {}), /asosiy kanal emas/);
  assert.equal(requests.length, 0);
});
