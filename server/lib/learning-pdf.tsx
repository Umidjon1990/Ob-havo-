import React from "react";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { LearningDocumentItem, LearningDocumentMeta, LearningTestPayload } from "./learning-docx";

const runtimeRequire = createRequire(join(process.cwd(), "package.json"));
const regularFont = runtimeRequire.resolve(
  "@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-arabic-400-normal.woff",
);
const boldFont = runtimeRequire.resolve(
  "@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-arabic-700-normal.woff",
);

Font.register({
  family: "ArabicArchive",
  fonts: [
    { src: regularFont, fontWeight: 400 },
    { src: boldFont, fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback(word => [word]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingRight: 42,
    paddingBottom: 50,
    paddingLeft: 42,
    color: "#172033",
    backgroundColor: "#FFFFFF",
    fontFamily: "ArabicArchive",
  },
  kicker: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: "#1E40AF",
    textAlign: "center",
    letterSpacing: 1.1,
    marginBottom: 5,
  },
  typeArabic: {
    fontSize: 23,
    fontWeight: 700,
    color: "#1E40AF",
    textAlign: "center",
    lineHeight: 1.35,
    marginBottom: 3,
  },
  titleArabic: {
    fontSize: 24,
    fontWeight: 700,
    textAlign: "center",
    lineHeight: 1.4,
    marginBottom: 2,
  },
  titleUz: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: "#263247",
    textAlign: "center",
    marginBottom: 5,
  },
  metadata: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 9,
  },
  rule: {
    height: 1,
    backgroundColor: "#D8E1EE",
    marginBottom: 10,
  },
  sectionArabic: {
    fontSize: 20,
    fontWeight: 700,
    color: "#0F766E",
    textAlign: "right",
    lineHeight: 1.3,
    marginTop: 2,
  },
  sectionUz: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    color: "#0F766E",
    textAlign: "right",
    marginBottom: 5,
  },
  bodyArabic: {
    fontSize: 18,
    fontWeight: 400,
    textAlign: "right",
    lineHeight: 1.38,
    marginBottom: 6,
  },
  question: {
    fontSize: 18,
    fontWeight: 700,
    textAlign: "right",
    lineHeight: 1.32,
    marginTop: 4,
    marginBottom: 1,
  },
  option: {
    fontSize: 18,
    fontWeight: 400,
    textAlign: "right",
    lineHeight: 1.25,
    marginBottom: 0,
    paddingRight: 9,
  },
  speaker: {
    fontSize: 18,
    fontWeight: 700,
    color: "#7C3AED",
    textAlign: "right",
    lineHeight: 1.4,
    marginTop: 5,
  },
  helperArabic: {
    fontSize: 18,
    color: "#64748B",
    textAlign: "right",
    lineHeight: 1.45,
    marginBottom: 8,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 46,
    right: 46,
    fontFamily: "Helvetica",
    fontSize: 8,
    color: "#94A3B8",
    textAlign: "center",
  },
});

const OPTION_MARKS = ["أ", "ب", "ج", "د"];

function levelLabel(level: string): string {
  return level === "A1A2" ? "A1/A2 · Boshlang‘ich" : "B1/B2 · O‘rta daraja";
}

function TestHeader({ meta, suffix }: { meta: LearningDocumentMeta; suffix?: string }) {
  const typeUz = meta.contentType === "listening" ? "TINGLASH TESTI" : "O‘QIB TUSHUNISH TESTI";
  const typeAr = meta.contentType === "listening" ? "اخْتِبَارُ الاسْتِمَاع" : "اخْتِبَارُ القِرَاءَة";
  const metadata = [meta.testDate, levelLabel(meta.level), meta.channelTitle].filter(Boolean).join("   ·   ");

  return (
    <View wrap={false}>
      <Text style={styles.kicker}>{typeUz}</Text>
      <Text style={styles.typeArabic}>{typeAr}</Text>
      <Text style={styles.titleArabic}>{meta.titleAr}</Text>
      <Text style={styles.titleUz}>{suffix ? `${meta.titleUz} · ${suffix}` : meta.titleUz}</Text>
      <Text style={styles.metadata}>{metadata}</Text>
      <View style={styles.rule} />
    </View>
  );
}

