<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import BykcCourseModal from '@/components/BykcCourseModal.vue'
import BykcSquareCard from '@/components/BykcSquareCard.vue'
import ExamCard from '@/components/ExamCard.vue'
import FocusCard from '@/components/FocusCard.vue'
import HomeCard from '@/components/HomeCard.vue'
import ScheduleDayRow from '@/components/ScheduleDayRow.vue'
import ShortcutCard from '@/components/ShortcutCard.vue'
import ShortcutDialog from '@/components/ShortcutDialog.vue'
import SourceStatusLine from '@/components/SourceStatusLine.vue'
import SpocDetailDialog from '@/components/SpocDetailDialog.vue'
import TodoCard from '@/components/TodoCard.vue'
import YgdkCard from '@/components/YgdkCard.vue'
import { useBykc, useBykcChosen, useBykcDetail } from '@/composables/useBykc'
import { useClock } from '@/composables/useClock'
import { useExams } from '@/composables/useExams'
import { usePomodoro } from '@/composables/usePomodoro'
import { useSchedule, type WeekEntry } from '@/composables/useSchedule'
import { useScheduleSettings } from '@/composables/useScheduleSettings'
import { useShortcuts } from '@/composables/useShortcuts'
import { useSpoc, useSpocDetail } from '@/composables/useSpoc'
import { useTodos } from '@/composables/useTodos'
import { useYgdk } from '@/composables/useYgdk'
import { useYgdkSettings } from '@/composables/useYgdkSettings'
import type { Course, Shortcut } from '@/types'
import { bykcChosenCoursesOnDate } from '@/utils/bykc'
import {
  addDays,
  formatDateKey,
  formatStamp,
  startOfWeekMonday,
} from '@/utils/date'
import { recentExamEntries } from '@/utils/exams'
import {
  coursesOnDay,
  DEFAULT_SECTION_TIMES,
  findCourseStates,
  isoDayOfWeek,
  sortCourses,
  weekNumberForDate,
} from '@/utils/schedule'
import { filterOpenSpocAssignments } from '@/utils/spoc'
import { resolveYgdkTermTarget, resolveYgdkWeekLimit } from '@/utils/ygdk'
import {
  normalizeShortcutRow,
  SHORTCUT_MIN_WIDTH_REM,
  SHORTCUT_ROW_COUNT,
  shortcutWidthRem,
  type ShortcutDraft,
} from '@/utils/shortcut'

const { now } = useClock()
const { now: spocNow } = useClock(30_000)
const router = useRouter()
const keyword = ref('')

const {
  meta,
  entries,
  hydrate: hydrateSchedule,
  refreshCurrent,
  loadWeek,
  weekView,
} = useSchedule()
const { highlightLeadMinutes } = useScheduleSettings()
const {
  state: examState,
  hydrate: hydrateExams,
  refresh: refreshExams,
} = useExams()
const {
  state: ygdkState,
  hydrate: hydrateYgdk,
  refresh: refreshYgdk,
} = useYgdk()
const { termTarget: ygdkUserTermTarget, weekTarget: ygdkUserWeekTarget } = useYgdkSettings()
const {
  state: bykcState,
  loadPage: loadBykcPage,
  refresh: refreshBykc,
} = useBykc()
const {
  state: bykcChosenState,
  hydrate: hydrateBykcChosen,
  refresh: refreshBykcChosen,
} = useBykcChosen()
const {
  state: bykcDetailState,
  open: openBykcDetail,
  refresh: refreshBykcDetail,
  close: closeBykcDetail,
} = useBykcDetail()

/** 学期目标优先系统值；周限制始终用用户设置，见 docs/trd-phase2.md 7.4。 */
const ygdkTermTarget = computed(() =>
  resolveYgdkTermTarget(ygdkState.overview?.termTarget ?? 0, ygdkUserTermTarget.value),
)
const ygdkWeekLimit = computed(() => resolveYgdkWeekLimit(ygdkUserWeekTarget.value))

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const dateText = computed(() => {
  const value = now.value
  const weekday = weekdays[value.getDay()] ?? 'Sun'
  return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}\u2002${weekday}`
})

const timeText = computed(() => {
  const value = now.value
  return `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
})

