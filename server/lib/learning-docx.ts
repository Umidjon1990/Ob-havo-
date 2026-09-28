import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  LineRuleType,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { ListeningPassage, ListeningQuiz } from "./listening";
import type { ReadingPassage, ReadingQuiz } from "./reading";

export type LearningTestPayload =
  | {
      contentType: "listening";
      passage: ListeningPassage;
      quizzes: ListeningQuiz[];
    }
  | {
      contentType: "reading";
      passage: ReadingPassage;
      quizzes: ReadingQuiz[];
    };

export interface LearningDocumentMeta {
  contentType: "listening" | "reading";
  titleAr: string;
  titleUz: string;
  testDate: string;
  level: string;
  channelTitle?: string | null;
}

export interface LearningDocumentItem {
  meta: LearningDocumentMeta;
  payload: LearningTestPayload;
}

// compact_reference_guide with an Arabic-test override:
// A4 page, reduced margins, and every Arabic content run at 18 pt.
const ARABIC_FONT = "Noto Naskh Arabic";
const embeddedArabicFont = readFileSync(join(process.cwd(), "server/assets/fonts/NotoNaskhArabic-Regular.ttf"));
const LATIN_FONT = "Arial";
const BODY_SIZE = 36; // half-points: 36 = 18 pt
const TITLE_SIZE = 50;
const SECTION_SIZE = 34;
const META_SIZE = 18;
const BLUE = "176B60";
const TEAL = "176B60";
const INK = "172D35";
const MUTED = "4B626A";
const LINE = "CBDAD6";
const OPTION_MARKS = ["أ", "ب", "ج", "د"];

function arabicRun(
  text: string,
  options: { bold?: boolean; size?: number; color?: string } = {},
): TextRun {
  return new TextRun({
    text,
    font: { ascii: ARABIC_FONT, hAnsi: ARABIC_FONT, cs: ARABIC_FONT },
    size: options.size ?? BODY_SIZE,
    sizeComplexScript: options.size ?? BODY_SIZE,
    bold: options.bold,
    boldComplexScript: options.bold,
    color: options.color ?? INK,
    rightToLeft: true,
    language: { value: "ar-SA", bidirectional: "ar-SA" },
  });
}

function latinRun(
  text: string,
  options: { bold?: boolean; size?: number; color?: string } = {},
): TextRun {
  return new TextRun({
    text,
    font: LATIN_FONT,
    rightToLeft: false,
    size: options.size ?? META_SIZE,
    bold: options.bold,
    color: options.color ?? MUTED,
  });
}

function arabicParagraph(
  text: string,
  options: {
    bold?: boolean;
    size?: number;
    color?: string;
    spacingAfter?: number;
    spacingBefore?: number;
    center?: boolean;
    keepNext?: boolean;
    line?: number;
    style?: string;
  } = {},
): Paragraph {
  return new Paragraph({
    style: options.style,
    bidirectional: true,
    keepLines: true,
    alignment: options.center ? AlignmentType.CENTER : AlignmentType.START,
    keepNext: options.keepNext,
    widowControl: true,
    spacing: {
      before: options.spacingBefore ?? 0,
      after: options.spacingAfter ?? 120,
      line: options.line ?? (options.size === TITLE_SIZE ? 900 : 600),
      lineRule: LineRuleType.EXACT,
    },
    children: [arabicRun(text, options)],
  });
}

function latinParagraph(
  text: string,
  options: { bold?: boolean; color?: string; spacingAfter?: number; center?: boolean } = {},
): Paragraph {
  return new Paragraph({
    bidirectional: false,
    alignment: options.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    keepNext: true,
    spacing: { after: options.spacingAfter ?? 80, line: 260 },
    children: [latinRun(text, options)],
  });
}

function divider(spacingBefore = 80, spacingAfter = 160): Paragraph {
  return new Paragraph({
    keepNext: true,
    spacing: { before: spacingBefore, after: spacingAfter, line: 20, lineRule: LineRuleType.EXACT },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE } },
    children: [new TextRun({ text: "", size: 2, sizeComplexScript: 2 })],
  });
}

function levelLabel(level: string): string {
  return level === "A1A2" ? "A1/A2 · Boshlang‘ich" : "B1/B2 · O‘rta daraja";
}

function typeLabel(contentType: LearningDocumentMeta["contentType"]): string {
  return contentType === "listening" ? "TINGLASH TESTI" : "O‘QIB TUSHUNISH TESTI";
}

function titleBlock(meta: LearningDocumentMeta, part: string): Paragraph[] {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(meta.testDate)
    ? meta.testDate.split("-").reverse().join(".") : meta.testDate;
  return [
    new Paragraph({
      bidirectional: false, alignment: AlignmentType.LEFT, keepNext: true,
      border: { top: { style: BorderStyle.SINGLE, size: 24, color: TEAL, space: 8 } },
      spacing: { before: 0, after: 100 },
      children: [latinRun(`${typeLabel(meta.contentType)}     |     ${meta.level === "A1A2" ? "A1 / A2" : "B1 / B2"}`, { bold: true, color: TEAL })],
    }),
    arabicParagraph(meta.titleAr, { bold: true, size: TITLE_SIZE, style: "Title", keepNext: true, spacingAfter: 40 }),
    latinParagraph(meta.titleUz, { bold: true, color: INK, spacingAfter: 100 }),
    latinParagraph([date, part, meta.channelTitle || "Zamonaviy Ta’lim"].join("   ·   "), { spacingAfter: 80 }),
    divider(0, 140),
  ];
}

