import { describe, expect, it } from 'vitest'
import type { Course, SectionTime, Week } from '@/types'
import {
  DEFAULT_SECTION_TIMES,
  buildWeekDays,
  courseHighlightState,
  coursePlaceText,
  courseSectionLabel,
  courseTimeLabel,
  courseTimes,
  coursesOnDay,
  findCourseStates,
  findNextCourse,
  isoDayOfWeek,
  normalizeTime,
  resolveCurrentWeek,
  sortCourses,
  timeToMinutes,
  weekDateRange,
  weekNumberForDate,
} from '@/utils/schedule'

function course(overrides: Partial<Course> = {}): Course {
  return {
    courseCode: 'C1',
    courseName: '高等数学',
    beginSection: 1,
    endSection: 2,
    beginTime: null,
    endTime: null,
    placeName: '教1-101',
    weeksAndTeachers: '1-16周 · 张三',
    dayOfWeek: 1,
    ...overrides,
  }
}

const weeks: Week[] = [
  {
    serialNumber: 1,
    name: '第1周',
    startDate: '2026-02-23',
    endDate: '2026-03-01',
    curWeek: false,
  },
  {
    serialNumber: 2,
    name: '第2周',
    startDate: '2026-03-02',
    endDate: '2026-03-08',
    curWeek: true,
  },
  {
    serialNumber: 3,
    name: '第3周',
    startDate: '2026-03-09',
    endDate: '2026-03-15',
    curWeek: false,
  },
]

describe('schedule normalize', () => {
  it('normalizeTime 规范时间并拒绝非法值', () => {
    expect(normalizeTime('8:00:00')).toBe('08:00')
    expect(normalizeTime('08:05')).toBe('08:05')
    expect(normalizeTime('23:59')).toBe('23:59')
    expect(normalizeTime('24:00')).toBeNull()
    expect(normalizeTime('12:60')).toBeNull()
    expect(normalizeTime('')).toBeNull()
    expect(normalizeTime(null)).toBeNull()
  })

  it('timeToMinutes 转换分钟数', () => {
    expect(timeToMinutes('08:00')).toBe(480)
    expect(timeToMinutes('08:05')).toBe(485)
    expect(timeToMinutes('bad')).toBeNull()
  })

  it('courseTimes 优先使用上游起止时间', () => {
    const times = courseTimes(
      course({ beginTime: '08:10', endTime: '09:40' }),
      DEFAULT_SECTION_TIMES,
    )
    expect(times).toEqual({
      startText: '08:10',
      endText: '09:40',
      startMinutes: 490,
      endMinutes: 580,
    })
  })

  it('courseTimes 缺失上游时间时按节次查作息表', () => {
    const times = courseTimes(course(), DEFAULT_SECTION_TIMES)
    expect(times?.startText).toBe('08:00')
    expect(times?.endText).toBe('09:35')
  })

  it('courseTimes 在结束早于开始时钳制分钟数', () => {
    const times = courseTimes(
      course({ beginTime: '10:00', endTime: '09:00' }),
      DEFAULT_SECTION_TIMES,
    )
    expect(times?.endMinutes).toBe(times?.startMinutes)
    expect(times?.endText).toBe('09:00')
  })

  it('courseTimes 无法确定开始时间时返回 null', () => {
    expect(
      courseTimes(
        course({ beginSection: null, endSection: null, beginTime: null, endTime: null }),
        DEFAULT_SECTION_TIMES,
      ),
    ).toBeNull()
  })

  it('courseSectionLabel 处理单节、多节与缺失', () => {
    expect(courseSectionLabel(course({ beginSection: 1, endSection: 2 }))).toBe('第 1-2 节')
    expect(courseSectionLabel(course({ beginSection: 3, endSection: 3 }))).toBe('第 3 节')
    expect(courseSectionLabel(course({ beginSection: null, endSection: 4 }))).toBe('第 4 节')
    expect(courseSectionLabel(course({ beginSection: null, endSection: null }))).toBe('')
  })

  it('courseTimeLabel 和 coursePlaceText 组合展示文案', () => {
    expect(courseTimeLabel(course(), DEFAULT_SECTION_TIMES)).toBe('08:00-09:35')
    expect(courseTimeLabel(course({ beginTime: '08:00', endTime: '08:00' }), DEFAULT_SECTION_TIMES)).toBe(
      '08:00',
    )
    expect(coursePlaceText(course())).toBe('教1-101 · 1-16周 · 张三')
    expect(coursePlaceText(course({ weeksAndTeachers: null }))).toBe('教1-101')
    expect(coursePlaceText(course({ placeName: null }))).toBe('1-16周 · 张三')
  })

  it('sortCourses 按开始时间、节次、课程名排序', () => {
    const items = [
      course({ courseCode: 'B', courseName: 'B', beginSection: 3, endSection: 4 }),
      course({ courseCode: 'A', courseName: 'A', beginSection: 1, endSection: 2 }),
      course({ courseCode: 'C', courseName: 'C', beginSection: 1, endSection: 2 }),
    ]
    expect(sortCourses(items).map((item) => item.courseCode)).toEqual(['A', 'C', 'B'])
  })

  it('isoDayOfWeek 与 coursesOnDay', () => {
    expect(isoDayOfWeek(new Date(2026, 2, 1))).toBe(7)
    expect(isoDayOfWeek(new Date(2026, 2, 2))).toBe(1)
    const items = [course({ dayOfWeek: 1 }), course({ dayOfWeek: 2 })]
    expect(coursesOnDay(items, 1)).toHaveLength(1)
    expect(coursesOnDay(items, 2)).toHaveLength(1)
    expect(coursesOnDay(items, 3)).toHaveLength(0)
  })
})

