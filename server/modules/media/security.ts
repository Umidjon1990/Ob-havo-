import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { pool } from "../../db";
const cookieName = "media_session";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
function secret() {
  const value = process.env.MEDIA_ENCRYPTION_KEY || process.env.ADMIN_PASSWORD;
  if (!value) throw new Error("Admin xavfsizlik sozlamalari yetishmaydi.");
  return createHash("sha256").update(`zamonaviy-media:${value}`).digest();
}
export function seal(value: unknown): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", secret(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
export function unseal<T = Record<string, string>>(value: string): T {
  const data = Buffer.from(value, "base64"),
    cipher = createDecipheriv("aes-256-gcm", secret(), data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString(
      "utf8",
    ),
  );
}
export function requestToken(req: Request): string | undefined {
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) return bearer;
  return req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
}
export async function isAuthenticated(req: Request) {
  const token = requestToken(req);
  if (!token || token.length > 200) return false;
  return (
    (
      await pool.query(
        "SELECT 1 FROM media_sessions WHERE token_hash=$1 AND expires_at>now()",
        [hashToken(token)],
      )
    ).rowCount === 1
  );
}
export function sameOrigin(req: Request) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser Bearer clients
  const configured =
    process.env.APP_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : "");
  try {
    return (
      new URL(origin).host === req.get("host") ||
      (!!configured &&
        new URL(origin).origin ===
          new URL(
            configured.startsWith("http")
              ? configured
              : `https://${configured}`,
          ).origin)
    );
  } catch {
    return false;
  }
}
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !sameOrigin(req)) {
      res.status(403).json({ error: "Bu manzildan boshqaruvga ruxsat yo‘q." });
      return;
    }
    if (!(await isAuthenticated(req))) {
      res.status(401).json({ error: "Boshqaruv uchun qayta kiring." });
      return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    next();
  } catch {
    res.status(503).json({ error: "Boshqaruv bazasiga ulanib bo‘lmadi." });
  }
}
export async function issueSession(res: Response) {
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO media_sessions(token_hash,expires_at) VALUES($1,now()+interval '7 days')",
    [hashToken(token)],
  );
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 86400000,
    path: "/",
  });
  return token;
}
export async function revokeSession(req: Request, res: Response) {
  const token = requestToken(req);
  if (token)
    await pool.query("DELETE FROM media_sessions WHERE token_hash=$1", [
      hashToken(token),
    ]);
  res.clearCookie(cookieName, { path: "/" });
}
export function equalSecret(a: string, b: string) {
  const x = Buffer.from(hashToken(a)),
    y = Buffer.from(hashToken(b));
  return timingSafeEqual(x, y);
}
export function assetSignature(id: string, expires: string) {
  return createHmac("sha256", secret())
    .update(`${id}:${expires}`)
    .digest("hex");
}
export function validAssetSignature(id: string, expires: string, sig: string) {
  return (
    /^\d+$/.test(expires) &&
    Number(expires) > Date.now() &&
    Number(expires) < Date.now() + 8 * 86400000 &&
    /^[a-f0-9]{64}$/.test(sig) &&
    equalSecret(assetSignature(id, expires), sig)
  );
}
