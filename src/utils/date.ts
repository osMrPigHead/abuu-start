/** 日期与时间格式化，见 docs/trd.md 6 / 7.2。 */

export const WEEKDAYS_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** Date -> 本地日期键，不经过 UTC，避免时区偏移。 */
export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** "YYYY-MM-DD" -> 本地零点；格式或日期不合法时返回 null。 */
export function parseDateKey(key: string): Date | null {
  const match = key.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setDate(next.getDate() + days)
  return next
}

/** 所在自然周的周一（本地零点）。 */
export function startOfWeekMonday(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const offset = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - offset)
  return start
}

/** 毫秒/ISO/Date -> 本地 "YYYY-MM-DD HH:mm"；无效值返回空串。 */
export function formatStamp(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return `${formatDateKey(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export function weekdayCn(date: Date): string {
  return WEEKDAYS_CN[date.getDay()] ?? '周日'
}

/** 仅对今天/明天返回相对文案，其余日期返回 null。 */
export function describeRelativeDay(target: Date, today: Date): string | null {
  const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((targetStart.getTime() - todayStart.getTime()) / 86_400_000)

  if (days === 0) return '今天'
  if (days === 1) return '明天'
  return null
}

/** 主页/日程行首的大字日期数字，如 "26"；与参考 A 一致，不补前导零。 */
export function formatDayNumber(date: Date): string {
  return String(date.getDate())
}