describe('course highlight', () => {
  const date = new Date(2026, 2, 2)
  const sectionTimes: SectionTime[] = [
    { section: 1, start: '08:00', end: '08:45' },
    { section: 2, start: '08:50', end: '09:35' },
  ]

  it('进行中区间为 [开始, 结束)', () => {
    expect(
      courseHighlightState(course(), sectionTimes, date, new Date(2026, 2, 2, 8, 0), 30),
    ).toBe('ongoing')
    expect(
      courseHighlightState(course(), sectionTimes, date, new Date(2026, 2, 2, 9, 34), 30),
    ).toBe('ongoing')
    expect(
      courseHighlightState(course(), sectionTimes, date, new Date(2026, 2, 2, 9, 35), 30),
    ).toBeNull()
  })

  it('开始前 lead 分钟内为 upcoming，边界包含', () => {
    expect(
      courseHighlightState(course(), sectionTimes, date, new Date(2026, 2, 2, 7, 30), 30),
    ).toBe('upcoming')
    expect(
      courseHighlightState(course(), sectionTimes, date, new Date(2026, 2, 2, 7, 29), 30),
    ).toBeNull()
  })

  it('非法 now 返回 null，lead 不合法时使用默认值', () => {
    expect(
      courseHighlightState(course(), sectionTimes, date, new Date(Number.NaN), 30),
    ).toBeNull()
    expect(
      courseHighlightState(course(), sectionTimes, date, new Date(2026, 2, 2, 7, 45), Number.NaN),
    ).toBe('upcoming')
  })
})

