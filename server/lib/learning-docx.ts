import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  PageBreak,
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

const ARABIC_FONT = "Traditional Arabic";
const BODY_SIZE = 36; // docx uses half-points: 36 = 18pt
const TITLE_SIZE = 52;
const SUBTITLE_SIZE = 40;
const OPTION_MARKS = ["أ", "ب", "ج", "د"];

function run(text: string, options: { bold?: boolean; size?: number; color?: string } = {}): TextRun {
  return new TextRun({
    text,
    font: ARABIC_FONT,
    size: options.size || BODY_SIZE,
    bold: options.bold,
    color: options.color,
    rightToLeft: true,
  });
}

function arabicParagraph(text: string, options: { bold?: boolean; size?: number; color?: string; spacingAfter?: number } = {}): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { after: options.spacingAfter ?? 180, line: 320 },
    children: [run(text, options)],
  });
}

function divider(): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 220 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "CBD5E1" } },
    children: [run("ــــــــــــــــــــــــــــــــــــــــ", { color: "94A3B8" })],
  });
}

function levelLabel(level: string): string {
  return level === "A1A2" ? "A1/A2 — Boshlang'ich" : "B1/B2 — O'rta daraja";
}

function quizParagraphs(question: string, options: string[], index: number): Paragraph[] {
  const result: Paragraph[] = [
    arabicParagraph(`${index + 1}. ${question}`, { bold: true, spacingAfter: 100 }),
  ];
  options.forEach((option, optionIndex) => {
    result.push(arabicParagraph(`${OPTION_MARKS[optionIndex] || optionIndex + 1}. ${option}`, {
      spacingAfter: 60,
    }));
  });
  return result;
}

function header(meta: LearningDocumentMeta): Paragraph[] {
  const typeTitle = meta.contentType === "listening"
    ? "🎧 Tinglash testi | اخْتِبَارُ الاسْتِمَاع"
    : "📖 O'qib tushunish | اخْتِبَارُ القِرَاءَة";
  return [
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [run(typeTitle, { bold: true, size: TITLE_SIZE, color: "1D4ED8" })],
    }),
    arabicParagraph(`📅 ${meta.testDate}`, { size: SUBTITLE_SIZE, spacingAfter: 60 }),
    arabicParagraph(`📊 ${levelLabel(meta.level)}`, { size: SUBTITLE_SIZE, spacingAfter: 60 }),
    arabicParagraph(`🏷 ${meta.titleAr} | ${meta.titleUz}`, { bold: true, size: SUBTITLE_SIZE }),
    ...(meta.channelTitle ? [arabicParagraph(`📣 ${meta.channelTitle}`, { size: SUBTITLE_SIZE })] : []),
    divider(),
  ];
}

function documentFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [run("Arab tili o‘quv testi • Zamonaviy ta'lim", { size: 24, color: "64748B" })],
      }),
    ],
  });
}

export async function createLearningTestDocx(meta: LearningDocumentMeta, payload: LearningTestPayload): Promise<Buffer> {
  if (payload.contentType !== meta.contentType || payload.quizzes.length !== 3) {
    throw new Error("Learning test payload is incomplete or mismatched");
  }

  const children: Paragraph[] = [...header(meta)];

  if (payload.contentType === "listening") {
    children.push(
      arabicParagraph("🎵 Audio Telegram xabarida berilgan. Savollarga javob bering.", {
        size: SUBTITLE_SIZE,
        color: "475569",
      }),
      arabicParagraph("اختبار الفهم", { bold: true, size: TITLE_SIZE, color: "0F766E" }),
      divider(),
    );
    payload.quizzes.forEach((quiz, index) => {
      children.push(...quizParagraphs(quiz.question, quiz.options, index));
      if (index < payload.quizzes.length - 1) children.push(divider());
    });

    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.CENTER,
        spacing: { after: 180 },
        children: [run("Audio script | نَصُّ التَّسْجِيل", { bold: true, size: TITLE_SIZE, color: "7C3AED" })],
      }),
      arabicParagraph("اقرأ النص بعد إكمال اختبار الاستماع.", { size: SUBTITLE_SIZE, color: "475569" }),
      divider(),
    );
    payload.passage.dialog.forEach((line, index) => {
      const speaker = line.speaker === "M" ? "المتحدث الأول" : "المتحدثة الثانية";
      children.push(
        arabicParagraph(`${speaker}:`, { bold: true, size: SUBTITLE_SIZE, color: "7C3AED", spacingAfter: 40 }),
        arabicParagraph(line.text, { spacingAfter: index === payload.passage.dialog.length - 1 ? 180 : 120 }),
      );
    });
  } else {
    children.push(
      arabicParagraph(`📄 ${payload.passage.titleAr}`, { bold: true, size: TITLE_SIZE, color: "0F766E" }),
      arabicParagraph(payload.passage.fullAr, { spacingAfter: 260 }),
      divider(),
      arabicParagraph("أسئلة الفهم", { bold: true, size: TITLE_SIZE, color: "0F766E" }),
      divider(),
    );
    payload.quizzes.forEach((quiz, index) => {
      children.push(...quizParagraphs(quiz.question, quiz.options, index));
      if (index < payload.quizzes.length - 1) children.push(divider());
    });
  }

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: ARABIC_FONT, size: BODY_SIZE },
          paragraph: {
            alignment: AlignmentType.RIGHT,
            spacing: { line: 320, after: 180 },
          },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 900, right: 1100, bottom: 900, left: 1100 },
        },
      },
      footers: { default: documentFooter() },
      children,
    }],
  });

  return Packer.toBuffer(document);
}