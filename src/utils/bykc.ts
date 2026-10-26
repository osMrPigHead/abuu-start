/** 博雅课程状态标签、时间与信息行文案，见 docs/ui-lowfi.md。 */
import type { BykcChosenCourse, BykcCourse, BykcCourseStatus, Course } from '@/types'
import { formatDateKey, pad2 } from '@/utils/date'
import { isoDayOfWeek } from '@/utils/schedule'

const BYKC_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/

type BykcDateTime = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

const STATUS_LABELS: Record<BykcCourseStatus, string> = {
  expired: '已过期',
  selected: '已选',
  preview: '预告',
  ended: '选课结束',
  full: '人数已满',
  available: '可选',
}

export function bykcStatusLabel(status: BykcCourseStatus): string {
  return STATUS_LABELS[status]
}

/** 严格解析 "YYYY-MM-DD HH:mm[:ss]"（本地时间，不做时区换算）；无效值返回 null。 */
export function parseBykcDateTime(value: string | null | undefined): BykcDateTime | null {
  if (typeof value !== 'string') return null

  const match = BYKC_DATE_TIME_RE.exec(value.trim())
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = match[6] === undefined ? 0 : Number(match[6])

  const date = new Date(year, month - 1, day, hour, minute, second, 0)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null
  }

  return { year, month, day, hour, minute }
}

/** 主页课程卡片的时间：`MM-DD HH:mm`；缺失或非法返回“时间待定”。 */
export function formatBykcCardTime(value: string | null): string {
  const date = parseBykcDateTime(value)
  if (!date) return '时间待定'

  return `${pad2(date.month)}-${pad2(date.day)} ${pad2(date.hour)}:${pad2(date.minute)}`
}

/** 广场列表的时间：`MM-DD HH:mm – HH:mm`，跨天时补全结束日期。 */
export function formatBykcListTime(startTime: string | null, endTime: string | null): string {
  const start = parseBykcDateTime(startTime)
  if (!start) return '时间待定'

  const startText = `${pad2(start.month)}-${pad2(start.day)} ${pad2(start.hour)}:${pad2(start.minute)}`
  const end = parseBykcDateTime(endTime)
  if (!end) return startText

  return sameDay(start, end)
    ? `${startText} – ${pad2(end.hour)}:${pad2(end.minute)}`
    : `${startText} – ${pad2(end.month)}-${pad2(end.day)} ${pad2(end.hour)}:${pad2(end.minute)}`
}

/** 详情 modal 的时间：`YYYY-MM-DD HH:mm – HH:mm`，跨天时补全结束日期。 */
export function formatBykcDetailTime(startTime: string | null, endTime: string | null): string {
  const start = parseBykcDateTime(startTime)
  if (!start) return '时间待定'

  const startText = `${start.year}-${pad2(start.month)}-${pad2(start.day)} ${pad2(start.hour)}:${pad2(start.minute)}`
  const end = parseBykcDateTime(endTime)
  if (!end) return startText

  return sameDay(start, end)
    ? `${startText} – ${pad2(end.hour)}:${pad2(end.minute)}`
    : `${startText} – ${end.year}-${pad2(end.month)}-${pad2(end.day)} ${pad2(end.hour)}:${pad2(end.minute)}`
}

/** 地点为空时显示“地点待定”。 */
export function bykcPlaceText(place: string | null): string {
  const text = place?.trim() ?? ''
  return text.length > 0 ? text : '地点待定'
}

/** 列表/详情的“地点 · 教师”；教师为空时只显示地点。 */
export function bykcMetaLine(course: Pick<BykcCourse, 'place' | 'teacher'>): string {
  const place = bykcPlaceText(course.place)
  const teacher = course.teacher?.trim() ?? ''
  return teacher.length > 0 ? `${place} · ${teacher}` : place
}

/**
 * 已选博雅课程在指定日期的日程项，见 docs/trd-phase2.md 7.2。
 * 开始时间缺失或不在该日时返回 null；结束时间跨天时只保留开始时间。
 */
export function bykcChosenCourseOnDate(
  course: BykcChosenCourse,
  date: Date,
): Course | null {
  const start = parseBykcDateTime(course.startTime)
  if (!start) return null

  const dateKey = `${start.year}-${pad2(start.month)}-${pad2(start.day)}`
  if (dateKey !== formatDateKey(date)) return null

  const end = parseBykcDateTime(course.endTime)
  const endTime =
    end && sameDay(start, end) ? `${pad2(end.hour)}:${pad2(end.minute)}` : null

  return {
    courseCode: `bykc-${course.courseId}`,
    courseName: course.courseName,
    beginSection: null,
    endSection: null,
    beginTime: `${pad2(start.hour)}:${pad2(start.minute)}`,
    endTime,
    placeName: course.place,
    weeksAndTeachers: course.teacher,
    dayOfWeek: isoDayOfWeek(date),
    source: 'bykc',
  }
}

/** 指定日期的全部博雅课程；无法解析开始时间的条目跳过。 */
export function bykcChosenCoursesOnDate(
  courses: readonly BykcChosenCourse[],
  date: Date,
): Course[] {
  const result: Course[] = []
  for (const course of courses) {
    const converted = bykcChosenCourseOnDate(course, date)
    if (converted) result.push(converted)
  }
  return result
}

function sameDay(left: BykcDateTime, right: BykcDateTime): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day
}
