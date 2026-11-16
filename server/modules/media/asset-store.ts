// Media fayllarini Postgres o'rniga S3-mos bucket'da saqlash.
// Yangi fayl avval bazaga yoziladi (mavjud kod o'zgarmaydi), fon jarayoni uni bucket'ga ko'chiradi
// va bazadagi nusxani o'chiradi. O'qishda `hydrateAssets` bucket'dagi faylni qaytadan `data` ga qo'yadi.
// Bucket sozlanmagan bo'lsa (masalan testlarda) hammasi avvalgidek bazada qoladi.
import { createHash, createHmac } from "node:crypto";
import { pool } from "../../db";

type Conf = { endpoint: string; bucket: string; region: string; key: string; secret: string; virtualHost: boolean };

export function bucketConfig(env = process.env): Conf | null {
  const endpoint = (env.MEDIA_BUCKET_ENDPOINT || "").replace(/\/$/, "");
  const bucket = env.MEDIA_BUCKET_NAME || "";
  const key = env.MEDIA_BUCKET_ACCESS_KEY_ID || "";
  const secret = env.MEDIA_BUCKET_SECRET_ACCESS_KEY || "";
  if (!/^https:\/\//.test(endpoint) || !bucket || !key || !secret) return null;
  return {
    endpoint,
    bucket,
    key,
    secret,
    region: env.MEDIA_BUCKET_REGION || "auto",
    virtualHost: (env.MEDIA_BUCKET_URL_STYLE || "").toLowerCase().startsWith("virtual"),
  };
}

const sha = (v: Buffer | string) => createHash("sha256").update(v).digest("hex");
const hmac = (k: Buffer | string, v: string) => createHmac("sha256", k).update(v).digest();

/** AWS SigV4 imzosi bilan bitta S3 so'rovi (PUT/GET/DELETE). */
export async function s3Request(conf: Conf, method: "PUT" | "GET" | "DELETE", objectKey: string, body?: Buffer, contentType?: string) {
  const base = new URL(conf.endpoint);
  const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
  const host = conf.virtualHost ? `${conf.bucket}.${base.host}` : base.host;
  const path = conf.virtualHost ? `/${encodedKey}` : `/${encodeURIComponent(conf.bucket)}/${encodedKey}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = sha(body || "");
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(contentType ? { "content-type": contentType } : {}),
  };
  const names = Object.keys(headers).sort();
  const canonical = [method, path, "", names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${day}/${conf.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha(canonical)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac("AWS4" + conf.secret, day), conf.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
  const { host: _host, ...sent } = headers;
  const response = await fetch(`${base.protocol}//${host}${path}`, {
    method,
    headers: {
      ...sent,
      authorization: `AWS4-HMAC-SHA256 Credential=${conf.key}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
    },
    body: body ? new Uint8Array(body) : undefined,
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok && !(method === "DELETE" && response.status === 404))
    throw new Error(`Bucket ${method} ${response.status}`);
  return response;
}

export type AssetStore = {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
};

let override: AssetStore | null | undefined;
/** Testlar uchun: boshqa saqlash joyini ulash (null = bucket o'chiq). */
export function setAssetStore(store: AssetStore | null | undefined) {
  override = store;
}
export function assetStore(): AssetStore | null {
  if (override !== undefined) return override;
  const conf = bucketConfig();
  if (!conf) return null;
  return {
    put: async (key, data, mime) => void (await s3Request(conf, "PUT", key, data, mime)),
    get: async (key) => Buffer.from(await (await s3Request(conf, "GET", key)).arrayBuffer()),
    remove: async (key) => void (await s3Request(conf, "DELETE", key)),
  };
}

export async function ensureAssetStorageColumns(sql: { query: (q: string) => Promise<unknown> } = pool) {
  await sql.query(
    "ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS storage_key TEXT; ALTER TABLE media_assets ALTER COLUMN data DROP NOT NULL;",
  );
}

/** Bucket'ga ko'chirilgan qatorlarning `data` maydonini qayta to'ldiradi. */
export async function hydrateAssets<T = any>(rows: T[]): Promise<T[]> {
  const missing = (rows as any[]).filter((r) => r && (r.data === null || r.data === undefined) && r.storage_key);
  if (!missing.length) return rows;
  const store = assetStore();
  if (!store) throw new Error("Media bucket sozlanmagan, fayl o‘qilmadi");
  await Promise.all(
    missing.map(async (r) => {
      r.data = await store.get(r.storage_key);
    }),
  );
  return rows;
}

/** O'chirilgan media qatorining bucket'dagi faylini ham o'chiradi (xato bo'lsa jim o'tadi). */
export async function removeStoredAsset(storageKey: string | null | undefined) {
  if (!storageKey) return;
  try {
    await assetStore()?.remove(storageKey);
  } catch {
    console.error("Media bucket: fayl o‘chirilmadi");
  }
}

/**
 * Bir partiya faylni bazadan bucket'ga ko'chiradi. Har bir fayl: bucket'ga yoziladi, keyin bazada
 * `data` bo'shatiladi. Bucket'ga yozilmagan fayl bazada qoladi — hech narsa yo'qolmaydi.
 */
export async function migrateAssetsBatch(limit = 5) {
  const store = assetStore();
  if (!store) return 0;
  const rows = (
    await pool.query(
      "SELECT id FROM media_assets WHERE storage_key IS NULL AND data IS NOT NULL ORDER BY created_at LIMIT $1",
      [limit],
    )
  ).rows as { id: string }[];
  let moved = 0;
  for (const { id } of rows) {
    const row = (await pool.query("SELECT id,mime_type,data FROM media_assets WHERE id=$1 AND storage_key IS NULL", [id])).rows[0];
    if (!row?.data) continue;
    const key = `media/${row.id}`;
    await store.put(key, row.data, row.mime_type);
    const done = await pool.query(
      "UPDATE media_assets SET storage_key=$2, data=NULL WHERE id=$1 AND storage_key IS NULL",
      [row.id, key],
    );
    if (done.rowCount) moved++;
  }
  return moved;
}

/** Bucket haqiqatan ishlashini tekshiradi: kichik fayl yoziladi, o'qiladi va o'chiriladi. */
export async function bucketSelfCheck(store = assetStore()) {
  if (!store) return false;
  const key = `health/${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const probe = Buffer.from("ob-havo-media-check");
  await store.put(key, probe, "text/plain");
  const back = await store.get(key);
  await store.remove(key);
  return Buffer.compare(back, probe) === 0;
}

let started = false;
/** Fon ko'chirishi: bucket sozlangan va tekshiruvdan o'tgan bo'lsa, har 20 soniyada kichik partiya. */
export async function startAssetMigration() {
  if (started || !assetStore()) return;
  started = true;
  try {
    if (!(await bucketSelfCheck())) throw new Error("mismatch");
    console.log("Media bucket: ulanish tekshirildi, ko‘chirish boshlandi");
  } catch {
    console.error("Media bucket: tekshiruvdan o‘tmadi, fayllar bazada qoladi");
    started = false;
    return;
  }
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const moved = await migrateAssetsBatch(5);
      if (moved) console.log(`Media bucket: ${moved} ta fayl ko‘chirildi`);
    } catch {
      console.error("Media bucket: ko‘chirish vaqtincha bajarilmadi");
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 20000);
  timer.unref?.();
  setTimeout(() => void tick(), 5000).unref?.();
}
