/** 考试时间解析、状态、分组与倒计时，见 docs/trd.md 7.2。 */
import type { Exam } from '@/types'
import { formatDateKey, pad2 } from './date'

export type ExamStatus = 'upcoming' | 'ongoing' | 'ended' | 'unknown'

export type ExamTiming = {
  startAt: Date | null
  endAt: Date | null
  /** 开始时间是否包含具体时分；仅有考试日期时为 false。 */
  startHasTime: boolean
  endHasTime: boolean
}

export type ExamEntry = {
  exam: Exam
  timing: ExamTiming
  status: ExamStatus
}

export type ExamGroup = {
  key: string
  label: string
  entries: ExamEntry[]
  ended: boolean
}

type ParsedDateTime = {
  date: Date
  hasTime: boolean
}

const EN_DASH = '\u2013'
const DAY_MS = 86_400_000

/**
 * 兼容 docs/api.md 1.2 提到的多格式：
 * `YYYY-MM-DD`、`YYYY-MM-DD HH:mm`、ISO 8601，以及中文/斜杠日期。
 */
export function parseExamDateTime(value: string | null | undefined): ParsedDateTime | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text.length === 0) return null

  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const parsed = new Date(text)
    if (Number.isNaN(parsed.getTime())) return null
    return { date: parsed, hasTime: /\d{2}:\d{2}/.test(text.slice(10)) }
  }

  const dateMatch = text.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/)
  if (!dateMatch) return null

  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  if (!isValidDate(year, month, day)) return null

  const timeMatch = text.slice(dateMatch[0].length).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  const hour = timeMatch ? Number(timeMatch[1]) : 0
  const minute = timeMatch ? Number(timeMatch[2]) : 0
  const second = timeMatch?.[3] ? Number(timeMatch[3]) : 0
  if (hour > 23 || minute > 59 || second > 59) return null

  return {
    date: new Date(year, month - 1, day, hour, minute, second),
    hasTime: timeMatch !== null,
  }
}

/** 仅解析 `HH:mm(:ss)`，用于和考试日期组合。 */
export function parseExamTimeOnly(
  value: string | null | undefined,
): { hour: number; minute: number; second: number } | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return null

  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = match[3] ? Number(match[3]) : 0
  if (hour > 23 || minute > 59 || second > 59) return null

  return { hour, minute, second }
}

export function examTiming(exam: Exam): ExamTiming {
  const dateParsed = parseExamDateTime(exam.examDate)
  const startParsed = parseExamDateTime(exam.startTime)
  const endParsed = parseExamDateTime(exam.endTime)

  let startAt: Date | null = null
  let startHasTime = false
  const startTimeOnly = parseExamTimeOnly(exam.startTime)

  // 上游 examDate 常在日期后带 00:00:00，具体时分以 startTime 为准。
  if (dateParsed) {
    if (startTimeOnly) {
      startAt = new Date(
        dateParsed.date.getFullYear(),
        dateParsed.date.getMonth(),
        dateParsed.date.getDate(),
        startTimeOnly.hour,
        startTimeOnly.minute,
        startTimeOnly.second,
      )
      startHasTime = true
    } else if (startParsed) {
      startAt = startParsed.date
      startHasTime = startParsed.hasTime
    } else {
      startAt = startOfDay(dateParsed.date)
    }
  } else if (startParsed) {
    startAt = startParsed.date
    startHasTime = startParsed.hasTime
  }

  let endAt: Date | null = null
  let endHasTime = false

  if (startAt) {
    if (endParsed) {
      if (endParsed.hasTime) {
        endAt = endParsed.date
        endHasTime = true
      } else {
        const dayEnd = new Date(endParsed.date)
        dayEnd.setHours(23, 59, 59, 999)
        endAt = dayEnd
      }
    } else {
      const endTimeOnly = parseExamTimeOnly(exam.endTime)
      if (endTimeOnly) {
        endAt = new Date(
          startAt.getFullYear(),
          startAt.getMonth(),
          startAt.getDate(),
          endTimeOnly.hour,
          endTimeOnly.minute,
          endTimeOnly.second,
        )
        endHasTime = true
        if (endAt.getTime() <= startAt.getTime()) {
          endAt = new Date(endAt.getTime() + DAY_MS)
        }
      } else {
        const dayEnd = new Date(startAt)
        dayEnd.setHours(23, 59, 59, 999)
        endAt = dayEnd
      }
    }
  }

  return { startAt, endAt, startHasTime, endHasTime }
}

export function examStatus(exam: Exam, now: Date): ExamStatus {
  const { startAt, endAt } = examTiming(exam)
  if (!startAt) return 'unknown'

  if (endAt && now.getTime() >= endAt.getTime()) return 'ended'
  if (now.getTime() >= startAt.getTime()) return 'ongoing'
  return 'upcoming'
}

export function isExamEnded(exam: Exam, now: Date): boolean {
  return examStatus(exam, now) === 'ended'
}

/** 未结束的考试按时间升序；已结束的考试按时间倒序。 */
export function sortExamEntries(entries: ExamEntry[], ended: boolean): ExamEntry[] {
  const sorted = [...entries]
  sorted.sort((left, right) => {
    const leftTime = timeOf(left)
    const rightTime = timeOf(right)
    if (leftTime === null && rightTime === null) {
      return left.exam.courseName.localeCompare(right.exam.courseName, 'zh-Hans-CN')
    }
    if (leftTime === null) return 1
    if (rightTime === null) return -1
    return ended ? rightTime - leftTime : leftTime - rightTime
  })
  return sorted
}