const dateTime = computed(() => now.value.toISOString())

const EMPTY_SECTION_TIMES = DEFAULT_SECTION_TIMES.map((item) => ({ ...item }))
const emptyLoadedView: WeekEntry = {
  status: 'ok',
  courses: [],
  sectionTimes: EMPTY_SECTION_TIMES,
  savedAt: null,
  error: null,
  loading: false,
  loaded: true,
}

const todayDate = computed(() => now.value)
const tomorrowDate = computed(() => addDays(now.value, 1))

const maxWeek = computed(() => {
  const serialNumbers = meta.weeks.map((week) => week.serialNumber)
  return Math.max(1, meta.currentWeek ?? 1, ...(serialNumbers.length > 0 ? serialNumbers : [1]))
})

const todayWeekNumber = computed(
  () => weekNumberForDate(todayDate.value, meta, todayDate.value) ?? meta.currentWeek,
)

const tomorrowWeekNumber = computed(() => {
  const byDate = weekNumberForDate(tomorrowDate.value, meta, todayDate.value)
  if (byDate !== null) return byDate

  if (meta.weeks.length > 0) return null
  if (meta.currentWeek === null) return null

  const sameNaturalWeek =
    formatDateKey(startOfWeekMonday(tomorrowDate.value)) ===
    formatDateKey(startOfWeekMonday(todayDate.value))
  return sameNaturalWeek ? meta.currentWeek : meta.currentWeek + 1
})

const todayView = computed(() => weekView(todayWeekNumber.value))
const tomorrowView = computed(() => {
  const week = tomorrowWeekNumber.value
  if (week === null || week > maxWeek.value) {
    return todayView.value.loaded ? emptyLoadedView : weekView(null)
  }
  return weekView(week)
})

const todayCourses = computed(() =>
  sortCourses(
    [
      ...coursesOnDay(todayView.value.courses, isoDayOfWeek(todayDate.value)),
      ...bykcChosenCoursesOnDate(bykcChosenState.courses, todayDate.value),
    ],
    todayView.value.sectionTimes,
  ),
)

const tomorrowCourses = computed(() =>
  sortCourses(
    [
      ...coursesOnDay(tomorrowView.value.courses, isoDayOfWeek(tomorrowDate.value)),
      ...bykcChosenCoursesOnDate(bykcChosenState.courses, tomorrowDate.value),
    ],
    tomorrowView.value.sectionTimes,
  ),
)

/** 博雅已选课程已有可用数据（缓存或已同步），可单独支撑今日/明日课程。 */
const todayReady = computed(
  () => todayView.value.loaded || bykcChosenState.savedAt !== null,
)
const tomorrowReady = computed(
  () => tomorrowView.value.loaded || bykcChosenState.savedAt !== null,
)

const todayState = computed(() => rowState(todayView.value))
const tomorrowState = computed(() => rowState(tomorrowView.value))

const statusView = computed(() =>
  meta.currentWeek === null ? todayView.value : weekView(meta.currentWeek),
)

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
)

const nextCourse = computed(() => courseStates.value.ongoing ?? courseStates.value.upcoming)

/** 博雅课程在摘要中带来源前缀，便于与常规课表区分。 */
function courseDisplayName(course: Course): string {
  return course.source === 'bykc' ? `博雅 · ${course.courseName}` : course.courseName
}

const nextLine = computed(() => {
  const next = nextCourse.value
  if (next) {
    const name = courseDisplayName(next.course)
    if (next.kind === 'ongoing') {
      return `正在上《${name}》 · 还有 ${next.remainingMinutes} 分钟`
    }

    const place = next.course.placeName?.trim() || ''
    const where = next.dayOffset === 1 ? '明天' : '今天'
    const location = place ? ` · ${place}` : ''
    return `下一节《${name}》 · ${where} ${next.startText}-${next.endText}${location}`
  }

  if (!todayReady.value) return '课表未加载'
  if (!tomorrowReady.value && tomorrowWeekNumber.value !== todayWeekNumber.value) {
    return '明日课表未加载'
  }
  return '暂无后续课程'
})

