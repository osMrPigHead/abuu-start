/** 课表缓存优先加载、周切换与今日/明日派生，见 docs/trd.md 7.2。 */
import { reactive } from "vue";
import { fetchByxtSchedule } from "@/api/byxt";
import { ApiError } from "@/api/client";
import { isAuthBlocked, markSourceExpired } from "@/composables/useAuth";
import type { SectionTime, Term, Week, WeekSource } from "@shared/api";
import type { ScheduleCache, SourceStatus, WeekCache } from "@/types";
import { mapApiError } from "@/utils/apiError";
import { readScheduleCache, persistScheduleCache } from "@/utils/scheduleCache";
import { sortCourses } from "@/utils/schedule";
import { remove, STORAGE_KEYS } from "@/utils/storage";
import {
  createEmptySectionTimes,
  createEmptyWeekEntry,
  resolveCurrentWeek,
  type WeekEntry,
} from "@/utils/week";

const DEFAULT_WARNING = "无法确定当前教学周，默认第 1 周";

export type { WeekEntry } from "@/utils/week";

type WeekMeta = {
  term: Term | null;
  weeks: Week[];
  currentWeek: number | null;
  weekSource: WeekSource;
  warning: string | null;
};

type BootState = {
  status: SourceStatus;
  error: string | null;
  loading: boolean;
  hydrated: boolean;
};

const EMPTY_SECTION_TIMES: SectionTime[] = createEmptySectionTimes();

const meta = reactive<WeekMeta>({
  term: null,
  weeks: [],
  currentWeek: null,
  weekSource: "default",
  warning: null,
});

const entries = reactive<Record<number, WeekEntry>>({});
const boot = reactive<BootState>({
  status: "idle",
  error: null,
  loading: false,
  hydrated: false,
});

const weekRequestIds = new Map<number, number>();
let currentRequestId = 0;
let lastFetchedWeek: number | null = null;

export function useSchedule() {
  hydrate();

  return {
    meta,
    entries,
    boot,
    hydrate,
    refreshCurrent,
    loadWeek,
    weekView,
    clearScheduleData,
  };
}

function hydrate(): void {
  if (boot.hydrated) return;
  boot.hydrated = true;

  const cache = readScheduleCache();
  if (!cache) return;

  meta.term = cache.term;
  meta.weeks = cache.weeks;
  meta.currentWeek = cache.currentWeek;
  meta.weekSource = cache.weekSource;
  meta.warning = cache.weekSource === "default" ? DEFAULT_WARNING : null;
  lastFetchedWeek = cache.lastWeek;

  // 课程缓存可能是跨学期旧数据；先用周次表日期重新定位当前周。
  if (cache.weeks.length > 0) {
    const resolved = resolveCurrentWeek(cache.weeks, null, new Date());
    if (resolved !== null) {
      meta.currentWeek = resolved;
      meta.weekSource = "weeks";
      meta.warning = null;
    }
  }

  const blocked = isAuthBlocked();
  for (const [key, cachedWeek] of Object.entries(cache.byWeek)) {
    const week = Number(key);
    if (!Number.isSafeInteger(week) || week < 1) continue;

    entries[week] = {
      status: blocked ? "no-credential" : "cached",
      courses: cachedWeek.courses,
      sectionTimes:
        cachedWeek.sectionTimes.length > 0
          ? cachedWeek.sectionTimes
          : EMPTY_SECTION_TIMES,
      savedAt: cachedWeek.savedAt || null,
      error: null,
      loading: false,
      loaded: true,
    };
  }
}

async function refreshCurrent(): Promise<void> {
  hydrate();

  if (isAuthBlocked()) {
    boot.status = "no-credential";
    boot.error = null;
    boot.loading = false;

    const week = meta.currentWeek;
    if (week !== null) {
      const entry = entries[week];
      if (entry) {
        entry.status = "no-credential";
        entry.error = null;
        entry.loading = false;
      }
    }
    return;
  }

  const previousWeek = meta.currentWeek;
  boot.status = "loading";
  boot.error = null;
  boot.loading = true;
  if (previousWeek !== null) {
    const previous = entries[previousWeek];
    if (previous) {
      previous.loading = true;
      previous.error = null;
      if (!previous.loaded) {
        previous.status = "loading";
      } else if (
        previous.status === "no-credential" ||
        previous.status === "auth-expired"
      ) {
        previous.status = "cached";
      }
    }
  }

  const requestId = ++currentRequestId;
  try {
    const response = await fetchByxtSchedule();
    if (requestId !== currentRequestId) return;

    const actualWeek = applyResponse(response);
    boot.status = "ok";
    boot.error = null;
    boot.loading = false;

    if (previousWeek !== null && previousWeek !== actualWeek) {
      const previous = entries[previousWeek];
      if (previous) previous.loading = false;
    }
  } catch (error) {
    if (requestId !== currentRequestId) return;

    const mapped = mapScheduleError(error);
    if (mapped.status === "auth-expired") markSourceExpired("byxt");

    boot.status = mapped.status;
    boot.error = mapped.status === "error" ? mapped.message : null;
    boot.loading = false;

    const week = meta.currentWeek ?? previousWeek;
    const entry = week === null ? null : entries[week];
    if (entry) {
      entry.loading = false;
      entry.error = mapped.message;
      if (entry.loaded) {
        entry.status = mapped.status === "error" ? "cached" : mapped.status;
      } else {
        entry.status = mapped.status;
      }
    }
  }
}

