/** 前端数据类型，字段口径见 docs/trd.md 4。 */

export type Term = {
  code: string
  name: string
}

export type Week = {
  serialNumber: number
  name: string
  startDate: string
  endDate: string
  curWeek: boolean
}

export type SectionTime = {
  section: number
  start: string
  end: string
}

export type Course = {
  courseCode: string
  courseName: string
  beginSection: number | null
  endSection: number | null
  beginTime: string | null
  endTime: string | null
  placeName: string | null
  weeksAndTeachers: string | null
  dayOfWeek: number | null
}

export type Exam = {
  courseName: string
  courseNo?: string
  examDate?: string
  startTime?: string
  endTime?: string
  examPlace?: string
  examSeatNo?: string
  week?: number
  examTimeDescription?: string
}

export type SpocAssignment = {
  assignmentId: string
  courseId: string
  courseName: string
  teacherName: string | null
  title: string
  startTime: string | null
  dueTime: string | null
  submissionStatus: 'submitted' | 'unsubmitted' | 'unknown'
  submissionStatusText: string
}

export type SpocAssignmentDetail = SpocAssignment & {
  score: string | null
  totalScore: string | null
  contentText: string | null
  attachments: { name: string }[]
  submittedAt: string | null
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

export type Credentials = {
  byxtCookie: string
  spocToken: string
  spocRoleCode: string
}

/* ---------- 中继响应 ---------- */

export type ByxtStatusResponse = {
  user: {
    id: string
    name: string
  }
  term: Term
}

export type WeekSource = 'weeks' | 'classWeek' | 'default'

export type ScheduleResponse = {
  term: Term
  weeks: Week[]
  currentWeek: number | null
  weekSource: WeekSource
  week: {
    number: number
    sectionTimes: SectionTime[]
    courses: Course[]
  }
  warning: string | null
}

export type ExamsResponse = {
  term: Term
  exams: Exam[]
}

export type SpocStatusResponse = {
  term: Term
}

export type SpocAssignmentsResponse = {
  term: Term
  assignments: SpocAssignment[]
}

export type SpocAssignmentDetailResponse = {
  assignment: SpocAssignmentDetail
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

/* ---------- 状态与错误 ---------- */

export type SourceStatus =
  | 'idle'
  | 'loading'
  | 'ok'
  | 'cached'
  | 'error'
  | 'no-credential'
  | 'auth-expired'

export type RelayErrorCode =
  | 'NO_CREDENTIAL'
  | 'AUTH_EXPIRED'
  | 'INVALID_REQUEST'
  | 'INVALID_WEEK'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'BAD_RESPONSE'
  | 'INTERNAL'

/** 前端额外把网络失败、非 JSON 响应归为 RELAY_UNREACHABLE。 */
export type ApiErrorCode = RelayErrorCode | 'RELAY_UNREACHABLE'

export type ErrorEnvelope = {
  error: {
    code: RelayErrorCode
    message: string
    upstreamStatus?: number
  }
}
