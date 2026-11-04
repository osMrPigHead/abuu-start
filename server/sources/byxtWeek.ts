/**
 * byxt 周次规则：固定作息表、当前周定位与 week 参数校验，见 docs/api.md 1.2。
 * 与业务归一化分离，便于单测周次边界。
 */
import { RelayError } from "../core/errors.ts";
import type { SectionTime, Week } from "../../shared/api.ts";

/** docs/api.md 1.2 的固定作息表，仅在上游未返回 sectionTimes 时使用。 */
export const FALLBACK_SECTION_TIMES: readonly SectionTime[] = [
  { section: 1, start: "08:00", end: "08:45" },
  { section: 2, start: "08:50", end: "09:35" },
  { section: 3, start: "09:50", end: "10:35" },
  { section: 4, start: "10:40", end: "11:25" },
  { section: 5, start: "11:30", end: "12:15" },
  { section: 6, start: "14:00", end: "14:45" },
  { section: 7, start: "14:50", end: "15:35" },
  { section: 8, start: "15:50", end: "16:35" },
  { section: 9, start: "16:40", end: "17:25" },
  { section: 10, start: "17:30", end: "18:15" },
  { section: 11, start: "19:00", end: "19:45" },
  { section: 12, start: "19:50", end: "20:35" },
  { section: 13, start: "20:40", end: "21:25" },
  { section: 14, start: "21:30", end: "22:15" },
];

export type WeekSource = "weeks" | "classWeek" | "default";

export type WeekResolution = {
  currentWeek: number | null;
  weekSource: WeekSource;
};

export function resolveCurrentWeek(
  weeks: readonly Week[],
  classWeek: number | null,
  now: Date,
): WeekResolution {
  const marked = weeks.find((week) => week.curWeek);
  if (marked) {
    return { currentWeek: marked.serialNumber, weekSource: "weeks" };
  }

  const todayKey = formatLocalDateKey(now);
  const byDate = weeks.find(
    (week) =>
      week.startDate.length > 0 &&
      week.endDate.length > 0 &&
      todayKey >= week.startDate &&
      todayKey <= week.endDate,
  );
  if (byDate) {
    return { currentWeek: byDate.serialNumber, weekSource: "weeks" };
  }

  if (classWeek !== null) {
    return { currentWeek: classWeek, weekSource: "classWeek" };
  }

  return { currentWeek: null, weekSource: "default" };
}

export function parseRequestedWeek(
  raw: string | null,
  weeks: readonly Week[],
): number | null {
  if (raw === null) return null;
  if (!/^\d+$/.test(raw)) {
    throw new RelayError("INVALID_WEEK", "周次必须为正整数");
  }

  const week = Number(raw);
  if (!Number.isSafeInteger(week) || week < 1) {
    throw new RelayError("INVALID_WEEK", "周次必须为正整数");
  }
  if (weeks.length > 0 && week > weeks.length) {
    throw new RelayError("INVALID_WEEK", "周次超出当前学期范围");
  }

  return week;
}

function formatLocalDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
