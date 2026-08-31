import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isLearningChannelDue,
  getLearningDeliveryContext,
  getScheduledLearningDeliveryContext,
  serializeWeekdayLevelSchedule,
} from "./learning-schedule";
import {
  isProfessionalDialog,
  parseListeningQuizResponse,
  validateListeningQuizzes,
  type DialogLine,
} from "./listening";
import {
  isProfessionalReadingPassage,
  shuffleReadingOptions,
  validateReadingQuizzes,
} from "./reading";
import { shuffleQuizOptions } from "./quiz-quality";
import { createLearningTestDocx } from "./learning-docx";

const arabicWords = (count: number): string =>
  Array.from({ length: count }, (_, index) => `كلمة${index + 1}`).join(" ");

function makeDialog(level: "A1A2" | "B1B2"): DialogLine[] {
  const wordsPerLine = level === "A1A2" ? 9 : 15;
  return Array.from({ length: 12 }, (_, index) => ({
    speaker: index % 2 === 0 ? "M" : "F",
    text: arabicWords(wordsPerLine),
  })) as DialogLine[];
}

function makeReadingPassage(level: "A1A2" | "B1B2") {
  const wordsPerParagraph = level === "A1A2" ? 35 : 65;
  return {
    titleAr: "عنوان النص",
    titleUz: "Matn sarlavhasi",
    topicAr: "موضوع النص",
    topicUz: "Matn mavzusi",
    paragraphsAr: [
      arabicWords(wordsPerParagraph),
      arabicWords(wordsPerParagraph),
      arabicWords(wordsPerParagraph),
    ],
    paragraphsUz: ["Birinchi paragraf", "Ikkinchi paragraf", "Uchinchi paragraf"],
  };
}

function makeListeningQuizzes() {
  return Array.from({ length: 3 }, (_, index) => ({
    question: `السؤال العربي ${index + 1}`,
    options: ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"],
    correctIndex: 0,
    explanation: "هذا شرح عربي واضح للإجابة الصحيحة.",
  }));
}

function makeReadingQuizzes() {
  return [
    {
      type: "multiple_choice",
      question: "ما الفكرة الرئيسية؟",
      options: ["الفكرة الأولى", "الفكرة الثانية", "الفكرة الثالثة", "الفكرة الرابعة"],
      correctIndex: 0,
      explanation: "هذا شرح عربي واضح للإجابة.",
    },
    {
      type: "true_false_ng",
      question: "هل وردت هذه المعلومة؟",
      options: ["صواب", "غلط", "غير معطى"],
      correctIndex: 0,
      explanation: "هذا شرح عربي واضح للإجابة.",
    },
    {
      type: "best_title",
      question: "أي عنوان يناسب النص؟",
      options: ["العنوان الأول", "العنوان الثاني", "العنوان الثالث"],
      correctIndex: 0,
      explanation: "هذا شرح عربي واضح للإجابة.",
    },
  ];
}

test("scheduler uses the Tashkent weekday and calendar date", () => {
  const channel = { scheduledTime: "09:30", scheduledDays: "4", lastSentAt: null };
  const thursdayAtSchedule = new Date("2026-08-20T04:30:00.000Z");

  assert.equal(isLearningChannelDue(channel, thursdayAtSchedule), true);
  assert.equal(
    isLearningChannelDue(channel, new Date("2026-08-20T04:29:00.000Z")),
    false,
  );
  assert.equal(
    isLearningChannelDue(channel, new Date("2026-08-19T04:30:00.000Z")),
    false,
  );
  assert.equal(
    isLearningChannelDue(
      { ...channel, lastSentAt: new Date("2026-08-20T03:00:00.000Z") },
      thursdayAtSchedule,
    ),
    false,
  );
});

test("delivery context preserves the configured level and recent topics", () => {
  const channel = { currentLevel: "B1B2" };
  const recentTopics = ["موضوع سابق", "موضوع أقدم"];
  const context = getLearningDeliveryContext(channel, recentTopics);

  assert.equal(context.level, "B1B2");
  assert.deepEqual(context.recentTopics, recentTopics);
  assert.equal(channel.currentLevel, "B1B2");
  context.recentTopics.push("لا تعدل المصدر");
  assert.deepEqual(recentTopics, ["موضوع سابق", "موضوع أقدم"]);
  assert.equal(getLearningDeliveryContext({ currentLevel: "invalid" }, []).level, "A1A2");
});