const nextPromptState = computed<'upcoming' | 'ongoing' | null>(() => {
  const upcoming = courseStates.value.upcoming
  const withinLead =
    upcoming !== null &&
    upcoming.startAt.getTime() - now.value.getTime() <=
      highlightLeadMinutes.value * 60_000

  // 进行中与即将开始同时成立时，文案仍显示“正在上课”，但颜色按即将开始处理。
  if (withinLead) return 'upcoming'
  if (courseStates.value.ongoing) return 'ongoing'
  return null
})

const nextLineClass = computed(() => {
  if (nextPromptState.value === 'ongoing') return 'font-medium text-sky-200'
  if (nextPromptState.value === 'upcoming') return 'font-medium text-amber-200'
  return 'text-white/55'
})

const recentExams = computed(() => recentExamEntries(examState.exams, now.value, 3))
const examHasData = computed(() => examState.savedAt !== null || examState.exams.length > 0)

const examEmptyText = computed(() => {
  switch (examState.status) {
    case 'loading':
    case 'idle':
      return '考试加载中…'
    case 'no-credential':
      return '配置 Cookie 后查看考试'
    case 'auth-expired':
      return '考试登录状态已失效'
    case 'error':
      return examState.error || '考试加载失败'
    default:
      return '暂无未开始考试'
  }
})

const examNotice = computed(() => {
  if (!examHasData.value) return ''
  if (examState.status === 'auth-expired') return '考试缓存 · 登录状态已失效'
  if (examState.status === 'no-credential') return '考试缓存 · 未配置 Cookie'
  if (examState.error) {
    const stamp = formatStamp(examState.savedAt)
    return stamp ? `考试缓存于 ${stamp}` : '考试缓存'
  }
  return ''
})

const examCanRetry = computed(
  () =>
    examHasData.value &&
    examState.status !== 'auth-expired' &&
    examState.status !== 'no-credential' &&
    examState.error !== null,
)

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

function preloadTomorrow(): void {
  const week = tomorrowWeekNumber.value
  if (week === null || week > maxWeek.value) return
  if (week === todayWeekNumber.value) return

  const existing = entries[week]
  if (!existing || (!existing.loaded && !existing.loading)) {
    void loadWeek(week)
  }
}

watch(tomorrowWeekNumber, preloadTomorrow, { immediate: true })

onMounted(() => {
  hydrateSchedule()
  hydrateExams()
  hydrateSpoc()
  hydrateYgdk()
  hydrateBykcChosen()
  void refreshCurrent()
  void refreshExams()
  void refreshSpoc()
  void refreshYgdk()
  void refreshBykcChosen()
  void loadBykcPage(1)
})

function refreshSchedule(): void {
  void refreshCurrent()
}

function openSchedule(): void {
  void router.push('/schedule')
}

function openExams(): void {
  void router.push('/exams')
}

function submitSearch(): void {
  const query = keyword.value.trim()
  if (query.length === 0) return

  window.location.assign(`https://www.bing.com/search?q=${encodeURIComponent(query)}`)
}

type WaterfallPlacement = {
  id: string
  width: number
  rows: number
  row: number
  x: number
}

type ShortcutPlacement = WaterfallPlacement & {
  shortcut: Shortcut
}

const ROW_HEIGHT_REM = 3
const ROW_GAP_REM = 0.75
const ROW_STEP_REM = ROW_HEIGHT_REM + ROW_GAP_REM
const ROW_COUNT = SHORTCUT_ROW_COUNT

const schedulePlacement: WaterfallPlacement = { id: 'schedule', width: 38, rows: 5, row: 0, x: 0 }
const bykcPlacement: WaterfallPlacement = {
  id: 'bykc',
  width: 22.4,
  rows: 5,
  row: 0,
  x: schedulePlacement.width + ROW_GAP_REM,
}
const todoPlacement: WaterfallPlacement = { id: 'todo', width: 34, rows: 6, row: 5, x: 0 }
const focusPlacement: WaterfallPlacement = {
  id: 'focus',
  // 原 28rem 的 4/5，与待办同一行。
  width: 22.4,
  rows: 4,
  row: todoPlacement.row,
  x: todoPlacement.width + ROW_GAP_REM,
}
const ygdkPlacement: WaterfallPlacement = {
  id: 'ygdk',
  width: focusPlacement.width,
  rows: 2,
  row: focusPlacement.row + focusPlacement.rows,
  x: focusPlacement.x,
}

