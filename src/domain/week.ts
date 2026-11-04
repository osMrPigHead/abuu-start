/** 教学周解析、日期范围与周视图纯函数，见 docs/trd.md 7.2。 */
import type { SectionTime, Week } from "@shared/api";
import type { Course, SourceStatus } from "@/types";
import {
  addDays,
  formatDateKey,
  isoDayOfWeek,
  parseDateKey,
  startOfWeekMonday,
} from "@/utils/date";
import { DEFAULT_SECTION_TIMES } from "@/domain/schedule";

export type WeekMeta = {
  weeks: Week[];
  currentWeek: number | null;
};

export type WeekDay = {
  date: Date;
  dayOfWeek: number;
  weekNumber: number;
};

export type WeekEntry = {
  status: SourceStatus;
  courses: Course[];
  sectionTimes: SectionTime[];
  savedAt: string | null;
  error: string | null;
  loading: boolean;
  loaded: boolean;
};

export function createEmptySectionTimes(): SectionTime[] {
  return DEFAULT_SECTION_TIMES.map((item) => ({ ...item }));
}

export function createEmptyWeekEntry(): WeekEntry {
  return {
    status: "idle",
    courses: [],
    sectionTimes: createEmptySectionTimes(),
    savedAt: null,
    error: null,
    loading: false,
    loaded: false,
  };
}

/** 当前教学周：优先 curWeek，其次日期范围，最后使用 classWeek。 */
export function resolveCurrentWeek(
  weeks: readonly Week[],
  fallback: number | null,
  now: Date,
): number | null {
  const marked = weeks.find((week) => week.curWeek);
  if (marked) return marked.serialNumber;

  const todayKey = formatDateKey(now);
  const byDate = weeks.find(
    (week) =>
      week.startDate.length > 0 &&
      week.endDate.length > 0 &&
      todayKey >= week.startDate &&
      todayKey <= week.endDate,
  );
  if (byDate) return byDate.serialNumber;

  if (fallback !== null && Number.isSafeInteger(fallback) && fallback > 0) {
    return fallback;
  }
  return null;
}

/**
 * 指定教学周的周一至周日。
 * weeks 中有该周时用真实起止日期，否则按当前自然周 + 周次差推算。
 */
export function weekDateRange(
  weekNumber: number,
  meta: WeekMeta,
  today: Date,
): { start: Date; end: Date } {
  const week = meta.weeks.find((item) => item.serialNumber === weekNumber);
  if (week) {
    const start =
      week.startDate.length > 0 ? parseDateKey(week.startDate) : null;
    const end = week.endDate.length > 0 ? parseDateKey(week.endDate) : null;

    if (start) {
      return {
        start,
        end: end && end.getTime() >= start.getTime() ? end : addDays(start, 6),
      };
    }
    if (end) {
      return { start: addDays(end, -6), end };
    }
  }

  const current = meta.currentWeek ?? 1;
  const start = addDays(startOfWeekMonday(today), (weekNumber - current) * 7);
  return { start, end: addDays(start, 6) };
}

export function buildWeekDays(
  weekNumber: number,
  meta: WeekMeta,
  today: Date,
): WeekDay[] {
  const range = weekDateRange(weekNumber, meta, today);

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(range.start, index);
    return {
      date,
      dayOfWeek: isoDayOfWeek(date),
      weekNumber,
    };
  });
}

/**
 * 某日期所属教学周。
 * - 有周次表：只在真实周范围内返回周次；
 * - 无周次表：以当前自然周为 meta.currentWeek，按周差推算。
 */
export function weekNumberForDate(
  date: Date,
  meta: WeekMeta,
  today: Date,
): number | null {
  if (meta.weeks.length > 0) {
    const key = formatDateKey(date);
    const found = meta.weeks.find(
      (week) =>
        week.startDate.length > 0 &&
        week.endDate.length > 0 &&
        key >= week.startDate &&
        key <= week.endDate,
    );
    return found?.serialNumber ?? null;
  }

  if (meta.currentWeek === null) return null;

  const todayMonday = startOfWeekMonday(today).getTime();
  const dateMonday = startOfWeekMonday(date).getTime();
  const diffWeeks = Math.round((dateMonday - todayMonday) / (7 * 86_400_000));
  return meta.currentWeek + diffWeeks;
}

/** 周次表与当前周共同决定的可翻页上限。 */
export function resolveMaxWeek(meta: WeekMeta): number {
  const serialNumbers = meta.weeks.map((week) => week.serialNumber);
  return Math.max(
    1,
    meta.currentWeek ?? 1,
    ...(serialNumbers.length > 0 ? serialNumbers : [1]),
  );
}

export type WeekRowState = "loading" | "ready" | "unavailable";

/** 日程行状态：已加载优先，失败/凭据问题视为不可用。 */
export function weekRowState(
  view: Pick<WeekEntry, "loaded" | "status">,
): WeekRowState {
  if (view.loaded) return "ready";
  if (
    view.status === "error" ||
    view.status === "no-credential" ||
    view.status === "auth-expired"
  ) {
    return "unavailable";
  }
  return "loading";
}
