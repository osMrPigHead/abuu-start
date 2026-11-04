/**
 * byxt 周次规则：当前周定位与 week 参数校验，见 docs/api.md 1.2。
 * 固定作息表与日期查找在 shared/schedule.ts；本模块只保留 byxt 特有规则。
 */
import { RelayError } from "../core/errors.ts";
import type { Week, WeekSource } from "../../shared/api.ts";
import { findWeekByDateKey, formatDateKey } from "../../shared/schedule.ts";

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

  const byDate = findWeekByDateKey(weeks, formatDateKey(now));
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