/** 大卡固定占位后各行的右端；快捷方式从这些位置继续排。 */
const BASE_ROW_ENDS = (() => {
  const rowEnds = Array.from({ length: ROW_COUNT }, () => 0)

  for (const item of [
    schedulePlacement,
    bykcPlacement,
    todoPlacement,
    focusPlacement,
    ygdkPlacement,
  ]) {
    for (let row = item.row; row < item.row + item.rows; row += 1) {
      rowEnds[row] = Math.max(rowEnds[row] ?? 0, item.x + item.width)
    }
  }

  return rowEnds
})()

const baseBoardWidthRem = Math.max(...BASE_ROW_ENDS)
const maxRowStartRem = Math.max(...BASE_ROW_ENDS.map((end) => end + ROW_GAP_REM))

/** 即使所有行都为空，也要留出第一张快捷方式的可放置范围。 */
const MIN_BOARD_WIDTH_REM = Math.max(
  baseBoardWidthRem,
  maxRowStartRem + SHORTCUT_MIN_WIDTH_REM,
)

const { shortcuts, addShortcut, updateShortcut, removeShortcut, moveShortcutTo } =
  useShortcuts()
const { todos, addTodo, updateTodo, removeTodo, toggleTodo } = useTodos()
const {
  state: spocState,
  hydrate: hydrateSpoc,
  refresh: refreshSpoc,
} = useSpoc()

const openSpocAssignments = computed(() =>
  filterOpenSpocAssignments(spocState.assignments, spocNow.value),
)
const {
  state: spocDetailState,
  open: openSpocDetail,
  refresh: refreshSpocDetail,
  close: closeSpocDetail,
} = useSpocDetail()

onBeforeUnmount(closeSpocDetail)
const {
  settings: pomodoroSettings,
  phase: pomodoroPhase,
  phaseSeconds: pomodoroPhaseSeconds,
  remainingSeconds: pomodoroRemainingSeconds,
  running: pomodoroRunning,
  started: pomodoroStarted,
  paused: pomodoroPaused,
  completedRounds: pomodoroCompletedRounds,
  expectedFinishAt: pomodoroExpectedFinishAt,
  start: startPomodoro,
  saveSettings: savePomodoroSettings,
  pause: pausePomodoro,
  resume: resumePomodoro,
  reset: resetPomodoro,
  editSettings: editPomodoroSettings,
} = usePomodoro()

const isEditing = ref(false)
const shortcutDialogOpen = ref(false)
const editingShortcut = ref<Shortcut | null>(null)

/**
 * 每行独立排列，行数固定、行内数量不限。
 * 快捷方式显式保存 row，横向位置由该行前面的卡片顺序推算，不做换行装箱。
 */
const shortcutLayout = computed(() => {
  const rowWidths = [...BASE_ROW_ENDS]
  const placements: ShortcutPlacement[] = []

  for (const shortcut of shortcuts.value) {
    const row = normalizeShortcutRow(shortcut.row)
    const width = shortcutWidthRem(shortcut.title, isEditing.value)
    const x = (rowWidths[row] ?? 0) + ROW_GAP_REM

    placements.push({
      id: shortcut.id,
      shortcut,
      width,
      rows: 1,
      row,
      x,
    })
    rowWidths[row] = x + width
  }

  return { placements, rowWidths }
})

const shortcutPlacements = computed(() => shortcutLayout.value.placements)

const boardHeightRem = ROW_COUNT * ROW_HEIGHT_REM + (ROW_COUNT - 1) * ROW_GAP_REM

const boardWidthRem = computed(() =>
  Math.max(MIN_BOARD_WIDTH_REM, ...shortcutLayout.value.rowWidths),
)

const boardStyle = computed(() => ({
  width: `${boardWidthRem.value}rem`,
  height: `${boardHeightRem}rem`,
}))