function sectionHeading(arabic: string, uzbek: string): Paragraph[] {
  return [
    new Paragraph({
      bidirectional: true, alignment: AlignmentType.START, keepNext: true,
      shading: { fill: "EDF5F2" }, spacing: { before: 40, after: 60, line: 680, lineRule: LineRuleType.EXACT },
      border: { right: { style: BorderStyle.SINGLE, size: 18, color: TEAL, space: 6 } },
      children: [arabicRun(arabic, { bold: true, size: SECTION_SIZE, color: TEAL })],
    }),
    latinParagraph(uzbek, { color: MUTED, spacingAfter: 110 }),
  ];
}

function quizParagraphs(question: string, options: string[], index: number): Paragraph[] {
  const result: Paragraph[] = [
    arabicParagraph(`${index + 1}. ${question}`, {
      bold: true,
      size: 35,
      line: 560,
      spacingBefore: index === 0 ? 0 : 100,
      spacingAfter: 80,
      keepNext: true,
    }),
  ];
  options.forEach((option, optionIndex) => {
    result.push(arabicParagraph(`${OPTION_MARKS[optionIndex] || optionIndex + 1}. ${option}`, {
      size: 33,
      line: 490,
      spacingAfter: 35,
      keepNext: optionIndex < options.length - 1,
    }));
  });
  return result;
}

function buildTest(meta: LearningDocumentMeta, payload: LearningTestPayload): Paragraph[][] {
  if (payload.contentType !== meta.contentType || payload.quizzes.length !== 3) {
    throw new Error("Learning test payload is incomplete or mismatched");
  }
  const questionPage = [
    ...titleBlock(meta, "Savollar"),
    ...sectionHeading("أَسْئِلَةُ الْفَهْمِ", payload.contentType === "reading"
      ? "Matnga asoslanib, har bir savol uchun bitta to‘g‘ri javobni belgilang."
      : "Audioni tinglab, har bir savol uchun bitta to‘g‘ri javobni belgilang."),
    ...payload.quizzes.flatMap((quiz, index) => quizParagraphs(quiz.question, quiz.options, index)),
  ];
  if (payload.contentType === "reading") {
    return [[
      ...titleBlock(meta, "O‘qish matni"),
      ...sectionHeading("نَصُّ الْقِرَاءَةِ", "Matnni o‘qing"),
      ...payload.passage.fullAr.split(/\n\s*\n/).filter(p => p.trim()).map(text =>
        arabicParagraph(text, { spacingAfter: 200, line: 650 })),
    ], questionPage];
  }
  return [questionPage, [
    ...titleBlock(meta, "Audio matni"),
    ...sectionHeading("نَصُّ التَّسْجِيلِ", "Audio matnini testni bajarib bo‘lgach o‘qing."),
    ...payload.passage.dialog.map((line, index) => new Paragraph({
      bidirectional: true, alignment: AlignmentType.START, keepLines: true,
      spacing: { after: 80, line: 580, lineRule: LineRuleType.EXACT },
      shading: index % 2 ? { fill: "F3F7F5" } : undefined,
      children: [
        arabicRun(`${line.speaker === "M" ? "المتحدث" : "المتحدثة"}:  `, { size: 24, bold: true, color: TEAL }),
        arabicRun(line.text, { size: 34 }),
      ],
    })),
  ]];
}

function documentFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80 },
        children: [
          latinRun("ZAMONAVIY TA’LIM  ·  ARAB TILI TESTLARI     ", { size: 16, color: MUTED }),
          new TextRun({
            font: LATIN_FONT,
            size: 18,
            sizeComplexScript: 18,
            rightToLeft: false,
            color: MUTED,
            children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES],
          }),
        ],
      }),
    ],
  });
}

export async function createLearningTestsDocx(items: LearningDocumentItem[]): Promise<Buffer> {
  if (items.length === 0) throw new Error("At least one learning test is required");

  const document = new Document({
    creator: "Zamonaviy ta'lim",
    fonts: [{ name: ARABIC_FONT, data: embeddedArabicFont }],
    title: items.length === 1 ? items[0].meta.titleUz : `${items.length} ta arab tili testi`,
    description: "RTL formatdagi arab tili o‘qish va tinglash testlari",
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: ARABIC_FONT, hAnsi: ARABIC_FONT, cs: ARABIC_FONT },
            size: BODY_SIZE,
            sizeComplexScript: BODY_SIZE,
            rightToLeft: true,
            language: { value: "ar-SA", bidirectional: "ar-SA" },
            color: INK,
          },
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: { line: 300, after: 120 },
          },
        },
      },
    },
    sections: items.flatMap(item => buildTest(item.meta, item.payload)).map(children => ({
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 850, right: 1020, bottom: 1060, left: 1020, footer: 500 },
        },
      },
      footers: { default: documentFooter() },
      children,
    })),
  });

  return Packer.toBuffer(document);
}

export async function createLearningTestDocx(
  meta: LearningDocumentMeta,
  payload: LearningTestPayload,
): Promise<Buffer> {
  return createLearningTestsDocx([{ meta, payload }]);
}
