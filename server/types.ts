/** 中继侧归一化类型，字段口径见 docs/trd.md 3.2 / 4、docs/api.md。 */

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

export type ByxtStatus = {
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
  weekSource: 'weeks' | 'classWeek' | 'default'
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

/** 阳光打卡概览，字段口径见 docs/trd-phase2.md 3.2 / 4。 */
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

/** 博雅课程列表项，见 docs/trd-phase2.md 3.2 / 4。 */
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

/** 博雅课程详情：列表项 + 纯文本简介。 */
export type BykcCourseDetail = BykcCourse & {
  descriptionText: string | null
}

/** 博雅课程广场分页结果。 */
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

/** byxt 统一响应信封。 */
export type ByxtEnvelope<T> = {
  code: string
  msg?: string | null
  datas: T
}

/** SPOC 统一响应信封。 */
export type SpocEnvelope<T> = {
  code: number
  msg?: string | null
  msg_en?: string | null
  content: T
}