export function buildExamEntries(exams: readonly Exam[], now: Date): ExamEntry[] {
  return exams.map((exam) => ({
    exam,
    timing: examTiming(exam),
    status: examStatus(exam, now),
  }))
}

/** 主页最近三场：未结束考试中按开始时间最早取前 N 场。 */
export function recentExamEntries(
  exams: readonly Exam[],
  now: Date,
  limit = 3,
): ExamEntry[] {
  const active = buildExamEntries(exams, now).filter((entry) => entry.status !== 'ended')
  return sortExamEntries(active, false).slice(0, Math.max(0, limit))
}

/**
 * 未结束考试按月分组，月份升序；已结束考试单独成组，组内按时间倒序。
 * 无法解析时间的条目归入“时间待定”并置后。
 */
export function groupExams(
  exams: readonly Exam[],
  now: Date,
): { upcoming: ExamGroup[]; ended: ExamGroup[] } {
  const entries = buildExamEntries(exams, now)
  const upcomingEntries = sortExamEntries(
    entries.filter((entry) => entry.status !== 'ended'),
    false,
  )
  const endedEntries = sortExamEntries(
    entries.filter((entry) => entry.status === 'ended'),
    true,
  )

  const monthMap = new Map<string, ExamEntry[]>()
  const unknown: ExamEntry[] = []

  for (const entry of upcomingEntries) {
    const key = entry.timing.startAt ? monthKey(entry.timing.startAt) : ''
    if (key.length === 0) {
      unknown.push(entry)
      continue
    }
    const list = monthMap.get(key) ?? []
    list.push(entry)
    monthMap.set(key, list)
  }

  const upcoming: ExamGroup[] = [...monthMap.keys()]
    .sort()
    .map((key) => ({
      key,
      label: formatMonthLabel(key),
      entries: monthMap.get(key) ?? [],
      ended: false,
    }))

  if (unknown.length > 0) {
    upcoming.push({ key: 'unknown', label: '时间待定', entries: unknown, ended: false })
  }

  const ended: ExamGroup[] =
    endedEntries.length > 0
      ? [{ key: 'ended', label: '已结束', entries: endedEntries, ended: true }]
      : []

  return { upcoming, ended }
}

/** “MM 月 DD 日 HH:mm – HH:mm”；缺开始时间时回退时间描述。 */
export function formatExamTimeText(exam: Exam): string {
  const timing = examTiming(exam)
  const description = exam.examTimeDescription?.trim() ?? ''

  if (!timing.startAt) return description || '时间待定'

  const datePart = `${pad2(timing.startAt.getMonth() + 1)} 月 ${pad2(
    timing.startAt.getDate(),
  )} 日`

  if (!timing.startHasTime) return description || datePart

  const startText = `${datePart} ${pad2(timing.startAt.getHours())}:${pad2(
    timing.startAt.getMinutes(),
  )}`

  if (!timing.endAt || !timing.endHasTime) return startText

  return `${startText} ${EN_DASH} ${pad2(timing.endAt.getHours())}:${pad2(
    timing.endAt.getMinutes(),
  )}`
}

/** “X 校区 / 具体地点”；只有具体地点时原样显示。 */
export function formatExamPlace(exam: Exam): string {
  const place = exam.examPlace?.trim() ?? ''
  if (place.length === 0) return '地点待定'
  if (place.includes('/')) return place

  const match = place.match(/^(.*?校区)\s*(.+)$/)
  return match ? `${match[1]} / ${match[2]}` : place
}

export function formatExamSeat(exam: Exam): string {
  const seat = exam.examSeatNo?.trim() ?? ''
  return seat.length > 0 ? `座位 ${seat}` : '座位待定'
}

export function formatExamWeek(exam: Exam): string {
  return exam.week === undefined ? '周次待定' : `第 ${exam.week} 周`
}

/**
 * 剩余天数按本地自然日计算；当天显示“今天 HH:mm”。
 * 已结束返回“已结束”。
 */
export function formatExamCountdown(exam: Exam, now: Date): string {
  const timing = examTiming(exam)
  if (!timing.startAt) return '时间待定'
  if (timing.endAt && now.getTime() >= timing.endAt.getTime()) return '已结束'

  const today = startOfDay(now)
  const startDay = startOfDay(timing.startAt)
  const days = Math.round((startDay.getTime() - today.getTime()) / DAY_MS)

  if (days <= 0) {
    if (!timing.startHasTime) return '今天'
    return `今天 ${pad2(timing.startAt.getHours())}:${pad2(timing.startAt.getMinutes())}`
  }

  return `剩余 ${days} 天`
}

export function formatExamDateKey(exam: Exam): string {
  const { startAt } = examTiming(exam)
  return startAt ? formatDateKey(startAt) : ''
}

function timeOf(entry: ExamEntry): number | null {
  return entry.timing.startAt?.getTime() ?? null
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

function formatMonthLabel(key: string): string {
  const [year, month] = key.split('-')
  if (!year || !month) return key
  return `${year} 年 ${Number(month)} 月`
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  )
}
