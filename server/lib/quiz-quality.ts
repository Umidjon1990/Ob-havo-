export type LearningLevel = "A1A2" | "B1B2";

export interface QuizQualityInput {
  question: unknown;
  options: unknown;
  correctIndex: unknown;
  explanation: unknown;
}

export interface QuizQualityRules {
  level: LearningLevel;
  minOptions: number;
  maxOptions: number;
  fixedOptions?: string[];
}

export interface NormalizedQuiz {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const LIMITS = {
  A1A2: { question: 150, option: 58, explanation: 180 },
  B1B2: { question: 210, option: 76, explanation: 190 },
} as const;

export function stripArabicDiacritics(text: string): string {
  return text.replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g, "").trim();
}

export function isPredominantlyArabic(text: string): boolean {
  const visible = text.replace(/[^A-Za-z\u0600-\u06FF]/g, "");
  const arabic = text.match(/[\u0600-\u06FF]/g)?.length || 0;
  return visible.length > 0 && arabic / visible.length >= 0.82;
}

function normalizedOptionKey(option: string): string {
  return option.replace(/[^\u0600-\u06FF]/g, "").toLowerCase();
}

function visibleLength(text: string): number {
  return text.replace(/\s+/g, "").length;
}

function hasBalancedOptions(options: string[], correctIndex: number): boolean {
  const lengths = options.map(visibleLength);
  const correctLength = lengths[correctIndex];
  const longestOther = Math.max(...lengths.filter((_, index) => index !== correctIndex));
  const shortest = Math.min(...lengths);
  const longest = Math.max(...lengths);

  // A correct option that is materially longer is an avoidable test-taking clue.
  if (correctLength > longestOther + 8 && correctLength >= Math.ceil(longestOther * 1.3)) {
    return false;
  }

  // Options must look like parallel choices, not a mix of labels and paragraphs.
  return longest - shortest <= 42 && longest <= Math.max(shortest * 3, shortest + 16);
}

export function getQuizQualityError(
  input: QuizQualityInput,
  rules: QuizQualityRules,
): string | null {
  if (!Array.isArray(input.options)) return "options are not an array";
  if (input.options.length < rules.minOptions || input.options.length > rules.maxOptions) return "wrong option count";
  if (!Number.isInteger(input.correctIndex) || typeof input.correctIndex !== "number" ||
    input.correctIndex < 0 || input.correctIndex >= input.options.length) return "invalid correct index";
  if (typeof input.question !== "string" || typeof input.explanation !== "string" ||
    input.options.some(option => typeof option !== "string")) return "quiz fields are not strings";

  const limits = LIMITS[rules.level];
  const question = stripArabicDiacritics(input.question);
  const options = input.options.map(option => stripArabicDiacritics(option));
  const explanation = stripArabicDiacritics(input.explanation);

  if (question.length < 10 || question.length > limits.question || !isPredominantlyArabic(question))
    return "question violates Arabic length limits";
  if (explanation.length < 16 || explanation.length > limits.explanation || !isPredominantlyArabic(explanation))
    return "explanation violates Arabic length limits";
  if (options.some(option =>
    option.length < 2 || option.length > limits.option || !isPredominantlyArabic(option),
  )) {
    return "an option violates Arabic length limits";
  }

  const optionKeys = options.map(normalizedOptionKey);
  if (new Set(optionKeys).size !== options.length) return "duplicate options";

  if (rules.fixedOptions) {
    if (options.length !== rules.fixedOptions.length ||
      options.some((option, index) => option !== rules.fixedOptions![index])) return "fixed options are not in the required order";
  } else if (!hasBalancedOptions(options, input.correctIndex)) {
    return "options reveal an answer through length imbalance";
  }
  return null;
}

export function validateQuizQuality(
  input: QuizQualityInput,
  rules: QuizQualityRules,
): NormalizedQuiz | null {
  if (getQuizQualityError(input, rules)) return null;
  const question = stripArabicDiacritics(input.question as string);
  const options = (input.options as string[]).map(option => stripArabicDiacritics(option));
  const explanation = stripArabicDiacritics(input.explanation as string);

  return {
    question,
    options,
    correctIndex: input.correctIndex as number,
    explanation,
  };
}

/** Fisher–Yates permutation that always carries the correct answer index with it. */
export function shuffleQuizOptions(
  options: readonly string[],
  correctIndex: number,
  random: () => number = Math.random,
): { options: string[]; correctIndex: number } {
  const indexed = options.map((option, index) => ({ option, correct: index === correctIndex }));
  for (let index = indexed.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [indexed[index], indexed[target]] = [indexed[target], indexed[index]];
  }
  return {
    options: indexed.map(item => item.option),
    correctIndex: indexed.findIndex(item => item.correct),
  };
}