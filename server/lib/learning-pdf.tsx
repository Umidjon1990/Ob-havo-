import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import type { LearningDocumentItem, LearningDocumentMeta, LearningTestPayload } from "./learning-docx";

const runtimeRequire = createRequire(join(process.cwd(), "package.json"));
const OPTION_MARKS = ["أ", "ب", "ج", "د"];
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

// Embed fonts in the document: exports never depend on a CDN or installed fonts.
let fontCss: string | undefined;
function embeddedFonts(): string {
  return fontCss ??= [
    ["Arabic", "noto-naskh-arabic", "arabic", 400],
    ["Arabic", "noto-naskh-arabic", "arabic", 700],
    ["Latin", "noto-sans", "latin", 400],
    ["Latin", "noto-sans", "latin", 700],
  ].map(([family, name, subset, weight]) => {
    const path = runtimeRequire.resolve(`@fontsource/${name}/files/${name}-${subset}-${weight}-normal.woff2`);
    return `@font-face{font-family:${family};font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(path).toString("base64")}) format('woff2');font-display:block;}`;
  }).join("\n");
}

function header(meta: LearningDocumentMeta, part: string): string {
  const reading = meta.contentType === "reading";
  const level = meta.level === "A1A2" ? "A1 / A2" : "B1 / B2";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(meta.testDate)
    ? meta.testDate.split("-").reverse().join(".") : meta.testDate;
  return `<header>
    <div class="eyebrow"><span>${reading ? "O‘QIB TUSHUNISH" : "TINGLAB TUSHUNISH"}</span><span class="badge">${level}</span></div>
    <h1 dir="rtl" lang="ar">${escapeHtml(meta.titleAr)}</h1>
    <p class="subtitle">${escapeHtml(meta.titleUz)}</p>
    <div class="meta"><span>${escapeHtml(date)}</span><span>${escapeHtml(part)}</span><span>Zamonaviy Ta’lim</span></div>
  </header>`;
}

function section(number: string, uzbek: string, arabic: string): string {
  return `<div class="section-title"><span class="section-number">${number}</span><span>${uzbek}</span><strong dir="rtl" lang="ar">${arabic}</strong></div>`;
}

function questions(payload: LearningTestPayload): string {
  return `<div class="questions" dir="rtl" lang="ar">${payload.quizzes.map((quiz, index) => `
    <article class="question">
      <div class="question-title"><span class="question-number">${index + 1}</span><h3>${escapeHtml(quiz.question)}</h3></div>
      <div class="options">${quiz.options.map((option, i) => `
        <div class="option"><span class="option-mark">${OPTION_MARKS[i] || i + 1}</span><div>${escapeHtml(option)}</div></div>
      `).join("")}</div>
    </article>`).join("")}</div>`;
}

function testSections({ meta, payload }: LearningDocumentItem): string {
  if (payload.contentType !== meta.contentType || payload.quizzes.length !== 3) {
    throw new Error("Learning test payload is incomplete or mismatched");
  }
  const questionPage = `<section class="sheet">
    ${header(meta, "Savollar")}
    ${section(payload.contentType === "reading" ? "02" : "01", "Savollar", "أَسْئِلَةُ الْفَهْمِ")}
    <p class="instruction">${payload.contentType === "reading" ? "Matnga asoslanib" : "Audioni tinglab"}, har bir savol uchun bitta to‘g‘ri javobni belgilang.</p>
    ${questions(payload)}
  </section>`;
  if (payload.contentType === "reading") {
    // Preserve the stored passage exactly, including all its paragraphs.
    const paragraphs = payload.passage.fullAr.split(/\n\s*\n/).filter(p => p.trim());
    return `<section class="sheet">
      ${header(meta, "O‘qish matni")}
      ${section("01", "Matnni o‘qing", "نَصُّ الْقِرَاءَةِ")}
      <div class="passage" dir="rtl" lang="ar">${paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join("")}</div>
    </section>${questionPage}`;
  }
  return `${questionPage}<section class="sheet transcript">
    ${header(meta, "Audio matni")}
    ${section("02", "Audio matni", "نَصُّ التَّسْجِيلِ")}
    <p class="instruction">Audio matnini testni bajarib bo‘lgach o‘qing.</p>
    <div class="dialog" dir="rtl" lang="ar">${payload.passage.dialog.map(line => `
      <div class="dialog-turn">
        <span class="speaker">${line.speaker === "M" ? "المتحدث" : "المتحدثة"}</span>
        <p>${escapeHtml(line.text)}</p>
      </div>`).join("")}</div>
  </section>`;
}

