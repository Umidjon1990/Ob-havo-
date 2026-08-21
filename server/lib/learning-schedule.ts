export const ALL_WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6];

export type LearningLevel = "A1A2" | "B1B2";

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