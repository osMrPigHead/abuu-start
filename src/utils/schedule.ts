/** 课表纯计算：节次/时间、周视图、今日明日与下一节课，见 docs/trd.md 7.2。 */
import type { Course, SectionTime, Week } from '@/types'
import {
  addDays,
  formatDateKey,
  parseDateKey,
  startOfWeekMonday,
} from './date'

/** docs/api.md 1.2 的固定作息表。 */
export const DEFAULT_SECTION_TIMES: readonly SectionTime[] = [
  { section: 1, start: '08:00', end: '08:45' },
  { section: 2, start: '08:50', end: '09:35' },
  { section: 3, start: '09:50', end: '10:35' },
  { section: 4, start: '10:40', end: '11:25' },
  { section: 5, start: '11:30', end: '12:15' },
  { section: 6, start: '14:00', end: '14:45' },
  { section: 7, start: '14:50', end: '15:35' },
  { section: 8, start: '15:50', end: '16:35' },
  { section: 9, start: '16:40', end: '17:25' },
  { section: 10, start: '17:30', end: '18:15' },
  { section: 11, start: '19:00', end: '19:45' },
  { section: 12, start: '19:50', end: '20:35' },
  { section: 13, start: '20:40', end: '21:25' },
  { section: 14, start: '21:30', end: '22:15' },
]

/** 参考 A 的默认提前高亮边界（分钟），0 表示不提前高亮。 */
export const DEFAULT_HIGHLIGHT_LEAD_MINUTES = 30
export const MIN_HIGHLIGHT_LEAD_MINUTES = 0
export const MAX_HIGHLIGHT_LEAD_MINUTES = 180

export type CourseHighlight = 'upcoming' | 'ongoing' | null

export type WeekMeta = {
  weeks: Week[]
  currentWeek: number | null
}

export type WeekDay = {
  date: Date
  dayOfWeek: number
  weekNumber: number
}

export type CourseTime = {
  startText: string
  endText: string
  startMinutes: number
  endMinutes: number
}

export type DayCoursesInput = {
  date: Date
  courses: Course[]
  sectionTimes: SectionTime[]
  loaded: boolean
}

export type NextCourse = {
  kind: 'ongoing' | 'next'
  course: Course
  dayOffset: 0 | 1
  remainingMinutes: number
  startText: string
  endText: string
  startAt: Date
  endAt: Date
}

export type CourseStates = {
  ongoing: NextCourse | null
  upcoming: NextCourse | null
}