/** Local, escaped HTML; Chromium handles Arabic shaping, bidi and pagination. */
export function learningTestsHtml(items: LearningDocumentItem[]): string {
  if (items.length === 0) throw new Error("At least one learning test is required");
  if (items.length > 30) throw new Error("At most 30 learning tests can be exported");
  const title = items.length === 1 ? items[0].meta.titleUz : `${items.length} ta arab tili testi`;
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:">
  <title>${escapeHtml(title)}</title><style>${embeddedFonts()}
    @page{size:A4;margin:15mm 18mm 19mm}
    *{box-sizing:border-box}
    body{margin:0;color:#172d35;background:white;font-family:Latin,sans-serif;font-size:10pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .sheet+.sheet{break-before:page}
    header{border-top:4pt solid #176b60;padding-top:10pt;padding-bottom:12pt;margin-bottom:15pt;border-bottom:1pt solid #cbdad6;break-inside:avoid}
    .eyebrow{display:flex;align-items:center;justify-content:space-between;color:#176b60;font-weight:700;font-size:9pt;letter-spacing:.6pt}
    .badge{padding:4pt 10pt;background:#edf5f2;border:1pt solid #cadfd8;border-radius:4pt;letter-spacing:0}
    h1{font-family:Arabic,serif;font-size:25pt;line-height:1.65;margin:9pt 0 1pt;text-align:right;font-weight:700}
    .subtitle{font-weight:700;font-size:11pt;line-height:1.6;margin:0 0 8pt}
    .meta{display:flex;justify-content:space-between;gap:10pt;color:#4b626a;font-size:8pt;line-height:1.5;overflow-wrap:anywhere}
    .section-title{display:flex;align-items:center;gap:8pt;background:#edf5f2;border-right:3pt solid #176b60;padding:5pt 9pt;margin:0 0 10pt;font-size:10pt;color:#195d54;font-weight:700;break-after:avoid;break-inside:avoid}
    .section-number{font-size:9pt;color:#537e74}
    .section-title strong{margin-left:auto;font-family:Arabic,serif;font-size:17pt;line-height:1.6}
    .passage{font-family:Arabic,serif;font-size:18pt;line-height:1.85;text-align:right}
    .passage p{margin:0 0 13pt;white-space:pre-line;orphans:3;widows:3}
    .instruction{color:#475c64;font-size:9pt;line-height:1.65;margin:0 0 10pt;break-after:avoid}
    .question{border-bottom:1pt solid #dce5e2;padding:0 0 9pt;margin:0 0 10pt;break-inside:avoid}
    .question-title{display:flex;align-items:baseline;gap:9pt;font-family:Arabic,serif;break-after:avoid}
    .question-number{font-family:Latin,sans-serif;font-size:10pt;font-weight:700;color:#176b60;flex:0 0 19pt;text-align:center;background:#edf5f2;border-radius:3pt;padding:2pt 0}
    h3{font-size:17.5pt;line-height:1.7;margin:0 0 5pt;font-weight:700}
    .options{padding-right:28pt;font-family:Arabic,serif;font-size:16.5pt;line-height:1.55}
    .option{display:flex;align-items:baseline;gap:9pt;margin:1pt 0;break-inside:avoid}
    .option-mark{color:#195d54;font-weight:700;flex:0 0 18pt;text-align:center}
    .dialog{font-family:Arabic,serif;font-size:17pt;line-height:1.65}
    .dialog-turn{display:flex;align-items:baseline;gap:8pt;padding:3pt 7pt;border-right:2pt solid #b5d1c8;break-inside:avoid;margin:0 0 3pt}
    .dialog-turn:nth-child(even){background:#f3f7f5}
    .speaker{flex:0 0 43pt;font-size:11pt;line-height:1.5;color:#176b60;font-weight:700}
    .dialog-turn p{margin:0;flex:1}
  </style></head><body>${items.map(testSections).join("")}</body></html>`;
}

// One renderer at a time avoids several memory-heavy Chromium processes on Railway.
let exportQueue: Promise<unknown> = Promise.resolve();
let queuedExports = 0;
export async function createLearningTestsPdf(items: LearningDocumentItem[]): Promise<Buffer> {
  const html = learningTestsHtml(items);
  if (queuedExports >= 5) throw new Error("PDF export is busy; please retry shortly");
  queuedExports++;
  const job = exportQueue.catch(() => undefined).then(async () => {
    const browser = await puppeteer.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: true,
      timeout: 30_000,
    });
    try {
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on("request", request => {
        if (request.url().startsWith("data:")) void request.continue();
        else void request.abort();
      });
      await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
      const pdf = await page.pdf({
        format: "A4", preferCSSPageSize: true, printBackground: true,
        displayHeaderFooter: true, headerTemplate: "<span></span>",
        footerTemplate: `<div style="width:100%;margin:0 18mm;padding-top:7px;border-top:1px solid #cbdad6;font-family:Arial,sans-serif;font-size:9px;color:#4b626a;display:flex;justify-content:space-between"><span>ZAMONAVIY TA'LIM · ARAB TILI TESTLARI</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
        timeout: 60_000, waitForFonts: true,
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  });
  exportQueue = job;
  try { return await job; } finally { queuedExports--; }
}

export async function createLearningTestPdf(meta: LearningDocumentMeta, payload: LearningTestPayload): Promise<Buffer> {
  return createLearningTestsPdf([{ meta, payload }]);
}
