/** 课表缓存读写与归一化，见 docs/trd.md 5 / 7.2。 */
import type { SectionTime, Week, WeekSource } from "@shared/api";
import type { Course, ScheduleCache, WeekCache } from "@/types";
import {
  asString,
  isRecord,
  nullableText,
  toPositiveInteger,
} from "@/utils/guards";
import { normalizeTime } from "@/utils/schedule";
import { readJson, STORAGE_KEYS, writeJson } from "@/utils/storage";
import { normalizeTerm } from "@/utils/term";
import { createEmptySectionTimes } from "@/utils/week";

export function readScheduleCache(): ScheduleCache | null {
  const raw = readJson<unknown>(STORAGE_KEYS.scheduleCache);
  if (!isRecord(raw)) return null;

  const term = normalizeTerm(raw.term);
  const weeks = Array.isArray(raw.weeks)
    ? raw.weeks.map(normalizeWeek).filter((week): week is Week => week !== null)
    : [];
  const currentWeek = toPositiveInteger(raw.currentWeek);
  const weekSource = normalizeWeekSource(raw.weekSource);
  const lastWeek = toPositiveInteger(raw.lastWeek);
  const byWeek: Record<number, WeekCache> = {};
  const rawByWeek = isRecord(raw.byWeek) ? raw.byWeek : {};

  for (const [key, value] of Object.entries(rawByWeek)) {
    const week = Number(key);
    if (!Number.isSafeInteger(week) || week < 1 || !isRecord(value)) continue;

    byWeek[week] = {
      savedAt: typeof value.savedAt === "string" ? value.savedAt : "",
      sectionTimes: normalizeSectionTimes(value.sectionTimes),
      courses: normalizeCourses(value.courses),
    };
  }

  return {
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : "",
    term,
    weeks,
    currentWeek,
    weekSource,
    lastWeek,
    byWeek,
  };
}

export function persistScheduleCache(cache: ScheduleCache): void {
  writeJson(STORAGE_KEYS.scheduleCache, cache);
}

function normalizeWeek(value: unknown): Week | null {
  if (!isRecord(value)) return null;

  const serialNumber = toPositiveInteger(value.serialNumber);
  if (serialNumber === null) return null;

  return {
    serialNumber,
    name: asString(value.name) || `第${serialNumber}周`,
    startDate: normalizeDateKey(value.startDate),
    endDate: normalizeDateKey(value.endDate),
    curWeek: value.curWeek === true,
  };
}

function normalizeSectionTimes(value: unknown): SectionTime[] {
  if (!Array.isArray(value)) return createEmptySectionTimes();

  const result: SectionTime[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const section = toPositiveInteger(item.section);
    const start = normalizeTime(asString(item.start));
    const end = normalizeTime(asString(item.end));
    if (section === null || !start || !end) continue;
    result.push({ section, start, end });
  }

  return result.length > 0
    ? result.sort((left, right) => left.section - right.section)
    : createEmptySectionTimes();
}

function normalizeCourses(value: unknown): Course[] {
  if (!Array.isArray(value)) return [];

  const courses: Course[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const courseName = asString(item.courseName).trim();
    if (courseName.length === 0) continue;

    courses.push({
      courseCode: asString(item.courseCode),
      courseName,
      beginSection: toPositiveInteger(item.beginSection),
      endSection: toPositiveInteger(item.endSection),
      beginTime: normalizeTime(asString(item.beginTime)),
      endTime: normalizeTime(asString(item.endTime)),
      placeName: nullableText(item.placeName),
      weeksAndTeachers: nullableText(item.weeksAndTeachers),
      dayOfWeek: normalizeDayOfWeek(item.dayOfWeek),
    });
  }

  return courses;
}

function normalizeDateKey(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
}

function normalizeDayOfWeek(value: unknown): number | null {
  const day = toPositiveInteger(value);
  if (day === null || day > 7) return null;
  return day;
}

function normalizeWeekSource(value: unknown): WeekSource {
  return value === "weeks" || value === "classWeek" || value === "default"
    ? value
    : "default";
}
