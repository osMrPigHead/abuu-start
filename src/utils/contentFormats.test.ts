import { describe, expect, it } from 'vitest'
import type {
  BykcChosenCourse,
  SpocAssignment,
} from '@shared/api'
import {
  bykcChosenCourseOnDate,
  bykcChosenCoursesOnDate,
  bykcMetaLine,
  bykcPlaceText,
  bykcStatusLabel,
  formatBykcCardTime,
  formatBykcDetailTime,
  formatBykcListTime,
  parseBykcDateTime,
} from '@/utils/bykc'
import {
  filterOpenSpocAssignments,
  formatSpocDateTime,
  formatSpocDue,
  formatSpocStart,
  isValidSpocAssignmentId,
  parseSpocDateTime,
  spocCourseLine,
  spocSubmissionLabel,
} from '@/utils/spoc'
import {
  DEFAULT_YGDK_TERM_TARGET,
  DEFAULT_YGDK_WEEK_TARGET,
  isValidYgdkTermTarget,
  isValidYgdkUid,
  isValidYgdkWeekTarget,
  resolveYgdkTermTarget,
  resolveYgdkWeekLimit,
  ygdkProgressPercent,
} from '@/utils/ygdk'

function chosen(overrides: Partial<BykcChosenCourse> = {}): BykcChosenCourse {
  return {
    courseId: 1,
    courseName: '艺术与审美',
    startTime: '2026-03-02 08:00',
    endTime: '2026-03-02 09:30',
    place: '主楼 101',
    teacher: '李四',
    ...overrides,
  }
}

function assignment(overrides: Partial<SpocAssignment> = {}): SpocAssignment {
  return {
    assignmentId: 'abc_123',
    courseId: 'C1',
    courseName: '软件工程',
    teacherName: '王五',
    title: '第一次作业',
    startTime: '2026-02-20 08:00:00',
    dueTime: '2026-03-10 23:59:59',
    submissionStatus: 'unsubmitted',
    submissionStatusText: '未提交',
    ...overrides,
  }
}

describe('bykc utils', () => {
  it('bykcStatusLabel 覆盖所有状态', () => {
    expect(bykcStatusLabel('expired')).toBe('已过期')
    expect(bykcStatusLabel('selected')).toBe('已选')
    expect(bykcStatusLabel('preview')).toBe('预告')
    expect(bykcStatusLabel('ended')).toBe('选课结束')
    expect(bykcStatusLabel('full')).toBe('人数已满')
    expect(bykcStatusLabel('available')).toBe('可选')
  })

  it('parseBykcDateTime 严格解析日期时间', () => {
    const date = parseBykcDateTime('2026-03-02 08:05')
    expect(date).toEqual({ year: 2026, month: 3, day: 2, hour: 8, minute: 5 })
    expect(parseBykcDateTime('2026-03-02T08:05:06')?.hour).toBe(8)
    expect(parseBykcDateTime('2026-02-30 08:05')).toBeNull()
    expect(parseBykcDateTime(null)).toBeNull()
  })

  it('formatBykcCardTime / formatBykcListTime / formatBykcDetailTime', () => {
    expect(formatBykcCardTime('2026-03-02 08:05')).toBe('03-02 08:05')
    expect(formatBykcCardTime(null)).toBe('时间待定')

    expect(formatBykcListTime('2026-03-02 08:05', '2026-03-02 09:30')).toBe(
      '03-02 08:05 – 09:30',
    )
    expect(formatBykcListTime('2026-03-02 23:00', '2026-03-03 01:00')).toBe(
      '03-02 23:00 – 03-03 01:00',
    )
    expect(formatBykcListTime('2026-03-02 08:05', null)).toBe('03-02 08:05')
    expect(formatBykcListTime('bad', '2026-03-02 09:30')).toBe('时间待定')

    expect(formatBykcDetailTime('2026-03-02 08:05', '2026-03-02 09:30')).toBe(
      '2026-03-02 08:05 – 09:30',
    )
    expect(formatBykcDetailTime('2026-03-02 23:00', '2026-03-03 01:00')).toBe(
      '2026-03-02 23:00 – 2026-03-03 01:00',
    )
  })

  it('bykcPlaceText / bykcMetaLine', () => {
    expect(bykcPlaceText(null)).toBe('地点待定')
    expect(bykcPlaceText('  主楼  ')).toBe('主楼')
    expect(bykcMetaLine({ place: '主楼', teacher: '李四' })).toBe('主楼 · 李四')
    expect(bykcMetaLine({ place: null, teacher: null })).toBe('地点待定')
    expect(bykcMetaLine({ place: '主楼', teacher: null })).toBe('主楼')
  })

  it('bykcChosenCourseOnDate 转换指定日期的已选课程', () => {
    const converted = bykcChosenCourseOnDate(chosen(), new Date(2026, 2, 2))
    expect(converted).toEqual({
      courseCode: 'bykc-1',
      courseName: '艺术与审美',
      beginSection: null,
      endSection: null,
      beginTime: '08:00',
      endTime: '09:30',
      placeName: '主楼 101',
      weeksAndTeachers: '李四',
      dayOfWeek: 1,
      source: 'bykc',
    })
  })

  it('bykcChosenCourseOnDate 处理日期不匹配、跨天与非法开始时间', () => {
    expect(bykcChosenCourseOnDate(chosen(), new Date(2026, 2, 3))).toBeNull()
    expect(
      bykcChosenCourseOnDate(
        chosen({ endTime: '2026-03-03 01:00' }),
        new Date(2026, 2, 2),
      )?.endTime,
    ).toBeNull()
    expect(
      bykcChosenCourseOnDate(chosen({ startTime: 'bad' }), new Date(2026, 2, 2)),
    ).toBeNull()
  })

  it('bykcChosenCoursesOnDate 过滤无法转换的条目', () => {
    const courses = [
      chosen(),
      chosen({ courseId: 2, startTime: '2026-03-03 08:00' }),
      chosen({ courseId: 3, startTime: 'bad' }),
    ]
    expect(bykcChosenCoursesOnDate(courses, new Date(2026, 2, 2))).toHaveLength(1)
  })
})

