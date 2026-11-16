import assert from "node:assert/strict";
import { test } from "node:test";
process.env.DATABASE_URL ||= "postgresql://local-test/not-used";

test("bucket config requires an https endpoint and all credentials", async () => {
  const { bucketConfig } = await import("./asset-store");
  assert.equal(bucketConfig({}), null);
  assert.equal(
    bucketConfig({ MEDIA_BUCKET_ENDPOINT: "http://x", MEDIA_BUCKET_NAME: "b", MEDIA_BUCKET_ACCESS_KEY_ID: "k", MEDIA_BUCKET_SECRET_ACCESS_KEY: "s" }),
    null,
  );
  const c = bucketConfig({
    MEDIA_BUCKET_ENDPOINT: "https://storage.example/",
    MEDIA_BUCKET_NAME: "b",
    MEDIA_BUCKET_ACCESS_KEY_ID: "k",
    MEDIA_BUCKET_SECRET_ACCESS_KEY: "s",
    MEDIA_BUCKET_URL_STYLE: "virtual-hosted",
  })!;
  assert.equal(c.endpoint, "https://storage.example");
  assert.equal(c.virtualHost, true);
  assert.equal(c.region, "auto");
});

test(
  "assets move to the bucket, stay readable, survive a failed upload and are removed with the row",
  { skip: !process.env.MEDIA_TEST_PGLITE_PATH },
  async () => {
    process.env.DATABASE_URL = "postgresql://local-test/not-used";
    const { pool } = await import("../../db");
    const { PGlite } = await import(process.env.MEDIA_TEST_PGLITE_PATH!);
    const pglite = new PGlite();
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
    const { ensureMediaTables } = await import("./schema");
    await ensureMediaTables(pool);
    const store = new Map<string, Buffer>();
    let failNext = false;
    const { setAssetStore, migrateAssetsBatch, hydrateAssets, removeStoredAsset, bucketSelfCheck } = await import("./asset-store");
    setAssetStore({
      put: async (k, d) => {
        if (failNext) {
          failNext = false;
          throw new Error("down");
        }
        store.set(k, Buffer.from(d));
      },
      get: async (k) => {
        const v = store.get(k);
        if (!v) throw new Error("missing");
        return v;
      },
      remove: async (k) => void store.delete(k),
    });
    try {
      assert.equal(await bucketSelfCheck(), true);
      assert.equal(store.size, 0, "tekshiruv fayli o'chiriladi");
      const a = Buffer.from("video-bytes"),
        b = Buffer.from("image-bytes");
      const ids = [];
      for (const [name, data] of [["a.mp4", a], ["b.jpg", b]] as const)
        ids.push(
          (await pool.query("INSERT INTO media_assets(name,mime_type,size,data) VALUES($1,'video/mp4',$2,$3) RETURNING id", [name, data.length, data]))
            .rows[0].id,
        );
      // Bucket vaqtincha ishlamasa, fayl bazada qoladi.
      failNext = true;
      await assert.rejects(migrateAssetsBatch(5));
      let rows = (await pool.query("SELECT id,data,storage_key FROM media_assets ORDER BY name")).rows;
      assert.equal(rows.filter((r: any) => r.storage_key).length, 0);
      assert.equal(await migrateAssetsBatch(5), 2);
      assert.equal(await migrateAssetsBatch(5), 0, "takror ko'chirilmaydi");
      rows = (await pool.query("SELECT id,name,data,storage_key FROM media_assets ORDER BY name")).rows;
      assert.ok(rows.every((r: any) => r.data === null && r.storage_key === "media/" + r.id));
      assert.equal(store.size, 2);
      const hydrated = await hydrateAssets(rows);
      assert.equal(Buffer.from(hydrated[0].data).toString(), "video-bytes");
      assert.equal(Buffer.from(hydrated[1].data).toString(), "image-bytes");
      // Hali ko'chirilmagan qator avvalgidek o'qiladi.
      const c = Buffer.from("fresh");
      const fresh = (await pool.query("INSERT INTO media_assets(name,mime_type,size,data) VALUES('c','image/png',5,$1) RETURNING id", [c])).rows[0].id;
      const [f] = await hydrateAssets((await pool.query("SELECT data,storage_key FROM media_assets WHERE id=$1", [fresh])).rows);
      assert.equal(Buffer.from(f.data).toString(), "fresh");
      // Hajm kvotasi o'zgarmaydi.
      assert.equal(Number((await pool.query("SELECT COALESCE(SUM(size),0) AS used FROM media_assets")).rows[0].used), a.length + b.length + 5);
      await removeStoredAsset("media/" + ids[0]);
      assert.equal(store.has("media/" + ids[0]), false);
    } finally {
      setAssetStore(undefined);
    }
  },
);