function SectionTitle({ arabic, uzbek, purple = false }: { arabic: string; uzbek: string; purple?: boolean }) {
  return (
    <View wrap={false}>
      <Text style={[styles.sectionArabic, purple ? { color: "#7C3AED" } : {}]}>{arabic}</Text>
      <Text style={[styles.sectionUz, purple ? { color: "#7C3AED" } : {}]}>{uzbek}</Text>
    </View>
  );
}

function Questions({ payload }: { payload: LearningTestPayload }) {
  return (
    <View>
      {payload.quizzes.map((quiz, index) => (
        <View key={`${index}-${quiz.question}`} wrap={false}>
          <Text style={styles.question}>{`${index + 1}. ${quiz.question}`}</Text>
          {quiz.options.map((option, optionIndex) => (
            <Text key={`${optionIndex}-${option}`} style={styles.option}>
              {`${OPTION_MARKS[optionIndex] || optionIndex + 1}. ${option}`}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Footer() {
  return (
    <Text
      fixed
      style={styles.footer}
      render={({ pageNumber, totalPages }) => `Arab tili testlari  ·  ${pageNumber} / ${totalPages}`}
    />
  );
}

function testPages(item: LearningDocumentItem, itemIndex: number): React.ReactElement[] {
  const { meta, payload } = item;
  if (payload.contentType !== meta.contentType || payload.quizzes.length !== 3) {
    throw new Error("Learning test payload is incomplete or mismatched");
  }

  if (payload.contentType === "reading") {
    return [
      <Page key={`reading-${itemIndex}`} size="A4" wrap style={styles.page}>
        <TestHeader meta={meta} />
        <SectionTitle arabic={payload.passage.titleAr} uzbek="O‘qish matni" />
        <Text style={styles.bodyArabic}>{payload.passage.fullAr}</Text>
        <View style={styles.rule} />
        <SectionTitle arabic="أَسْئِلَةُ الْفَهْم" uzbek="Savollar" />
        <Questions payload={payload} />
        <Footer />
      </Page>,
    ];
  }

  return [
    <Page key={`listening-questions-${itemIndex}`} size="A4" wrap style={styles.page}>
      <TestHeader meta={meta} />
      <SectionTitle arabic="أَسْئِلَةُ الْفَهْم" uzbek="Audio tinglang va savollarga javob bering" />
      <Questions payload={payload} />
      <Footer />
    </Page>,
    <Page key={`listening-script-${itemIndex}`} size="A4" wrap style={styles.page}>
      <TestHeader meta={meta} suffix="Audio matni" />
      <SectionTitle arabic="نَصُّ التَّسْجِيل" uzbek="Audio matni" purple />
      <Text style={styles.helperArabic}>اقرأ النص بعد إكمال اختبار الاستماع.</Text>
      {payload.passage.dialog.map((line, index) => (
        <View key={`${index}-${line.speaker}`} wrap={false}>
          <Text style={styles.speaker}>
            {line.speaker === "M" ? "الْمُتَحَدِّثُ الْأَوَّلُ" : "الْمُتَحَدِّثَةُ الثَّانِيَةُ"}
          </Text>
          <Text style={styles.bodyArabic}>{line.text}</Text>
        </View>
      ))}
      <Footer />
    </Page>,
  ];
}

export async function createLearningTestsPdf(items: LearningDocumentItem[]): Promise<Buffer> {
  if (items.length === 0) throw new Error("At least one learning test is required");
  const pages = items.flatMap(testPages);
  return renderToBuffer(
    <Document
      author="Zamonaviy ta'lim"
      title={items.length === 1 ? items[0].meta.titleUz : `${items.length} ta arab tili testi`}
      subject="RTL formatdagi arab tili o‘qish va tinglash testlari"
      language="ar"
    >
      {pages}
    </Document>,
  );
}

export async function createLearningTestPdf(
  meta: LearningDocumentMeta,
  payload: LearningTestPayload,
): Promise<Buffer> {
  return createLearningTestsPdf([{ meta, payload }]);
}
