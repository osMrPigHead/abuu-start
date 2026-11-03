import { describe, expect, it } from 'vitest'
import {
  addDays,
  describeRelativeDay,
  formatDateKey,
  formatDayNumber,
  formatStamp,
  pad2,
  parseDateKey,
  startOfWeekMonday,
  weekdayCn,
} from '@/utils/date'
import {
  formatLocalDateTime,
  nextRepeatDueAt,
  parseLocalDateTime,
} from '@/utils/repeat'

describe('date utils', () => {
  it('pad2 补足两位', () => {
    expect(pad2(1)).toBe('01')
    expect(pad2(12)).toBe('12')
    expect(pad2(123)).toBe('123')
  })

  it('formatDateKey 使用本地日期并补零', () => {
    expect(formatDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
    expect(formatDateKey(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })

  it('parseDateKey 接受合法日期并返回本地零点', () => {
    const date = parseDateKey(' 2026-02-28 ')
    expect(date).not.toBeNull()
    expect(date?.getFullYear()).toBe(2026)
    expect(date?.getMonth()).toBe(1)
    expect(date?.getDate()).toBe(28)
    expect(date?.getHours()).toBe(0)
  })

  it('parseDateKey 拒绝错误格式和非法日期', () => {
    expect(parseDateKey('2026-2-3')).toBeNull()
    expect(parseDateKey('2026-02-30')).toBeNull()
    expect(parseDateKey('2026/02/03')).toBeNull()
    expect(parseDateKey('')).toBeNull()
  })

  it('addDays 跨月跨年并保留本地零点', () => {
    expect(formatDateKey(addDays(new Date(2026, 0, 31), 1))).toBe('2026-02-01')
    expect(formatDateKey(addDays(new Date(2026, 11, 31), 1))).toBe('2027-01-01')
    expect(formatDateKey(addDays(new Date(2026, 2, 1), -1))).toBe('2026-02-28')
  })

  it('startOfWeekMonday 返回自然周周一', () => {
    expect(formatDateKey(startOfWeekMonday(new Date(2026, 2, 2)))).toBe('2026-03-02')
    expect(formatDateKey(startOfWeekMonday(new Date(2026, 2, 8)))).toBe('2026-03-02')
    expect(formatDateKey(startOfWeekMonday(new Date(2026, 2, 4)))).toBe('2026-03-02')
  })

  it('formatStamp 支持 Date、毫秒和 ISO，非法值返回空串', () => {
    const date = new Date(2026, 0, 2, 3, 4)
    expect(formatStamp(date)).toBe('2026-01-02 03:04')
    expect(formatStamp(date.getTime())).toBe('2026-01-02 03:04')
    expect(formatStamp(date.toISOString())).toBe('2026-01-02 03:04')
    expect(formatStamp(null)).toBe('')
    expect(formatStamp(undefined)).toBe('')
    expect(formatStamp('')).toBe('')
    expect(formatStamp('not-a-date')).toBe('')
  })

  it('weekdayCn 和 describeRelativeDay 输出相对文案', () => {
    expect(weekdayCn(new Date(2026, 2, 1))).toBe('周日')
    expect(weekdayCn(new Date(2026, 2, 2))).toBe('周一')

    const today = new Date(2026, 2, 2, 10, 0)
    expect(describeRelativeDay(new Date(2026, 2, 2, 23, 0), today)).toBe('今天')
    expect(describeRelativeDay(new Date(2026, 2, 3, 1, 0), today)).toBe('明天')
    expect(describeRelativeDay(new Date(2026, 2, 4), today)).toBeNull()
  })

  it('formatDayNumber 不补前导零', () => {
    expect(formatDayNumber(new Date(2026, 2, 6))).toBe('6')
    expect(formatDayNumber(new Date(2026, 2, 26))).toBe('26')
  })
})

describe('repeat utils', () => {
  it('parseLocalDateTime 解析本地时间并支持可选秒', () => {
    const date = parseLocalDateTime('2026-03-02T08:05')
    expect(date).not.toBeNull()
    expect(date?.getFullYear()).toBe(2026)
    expect(date?.getMonth()).toBe(2)
    expect(date?.getDate()).toBe(2)
    expect(date?.getHours()).toBe(8)
    expect(date?.getMinutes()).toBe(5)
    expect(date?.getSeconds()).toBe(0)

    expect(parseLocalDateTime('2026-03-02T08:05:06')?.getSeconds()).toBe(6)
  })

  it('parseLocalDateTime 拒绝非法格式与溢出时间', () => {
    expect(parseLocalDateTime(null)).toBeNull()
    expect(parseLocalDateTime('2026-03-02 08:05')).toBeNull()
    expect(parseLocalDateTime('2026-02-30T08:05')).toBeNull()
    expect(parseLocalDateTime('2026-03-02T24:00')).toBeNull()
    expect(parseLocalDateTime('2026-03-02T08:60')).toBeNull()
  })

  it('formatLocalDateTime 与 Todo.dueAt 存储格式一致', () => {
    expect(formatLocalDateTime(new Date(2026, 2, 2, 8, 5))).toBe('2026-03-02T08:05')
    expect(formatLocalDateTime(new Date(2026, 10, 9, 0, 0))).toBe('2026-11-09T00:00')
  })

  it('nextRepeatDueAt 处理每日重复', () => {
    const now = new Date(2026, 2, 2, 9, 0)
    expect(nextRepeatDueAt('2026-03-02T08:00', 'daily', now)).toBe('2026-03-03T08:00')
    expect(nextRepeatDueAt('2026-02-27T08:00', 'daily', now)).toBe('2026-03-03T08:00')
  })

  it('nextRepeatDueAt 处理每周重复', () => {
    const now = new Date(2026, 2, 2, 9, 0)
    expect(nextRepeatDueAt('2026-03-02T08:00', 'weekly', now)).toBe('2026-03-09T08:00')
    expect(nextRepeatDueAt('2026-02-02T08:00', 'weekly', now)).toBe('2026-03-09T08:00')
  })

  it('nextRepeatDueAt 恰好在到期时刻继续顺延', () => {
    const now = new Date(2026, 2, 3, 8, 0)
    expect(nextRepeatDueAt('2026-03-02T08:00', 'daily', now)).toBe('2026-03-04T08:00')
  })

  it('nextRepeatDueAt 对不重复或非法输入返回 null', () => {
    const now = new Date(2026, 2, 2, 9, 0)
    expect(nextRepeatDueAt('2026-03-02T08:00', 'none', now)).toBeNull()
    expect(nextRepeatDueAt('bad', 'daily', now)).toBeNull()
  })
})