/** "8:00:00" / "08:00" -> "08:00"；无法解析返回 null。 */
export function normalizeTime(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null

  const match = value.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${match[2]}`
}

/** "08:00" -> 480。 */
export function timeToMinutes(value: string | null | undefined): number | null {
  const normalized = normalizeTime(value)
  if (!normalized) return null
  const [hour, minute] = normalized.split(':').map(Number)
  return hour * 60 + minute
}

export function sectionTimeFor(
  section: number | null,
  sectionTimes: readonly SectionTime[],
): SectionTime | null {
  if (section === null) return null
  return sectionTimes.find((item) => item.section === section) ?? null
}

/** 课程起止时间；优先上游 begin/endTime，缺失时按节次查作息表。 */
export function courseTimes(
  course: Course,
  sectionTimes: readonly SectionTime[],
): CourseTime | null {
  const beginSection = sectionTimeFor(course.beginSection, sectionTimes)
  const endSection = sectionTimeFor(course.endSection, sectionTimes)
  const startText = normalizeTime(course.beginTime) ?? beginSection?.start ?? null
  const rawEndText = normalizeTime(course.endTime) ?? endSection?.end ?? startText

  const startMinutes = timeToMinutes(startText)
  if (startMinutes === null) return null

  const endMinutes = timeToMinutes(rawEndText) ?? startMinutes
  return {
    startText: startText ?? '',
    endText: rawEndText ?? startText ?? '',
    startMinutes,
    endMinutes: endMinutes < startMinutes ? startMinutes : endMinutes,
  }
}

/** 如 "第 1-2 节"；无节次返回空串。 */
export function courseSectionLabel(course: Course): string {
  const begin = course.beginSection
  const end = course.endSection

  if (begin === null && end === null) return ''
  if (begin !== null && end !== null) {
    return begin === end ? `第 ${begin} 节` : `第 ${begin}-${end} 节`
  }
  return `第 ${begin ?? end} 节`
}

export function courseTimeLabel(
  course: Course,
  sectionTimes: readonly SectionTime[],
): string {
  const times = courseTimes(course, sectionTimes)
  if (!times) return ''
  return times.startText === times.endText
    ? times.startText
    : `${times.startText}-${times.endText}`
}

/**
 * 参考 A 的高亮判定：
 * - [开始, 结束) 内为进行中；
 * - (开始, 开始 + 提前边界] 内为即将开始；
 * - 其余不高亮。
 */
export function courseHighlightState(
  course: Course,
  sectionTimes: readonly SectionTime[],
  date: Date,
  now: Date,
  leadMinutes: number,
): CourseHighlight {
  const times = courseTimes(course, sectionTimes)
  if (!times || Number.isNaN(now.getTime())) return null

  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const start = addMinutes(dayStart, times.startMinutes)
  const end = addMinutes(dayStart, times.endMinutes)
  const nowTime = now.getTime()

  if (start.getTime() <= nowTime && nowTime < end.getTime()) return 'ongoing'

  const lead = Number.isFinite(leadMinutes)
    ? Math.max(0, Math.floor(leadMinutes))
    : DEFAULT_HIGHLIGHT_LEAD_MINUTES
  const minutesUntilStart = (start.getTime() - nowTime) / 60_000
  if (minutesUntilStart > 0 && minutesUntilStart <= lead) return 'upcoming'

  return null
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

/** "地点 · 教师/周次描述"；任一缺失时只显示存在的一项。 */
export function coursePlaceText(course: Course): string {
  const place = course.placeName?.trim() ?? ''
  const detail = course.weeksAndTeachers?.trim() ?? ''
  if (place.length > 0 && detail.length > 0) return `${place} · ${detail}`
  return place || detail
}

export function sortCourses(
  courses: readonly Course[],
  sectionTimes: readonly SectionTime[] = DEFAULT_SECTION_TIMES,
): Course[] {
  return [...courses].sort((left, right) => {
    const leftTime = courseTimes(left, sectionTimes)
    const rightTime = courseTimes(right, sectionTimes)
    const leftStart = leftTime?.startMinutes ?? Number.MAX_SAFE_INTEGER
    const rightStart = rightTime?.startMinutes ?? Number.MAX_SAFE_INTEGER
    if (leftStart !== rightStart) return leftStart - rightStart

    const leftSection = left.beginSection ?? Number.MAX_SAFE_INTEGER
    const rightSection = right.beginSection ?? Number.MAX_SAFE_INTEGER
    if (leftSection !== rightSection) return leftSection - rightSection

    return left.courseName.localeCompare(right.courseName, 'zh-Hans-CN')
  })
}

/** JS getDay()（周日 0）-> 教学日 1-7（周一 1、周日 7）。 */
export function isoDayOfWeek(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1
}

export function coursesOnDay(courses: readonly Course[], dayOfWeek: number): Course[] {
  return courses.filter((course) => course.dayOfWeek === dayOfWeek)
}

/**
 * 当前教学周：优先 curWeek，其次日期范围，最后使用 classWeek。
 * 都没有时返回 null，由调用方按默认第 1 周处理。
 */
export function resolveCurrentWeek(
  weeks: readonly Week[],
  fallback: number | null,
  now: Date,
): number | null {
  const marked = weeks.find((week) => week.curWeek)
  if (marked) return marked.serialNumber

  const todayKey = formatDateKey(now)
  const byDate = weeks.find(
    (week) =>
      week.startDate.length > 0 &&
      week.endDate.length > 0 &&
      todayKey >= week.startDate &&
      todayKey <= week.endDate,
  )
  if (byDate) return byDate.serialNumber

  if (fallback !== null && Number.isSafeInteger(fallback) && fallback > 0) {
    return fallback
  }
  return null
}

/**
 * 指定教学周的周一至周日。
 * weeks 中有该周时用真实起止日期，否则按当前自然周 + 周次差推算。
 */
export function weekDateRange(
  weekNumber: number,
  meta: WeekMeta,
  today: Date,
): { start: Date; end: Date } {
  const week = meta.weeks.find((item) => item.serialNumber === weekNumber)
  if (week) {
    const start = week.startDate.length > 0 ? parseDateKey(week.startDate) : null
    const end = week.endDate.length > 0 ? parseDateKey(week.endDate) : null

    if (start) {
      return {
        start,
        end: end && end.getTime() >= start.getTime() ? end : addDays(start, 6),
      }
    }
    if (end) {
      return { start: addDays(end, -6), end }
    }
  }

  const current = meta.currentWeek ?? 1
  const start = addDays(startOfWeekMonday(today), (weekNumber - current) * 7)
  return { start, end: addDays(start, 6) }
}

export function buildWeekDays(
  weekNumber: number,
  meta: WeekMeta,
  today: Date,
): WeekDay[] {
  const range = weekDateRange(weekNumber, meta, today)

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(range.start, index)
    return {
      date,
      dayOfWeek: isoDayOfWeek(date),
      weekNumber,
    }
  })
}

/**
 * 某日期所属教学周。
 * - 有周次表：只在真实周范围内返回周次；
 * - 无周次表：以当前自然周为 meta.currentWeek，按周差推算。
 */
export function weekNumberForDate(
  date: Date,
  meta: WeekMeta,
  today: Date,
): number | null {
  if (meta.weeks.length > 0) {
    const key = formatDateKey(date)
    const found = meta.weeks.find(
      (week) =>
        week.startDate.length > 0 &&
        week.endDate.length > 0 &&
        key >= week.startDate &&
        key <= week.endDate,
    )
    return found?.serialNumber ?? null
  }

  if (meta.currentWeek === null) return null

  const todayMonday = startOfWeekMonday(today).getTime()
  const dateMonday = startOfWeekMonday(date).getTime()
  const diffWeeks = Math.round((dateMonday - todayMonday) / (7 * 86_400_000))
  return meta.currentWeek + diffWeeks
}

/** 今日/明日课程中的“进行中”与“下一节”；两者可同时存在。 */
export function findCourseStates(
  today: DayCoursesInput,
  tomorrow: DayCoursesInput | null,
  now: Date,
): CourseStates {
  const timed: {
    course: Course
    dayOffset: 0 | 1
    time: CourseTime
    startAt: Date
    endAt: Date
  }[] = []

  const days: { input: DayCoursesInput; dayOffset: 0 | 1 }[] = [{ input: today, dayOffset: 0 }]
  if (tomorrow) days.push({ input: tomorrow, dayOffset: 1 })

  for (const day of days) {
    if (!day.input.loaded) continue
    const dayStart = new Date(
      day.input.date.getFullYear(),
      day.input.date.getMonth(),
      day.input.date.getDate(),
    )

    for (const course of day.input.courses) {
      const time = courseTimes(course, day.input.sectionTimes)
      if (!time) continue
      timed.push({
        course,
        dayOffset: day.dayOffset,
        time,
        startAt: addMinutes(dayStart, time.startMinutes),
        endAt: addMinutes(dayStart, time.endMinutes),
      })
    }
  }

  timed.sort((left, right) => left.startAt.getTime() - right.startAt.getTime())

  const ongoingItem = timed.find(
    (item) => item.startAt.getTime() <= now.getTime() && now.getTime() < item.endAt.getTime(),
  )
  const ongoing: NextCourse | null = ongoingItem
    ? {
        kind: 'ongoing',
        course: ongoingItem.course,
        dayOffset: ongoingItem.dayOffset,
        remainingMinutes: Math.max(
          1,
          Math.ceil((ongoingItem.endAt.getTime() - now.getTime()) / 60_000),
        ),
        startText: ongoingItem.time.startText,
        endText: ongoingItem.time.endText,
        startAt: ongoingItem.startAt,
        endAt: ongoingItem.endAt,
      }
    : null

  const upcomingItem = timed.find((item) => item.startAt.getTime() > now.getTime())
  const upcoming: NextCourse | null = upcomingItem
    ? {
        kind: 'next',
        course: upcomingItem.course,
        dayOffset: upcomingItem.dayOffset,
        remainingMinutes: Math.max(
          0,
          Math.ceil((upcomingItem.startAt.getTime() - now.getTime()) / 60_000),
        ),
        startText: upcomingItem.time.startText,
        endText: upcomingItem.time.endText,
        startAt: upcomingItem.startAt,
        endAt: upcomingItem.endAt,
      }
    : null

  return { ongoing, upcoming }
}

/** 兼容旧调用：有进行中课程时优先返回进行中。 */
export function findNextCourse(
  today: DayCoursesInput,
  tomorrow: DayCoursesInput | null,
  now: Date,
): NextCourse | null {
  const states = findCourseStates(today, tomorrow, now)
  return states.ongoing ?? states.upcoming
}
