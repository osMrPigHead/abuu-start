/**
 * 前端本地类型：本地存储、UI 状态与合并后的课表模型。
 * 与中继共享的契约见 shared/api.ts、shared/auth.ts、shared/errors.ts。
 */
import type {
  BykcChosenCourse,
  BykcChosenTerm,
  BykcCourse,
  BykcCourseDetail,
  Course as RelayCourse,
  Exam,
  SectionTime,
  SpocAssignment,
  SpocAssignmentDetail,
  Term,
  Week,
  WeekSource,
  YgdkOverview,
} from '@shared/api'
import type { RelayErrorCode } from '@shared/errors'

/** 课表课程：中继响应 + 前端合并博雅课程时的来源标记。 */
export type Course = RelayCourse & {
  /** 课程来源；byxt 常规课表缺省，博雅已选课程固定为 `bykc`。 */
  source?: 'byxt' | 'bykc'
}

export type Shortcut = {
  id: string
  title: string
  url: string
  /** 主页行式瀑布流中的行号，0 起，见 docs/ui-lowfi.md。 */
  row: number
}

export type Todo = {
  id: string
  title: string
  dueAt: string | null
  note: string
  priority: 'high' | 'medium' | 'low'
  repeat: 'none' | 'daily' | 'weekly'
  done: boolean
  completedAt: string | null
  createdAt: string
}

export type PomodoroSettings = {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  roundsPerLongBreak: number
}

/** 番茄钟运行态只保存在当前页面内存中，见 docs/trd-phase2.md 7.5。 */
export type PomodoroRuntime = {
  phase: 'focus' | 'short-break' | 'long-break'
  endsAt: number | null
  remainingSeconds: number
  running: boolean
  paused: boolean
  completedRounds: number
  phaseDurationSeconds: number
  oneMinuteNotified: boolean
}

/** 用户在设置页维护的打卡目标。 */
export type YgdkSettings = {
  termTarget: number
  weekTarget: number
}

/* ---------- 缓存 ---------- */

export type WeekCache = {
  savedAt: string
  sectionTimes: SectionTime[]
  courses: Course[]
}

export type ScheduleCache = {
  savedAt: string
  term: Term
  weeks: Week[]
  currentWeek: number | null
  weekSource: WeekSource
  lastWeek: number | null
  byWeek: Record<number, WeekCache>
}

export type ExamsCache = {
  savedAt: string
  term: Term
  exams: Exam[]
}

export type SpocAssignmentsCache = {
  savedAt: string
  term: Term
  assignments: SpocAssignment[]
}

export type SpocDetailCache = {
  savedAt: string
  assignment: SpocAssignmentDetail
}

export type YgdkOverviewCache = {
  savedAt: string
  overview: YgdkOverview
}

/** 博雅广场每页独立缓存。 */
export type BykcCoursesCache = {
  savedAt: string
  page: number
  pageSize: number
  total: number
  totalPages: number
  courses: BykcCourse[]
}

export type BykcCourseCache = {
  savedAt: string
  course: BykcCourseDetail
}

/** 已选博雅课程缓存，见 docs/trd-phase2.md 5。 */
export type BykcChosenCache = {
  savedAt: string
  term: BykcChosenTerm
  courses: BykcChosenCourse[]
}

/* ---------- UI 状态与错误 ---------- */

export type SourceStatus =
  | 'idle'
  | 'loading'
  | 'ok'
  | 'cached'
  | 'error'
  | 'no-credential'
  | 'auth-expired'

/** 前端额外把网络失败、非 JSON 响应归为 RELAY_UNREACHABLE。 */
export type ApiErrorCode = RelayErrorCode | 'RELAY_UNREACHABLE'
