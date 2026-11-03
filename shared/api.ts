/**
 * 前端与本地中继共用的业务契约。
 * 中继按这些结构归一化上游数据，前端按同一结构读取；字段口径见 docs/trd.md 4、docs/api.md。
 */

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

export type WeekSource = 'weeks' | 'classWeek' | 'default'

/* ---------- 中继响应 ---------- */

export type ByxtStatusResponse = {
  user: {
    id: string
    name: string
  }
  term: Term
}

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

/* ---------- 本机中继状态 ---------- */

export type RelayHealthResponse = {
  ok: boolean
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
