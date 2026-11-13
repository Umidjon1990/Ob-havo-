// Zamonaviy Ta'lim "Mini-testlar" uchun yopiq API.
// Faqat xizmat kaliti (PLATFORM_SERVICE_SECRET) bilan ishlaydi; Telegram yuborish jarayoniga tegmaydi.
// Asosiy tizim ro'yxat va savollarni shu yerdan oladi, javobni o'zi tekshiradi.
import type { Express, NextFunction, Request, Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";

export interface MiniTestRow {
  id: string;
  contentType: string;
  titleAr: string;
  titleUz: string;
  testDate: string;
  level: string;
  payload?: string;
  createdAt: Date | string | null;
  hasAudio?: boolean;
  audioBase64?: string | null;
}

export interface MiniTestSource {
  list(limit: number): Promise<MiniTestRow[]>;
  get(id: string): Promise<MiniTestRow | undefined>;
}

const digest = (v: string) => createHash("sha256").update(v).digest();

export function validServiceKey(given: string | undefined, key = process.env.PLATFORM_SERVICE_SECRET || "") {
  if (key.length < 32 || !given) return false;
  return timingSafeEqual(digest(given), digest(key));
}

function serviceOnly(req: Request, res: Response, next: NextFunction) {
  if (!validServiceKey(req.get("x-platform-key"))) return res.status(403).json({ error: "Xizmat ruxsati yo‘q" });
  res.set("Cache-Control", "no-store");
  next();
}

/** Saqlangan payloadni xavfsiz, bir xil shaklga keltiradi. Noto'g'ri bo'lsa null. */
export function normalizeMiniTest(row: MiniTestRow) {
  let payload: any;
  try {
    payload = JSON.parse(row.payload || "");
  } catch {
    return null;
  }
  const quizzes = Array.isArray(payload?.quizzes) ? payload.quizzes : [];
  const questions = quizzes
    .filter(
      (q: any) =>
        q &&
        typeof q.question === "string" &&
        Array.isArray(q.options) &&
        q.options.length >= 2 &&
        q.options.every((o: unknown) => typeof o === "string") &&
        Number.isInteger(q.correctIndex) &&
        q.correctIndex >= 0 &&
        q.correctIndex < q.options.length,
    )
    .map((q: any) => ({
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: typeof q.explanation === "string" ? q.explanation : "",
      type: typeof q.type === "string" ? q.type : "multiple_choice",
    }));
  if (!questions.length) return null;
  const p = payload.passage || {};
  const base = {
    id: row.id,
    type: row.contentType === "listening" ? "listening" : "reading",
    level: row.level,
    titleAr: row.titleAr,
    titleUz: row.titleUz,
    testDate: row.testDate,
    createdAt: row.createdAt,
    questions,
  };
  if (base.type === "listening") {
    const dialog = Array.isArray(p.dialog)
      ? p.dialog
          .filter((l: any) => l && typeof l.text === "string")
          .map((l: any) => ({ speaker: l.speaker === "F" ? "F" : "M", text: l.text }))
      : [];
    return {
      ...base,
      topicAr: p.topicAr || "",
      topicUz: p.topicUz || "",
      transcript: dialog,
      hasAudio: Boolean(row.audioBase64 ?? row.hasAudio),
    };
  }
  const paragraphsAr = Array.isArray(p.paragraphsAr) ? p.paragraphsAr.filter((x: unknown) => typeof x === "string") : [];
  const paragraphsUz = Array.isArray(p.paragraphsUz) ? p.paragraphsUz.filter((x: unknown) => typeof x === "string") : [];
  return {
    ...base,
    topicAr: p.topicAr || "",
    topicUz: p.topicUz || "",
    passageTitleAr: p.titleAr || row.titleAr,
    paragraphsAr: paragraphsAr.length ? paragraphsAr : typeof p.fullAr === "string" ? [p.fullAr] : [],
    paragraphsUz: paragraphsUz.length ? paragraphsUz : typeof p.fullUz === "string" ? [p.fullUz] : [],
    hasAudio: false,
  };
}

export function registerMiniTestApi(app: Express, source: MiniTestSource) {
  app.get("/api/platform/mini-tests", serviceOnly, async (_req, res) => {
    try {
      const rows = await source.list(1000);
      res.json({
        tests: rows.map((r) => ({
          id: r.id,
          type: r.contentType === "listening" ? "listening" : "reading",
          level: r.level,
          titleAr: r.titleAr,
          titleUz: r.titleUz,
          testDate: r.testDate,
          createdAt: r.createdAt,
          hasAudio: Boolean(r.hasAudio),
        })),
      });
    } catch (error) {
      console.error("Mini-test list failed");
      res.status(503).json({ error: "Ro‘yxat vaqtincha olinmadi" });
    }
  });
  app.get("/api/platform/mini-tests/:id", serviceOnly, async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!/^[0-9a-zA-Z-]{1,64}$/.test(id)) return res.status(404).json({ error: "Test topilmadi" });
      const row = await source.get(id);
      const test = row && normalizeMiniTest(row);
      if (!test) return res.status(404).json({ error: "Test topilmadi" });
      res.json({ test });
    } catch {
      console.error("Mini-test read failed");
      res.status(503).json({ error: "Test vaqtincha olinmadi" });
    }
  });
}
