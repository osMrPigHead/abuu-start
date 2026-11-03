import { describe, expect, it } from 'vitest'
import type { Exam } from '@shared/api'
import {
  buildExamEntries,
  examStatus,
  examTiming,
  formatExamCountdown,
  formatExamDateKey,
  formatExamPlace,
  formatExamSeat,
  formatExamTimeText,
  formatExamWeek,
  groupExams,
  isExamEnded,
  parseExamDateTime,
  parseExamTimeOnly,
  recentExamEntries,
  sortExamEntries,
} from '@/utils/exams'

function exam(overrides: Partial<Exam> = {}): Exam {
  return {
    courseName: '高等数学',
    examDate: '2026-03-02',
    startTime: '08:00',
    endTime: '09:30',
    ...overrides,
  }
}

describe('exam datetime parsing', () => {
  it('parseExamDateTime 支持 ISO（带/不带时间）', () => {
    const withTime = parseExamDateTime('2026-03-02T08:30')
    expect(withTime).not.toBeNull()
    expect(withTime?.hasTime).toBe(true)
    expect(withTime?.date.getHours()).toBe(8)

    const dateOnly = parseExamDateTime('2026-03-02T00:00:00')
    expect(dateOnly?.hasTime).toBe(true)
  })

  it('parseExamDateTime 支持空格、中文和斜杠日期', () => {
    const space = parseExamDateTime('2026-03-02 08:30')
    expect(space?.date.getHours()).toBe(8)
    expect(space?.hasTime).toBe(true)

    const chinese = parseExamDateTime('2026年3月2日 08:30')
    expect(chinese?.date.getMonth()).toBe(2)
    expect(chinese?.date.getDate()).toBe(2)
    expect(chinese?.hasTime).toBe(true)

    const slash = parseExamDateTime('2026/03/02')
    expect(slash?.date.getDate()).toBe(2)
    expect(slash?.hasTime).toBe(false)
  })

  it('parseExamDateTime 拒绝非法值', () => {
    expect(parseExamDateTime(null)).toBeNull()
    expect(parseExamDateTime('')).toBeNull()
    expect(parseExamDateTime('2026-02-30')).toBeNull()
    expect(parseExamDateTime('2026-03-02 25:00')).toBeNull()
  })

  it('parseExamTimeOnly 解析纯时间', () => {
    expect(parseExamTimeOnly('8:05')).toEqual({ hour: 8, minute: 5, second: 0 })
    expect(parseExamTimeOnly('08:05:06')).toEqual({ hour: 8, minute: 5, second: 6 })
    expect(parseExamTimeOnly('24:00')).toBeNull()
    expect(parseExamTimeOnly(null)).toBeNull()
  })
})

describe('exam timing and status', () => {
  it('examTiming 组合考试日期与纯时间', () => {
    const timing = examTiming(exam())
    expect(timing.startAt?.getHours()).toBe(8)
    expect(timing.startAt?.getMinutes()).toBe(0)
    expect(timing.endAt?.getHours()).toBe(9)
    expect(timing.endAt?.getMinutes()).toBe(30)
    expect(timing.startHasTime).toBe(true)
    expect(timing.endHasTime).toBe(true)
  })

  it('examTiming 仅日期时补到当天结束', () => {
    const timing = examTiming({ courseName: '考试', examDate: '2026-03-02' })
    expect(timing.startAt?.getHours()).toBe(0)
    expect(timing.startHasTime).toBe(false)
    expect(timing.endAt?.getHours()).toBe(23)
    expect(timing.endAt?.getMinutes()).toBe(59)
    expect(timing.endAt?.getSeconds()).toBe(59)
    expect(timing.endHasTime).toBe(false)
  })

  it('examTiming 结束时间早于开始时顺延到次日', () => {
    const timing = examTiming(exam({ startTime: '23:00', endTime: '01:00' }))
    expect(timing.endAt?.getDate()).toBe(3)
    expect(timing.endAt?.getHours()).toBe(1)
  })

  it('examStatus 在开始和结束边界正确切换', () => {
    const item = exam()
    expect(examStatus(item, new Date(2026, 2, 2, 7, 59))).toBe('upcoming')
    expect(examStatus(item, new Date(2026, 2, 2, 8, 0))).toBe('ongoing')
    expect(examStatus(item, new Date(2026, 2, 2, 9, 30))).toBe('ended')
    expect(examStatus({ courseName: '无时间' }, new Date(2026, 2, 2, 9, 30))).toBe('unknown')
    expect(isExamEnded(item, new Date(2026, 2, 2, 9, 30))).toBe(true)
  })
})