test("scheduled delivery selects the configured level for the Tashkent weekday", () => {
  const channel = {
    currentLevel: "A1A2",
    scheduledDays: "1,4",
    scheduledLevels: JSON.stringify({ 1: "A1A2", 4: "B1B2" }),
  };

  const monday = new Date("2026-08-17T04:00:00.000Z");
  const thursday = new Date("2026-08-20T04:00:00.000Z");
  assert.equal(getScheduledLearningDeliveryContext(channel, [], monday).level, "A1A2");
  assert.equal(getScheduledLearningDeliveryContext(channel, [], thursday).level, "B1B2");
  assert.equal(isLearningChannelDue({ ...channel, scheduledTime: "09:00", lastSentAt: null }, thursday), true);
});

test("legacy schedules and invalid weekday-level schedules are handled safely", () => {
  const legacyChannel = { currentLevel: "B1B2", scheduledDays: "1,4", scheduledLevels: null };
  assert.equal(
    getScheduledLearningDeliveryContext(legacyChannel, [], new Date("2026-08-20T04:00:00.000Z")).level,
    "B1B2",
  );
  assert.throws(() => serializeWeekdayLevelSchedule({}), /At least one weekday-level pair/);
  assert.throws(() => serializeWeekdayLevelSchedule({ 7: "A1A2" }), /Weekday must be between 0 and 6/);
  assert.throws(() => serializeWeekdayLevelSchedule({ 1: "C1" }), /Level must be A1A2 or B1B2/);
});

for (const level of ["A1A2", "B1B2"] as const) {
  test(`${level} listening validator rejects malformed dialogs and word counts`, () => {
    const valid = makeDialog(level);
    assert.equal(isProfessionalDialog(valid, level), true);
    assert.equal(isProfessionalDialog(valid.slice(0, 11), level), false);
    assert.equal(
      isProfessionalDialog(
        valid.map(line => ({ ...line, text: "كلمة" })),
        level,
      ),
      false,
    );
    assert.equal(
      isProfessionalDialog(
        valid.map(line => ({ ...line, speaker: "X" })),
        level,
      ),
      false,
    );
  });

  test(`${level} reading validator rejects malformed word counts`, () => {
    const valid = makeReadingPassage(level);
    assert.equal(isProfessionalReadingPassage(valid, level), true);
    assert.equal(
      isProfessionalReadingPassage(
        { ...valid, paragraphsAr: valid.paragraphsAr.map(() => arabicWords(10)) },
        level,
      ),
      false,
    );
    assert.equal(
      isProfessionalReadingPassage(
        { ...valid, paragraphsAr: [valid.paragraphsAr[0], valid.paragraphsAr[1]] },
        level,
      ),
      false,
    );
  });
}

test("A1A2 listening validator tolerates a natural four-word line", () => {
  const dialog = makeDialog("A1A2");
  dialog[0] = { ...dialog[0], text: arabicWords(4) };
  assert.equal(isProfessionalDialog(dialog, "A1A2"), true);

  dialog[0] = { ...dialog[0], text: arabicWords(3) };
  assert.equal(isProfessionalDialog(dialog, "A1A2"), false);
});

test("listening validator rejects fewer than three quizzes", () => {
  assert.notEqual(validateListeningQuizzes(makeListeningQuizzes()), null);
  assert.equal(validateListeningQuizzes(makeListeningQuizzes().slice(0, 2)), null);
  assert.equal(
    validateListeningQuizzes(makeListeningQuizzes().map(quiz => ({
      ...quiz,
      options: quiz.options.slice(0, 3),
    }))),
    null,
  );
});

test("listening quiz parser accepts JSON mode objects and prior array responses", () => {
  const quizzes = makeListeningQuizzes();
  assert.deepEqual(parseListeningQuizResponse(JSON.stringify({ quizzes })), quizzes);
  assert.deepEqual(parseListeningQuizResponse(`\`\`\`json\n${JSON.stringify(quizzes)}\n\`\`\``), quizzes);
  assert.throws(() => parseListeningQuizResponse('{"quizzes": [invalid]}'), SyntaxError);
});