function placementStyle(item: WaterfallPlacement) {
  return {
    left: `${item.x}rem`,
    top: `${item.row * (ROW_HEIGHT_REM + ROW_GAP_REM)}rem`,
    width: `${item.width}rem`,
    height: `${item.rows * ROW_HEIGHT_REM + (item.rows - 1) * ROW_GAP_REM}rem`,
  }
}

const boardElement = ref<HTMLElement | null>(null)

function availableStartRem(row: number): number {
  return (BASE_ROW_ENDS[row] ?? 0) + ROW_GAP_REM
}

function rowTopRem(row: number): number {
  return row * ROW_STEP_REM
}

function rowGuideStyle(row: number) {
  const start = availableStartRem(row)
  return {
    left: `${start}rem`,
    top: `${rowTopRem(row)}rem`,
    width: `${Math.max(0, boardWidthRem.value - start)}rem`,
    height: `${ROW_HEIGHT_REM}rem`,
  }
}

const topButtonClass =
  'flex h-[2.43rem] w-[2.43rem] shrink-0 items-center justify-center rounded-full border border-white/20 bg-slate-950/40 text-white/60 backdrop-blur-xl transition hover:border-white/35 hover:bg-slate-950/55 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40'

function openCreateDialog(): void {
  editingShortcut.value = null
  shortcutDialogOpen.value = true
}

function openEditDialog(shortcut: Shortcut): void {
  editingShortcut.value = shortcut
  shortcutDialogOpen.value = true
}

function closeShortcutDialog(): void {
  shortcutDialogOpen.value = false
}

function submitShortcut(draft: ShortcutDraft): void {
  const current = editingShortcut.value

  if (current) {
    if (updateShortcut(current.id, draft)) shortcutDialogOpen.value = false
    return
  }

  const created = addShortcut(draft, 0)
  if (!created) return

  shortcutDialogOpen.value = false
  void nextTick(() => scrollShortcutIntoView(created.id))
}

function scrollShortcutIntoView(id: string): void {
  const card = [...document.querySelectorAll<HTMLElement>('[data-shortcut-id]')].find(
    (element) => element.dataset.shortcutId === id,
  )
  card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' })
}

function removeShortcutFromDialog(id: string): void {
  removeShortcut(id)
  shortcutDialogOpen.value = false
}

function toggleEditing(): void {
  isEditing.value = !isEditing.value
  resetDragState()
}

const draggingId = ref<string | null>(null)
const dragRow = ref<number | null>(null)
const dragIndex = ref<number | null>(null)
const dragInsertX = ref<number | null>(null)

const insertionStyle = computed(() => {
  if (dragRow.value === null || dragInsertX.value === null) return {}
  return {
    left: `${Math.min(dragInsertX.value, boardWidthRem.value)}rem`,
    top: `${rowTopRem(dragRow.value)}rem`,
    height: `${ROW_HEIGHT_REM}rem`,
  }
})

function handleShortcutDragStart(shortcut: Shortcut): void {
  if (!isEditing.value) return
  clearDragTarget()
  draggingId.value = shortcut.id
}

/**
 * 在整块功能区上计算落点：纵向按 11 行取行号，横向按该行现有卡片取插入序号。
 * 因此空行、行尾空白和超出当前画布宽度的行尾都可作为放置目标。
 */
