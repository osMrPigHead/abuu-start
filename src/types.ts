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
  /** 课程来源；byxt 常规课表缺省，博雅已选课程固定为 `bykc`。 */
  source?: 'byxt' | 'bykc'
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

/** 阳光打卡概览，见 docs/trd-phase2.md 4。 */
export type YgdkOverview = {
  termName: string | null
  termCount: number
  termTarget: number
  weekCount: number
  weekTarget: number
}

/** 博雅课程状态，见 docs/api.md 3.3。 */
export type BykcCourseStatus =
  | 'expired'
  | 'selected'
  | 'preview'
  | 'ended'
  | 'full'
  | 'available'

/** 博雅课程列表项，见 docs/trd-phase2.md 4。 */
export type BykcCourse = {
  id: number
  courseName: string
  startTime: string | null
  endTime: string | null
  place: string | null
  teacher: string | null
  status: BykcCourseStatus
  selected: boolean
  currentCount: number | null
  maxCount: number
}

export type BykcCourseDetail = BykcCourse & {
  descriptionText: string | null
}

export type BykcCoursePage = {
  page: number
  pageSize: number
  total: number
  totalPages: number
  courses: BykcCourse[]
}

export type BykcStatusResponse = {
  user: {
    name: string
  }
  term: {
    name: string
  }
}

/** 已选博雅课程，见 docs/trd-phase2.md 4。 */
export type BykcChosenCourse = {
  courseId: number
  courseName: string
  startTime: string | null
  endTime: string | null
  place: string | null
  teacher: string | null
}

export type BykcChosenTerm = {
  name: string
  startDate: string
  endDate: string
}

export type BykcChosenResponse = {
  term: BykcChosenTerm
  courses: BykcChosenCourse[]
}

export type BykcCourseResponse = {
  course: BykcCourseDetail
}

/** 用户在设置页维护的打卡目标。 */
export type YgdkSettings = {
  termTarget: number
  weekTarget: number
}

/** 本机背景目录与第一层图片清单，见 docs/trd-phase3.md 3.3。 */
export type BackgroundImage = {
  name: string
  size: number
  modifiedAt: string
}

export type BackgroundManifest = {
  directory: string | null
  configured: boolean
  images: BackgroundImage[]
  warning: string | null
}

/* ---------- 认证 ---------- */

export type AuthSourceId = 'byxt' | 'spoc' | 'bykc' | 'ygdk'

export type AuthSourceStatus = 'unconfigured' | 'pending' | 'ready' | 'failed' | 'expired'

export type AuthSourceError = {
  code: string
  message: string
}

export type AuthSourceState = {
  status: AuthSourceStatus
  updatedAt: string | null
  error: AuthSourceError | null
}

export type AuthUser = {
  name: string
  schoolid: string
}

export type AuthSources = Record<AuthSourceId, AuthSourceState>

export type AuthStatusResponse = {
  authenticated: boolean
  user: AuthUser | null
  authenticatedAt: string | null
  persisted: boolean
  deriving: boolean
  sources: AuthSources
  warning?: string
}

export type AuthPreloadResponse = {
  loginId: string
  captchaRequired: boolean
  captcha?: {
    image: string
    expiresAt: string
  }
  alreadyLoggedIn: boolean
}

export type AuthLoginResponse = {
  authenticated: true
  user: AuthUser
  authenticatedAt: string
  persisted: boolean
  sources: AuthSources
  warning?: string
}

export type AuthSourceRetryResponse = {
  source: AuthSourceId
  status: AuthSourceStatus
  updatedAt: string | null
  error: AuthSourceError | null
}

export type AuthLogoutResponse = {
  ok: true
  warning?: string
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
  | 'AUTH_REQUIRED'
  | 'INVALID_CREDENTIALS'
  | 'CAPTCHA_REQUIRED'
  | 'CAPTCHA_INVALID'
  | 'PASSWORD_EXPIRED'
  | 'AUTH_EXPIRED'
  | 'LOGIN_IN_PROGRESS'
  | 'SOURCE_UNKNOWN'
  | 'SOURCE_BUSY'
  | 'INVALID_REQUEST'
  | 'INVALID_WEEK'
  | 'INVALID_PAGE'
  | 'INVALID_PATH'
  | 'PATH_UNAVAILABLE'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'FORBIDDEN_ORIGIN'
  | 'UNSUPPORTED_MEDIA'
  | 'PAYLOAD_TOO_LARGE'
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
