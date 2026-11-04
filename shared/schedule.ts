/**
 * 前端与本地中继共用的课表基础规则：固定作息、时间/日期归一化与周次查找。
 * 字段口径见 docs/api.md 1.2；只包含无副作用纯函数。
 */
import type { SectionTime, Week } from "./api.ts";
import { toPositiveInteger } from "./guards.ts";

/** docs/api.md 1.2 的固定作息表，仅在上游未返回 sectionTimes 时使用。 */
export const SECTION_TIMES: readonly SectionTime[] = [
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

/** Date -> 本地日期键，不经过 UTC，避免时区偏移。 */
export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** "8:00:00" / "08:00" -> "08:00"；无法解析返回 null。 */
export function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

/** 只保留日期键 "YYYY-MM-DD" 前缀；非法值返回空串。 */
export function normalizeDateKey(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
}

/** 教学日 1-7；其余返回 null。 */
export function normalizeDayOfWeek(value: unknown): number | null {
  const day = toPositiveInteger(value);
  if (day === null || day > 7) return null;
  return day;
}

/**
 * 解析上游 sectionTimes；无有效项时返回固定作息表的副本。
 * 每次返回新数组，避免调用方共享 SECTION_TIMES 的可变引用。
 */
export function parseSectionTimes(value: unknown): SectionTime[] {
  const result: SectionTime[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== "object" || item === null || Array.isArray(item))
        continue;

      const record = item as Record<string, unknown>;
      const section = toPositiveInteger(record.section);
      const start = normalizeTime(record.start);
      const end = normalizeTime(record.end);
      if (section === null || !start || !end) continue;
      result.push({ section, start, end });
    }
  }

  if (result.length === 0) {
    return SECTION_TIMES.map((item) => ({ ...item }));
  }

  return result.sort((left, right) => left.section - right.section);
}

/** 返回日期落在起止范围内的教学周；无匹配返回 null。 */
export function findWeekByDateKey(
  weeks: readonly Week[],
  dateKey: string,
): Week | null {
  return (
    weeks.find(
      (week) =>
        week.startDate.length > 0 &&
        week.endDate.length > 0 &&
        dateKey >= week.startDate &&
        dateKey <= week.endDate,
    ) ?? null
  );
}
