import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isLearningChannelDue,
  getLearningDeliveryContext,
} from "./learning-schedule";
import {
  isProfessionalDialog,
  validateListeningQuizzes,
  type DialogLine,
} from "./listening";
import {
  isProfessionalReadingPassage,
  validateReadingQuizzes,
} from "./reading";

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