async function loadWeek(
  week: number,
  options: { force?: boolean } = {},
): Promise<void> {
  hydrate();
  if (!Number.isSafeInteger(week) || week < 1) return;

  const entry = ensureEntry(week);
  if (isAuthBlocked()) {
    entry.status = "no-credential";
    entry.error = null;
    entry.loading = false;
    return;
  }

  if (!options.force && entry.loaded) return;

  const requestId = (weekRequestIds.get(week) ?? 0) + 1;
  weekRequestIds.set(week, requestId);

  const hadData = entry.loaded;
  entry.loading = true;
  entry.error = null;
  if (!hadData) {
    entry.status = "loading";
  } else if (
    entry.status === "no-credential" ||
    entry.status === "auth-expired"
  ) {
    entry.status = "cached";
  }

  try {
    const response = await fetchByxtSchedule(week);
    if (weekRequestIds.get(week) !== requestId) return;
    applyResponse(response);
  } catch (error) {
    if (weekRequestIds.get(week) !== requestId) return;

    const mapped = mapScheduleError(error);
    if (mapped.status === "auth-expired") markSourceExpired("byxt");

    entry.loading = false;
    entry.error = mapped.message;
    if (hadData) {
      entry.status = mapped.status === "error" ? "cached" : mapped.status;
    } else {
      entry.status = mapped.status;
      entry.loaded = false;
      entry.courses = [];
      entry.sectionTimes = EMPTY_SECTION_TIMES;
      entry.savedAt = null;
    }
  }
}

function applyResponse(
  response: Awaited<ReturnType<typeof fetchByxtSchedule>>,
): number {
  const week = response.week.number;
  meta.term = response.term;
  if (response.weeks.length > 0 || meta.weeks.length === 0) {
    meta.weeks = response.weeks;
  }
  meta.currentWeek = response.currentWeek;
  meta.weekSource = response.weekSource;
  meta.warning = response.warning;

  const sectionTimes =
    response.week.sectionTimes.length > 0
      ? response.week.sectionTimes
      : EMPTY_SECTION_TIMES;
  const entry = ensureEntry(week);
  entry.status = "ok";
  entry.courses = sortCourses(response.week.courses, sectionTimes);
  entry.sectionTimes = sectionTimes;
  entry.savedAt = new Date().toISOString();
  entry.error = null;
  entry.loading = false;
  entry.loaded = true;
  lastFetchedWeek = week;
  persistCache();
  return week;
}

function ensureEntry(week: number): WeekEntry {
  const existing = entries[week];
  if (existing) return existing;

  const entry = createEmptyWeekEntry();
  entries[week] = entry;
  return entry;
}

/** 当前周请求没有对应缓存条目时，用 boot 状态合成只读视图。 */
function weekView(week: number | null): WeekEntry {
  if (week !== null && entries[week]) return entries[week];

  const isCurrent =
    week === null || meta.currentWeek === null || week === meta.currentWeek;
  if (!isCurrent) {
    return {
      ...createEmptyWeekEntry(),
      status: "loading",
      sectionTimes: EMPTY_SECTION_TIMES,
      loading: true,
    };
  }

  const status = boot.status === "idle" ? "loading" : boot.status;
  return {
    ...createEmptyWeekEntry(),
    status,
    sectionTimes: EMPTY_SECTION_TIMES,
    error: boot.error,
    loading: boot.loading || status === "loading",
  };
}

function clearScheduleData(): void {
  remove(STORAGE_KEYS.scheduleCache);

  meta.term = null;
  meta.weeks = [];
  meta.currentWeek = null;
  meta.weekSource = "default";
  meta.warning = null;

  for (const key of Object.keys(entries)) {
    Reflect.deleteProperty(entries, key);
  }

  boot.status = "idle";
  boot.error = null;
  boot.loading = false;
  boot.hydrated = true;
  currentRequestId += 1;
  weekRequestIds.clear();
  lastFetchedWeek = null;
}

/* ------------------------------- 缓存读写 ------------------------------- */

function persistCache(): void {
  const byWeek: Record<number, WeekCache> = {};
  for (const [key, entry] of Object.entries(entries)) {
    const week = Number(key);
    if (!Number.isSafeInteger(week) || week < 1 || !entry.loaded) continue;

    byWeek[week] = {
      savedAt: entry.savedAt ?? new Date().toISOString(),
      sectionTimes: entry.sectionTimes,
      courses: entry.courses,
    };
  }

  if (!meta.term) return;

  const cache: ScheduleCache = {
    savedAt: new Date().toISOString(),
    term: meta.term,
    weeks: meta.weeks,
    currentWeek: meta.currentWeek,
    weekSource: meta.weekSource,
    lastWeek: lastFetchedWeek,
    byWeek,
  };
  persistScheduleCache(cache);
}

/* ------------------------------- 错误映射 ------------------------------- */

function mapScheduleError(error: unknown): {
  status: SourceStatus;
  message: string;
} {
  if (!(error instanceof ApiError)) {
    return { status: "error", message: "课表加载失败，请稍后重试" };
  }

  return mapApiError(error, {
    fallback: "课表加载失败",
    messageOverrides: { INVALID_WEEK: "周次无效或超出当前学期范围" },
  });
}