test("reading validator rejects fewer than three or incorrectly ordered quizzes", () => {
  assert.notEqual(validateReadingQuizzes(makeReadingQuizzes()), null);
  assert.equal(validateReadingQuizzes(makeReadingQuizzes().slice(0, 2)), null);
  assert.equal(
    validateReadingQuizzes([
      ...makeReadingQuizzes().slice(0, 2),
      { ...makeReadingQuizzes()[2], type: "true_false_ng" },
    ]),
    null,
  );
});

for (const level of ["A1A2", "B1B2"] as const) {
  test(`${level} quiz validators reject answer-length clues, overlong choices, and duplicates`, () => {
    const listeningWithLongCorrect = makeListeningQuizzes().map(quiz => ({ ...quiz }));
    listeningWithLongCorrect[0] = {
      ...listeningWithLongCorrect[0],
      options: [
        "خيار قصير",
        "بديل قريب",
        "جواب موجز",
        "هذه الإجابة الصحيحة تشرح تفاصيل كثيرة بشكل واضح ومباشر",
      ],
      correctIndex: 3,
    };
    assert.equal(validateListeningQuizzes(listeningWithLongCorrect, level), null);

    const readingWithLongOption = makeReadingQuizzes().map(quiz => ({ ...quiz }));
    readingWithLongOption[0] = {
      ...readingWithLongOption[0],
      options: [
        "خيار أول",
        "خيار ثان",
        "خيار ثالث",
        Array.from({ length: 22 }, () => "كلمة").join(" "),
      ],
      correctIndex: 0,
    };
    assert.equal(validateReadingQuizzes(readingWithLongOption, level), null);

    const listeningWithDuplicate = makeListeningQuizzes().map(quiz => ({ ...quiz }));
    listeningWithDuplicate[1] = {
      ...listeningWithDuplicate[1],
      options: ["الخيار الأول", "الخيار الأول", "الخيار الثالث", "الخيار الرابع"],
    };
    assert.equal(validateListeningQuizzes(listeningWithDuplicate, level), null);
  });
}

test("Fisher–Yates shuffle keeps the correct answer attached in listening and reading flows", () => {
  const original = ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"];
  const shuffledListening = shuffleQuizOptions(original, 2, () => 0);
  assert.notDeepEqual(shuffledListening.options, original);
  assert.equal(shuffledListening.options[shuffledListening.correctIndex], original[2]);

  const readingQuiz = {
    type: "multiple_choice" as const,
    question: "ما الفكرة الرئيسية؟",
    options: original,
    correctIndex: 1,
    explanation: "هذا شرح عربي واضح للإجابة.",
  };
  for (let attempt = 0; attempt < 8; attempt++) {
    const shuffledReading = shuffleReadingOptions(readingQuiz);
    assert.equal(shuffledReading.options[shuffledReading.correctIndex], original[1]);
  }
});

test("learning DOCX generator creates a document and rejects incomplete archives", async () => {
  const basePassage = makeReadingPassage("A1A2");
  const passage = {
    ...basePassage,
    fullAr: basePassage.paragraphsAr.join("\n\n"),
    fullUz: basePassage.paragraphsUz.join("\n\n"),
  };
  const meta = {
    contentType: "reading" as const,
    titleAr: passage.titleAr,
    titleUz: passage.titleUz,
    testDate: "2026-08-28",
    level: "A1A2",
    channelTitle: "Arab tili",
  };

  const document = await createLearningTestDocx(meta, {
    contentType: "reading",
    passage,
    quizzes: makeReadingQuizzes(),
  });
  assert.equal(document.subarray(0, 2).toString(), "PK");
  assert.ok(document.length > 1000);

  await assert.rejects(
    () => createLearningTestDocx(meta, {
      contentType: "reading",
      passage,
      quizzes: makeReadingQuizzes().slice(0, 2),
    }),
    /incomplete/,
  );
});
