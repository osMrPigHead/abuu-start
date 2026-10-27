<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import BackHomeLink from '@/components/BackHomeLink.vue'
import ScheduleDayRow from '@/components/ScheduleDayRow.vue'
import SourceStatusLine from '@/components/SourceStatusLine.vue'
import WeekSwitcher from '@/components/WeekSwitcher.vue'
import { useClock } from '@/composables/useClock'
import { useBykcChosen } from '@/composables/useBykc'
import { useSchedule, type WeekEntry } from '@/composables/useSchedule'
import { useScheduleSettings } from '@/composables/useScheduleSettings'
import { bykcChosenCoursesOnDate } from '@/utils/bykc'
import { formatDateKey } from '@/utils/date'
import { buildWeekDays, coursesOnDay, sortCourses, weekDateRange } from '@/utils/schedule'

const { meta, hydrate: hydrateSchedule, refreshCurrent, loadWeek, weekView } = useSchedule()
const {
  state: bykcChosenState,
  hydrate: hydrateBykcChosen,
  refresh: refreshBykcChosen,
} = useBykcChosen()
const { highlightLeadMinutes } = useScheduleSettings()
const { now } = useClock(Math.max(5, highlightLeadMinutes.value) * 1000)

const today = computed(() => now.value)
const userNavigated = ref(false)

hydrateSchedule()

const selectedWeek = ref(meta.currentWeek ?? 1)
const selectedView = computed(() => weekView(selectedWeek.value))

const minWeek = computed(() => {
  const serialNumbers = meta.weeks.map((week) => week.serialNumber)
  return serialNumbers.length > 0 ? Math.min(...serialNumbers) : 1
})
const maxWeek = computed(() => {
  const serialNumbers = meta.weeks.map((week) => week.serialNumber)
  return Math.max(1, meta.currentWeek ?? 1, ...(serialNumbers.length > 0 ? serialNumbers : [1]))
})
const canPrev = computed(() => selectedWeek.value > minWeek.value)
const canNext = computed(() => selectedWeek.value < maxWeek.value)

const weekOptions = computed(() =>
  [...meta.weeks].sort((left, right) => left.serialNumber - right.serialNumber),
)

const weekDays = computed(() => buildWeekDays(selectedWeek.value, meta, today.value))
const weekRows = computed(() =>
  weekDays.value.map((day) => ({
    ...day,
    courses: sortCourses(
      [
        ...coursesOnDay(selectedView.value.courses, day.dayOfWeek),
        ...bykcChosenCoursesOnDate(bykcChosenState.courses, day.date),
      ],
      selectedView.value.sectionTimes,
    ),
  })),
)

const range = computed(() => weekDateRange(selectedWeek.value, meta, today.value))
const rangeLabel = computed(
  () => `${formatDateKey(range.value.start)} – ${formatDateKey(range.value.end)}`,
)

const displayWarning = computed(
  () =>
    meta.warning ??
    (meta.currentWeek === null && !selectedView.value.loading && !selectedView.value.loaded
      ? '无法确定教学周，默认第 1 周'
      : null),
)

watch(
  () => meta.currentWeek,
  (week) => {
    if (week === null) return
    if (!userNavigated.value) selectedWeek.value = week
  },
  { immediate: true },
)

onMounted(() => {
  hydrateSchedule()
  hydrateBykcChosen()
  void refreshCurrent()
  void refreshBykcChosen()
})

function rowState(view: WeekEntry): 'loading' | 'ready' | 'unavailable' {
  if (view.loaded) return 'ready'
  if (
    view.status === 'error' ||
    view.status === 'no-credential' ||
    view.status === 'auth-expired'
  ) {
    return 'unavailable'
  }
  return 'loading'
}

function selectWeek(week: number): void {
  if (!Number.isSafeInteger(week) || week < minWeek.value || week > maxWeek.value) {
    return
  }

  userNavigated.value = true
  if (week === selectedWeek.value) {
    void loadWeek(week, { force: true })
    return
  }

  selectedWeek.value = week
  void loadWeek(week, { force: true })
}

function refresh(): void {
  if (meta.currentWeek === null || selectedWeek.value === meta.currentWeek) {
    void refreshCurrent()
    return
  }
  void loadWeek(selectedWeek.value, { force: true })
}
</script>

<template>
  <div class="home-backdrop min-h-screen text-white antialiased">
    <main class="mx-auto w-full max-w-6xl px-8 py-10">
      <div class="route-page-header">
        <WeekSwitcher
          :selected-week="selectedWeek"
          :current-week="meta.currentWeek"
          :weeks="weekOptions"
          :can-prev="canPrev"
          :can-next="canNext"
          label="周次切换（页首）"
          class="mb-6"
          @select="selectWeek"
        />

        <header class="flex items-end justify-between gap-6">
          <div>
            <h1 class="text-2xl font-semibold tracking-wide">第 {{ selectedWeek }} 周</h1>
            <p class="mt-1 text-sm text-white/45">{{ rangeLabel }}</p>
          </div>
          <BackHomeLink />
        </header>
      </div>

      <div class="route-page-body flow-root">
        <div class="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3 backdrop-blur-md">
          <SourceStatusLine
            :status="selectedView.status"
            :saved-at="selectedView.savedAt"
            :error="selectedView.error"
            :warning="displayWarning"
            :refreshing="selectedView.loading"
            secondary-label="博雅"
            :secondary-status="bykcChosenState.status"
            :secondary-saved-at="bykcChosenState.savedAt"
            :secondary-error="bykcChosenState.error"
            :secondary-refreshing="bykcChosenState.loading"
            secondary-no-credential-text="未登录，请前往设置完成登录"
            secondary-auth-expired-text="登录状态已失效，请重新登录"
            @retry="refresh"
            @retry-secondary="refreshBykcChosen"
          />
        </div>

        <section
          class="mt-4 rounded-3xl border border-white/12 bg-slate-950/35 px-5 py-2 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.95)] backdrop-blur-md"
          aria-label="一周课表"
        >
          <div
            v-for="day in weekRows"
            :key="formatDateKey(day.date)"
            class="border-b border-white/8 last:border-b-0"
          >
            <ScheduleDayRow
              :date="day.date"
              :week-number="day.weekNumber"
              :courses="day.courses"
              :section-times="selectedView.sectionTimes"
              :state="rowState(selectedView)"
              :now="now"
              :highlight-lead-minutes="highlightLeadMinutes"
            />
          </div>
        </section>

        <WeekSwitcher
          :selected-week="selectedWeek"
          :current-week="meta.currentWeek"
          :weeks="weekOptions"
          :can-prev="canPrev"
          :can-next="canNext"
          label="周次切换（页尾）"
          class="mt-5"
          @select="selectWeek"
        />
      </div>
    </main>
  </div>
</template>
