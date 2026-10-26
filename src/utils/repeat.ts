/** 重复待办的下一次截止时间计算，见 docs/trd.md 7.4。 */
import type { Todo } from '@/types'
import { pad2 } from '@/utils/date'

const LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
const DAY_MS = 86_400_000

/** "YYYY-MM-DDTHH:mm" 按本地时间解析；无效值返回 null。 */
export function parseLocalDateTime(value: string | null | undefined): Date | null {
  if (typeof value !== 'string') return null

  const match = LOCAL_DATE_TIME_RE.exec(value.trim())
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

  return date
}

/** Date -> 本地 "YYYY-MM-DDTHH:mm"，与 Todo.dueAt 的存储格式一致。 */
export function formatLocalDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/**
 * 计算重复待办的下一次截止时间：原截止时间加一个周期，
 * 若仍不晚于 now，则继续顺延到未来最近一次。
 */
export function nextRepeatDueAt(
  dueAt: string,
  repeat: Todo['repeat'],
  now: Date,
): string | null {
  if (repeat === 'none') return null

  const base = parseLocalDateTime(dueAt)
  if (!base) return null

  const stepDays = repeat === 'daily' ? 1 : 7
  const stepMs = stepDays * DAY_MS
  const elapsed = now.getTime() - base.getTime()

  // 先按毫秒差估算需要前进的周期数，再用本地日历日校正，避免夏令时造成偏差。
  let steps = Math.max(1, Math.floor(elapsed / stepMs) + 1)
  let next = addCalendarDays(base, steps * stepDays)

  while (next.getTime() <= now.getTime()) {
    steps += 1
    next = addCalendarDays(base, steps * stepDays)
  }

  return formatLocalDateTime(next)
}

function addCalendarDays(base: Date, days: number): Date {
  const next = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    base.getHours(),
    base.getMinutes(),
  )
  next.setDate(next.getDate() + days)
  return next
}
