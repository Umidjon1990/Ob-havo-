import test from "node:test";
import assert from "node:assert/strict";
import {
  campaignSchema,
  postSchema,
  validatePublication,
  suggestedDates,
} from "../../../shared/media";
const base = postSchema.parse({
  title: "Test",
  caption: "Matn",
  format: "text",
});
test("platform validation rejects missing media, oversized captions, and incompatible formats", () => {
  assert.equal(validatePublication(base, "telegram", []), null);
  assert.ok(validatePublication(base, "instagram", []));
  assert.ok(validatePublication({ ...base, format: "video" }, "youtube", []));
  assert.equal(
    validatePublication({ ...base, format: "video" }, "youtube", ["video/mp4"]),
    null,
  );
  assert.ok(
    validatePublication({ ...base, format: "carousel" }, "instagram", [
      "image/jpeg",
    ]),
  );
  assert.equal(
    validatePublication({ ...base, format: "carousel" }, "instagram", [
      "image/jpeg",
      "image/jpeg",
    ]),
    null,
  );
  assert.ok(
    validatePublication({ ...base, format: "image" }, "instagram", [
      "image/png",
    ]),
  );
  assert.ok(
    validatePublication({ ...base, caption: "x".repeat(4097) }, "telegram", []),
  );
  assert.equal(
    validatePublication(
      {
        ...base,
        caption: "x".repeat(5000),
        variants: { telegram: "Qisqa matn" },
      },
      "telegram",
      [],
    ),
    null,
  );
});
test("monthly suggestions span valid dates in Tashkent time and exclude past dates", () => {
  const dates = suggestedDates("2028-02", 20, new Date("2028-01-01"));
  assert.equal(dates.length, 20);
  assert.equal(new Set(dates).size, 20);
  assert.ok(
    dates.every(
      (d) => d.startsWith("2028-02-") && d.endsWith("T13:00:00.000Z"),
    ),
  );
  assert.equal(suggestedDates("2020-01", 10, new Date()).length, 0);
  assert.equal(
    campaignSchema.safeParse({
      topic: "Arab tili",
      count: 12,
      month: "2028-02",
      format: "video",
    }).success,
    false,
  );
});
// Integration tests use a dedicated disposable PostgreSQL database. Never use production DATABASE_URL.
const integration = !!(
  process.env.MEDIA_TEST_DATABASE_URL || process.env.MEDIA_TEST_PGLITE_PATH
);
test(
  "durable admin, rules, media, scheduling and delivery recovery",
  { skip: !integration },
  async () => {
    process.env.DATABASE_URL =
      process.env.MEDIA_TEST_DATABASE_URL || "postgresql://local-test/not-used";
    process.env.OPENAI_API_KEY = "local-test-placeholder";
    process.env.ADMIN_USERNAME = "test-admin";
    process.env.ADMIN_PASSWORD = "test-password";
    process.env.APP_URL = "https://media.test";
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
    const { pool } = await import("../../db");
    let pglite: any;
    if (process.env.MEDIA_TEST_PGLITE_PATH) {
      const { PGlite } = await import(process.env.MEDIA_TEST_PGLITE_PATH);
      pglite = new PGlite();
      const query = async (text: any, values?: any[]) => {
        if (!values && text.trim().split(";").filter(Boolean).length > 1) {
          await pglite.exec(text);
          return { rows: [], rowCount: 0 };
        }
        const r = await pglite.query(text, values);
        return { ...r, rowCount: r.affectedRows || r.rows?.length || 0 };
      };
      (pool as any).query = query;
      (pool as any).connect = async () => ({ query, release() {} });
    }
    const { ensureMediaTables } = await import("./schema");
    await ensureMediaTables(pool);
    await ensureMediaTables(pool);
    const { seal, unseal, assetSignature, validAssetSignature } =
      await import("./security");
    const sealed = seal({ access_token: "very-secret" });
    assert.ok(!sealed.includes("very-secret"));
    assert.deepEqual(unseal(sealed), { access_token: "very-secret" });
    const expires = String(Date.now() + 3600000);
    assert.ok(
      validAssetSignature("id", expires, assetSignature("id", expires)),
    );
    assert.ok(
      !validAssetSignature("other", expires, assetSignature("id", expires)),
    );
    const express = (await import("express")).default;
    const { createServer } = await import("node:http");
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    const server = createServer(app);
    await registerRoutes(server, app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    const nativeFetch = globalThis.fetch;
    let sends = 0,
      ambiguous = false;
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url).startsWith(origin)) return nativeFetch(url, init);
      if (String(url).includes("api.telegram.org")) {
        const method = String(url).split("/").pop();
        if (method === "getMe")
          return Response.json({ ok: true, result: { id: 123 } });
        if (method === "getChat")
          return Response.json({
            ok: true,
            result: { id: -1001, title: "Test channel", type: "channel" },
          });
        if (method === "getChatMember")
          return Response.json({
            ok: true,
            result: { status: "administrator", can_post_messages: true },
          });
        sends++;
        if (ambiguous) throw new TypeError("network interrupted");
        return Response.json({
          ok: true,
          result: { message_id: 99, chat: { username: "testchannel" } },
        });
      }
      throw new Error("External calls are blocked by this test.");
    }) as typeof fetch;
    let cookie = "";
    const request = async (
      path: string,
      method = "GET",
      body?: unknown,
      headers: Record<string, string> = {},
    ) => {
      const r = await fetch(origin + path, {
        method,
        headers: {
          ...(!Buffer.isBuffer(body)
            ? { "Content-Type": "application/json" }
            : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        ...(body !== undefined
          ? { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }
          : {}),
      });
      let d: any;
      try {
        d = await r.json();
      } catch {}
      return { r, d };
    };
    try {
      assert.equal((await request("/api/media/posts")).r.status, 401);
      assert.equal((await request("/api/channels")).r.status, 401);
      const login = await request("/api/admin/login", "POST", {
        username: "test-admin",
        password: "test-password",
      });
      assert.equal(login.r.status, 200);
      assert.ok(login.r.headers.get("set-cookie")?.includes("HttpOnly"));
      cookie = login.r.headers.get("set-cookie")!.split(";")[0];
      assert.equal((await request("/api/admin/verify", "POST")).r.status, 200);
      assert.equal(
        (
          await request("/api/media/posts", "POST", base, {
            Origin: "https://evil.test",
          })
        ).r.status,
        403,
      );
      const account = (
        await request("/api/media/accounts", "POST", {
          platform: "telegram",
          name: "Test",
          external_id: "@testchannel",
        })
      ).d;
      assert.equal(
        (await request(`/api/media/accounts/${account.id}/verify`, "POST")).r
          .status,
        200,
      );
      const p = (await request("/api/media/posts", "POST", base)).d;
      assert.equal(
        (
          await request(`/api/media/posts/${p.id}/schedule`, "POST", {
            account_ids: [account.id],
            scheduled_at: new Date(Date.now() + 60000).toISOString(),
          })
        ).r.status,
        200,
      );
      assert.equal(
        (
          await request(`/api/media/posts/${p.id}/schedule`, "POST", {
            account_ids: [account.id],
            scheduled_at: new Date(Date.now() + 60000).toISOString(),
          })
        ).r.status,
        409,
      );
      assert.equal(
        (
          await request(`/api/media/posts/${p.id}`, "PATCH", {
            ...base,
            caption: "Changed",
          })
        ).r.status,
        409,
      );
      await pool.query(
        "UPDATE media_deliveries SET scheduled_at=now()-interval '1 second'",
      );
      const { processDelivery } = await import("./worker");
      await Promise.all([processDelivery(), processDelivery()]);
      const published = (
        await pool.query("SELECT * FROM media_deliveries WHERE post_id=$1", [
          p.id,
        ])
      ).rows[0];
      assert.equal(published.status, "published");
      assert.equal(sends, 1);
      await processDelivery();
      assert.equal(sends, 1);
      assert.equal(
        (await request(`/api/media/deliveries/${published.id}/retry`, "POST")).r
          .status,
        409,
      );
      const p2 = (
        await request("/api/media/posts", "POST", {
          ...base,
          title: "Ambiguous",
        })
      ).d;
      await request(`/api/media/posts/${p2.id}/schedule`, "POST", {
        account_ids: [account.id],
        scheduled_at: new Date(Date.now() + 60000).toISOString(),
      });
      await pool.query(
        "UPDATE media_deliveries SET scheduled_at=now()-interval '1 second' WHERE post_id=$1",
        [p2.id],
      );
      ambiguous = true;
      await processDelivery();
      const d2 = (
        await pool.query("SELECT * FROM media_deliveries WHERE post_id=$1", [
          p2.id,
        ])
      ).rows[0];
      assert.equal(d2.status, "needs_review");
      await processDelivery();
      assert.equal(sends, 2);
      assert.equal(
        (await request(`/api/media/deliveries/${d2.id}/retry`, "POST")).r
          .status,
        409,
      );
      assert.equal(
        (
          await request(`/api/media/deliveries/${d2.id}/resolve`, "POST", {
            published: false,
          })
        ).r.status,
        200,
      );
      assert.equal(
        (await request(`/api/media/deliveries/${d2.id}/cancel`, "POST")).r
          .status,
        200,
      );
      const r = (
        await request("/api/media/rules", "POST", {
          title: "Motion",
          content: "Pop-up",
          scope: "video",
          active: true,
        })
      ).d;
      assert.equal(
        (
          await request(`/api/media/rules/${r.id}`, "PUT", {
            ...r,
            content: "Pop-up + whoosh",
          })
        ).r.status,
        200,
      );
      assert.equal(
        (
          await request(`/api/media/rules/${r.id}`, "PUT", {
            ...r,
            content: "Stale",
          })
        ).r.status,
        409,
      );
      const history = (await request(`/api/media/rules/${r.id}/history`)).d;
      assert.equal(history[0].content, "Pop-up");
      const jpg = Buffer.from([255, 216, 255, 224, 1, 2, 3]);
      const a = (
        await request("/api/media/assets", "POST", jpg, {
          "Content-Type": "image/jpeg",
          "X-File-Name": "test.jpg",
        })
      ).d;
      assert.ok(a.id);
      const assetResponse = await fetch(origin + `/api/media/assets/${a.id}`, {
        headers: { Cookie: cookie, Range: "bytes=0-2" },
      });
      assert.equal(assetResponse.status, 206);
      assert.equal((await assetResponse.arrayBuffer()).byteLength, 3);
      const attached = (
        await request("/api/media/posts", "POST", {
          ...base,
          format: "image",
          asset_ids: [a.id],
        })
      ).d;
      assert.equal(
        (await request(`/api/media/assets/${a.id}`, "DELETE")).r.status,
        409,
      );
      await request(`/api/media/posts/${attached.id}`, "DELETE");
      assert.equal(
        (await request(`/api/media/assets/${a.id}`, "DELETE")).r.status,
        200,
      );
      const before = (
        await pool.query("SELECT count(*)::int AS n FROM media_posts")
      ).rows[0].n;
      await ensureMediaTables(pool);
      assert.equal(
        (await pool.query("SELECT count(*)::int AS n FROM media_posts")).rows[0]
          .n,
        before,
      );
      await request("/api/admin/logout", "POST");
      assert.equal((await request("/api/media/posts")).r.status, 401);
    } finally {
      globalThis.fetch = nativeFetch;
      await new Promise<void>((r) => server.close(() => r()));
      if (pglite) await pglite.close();
      else await pool.end();
    }
  },
);