describe('week resolution', () => {
  it('resolveCurrentWeek 优先 curWeek', () => {
    expect(resolveCurrentWeek(weeks, 3, new Date(2026, 1, 23))).toBe(2)
  })

  it('resolveCurrentWeek 其次按日期范围', () => {
    const noMarker = weeks.map((week) => ({ ...week, curWeek: false }))
    expect(resolveCurrentWeek(noMarker, 3, new Date(2026, 2, 4))).toBe(2)
  })

  it('resolveCurrentWeek 再使用 classWeek，最后返回 null', () => {
    expect(resolveCurrentWeek([], 3, new Date(2026, 2, 4))).toBe(3)
    expect(resolveCurrentWeek([], null, new Date(2026, 2, 4))).toBeNull()
    expect(resolveCurrentWeek([], 0, new Date(2026, 2, 4))).toBeNull()
  })

  it('weekDateRange 使用真实周起止日期', () => {
    const range = weekDateRange(2, { weeks, currentWeek: 2 }, new Date(2026, 2, 4))
    expect(range.start.getDate()).toBe(2)
    expect(range.end.getDate()).toBe(8)
  })

  it('weekDateRange 在缺日期或无周次表时推算', () => {
    const missingStart = weekDateRange(
      1,
      {
        weeks: [{ serialNumber: 1, name: '', startDate: '', endDate: '2026-03-08', curWeek: false }],
        currentWeek: 1,
      },
      new Date(2026, 2, 4),
    )
    expect(missingStart.start.getDate()).toBe(2)

    const fallback = weekDateRange(3, { weeks: [], currentWeek: 1 }, new Date(2026, 2, 4))
    expect(fallback.start.getDate()).toBe(16)
  })

  it('buildWeekDays 生成周一到周日', () => {
    const days = buildWeekDays(2, { weeks, currentWeek: 2 }, new Date(2026, 2, 4))
    expect(days).toHaveLength(7)
    expect(days.map((day) => day.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(days[0]?.date.getDate()).toBe(2)
  })

  it('weekNumberForDate 在真实周范围内匹配', () => {
    expect(
      weekNumberForDate(new Date(2026, 2, 4), { weeks, currentWeek: 2 }, new Date(2026, 2, 4)),
    ).toBe(2)
    expect(
      weekNumberForDate(new Date(2026, 3, 4), { weeks, currentWeek: 2 }, new Date(2026, 2, 4)),
    ).toBeNull()
  })

  it('weekNumberForDate 无周次表时按自然周差推算', () => {
    expect(
      weekNumberForDate(new Date(2026, 2, 11), { weeks: [], currentWeek: 2 }, new Date(2026, 2, 4)),
    ).toBe(3)
    expect(
      weekNumberForDate(new Date(2026, 2, 4), { weeks: [], currentWeek: null }, new Date(2026, 2, 4)),
    ).toBeNull()
  })
})

describe('findCourseStates', () => {
  const today = new Date(2026, 2, 2)
  const daySectionTimes = [...DEFAULT_SECTION_TIMES]

  it('可同时返回进行中与下一节', () => {
    const states = findCourseStates(
      {
        date: today,
        courses: [
          course({ courseCode: 'A', courseName: 'A', beginTime: '08:00', endTime: '09:00' }),
          course({ courseCode: 'B', courseName: 'B', beginTime: '10:00', endTime: '11:00' }),
        ],
        sectionTimes: daySectionTimes,
        loaded: true,
      },
      null,
      new Date(2026, 2, 2, 8, 30),
    )
    expect(states.ongoing?.course.courseCode).toBe('A')
    expect(states.ongoing?.remainingMinutes).toBe(30)
    expect(states.upcoming?.course.courseCode).toBe('B')
    expect(states.upcoming?.remainingMinutes).toBe(90)
  })

  it('没有进行中课程时下一节可以是明天', () => {
    const states = findCourseStates(
      {
        date: today,
        courses: [],
        sectionTimes: daySectionTimes,
        loaded: true,
      },
      {
        date: new Date(2026, 2, 3),
        courses: [course({ courseCode: 'T', beginTime: '08:00', endTime: '09:00' })],
        sectionTimes: daySectionTimes,
        loaded: true,
      },
      new Date(2026, 2, 2, 22, 0),
    )
    expect(states.ongoing).toBeNull()
    expect(states.upcoming?.course.courseCode).toBe('T')
    expect(states.upcoming?.dayOffset).toBe(1)
  })

  it('未加载的日期跳过，findNextCourse 优先进行中', () => {
    const todayInput = {
      date: today,
      courses: [course({ courseCode: 'A', beginTime: '08:00', endTime: '09:00' })],
      sectionTimes: daySectionTimes,
      loaded: false,
    }
    const tomorrowInput = {
      date: new Date(2026, 2, 3),
      courses: [course({ courseCode: 'B', beginTime: '08:00', endTime: '09:00' })],
      sectionTimes: daySectionTimes,
      loaded: true,
    }
    expect(findCourseStates(todayInput, tomorrowInput, new Date(2026, 2, 2, 7, 0)).ongoing).toBeNull()

    const ongoing = findNextCourse(
      {
        date: today,
        courses: [course({ courseCode: 'A', beginTime: '08:00', endTime: '09:00' })],
        sectionTimes: daySectionTimes,
        loaded: true,
      },
      null,
      new Date(2026, 2, 2, 8, 30),
    )
    expect(ongoing?.kind).toBe('ongoing')
  })

  it('没有课程时返回 null', () => {
    expect(
      findCourseStates(
        {
          date: today,
          courses: [],
          sectionTimes: daySectionTimes,
          loaded: true,
        },
        null,
        new Date(2026, 2, 2, 8, 0),
      ),
    ).toEqual({ ongoing: null, upcoming: null })
  })
})
