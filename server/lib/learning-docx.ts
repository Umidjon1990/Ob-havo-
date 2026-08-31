import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  PageBreak,
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
const ARABIC_FONT = "Traditional Arabic";
const LATIN_FONT = "Arial";
const BODY_SIZE = 36; // half-points: 36 = 18 pt
const TITLE_SIZE = 50;
const SECTION_SIZE = 42;
const META_SIZE = 22;
const BLUE = "1E40AF";
const TEAL = "0F766E";
const INK = "172033";
const MUTED = "64748B";
const LINE = "D8E1EE";
const OPTION_MARKS = ["أ", "ب", "ج", "د"];

function arabicRun(
  text: string,
  options: { bold?: boolean; size?: number; color?: string } = {},
): TextRun {
  return new TextRun({
    text,
    font: ARABIC_FONT,
    size: options.size ?? BODY_SIZE,
    bold: options.bold,
    color: options.color ?? INK,
    rightToLeft: true,
  });
}

function latinRun(
  text: string,
  options: { bold?: boolean; size?: number; color?: string } = {},
): TextRun {
  return new TextRun({
    text,
    font: LATIN_FONT,
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
  } = {},
): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: options.center ? AlignmentType.CENTER : AlignmentType.RIGHT,
    keepNext: options.keepNext,
    widowControl: true,
    spacing: {
      before: options.spacingBefore ?? 0,
      after: options.spacingAfter ?? 120,
      line: 300,
    },
    children: [arabicRun(text, options)],
  });
}

function latinParagraph(
  text: string,
  options: { bold?: boolean; color?: string; spacingAfter?: number; center?: boolean } = {},
): Paragraph {
  return new Paragraph({
    alignment: options.center ? AlignmentType.CENTER : AlignmentType.RIGHT,
    spacing: { after: options.spacingAfter ?? 80, line: 260 },
    children: [latinRun(text, options)],
  });
}

function divider(spacingBefore = 80, spacingAfter = 160): Paragraph {
  return new Paragraph({
    spacing: { before: spacingBefore, after: spacingAfter },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE } },
    children: [new TextRun("")],
  });
}

function levelLabel(level: string): string {
  return level === "A1A2" ? "A1/A2 · Boshlang‘ich" : "B1/B2 · O‘rta daraja";
}

function typeLabel(contentType: LearningDocumentMeta["contentType"]): string {
  return contentType === "listening" ? "TINGLASH TESTI" : "O‘QIB TUSHUNISH TESTI";
}

function titleBlock(meta: LearningDocumentMeta): Paragraph[] {
  const arabicType = meta.contentType === "listening"
    ? "اخْتِبَارُ الاسْتِمَاع"
    : "اخْتِبَارُ القِرَاءَة";
  const metadata = [meta.testDate, levelLabel(meta.level), meta.channelTitle].filter(Boolean).join("   ·   ");

  return [
    latinParagraph(typeLabel(meta.contentType), { bold: true, color: BLUE, center: true, spacingAfter: 20 }),
    arabicParagraph(arabicType, { bold: true, size: TITLE_SIZE, color: BLUE, center: true, spacingAfter: 30 }),
    arabicParagraph(meta.titleAr, { bold: true, size: TITLE_SIZE, center: true, spacingAfter: 20 }),
    latinParagraph(meta.titleUz, { bold: true, color: INK, center: true, spacingAfter: 70 }),
    latinParagraph(metadata, { color: MUTED, center: true, spacingAfter: 80 }),
    divider(10, 180),
  ];
}

function sectionHeading(arabic: string, uzbek: string, color = TEAL): Paragraph[] {
  return [
    arabicParagraph(arabic, {
      bold: true,
      size: SECTION_SIZE,
      color,
      spacingBefore: 80,
      spacingAfter: 20,
      keepNext: true,
    }),
    latinParagraph(uzbek, { bold: true, color, spacingAfter: 100 }),
  ];
}

