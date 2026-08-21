export const ALL_WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6];

export type LearningLevel = "A1A2" | "B1B2";
export type WeekdayLevelSchedule = Partial<Record<number, LearningLevel>>;

export interface LearningDeliveryContext {
  level: LearningLevel;
  recentTopics: string[];
}

/**
 * Resolve the level from the channel configuration, not from the calendar.
 * This keeps an admin-selected level stable across scheduled deliveries.
 */
export function getLearningDeliveryContext(
  channel: { currentLevel?: string | null },
  recentTopics: string[],
): LearningDeliveryContext {
  return {
    level: channel.currentLevel === "B1B2" ? "B1B2" : "A1A2",
    recentTopics: [...recentTopics],
  };
}

/**
 * Read a per-weekday schedule. Legacy channels have no schedule yet, so their
 * selected current level is used for each configured weekday.
 */
export function normalizeWeekdayLevelSchedule(
  value: unknown,
  fallbackLevel: LearningLevel = "A1A2",
  fallbackDays: unknown = ALL_WEEK_DAYS,
): WeekdayLevelSchedule {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }

  const schedule: WeekdayLevelSchedule = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [day, level] of Object.entries(raw)) {
      const numericDay = Number(day);
      if (Number.isInteger(numericDay) && numericDay >= 0 && numericDay <= 6 && (level === "A1A2" || level === "B1B2")) {
        schedule[numericDay] = level;
      }
    }
  }

  if (Object.keys(schedule).length > 0) return schedule;
  for (const day of normalizeScheduledDays(fallbackDays)) {
    schedule[day] = fallbackLevel;
  }
  return schedule;
}

export function serializeWeekdayLevelSchedule(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A weekday-level schedule is required");
  }

  const schedule: Record<string, LearningLevel> = {};
  for (const [day, level] of Object.entries(value)) {
    const numericDay = Number(day);
    if (!Number.isInteger(numericDay) || numericDay < 0 || numericDay > 6) {
      throw new Error("Weekday must be between 0 and 6");
    }
    if (level !== "A1A2" && level !== "B1B2") {
      throw new Error("Level must be A1A2 or B1B2");
    }
    schedule[String(numericDay)] = level;
  }

  if (Object.keys(schedule).length === 0) {
    throw new Error("At least one weekday-level pair is required");
  }
  return JSON.stringify(schedule);
}

export function getScheduledLearningDeliveryContext(
  channel: { currentLevel?: string | null; scheduledLevels?: string | null; scheduledDays?: string | null },
  recentTopics: string[],
  now = new Date(),
): LearningDeliveryContext {
  const fallbackLevel: LearningLevel = channel.currentLevel === "B1B2" ? "B1B2" : "A1A2";
  const schedule = normalizeWeekdayLevelSchedule(channel.scheduledLevels, fallbackLevel, channel.scheduledDays || ALL_WEEK_DAYS);
  const weekday = getUzbekistanDate(now).getUTCDay();
  return {
    level: schedule[weekday] || fallbackLevel,
    recentTopics: [...recentTopics],
  };
}

export function getUzbekistanDate(date = new Date()): Date {
  return new Date(date.getTime() + 5 * 60 * 60 * 1000);
}

export function getUzbekistanDateKey(date = new Date()): string {
  const uz = getUzbekistanDate(date);
  return `${uz.getUTCFullYear()}-${String(uz.getUTCMonth() + 1).padStart(2, "0")}-${String(uz.getUTCDate()).padStart(2, "0")}`;
}

export function normalizeScheduledDays(value: unknown): number[] {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const days = candidates
    .map(day => Number(day))
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6);

  return Array.from(new Set(days)).sort((a, b) => a - b);
}

export function serializeScheduledDays(value: unknown): string {
  const days = normalizeScheduledDays(value);
  if (days.length === 0) throw new Error("At least one scheduled weekday is required");
  return days.join(",");
}

export function isValidScheduledTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return Boolean(match);
}

export function isLearningChannelDue(
  channel: { scheduledTime: string | null; scheduledDays: string | null; lastSentAt: Date | null },
  now = new Date(),
): boolean {
  const uzNow = getUzbekistanDate(now);
  const [hour, minute] = (channel.scheduledTime || "00:00").split(":").map(Number);
  const days = normalizeScheduledDays(channel.scheduledDays || ALL_WEEK_DAYS);

  if (!days.includes(uzNow.getUTCDay())) return false;
  if (uzNow.getUTCHours() !== hour || uzNow.getUTCMinutes() !== minute) return false;
  return !channel.lastSentAt || getUzbekistanDateKey(channel.lastSentAt) !== getUzbekistanDateKey(now);
}