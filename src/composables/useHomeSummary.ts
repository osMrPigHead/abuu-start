/** 主页日程摘要：今日/明日课程、考试与聚合同步状态。 */
import { computed, type Ref } from "vue";
import { useBykcChosen } from "@/composables/useBykcChosen";
import { useExams } from "@/composables/useExams";
import { useSchedule } from "@/composables/useSchedule";
import { useScheduleSettings } from "@/composables/useScheduleSettings";
import { addDays, formatDateKey, startOfWeekMonday } from "@/utils/date";
import { recentExamEntries } from "@/utils/exams";
import {
  courseDisplayName,
  findCourseStates,
  mergeCoursesForDate,
} from "@/utils/schedule";
import {
  canRetrySource,
  needsSettingsSource,
  resolveAggregateSourceBadge,
  resolveSourcePlaceholder,
  type SourceBadgeState,
} from "@/utils/sourceStatus";
import {
  createEmptyWeekEntry,
  resolveMaxWeek,
  weekNumberForDate,
  weekRowState,
  type WeekEntry,
} from "@/utils/week";

export function useHomeSummary(now: Ref<Date>) {
  const { meta, entries, loadWeek, refreshCurrent, weekView } = useSchedule();
  const { state: bykcChosenState, refresh: refreshBykcChosen } =
    useBykcChosen();
  const { state: examState, refresh: refreshExams } = useExams();
  const { highlightLeadMinutes } = useScheduleSettings();

  const todayDate = computed(() => now.value);
  const tomorrowDate = computed(() => addDays(now.value, 1));

  const maxWeek = computed(() => resolveMaxWeek(meta));

  const todayWeekNumber = computed(
    () =>
      weekNumberForDate(todayDate.value, meta, todayDate.value) ??
      meta.currentWeek,
  );

  const tomorrowWeekNumber = computed(() => {
    const byDate = weekNumberForDate(tomorrowDate.value, meta, todayDate.value);
    if (byDate !== null) return byDate;

    if (meta.weeks.length > 0) return null;
    if (meta.currentWeek === null) return null;

    const sameNaturalWeek =
      formatDateKey(startOfWeekMonday(tomorrowDate.value)) ===
      formatDateKey(startOfWeekMonday(todayDate.value));
    return sameNaturalWeek ? meta.currentWeek : meta.currentWeek + 1;
  });

  const todayView = computed(() => weekView(todayWeekNumber.value));
  const tomorrowView = computed(() => {
    const week = tomorrowWeekNumber.value;
    if (week === null || week > maxWeek.value) {
      return todayView.value.loaded
        ? { ...createEmptyWeekEntry(), status: "ok" as const, loaded: true }
        : weekView(null);
    }
    return weekView(week);
  });

  const todayCourses = computed(() =>
    mergeCoursesForDate(
      todayView.value.courses,
      bykcChosenState.courses,
      todayDate.value,
      todayView.value.sectionTimes,
    ),
  );

  const tomorrowCourses = computed(() =>
    mergeCoursesForDate(
      tomorrowView.value.courses,
      bykcChosenState.courses,
      tomorrowDate.value,
      tomorrowView.value.sectionTimes,
    ),
  );

  /** 博雅已选课程已有可用数据（缓存或已同步），可单独支撑今日/明日课程。 */
  const todayReady = computed(
    () => todayView.value.loaded || bykcChosenState.savedAt !== null,
  );
  const tomorrowReady = computed(
    () => tomorrowView.value.loaded || bykcChosenState.savedAt !== null,
  );

  const todayState = computed(() => weekRowState(todayView.value));
  const tomorrowState = computed(() => weekRowState(tomorrowView.value));

  const statusView = computed(() =>
    meta.currentWeek === null ? todayView.value : weekView(meta.currentWeek),
  );

  /** 日程卡片聚合课表、博雅已选课程与考试三个数据源。 */
  const scheduleSyncSources = computed<SourceBadgeState[]>(() => [
    {
      status: statusView.value.status,
      savedAt: statusView.value.savedAt,
      error: statusView.value.error,
      loading: statusView.value.loading,
    },
    {
      status: bykcChosenState.status,
      savedAt: bykcChosenState.savedAt,
      error: bykcChosenState.error,
      loading: bykcChosenState.loading,
    },
    {
      status: examState.status,
      savedAt: examState.savedAt,
      error: examState.error,
      loading: examState.loading,
    },
  ]);

  const scheduleBadge = computed(() =>
    resolveAggregateSourceBadge(scheduleSyncSources.value),
  );

  const scheduleCanRetry = computed(() =>
    scheduleSyncSources.value.some(canRetrySource),
  );
  const scheduleNeedsSettings = computed(() =>
    scheduleSyncSources.value.some(needsSettingsSource),
  );

  function retryScheduleSources(): void {
    const [schedule, bykc, exams] = scheduleSyncSources.value;
    if (schedule && canRetrySource(schedule)) void refreshCurrent();
    if (bykc && canRetrySource(bykc)) void refreshBykcChosen();
    if (exams && canRetrySource(exams)) void refreshExams();
  }

  const courseStates = computed(() =>
    findCourseStates(
      {
        date: todayDate.value,
        courses: todayCourses.value,
        sectionTimes: todayView.value.sectionTimes,
        loaded: todayReady.value,
      },
      tomorrowReady.value
        ? {
            date: tomorrowDate.value,
            courses: tomorrowCourses.value,
            sectionTimes: tomorrowView.value.sectionTimes,
            loaded: true,
          }
        : null,
      now.value,
    ),
  );

  const nextCourse = computed(
    () => courseStates.value.ongoing ?? courseStates.value.upcoming,
  );

  const nextLine = computed(() => {
    const next = nextCourse.value;
    if (next) {
      const name = courseDisplayName(next.course);
      if (next.kind === "ongoing") {
        return `正在上《${name}》 · 还有 ${next.remainingMinutes} 分钟`;
      }

      const place = next.course.placeName?.trim() || "";
      const where = next.dayOffset === 1 ? "明天" : "今天";
      const location = place ? ` · ${place}` : "";
      return `下一节《${name}》 · ${where} ${next.startText}-${next.endText}${location}`;
    }

    if (!todayReady.value) return "课表未加载";
    if (
      !tomorrowReady.value &&
      tomorrowWeekNumber.value !== todayWeekNumber.value
    ) {
      return "明日课表未加载";
    }
    return "暂无后续课程";
  });

  const nextPromptState = computed<"upcoming" | "ongoing" | null>(() => {
    const upcoming = courseStates.value.upcoming;
    const withinLead =
      upcoming !== null &&
      upcoming.startAt.getTime() - now.value.getTime() <=
        highlightLeadMinutes.value * 60_000;

    // 进行中与即将开始同时成立时，文案仍显示“正在上课”，但颜色按即将开始处理。
    if (withinLead) return "upcoming";
    if (courseStates.value.ongoing) return "ongoing";
    return null;
  });

  const recentExams = computed(() =>
    recentExamEntries(examState.exams, now.value, 3),
  );

  const examEmptyText = computed(() =>
    examState.status === "idle"
      ? "考试加载中…"
      : resolveSourcePlaceholder(
          { status: examState.status, error: examState.error },
          {
            loading: "考试加载中…",
            noCredential: "登录后查看考试",
            authExpired: "考试登录状态已失效",
            error: "考试加载失败",
            empty: "暂无未开始考试",
          },
        ),
  );

  return {
    meta,
    entries,
    loadWeek,
    maxWeek,
    todayDate,
    tomorrowDate,
    todayWeekNumber,
    tomorrowWeekNumber,
    todayView,
    tomorrowView,
    todayCourses,
    tomorrowCourses,
    todayState,
    tomorrowState,
    todayReady,
    tomorrowReady,
    scheduleBadge,
    scheduleCanRetry,
    scheduleNeedsSettings,
    retryScheduleSources,
    courseStates,
    nextCourse,
    nextLine,
    nextPromptState,
    recentExams,
    examEmptyText,
    examState,
    refreshExams,
    highlightLeadMinutes,
  };
}

export type { WeekEntry };