function quizParagraphs(question: string, options: string[], index: number): Paragraph[] {
  const result: Paragraph[] = [
    arabicParagraph(`${index + 1}. ${question}`, {
      bold: true,
      spacingBefore: index === 0 ? 0 : 100,
      spacingAfter: 80,
      keepNext: true,
    }),
  ];
  options.forEach((option, optionIndex) => {
    result.push(arabicParagraph(`${OPTION_MARKS[optionIndex] || optionIndex + 1}. ${option}`, {
      spacingAfter: 45,
    }));
  });
  return result;
}

function buildTest(meta: LearningDocumentMeta, payload: LearningTestPayload): Paragraph[] {
  if (payload.contentType !== meta.contentType || payload.quizzes.length !== 3) {
    throw new Error("Learning test payload is incomplete or mismatched");
  }

  const children: Paragraph[] = [...titleBlock(meta)];

  if (payload.contentType === "listening") {
    children.push(...sectionHeading("أَسْئِلَةُ الْفَهْم", "Audio tinglang va savollarga javob bering"));
    payload.quizzes.forEach((quiz, index) => children.push(...quizParagraphs(quiz.question, quiz.options, index)));
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      ...titleBlock({ ...meta, titleUz: `${meta.titleUz} · Audio matni` }),
      ...sectionHeading("نَصُّ التَّسْجِيل", "Audio matni", "7C3AED"),
      arabicParagraph("اقرأ النص بعد إكمال اختبار الاستماع.", { color: MUTED, spacingAfter: 140 }),
    );
    payload.passage.dialog.forEach((line, index) => {
      const speaker = line.speaker === "M" ? "الْمُتَحَدِّثُ الْأَوَّلُ" : "الْمُتَحَدِّثَةُ الثَّانِيَةُ";
      children.push(
        arabicParagraph(speaker, {
          bold: true,
          color: "7C3AED",
          spacingBefore: index === 0 ? 0 : 60,
          spacingAfter: 20,
          keepNext: true,
        }),
        arabicParagraph(line.text, { spacingAfter: 90 }),
      );
    });
  } else {
    children.push(
      ...sectionHeading(payload.passage.titleAr, "O‘qish matni"),
      arabicParagraph(payload.passage.fullAr, { spacingAfter: 180 }),
      divider(20, 140),
      ...sectionHeading("أَسْئِلَةُ الْفَهْم", "Savollar"),
    );
    payload.quizzes.forEach((quiz, index) => children.push(...quizParagraphs(quiz.question, quiz.options, index)));
  }

  return children;
}

function documentFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80 },
        children: [
          latinRun("Arab tili testlari  ·  ", { size: 18, color: MUTED }),
          new TextRun({
            font: LATIN_FONT,
            size: 18,
            color: MUTED,
            children: ["Sahifa ", PageNumber.CURRENT],
          }),
        ],
      }),
    ],
  });
}

export async function createLearningTestsDocx(items: LearningDocumentItem[]): Promise<Buffer> {
  if (items.length === 0) throw new Error("At least one learning test is required");

  const children: Paragraph[] = [];
  items.forEach((item, index) => {
    if (index > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(...buildTest(item.meta, item.payload));
  });

  const document = new Document({
    creator: "Zamonaviy ta'lim",
    title: items.length === 1 ? items[0].meta.titleUz : `${items.length} ta arab tili testi`,
    description: "RTL formatdagi arab tili o‘qish va tinglash testlari",
    styles: {
      default: {
        document: {
          run: { font: ARABIC_FONT, size: BODY_SIZE, color: INK },
          paragraph: {
            alignment: AlignmentType.RIGHT,
            spacing: { line: 300, after: 120 },
          },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 900, right: 1000, bottom: 900, left: 1000, footer: 520 },
        },
      },
      footers: { default: documentFooter() },
      children,
    }],
  });

  return Packer.toBuffer(document);
}

export async function createLearningTestDocx(
  meta: LearningDocumentMeta,
  payload: LearningTestPayload,
): Promise<Buffer> {
  return createLearningTestsDocx([{ meta, payload }]);
}