describe('spoc utils', () => {
  it('isValidSpocAssignmentId 校验中继 id 格式', () => {
    expect(isValidSpocAssignmentId('abc_123-XYZ')).toBe(true)
    expect(isValidSpocAssignmentId('')).toBe(false)
    expect(isValidSpocAssignmentId('a'.repeat(129))).toBe(false)
    expect(isValidSpocAssignmentId('abc/def')).toBe(false)
  })

  it('parseSpocDateTime / formatSpocDateTime', () => {
    const date = parseSpocDateTime('2026-03-02 08:05:06')
    expect(date?.getHours()).toBe(8)
    expect(date?.getSeconds()).toBe(6)
    expect(parseSpocDateTime('2026-03-02T08:05')?.getMinutes()).toBe(5)
    expect(parseSpocDateTime('2026-02-30 08:05:06')).toBeNull()

    expect(formatSpocDateTime('2026-03-02 08:05:06')).toBe('2026-03-02 08:05')
    expect(formatSpocDateTime('bad')).toBe('')
  })

  it('截止与开始时间缺失时回退文案', () => {
    expect(formatSpocDue(null)).toBe('无截止时间')
    expect(formatSpocDue('2026-03-02 08:05:06')).toBe('2026-03-02 08:05')
    expect(formatSpocStart(null)).toBe('未知')
    expect(formatSpocStart('2026-03-02 08:05:06')).toBe('2026-03-02 08:05')
  })

  it('spocCourseLine / spocSubmissionLabel', () => {
    expect(spocCourseLine(assignment())).toBe('软件工程·王五')
    expect(spocCourseLine(assignment({ teacherName: null }))).toBe('软件工程')
    expect(spocSubmissionLabel(assignment())).toBe('未提交')
    expect(spocSubmissionLabel(assignment({ submissionStatus: 'submitted' }))).toBe('未知')
  })

  it('filterOpenSpocAssignments 只保留未提交且未截止作业', () => {
    const now = new Date(2026, 2, 2, 12, 0)
    const items = [
      assignment({ assignmentId: 'no-due', dueTime: null }),
      assignment({ assignmentId: 'future', dueTime: '2026-03-03 00:00:00' }),
      assignment({ assignmentId: 'past', dueTime: '2026-03-01 00:00:00' }),
      assignment({ assignmentId: 'invalid', dueTime: 'bad' }),
      assignment({ assignmentId: 'submitted', submissionStatus: 'submitted' }),
    ]
    expect(filterOpenSpocAssignments(items, now).map((item) => item.assignmentId)).toEqual([
      'no-due',
      'future',
      'invalid',
    ])
  })
})

describe('ygdk utils', () => {
  it('目标校验上下界', () => {
    expect(isValidYgdkTermTarget(1)).toBe(true)
    expect(isValidYgdkTermTarget(100)).toBe(true)
    expect(isValidYgdkTermTarget(0)).toBe(false)
    expect(isValidYgdkTermTarget(101)).toBe(false)
    expect(isValidYgdkWeekTarget(1)).toBe(true)
    expect(isValidYgdkWeekTarget(14)).toBe(true)
    expect(isValidYgdkWeekTarget(15)).toBe(false)
  })

  it('UID 必须是十进制安全整数', () => {
    expect(isValidYgdkUid('12345')).toBe(true)
    expect(isValidYgdkUid(' 12345 ')).toBe(true)
    expect(isValidYgdkUid('')).toBe(false)
    expect(isValidYgdkUid('12a')).toBe(false)
    expect(isValidYgdkUid('1234567890123456')).toBe(false)
  })

  it('resolveYgdkTermTarget 优先系统值，其次用户值，最后默认值', () => {
    expect(resolveYgdkTermTarget(20, 30)).toBe(20)
    expect(resolveYgdkTermTarget(0, 30)).toBe(30)
    expect(resolveYgdkTermTarget(0, 0)).toBe(DEFAULT_YGDK_TERM_TARGET)
    expect(resolveYgdkTermTarget(Number.NaN, 30)).toBe(30)
  })

  it('resolveYgdkWeekLimit 只使用用户设置', () => {
    expect(resolveYgdkWeekLimit(7)).toBe(7)
    expect(resolveYgdkWeekLimit(0)).toBe(DEFAULT_YGDK_WEEK_TARGET)
  })

  it('ygdkProgressPercent 封顶并取整', () => {
    expect(ygdkProgressPercent(0, 16)).toBe(0)
    expect(ygdkProgressPercent(8, 16)).toBe(50)
    expect(ygdkProgressPercent(20, 16)).toBe(100)
    expect(ygdkProgressPercent(1, 3)).toBe(33)
    expect(ygdkProgressPercent(1, 0)).toBe(0)
    expect(ygdkProgressPercent(Number.NaN, 16)).toBe(0)
  })
})