describe('exam sorting and grouping', () => {
  const now = new Date(2026, 1, 1, 0, 0)

  const items: Exam[] = [
    exam({ courseName: '三月', examDate: '2026-03-10', startTime: '09:00' }),
    exam({ courseName: '二月', examDate: '2026-02-10', startTime: '09:00' }),
    exam({ courseName: '已结束', examDate: '2025-12-01', startTime: '09:00' }),
    exam({ courseName: '待定', examDate: undefined, startTime: undefined, endTime: undefined }),
  ]

  it('sortExamEntries 未结束升序、已结束降序、无时间置后', () => {
    const entries = buildExamEntries(items, now)
    const upcoming = sortExamEntries(
      entries.filter((entry) => entry.status !== 'ended'),
      false,
    )
    expect(upcoming.map((entry) => entry.exam.courseName)).toEqual(['二月', '三月', '待定'])

    const ended = sortExamEntries(
      entries.filter((entry) => entry.status === 'ended'),
      true,
    )
    expect(ended.map((entry) => entry.exam.courseName)).toEqual(['已结束'])
  })

  it('recentExamEntries 过滤已结束并限制数量', () => {
    expect(recentExamEntries(items, now, 2).map((entry) => entry.exam.courseName)).toEqual([
      '二月',
      '三月',
    ])
    expect(recentExamEntries(items, now, 0)).toEqual([])
  })

  it('groupExams 按月分组、待定置后、已结束独立成组', () => {
    const groups = groupExams(items, now)
    expect(groups.upcoming.map((group) => group.label)).toEqual([
      '2026 年 2 月',
      '2026 年 3 月',
      '时间待定',
    ])
    expect(groups.ended).toHaveLength(1)
    expect(groups.ended[0]?.label).toBe('已结束')
    expect(groups.ended[0]?.ended).toBe(true)
  })
})

describe('exam formatting', () => {
  it('formatExamTimeText 组合日期与时间', () => {
    expect(formatExamTimeText(exam())).toBe('03 月 02 日 08:00 – 09:30')
    expect(formatExamTimeText(exam({ endTime: undefined }))).toBe('03 月 02 日 08:00')
    expect(formatExamTimeText({ courseName: '考试', examDate: '2026-03-02' })).toBe(
      '03 月 02 日',
    )
    expect(
      formatExamTimeText({
        courseName: '考试',
        examDate: '2026-03-02',
        examTimeDescription: '以通知为准',
      }),
    ).toBe('以通知为准')
    expect(formatExamTimeText({ courseName: '考试' })).toBe('时间待定')
  })

  it('formatExamPlace 处理校区和空值', () => {
    expect(formatExamPlace({ courseName: '考试', examPlace: '学院路校区 主楼' })).toBe(
      '学院路校区 / 主楼',
    )
    expect(formatExamPlace({ courseName: '考试', examPlace: '主楼 / 101' })).toBe('主楼 / 101')
    expect(formatExamPlace({ courseName: '考试' })).toBe('地点待定')
  })

  it('formatExamSeat 和 formatExamWeek', () => {
    expect(formatExamSeat({ courseName: '考试', examSeatNo: 'A12' })).toBe('座位 A12')
    expect(formatExamSeat({ courseName: '考试' })).toBe('座位待定')
    expect(formatExamWeek({ courseName: '考试', week: 8 })).toBe('第 8 周')
    expect(formatExamWeek({ courseName: '考试' })).toBe('周次待定')
  })

  it('formatExamCountdown 按自然日计算', () => {
    expect(formatExamCountdown(exam(), new Date(2026, 2, 2, 7, 0))).toBe('今天 08:00')
    expect(formatExamCountdown({ courseName: '考试', examDate: '2026-03-02' }, new Date(2026, 2, 2, 7, 0))).toBe(
      '今天',
    )
    expect(formatExamCountdown(exam(), new Date(2026, 1, 28, 12, 0))).toBe('剩余 2 天')
    expect(formatExamCountdown(exam(), new Date(2026, 2, 2, 10, 0))).toBe('已结束')
    expect(formatExamCountdown({ courseName: '考试' }, new Date(2026, 2, 2))).toBe('时间待定')
  })

  it('formatExamDateKey 返回开始日期或空串', () => {
    expect(formatExamDateKey(exam())).toBe('2026-03-02')
    expect(formatExamDateKey({ courseName: '考试' })).toBe('')
  })
})