test("Instagram resumes the saved container and YouTube resumes an interrupted upload without a duplicate", async () => {
  process.env.DATABASE_URL ||= "postgresql://local-test/not-used";
  process.env.ADMIN_PASSWORD ||= "test-password";
  process.env.APP_URL = "https://media.test";
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  const { publish, PublishError } = await import("./providers");
  const { seal } = await import("./security");
  const nativeFetch = globalThis.fetch;
  const post: any = {
    ...base,
    id: "post",
    format: "video",
    asset_ids: ["asset"],
    variants: { instagram_cover_id: "cover" },
    deliveries: [],
  };
  const assets = [
    {
      id: "asset",
      mime_type: "video/mp4",
      size: 8,
      data: Buffer.from("video123"),
    },
  ];
  const account = {
    id: "account",
    platform: "instagram",
    external_id: "123",
    credentials: seal({ access_token: "test-ig" }),
  };
  let creates = 0,
    publishes = 0,
    ready = false,
    saved: any = {};
  try {
    globalThis.fetch = (async (url: any, init: any) => {
      const s = String(url);
      if (s.endsWith("/123/media")) {
        assert.equal(init.body.get("media_type"), "REELS");
        assert.match(init.body.get("cover_url"), /^https:\/\/media\.test\/api\/media\/assets\/cover\/public\?/);
        assert.equal(init.body.get("children"), null);
        creates++;
        return Response.json({ id: "container" });
      }
      if (s.includes("/container?"))
        return Response.json({
          status_code: ready ? "FINISHED" : "IN_PROGRESS",
        });
      if (s.endsWith("/123/media_publish")) {
        publishes++;
        return Response.json({ id: "published" });
      }
      if (s.includes("/published?"))
        return Response.json({ permalink: "https://instagram.com/p/test/" });
      throw new Error("Unexpected external call");
    }) as typeof fetch;
    await assert.rejects(
      () =>
        publish(post, account, assets, saved, async (s) => {
          saved = { ...s };
        }),
      (e) => e instanceof PublishError && e.retryable,
    );
    assert.equal(saved.container_id, "container");
    ready = true;
    const ig = await publish(post, account, assets, saved, async (s) => {
      saved = { ...s };
    });
    assert.equal(ig.external_id, "published");
    assert.equal(creates, 1);
    assert.equal(publishes, 1);
    let sessions = 0,
      uploads = 0,
      probes = 0;
    const youtube = {
      ...account,
      platform: "youtube",
      credentials: seal({ refresh_token: "test-refresh" }),
    };
    saved = {};
    globalThis.fetch = (async (url: any, init: any) => {
      const s = String(url);
      if (s === "https://oauth2.googleapis.com/token")
        return Response.json({ access_token: "youtube-access" });
      if (s.includes("uploadType=resumable")) {
        sessions++;
        return new Response("", {
          status: 200,
          headers: {
            location: "https://www.googleapis.com/upload/test-session",
          },
        });
      }
      if (s === "https://www.googleapis.com/upload/test-session") {
        if (init.headers["Content-Range"] === "bytes */8") {
          probes++;
          return Response.json({
            id: "video-id",
            status: { privacyStatus: "private" },
          });
        }
        uploads++;
        throw new TypeError("Network interrupted after upload");
      }
      throw new Error("Unexpected external call");
    }) as typeof fetch;
    await assert.rejects(
      () =>
        publish(post, youtube, assets, saved, async (s) => {
          saved = { ...s };
        }),
      (e) => e instanceof PublishError && e.retryable,
    );
    const yt = await publish(post, youtube, assets, saved, async (s) => {
      saved = { ...s };
    });
    assert.equal(yt.external_id, "video-id");
    assert.ok("note" in yt && yt.note?.includes("private"));
    assert.equal(sessions, 1);
    assert.equal(uploads, 1);
    assert.equal(probes, 1);
  } finally {
    globalThis.fetch = nativeFetch;
  }
});

test("Article is restricted to Telegram rich content", () => {
  const article = postSchema.parse({title: "Dars", format: "article", caption: "<h1>Dars</h1><table><tr><td>كِتَابٌ</td></tr></table>"});
  assert.equal(validatePublication(article, "telegram", []), null);
  assert.ok(validatePublication(article, "instagram", []));
  assert.ok(validatePublication(article, "youtube", []));
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(validatePublication({...article, asset_ids: [id], caption: `<img src="{{asset:${id}}}"/>`}, "telegram", ["image/jpeg"]), null);
  assert.ok(validatePublication({...article, caption: `<img src="{{asset:${id}}}"/>`}, "telegram", []));
  assert.ok(validatePublication({...article, asset_ids: [id]}, "telegram", ["image/jpeg"]));
  assert.ok(validatePublication({...article, caption: " "}, "telegram", []));
});