function handleBoardDragOver(event: DragEvent): void {
  if (!isEditing.value || !draggingId.value) return

  const board = boardElement.value
  if (!board) return

  const rect = board.getBoundingClientRect()
  if (rect.width <= 0) return

  const remPx = rect.width / boardWidthRem.value
  if (!Number.isFinite(remPx) || remPx <= 0) return

  const row = Math.min(
    ROW_COUNT - 1,
    Math.max(0, Math.floor((event.clientY - rect.top) / (ROW_STEP_REM * remPx))),
  )
  const xRem = (event.clientX - rect.left) / remPx
  const start = availableStartRem(row)

  if (xRem < start) {
    clearDragTarget()
    return
  }

  const others = shortcutLayout.value.placements.filter(
    (placement) => placement.row === row && placement.id !== draggingId.value,
  )
  let index = others.findIndex(
    (placement) => xRem < placement.x + placement.width / 2,
  )
  if (index < 0) index = others.length

  const previous = others[index - 1]
  dragRow.value = row
  dragIndex.value = index
  dragInsertX.value =
    index === 0 || !previous
      ? start
      : previous.x + previous.width + ROW_GAP_REM

  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function handleBoardDrop(event: DragEvent): void {
  if (!isEditing.value || !draggingId.value) return

  const row = dragRow.value
  const index = dragIndex.value
  if (row === null || index === null) return

  event.preventDefault()
  moveShortcutTo(draggingId.value, row, index)
  resetDragState()
}

function handleShortcutDragEnd(): void {
  resetDragState()
}

function clearDragTarget(): void {
  dragRow.value = null
  dragIndex.value = null
  dragInsertX.value = null
}

function resetDragState(): void {
  draggingId.value = null
  clearDragTarget()
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
</script>

<template>
  <div class="home-backdrop min-h-screen text-white antialiased">
    <main class="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-6 py-8 sm:px-10">
      <header class="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div class="home-clock" aria-label="当前日期与时间">
          <time :datetime="dateTime" class="home-clock-date">{{ dateText }}</time>
          <time :datetime="dateTime" class="home-clock-time">{{ timeText }}</time>
        </div>

        <div class="flex w-full items-center justify-end gap-3 lg:w-auto">
          <form
            class="flex h-[2.43rem] w-full max-w-[26rem] items-center gap-1.5 rounded-full border border-white/20 bg-slate-950/40 pl-4 pr-1.5 backdrop-blur-xl transition focus-within:border-white/35 focus-within:bg-slate-950/55 lg:w-[22rem] lg:max-w-none lg:flex-none xl:w-[24rem]"
            role="search"
            @submit.prevent="submitSearch"
          >
            <input
              v-model="keyword"
              type="text"
              inputmode="search"
              enterkeyhint="search"
              autocomplete="off"
              spellcheck="false"
              placeholder="使用 Bing 搜索"
              aria-label="搜索关键词"
              class="h-full min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/45"
            >
            <button
              type="submit"
              aria-label="使用 Bing 搜索"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
            >
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" class="h-[18px] w-[18px]">
                <path
                  d="m14.5 14.5 3 3m-2-8.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </form>

          <button
            type="button"
            :class="topButtonClass"
            aria-label="新建快捷方式"
            title="新建快捷方式"
            @click="openCreateDialog"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="h-5 w-5">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>

          <button
            type="button"
            :class="[topButtonClass, isEditing ? 'ring-2 ring-white/50 text-white' : '']"
            :aria-pressed="isEditing"
            :aria-label="isEditing ? '退出编辑' : '编辑快捷方式'"
            :title="isEditing ? '退出编辑' : '编辑快捷方式'"
            @click="toggleEditing"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="h-5 w-5">
              <path
                d="m4 20 4.4-1 9.6-9.6a2.1 2.1 0 0 0-3-3L5.4 16 4 20Z"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <RouterLink
            to="/settings"
            :class="topButtonClass"
            aria-label="设置"
            title="设置"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="h-5 w-5">
              <path
                d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                stroke="currentColor"
                stroke-width="1.5"
              />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.08A1.65 1.65 0 0 0 10.1 3.09V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15.2 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.14.6.64 1.04 1.25 1.09H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </RouterLink>
        </div>
      </header>

      <div
        class="waterfall-scroll -mx-6 mt-6 overflow-x-auto overflow-y-hidden px-6 pb-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/30 sm:-mx-10 sm:px-10"
        role="region"
        aria-label="功能区，可左右滚动"
        tabindex="0"
      >
        <div
          ref="boardElement"
          class="waterfall-board"
          :style="boardStyle"
          @dragover="handleBoardDragOver"
          @drop="handleBoardDrop"
        >
          <template v-for="row in ROW_COUNT" :key="`row-guide-${row}`">
            <div
              v-if="isEditing"
              :data-row-guide="row - 1"
              class="pointer-events-none absolute rounded-xl border border-dashed transition-colors"
              :class="
                dragRow === row - 1
                  ? 'border-sky-300/40 bg-sky-300/5'
                  : 'border-white/10'
              "
              :style="rowGuideStyle(row - 1)"
            ></div>
          </template>

          <div class="absolute" :style="placementStyle(schedulePlacement)">
            <HomeCard
              title="日程"
              dense
              class="h-full w-full cursor-pointer"
              role="link"
              tabindex="0"
              aria-label="打开日程详情"
              @click="openSchedule"
              @keydown.enter="openSchedule"
              @keydown.space.prevent="openSchedule"
            >
              <div class="flex min-h-0 flex-1 flex-col gap-1">
                <p
                  class="shrink-0 truncate text-[11px] leading-tight transition-colors"
                  :class="nextLineClass"
                >
                  {{ nextLine }}
                </p>

                <div class="flex min-h-0 flex-1 flex-col gap-1">
                  <ScheduleDayRow
                    :date="todayDate"
                    :week-number="todayWeekNumber"
                    relative-label="今天"
                    :courses="todayCourses"
                    :section-times="todayView.sectionTimes"
                    :state="todayState"
                    :now="now"
                    :highlight-lead-minutes="highlightLeadMinutes"
                    compact
                    class="min-h-0 flex-1"
                  />
                  <ScheduleDayRow
                    :date="tomorrowDate"
                    :week-number="tomorrowWeekNumber"
                    relative-label="明天"
                    :courses="tomorrowCourses"
                    :section-times="tomorrowView.sectionTimes"
                    :state="tomorrowState"
                    :now="now"
                    :highlight-lead-minutes="highlightLeadMinutes"
                    compact
                    class="min-h-0 flex-1"
                  />
                </div>

                <div
                  class="min-w-0 cursor-pointer"
                  role="link"
                  tabindex="0"
                  aria-label="打开考试详情"
                  @click.stop="openExams"
                  @keydown.enter.stop="openExams"
                  @keydown.space.stop.prevent="openExams"
                >
                  <div
                    v-if="recentExams.length > 0"
                    class="grid min-w-0 auto-cols-fr grid-flow-col gap-2"
                  >
                    <ExamCard
                      v-for="entry in recentExams"
                      :key="`${entry.exam.courseName}-${entry.exam.examDate}-${entry.exam.startTime}`"
                      :exam="entry.exam"
                      :now="now"
                      compact
                    />
                  </div>

                  <div
                    v-else
                    class="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-2 py-1.5 text-[9.5px] leading-tight text-white/45 transition hover:border-white/25"
                  >
                    <span class="min-w-0 truncate">{{ examEmptyText }}</span>
                    <button
                      v-if="examState.status === 'error'"
                      type="button"
                      class="shrink-0 text-white/65 transition hover:text-white"
                      @click.stop="refreshExams"
                    >
                      重试
                    </button>
                  </div>

                  <div
                    v-if="examNotice"
                    class="mt-1 flex min-w-0 items-center gap-2 text-[9px] leading-tight text-white/35"
                  >
                    <span class="min-w-0 truncate">{{ examNotice }}</span>
                    <button
                      v-if="examCanRetry"
                      type="button"
                      class="shrink-0 text-white/55 transition hover:text-white"
                      @click.stop="refreshExams"
                    >
                      重试
                    </button>
                  </div>
                </div>

                <div @click.stop @keydown.stop>
                  <SourceStatusLine
                    :status="statusView.status"
                    :saved-at="statusView.savedAt"
                    :error="statusView.error"
                    :warning="meta.warning"
                    :refreshing="statusView.loading"
                    secondary-label="博雅"
                    :secondary-status="bykcChosenState.status"
                    :secondary-saved-at="bykcChosenState.savedAt"
                    :secondary-error="bykcChosenState.error"
                    :secondary-refreshing="bykcChosenState.loading"
                    secondary-no-credential-text="未配置 auth_token"
                    secondary-auth-expired-text="auth_token 已失效，请更新"
                    compact
                    @retry="refreshSchedule"
                    @retry-secondary="refreshBykcChosen"
                  />
                </div>
              </div>
            </HomeCard>
          </div>

          <div class="absolute" :style="placementStyle(bykcPlacement)">
            <BykcSquareCard
              class="h-full w-full"
              :courses="bykcState.courses"
              :status="bykcState.status"
              :saved-at="bykcState.savedAt"
              :error="bykcState.error"
              :loading="bykcState.loading"
              @open="openBykcDetail"
              @retry="refreshBykc"
            />
          </div>

          <div class="absolute" :style="placementStyle(todoPlacement)">
            <TodoCard
              :todos="todos"
              :spoc-assignments="openSpocAssignments"
              :spoc-status="spocState.status"
              :spoc-saved-at="spocState.savedAt"
              :spoc-error="spocState.error"
              :spoc-loading="spocState.loading"
              class="h-full w-full"
              @create="addTodo"
              @update="updateTodo"
              @remove="removeTodo"
              @toggle="toggleTodo"
              @refresh-spoc="refreshSpoc"
              @open-spoc="openSpocDetail"
            />
          </div>

          <div class="absolute" :style="placementStyle(focusPlacement)">
            <FocusCard
              :settings="pomodoroSettings"
              :phase="pomodoroPhase"
              :phase-seconds="pomodoroPhaseSeconds"
              :remaining-seconds="pomodoroRemainingSeconds"
              :running="pomodoroRunning"
              :started="pomodoroStarted"
              :paused="pomodoroPaused"
              :completed-rounds="pomodoroCompletedRounds"
              :expected-finish-at="pomodoroExpectedFinishAt"
              @start="startPomodoro"
              @settings-change="savePomodoroSettings"
              @pause="pausePomodoro"
              @resume="resumePomodoro"
              @reset="resetPomodoro"
              @edit="editPomodoroSettings"
            />
          </div>

          <div class="absolute" :style="placementStyle(ygdkPlacement)">
            <YgdkCard
              class="h-full w-full"
              :status="ygdkState.status"
              :overview="ygdkState.overview"
              :term-target="ygdkTermTarget"
              :week-limit="ygdkWeekLimit"
              :saved-at="ygdkState.savedAt"
              :error="ygdkState.error"
              @retry="refreshYgdk"
            />
          </div>

          <ShortcutCard
            v-for="placement in shortcutPlacements"
            :key="placement.id"
            :shortcut="placement.shortcut"
            :editing="isEditing"
            :dragging="draggingId === placement.id"
            :style="placementStyle(placement)"
            @edit="openEditDialog(placement.shortcut)"
            @dragstart="handleShortcutDragStart(placement.shortcut)"
            @dragend="handleShortcutDragEnd"
          />

          <div
            v-if="isEditing && draggingId && dragRow !== null && dragInsertX !== null"
            aria-hidden="true"
            class="pointer-events-none absolute z-20 w-0.5 rounded-full bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.75)]"
            :style="insertionStyle"
          ></div>
        </div>
      </div>
    </main>

    <ShortcutDialog
      :open="shortcutDialogOpen"
      :shortcut="editingShortcut"
      @close="closeShortcutDialog"
      @submit="submitShortcut"
      @remove="removeShortcutFromDialog"
    />

    <BykcCourseModal
      :open="bykcDetailState.courseId !== null"
      :preview="bykcDetailState.preview"
      :detail="bykcDetailState.course"
      :status="bykcDetailState.status"
      :saved-at="bykcDetailState.savedAt"
      :error="bykcDetailState.error"
      :loading="bykcDetailState.loading"
      :not-found="bykcDetailState.notFound"
      @close="closeBykcDetail"
      @retry="refreshBykcDetail"
    />

    <SpocDetailDialog
      :open="spocDetailState.assignmentId !== null"
      :preview="spocDetailState.preview"
      :detail="spocDetailState.assignment"
      :status="spocDetailState.status"
      :saved-at="spocDetailState.savedAt"
      :error="spocDetailState.error"
      :loading="spocDetailState.loading"
      :not-found="spocDetailState.notFound"
      @close="closeSpocDetail"
      @retry="refreshSpocDetail"
    />
  </div>
</template>
