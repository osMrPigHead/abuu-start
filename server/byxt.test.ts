// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { byxtExams, byxtSchedule, byxtStatus } from './byxt.ts'

vi.mock('./authSession.ts', () => ({
  byxtCookieHeader: vi.fn(() => 'SESSION=abc'),
}))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function envelope(datas: unknown): Response {
  return jsonResponse({ code: '0', msg: '', datas })
}

function currentUser(overrides: Record<string, unknown> = {}): Response {
  return envelope({
    userId: 'u1',
    userName: '张三',
    welcomeInfo: {
      xnxqdm: '2026',
      xnxqmc: '2025-2026 学年春季学期',
      classWeek: '2',
      ...overrides,
    },
  })
}

function scheduleDetail(): Response {
  return envelope({
    sectionTimes: [
      { section: 1, start: '8:00', end: '8:45' },
      { section: 2, start: '8:50', end: '9:35' },
      { section: 3, start: '9:50', end: '10:35' },
    ],
    arrangedList: [
      {
        courseCode: 'C1',
        courseName: '高等数学',
        beginSection: '1',
        endSection: '2',
        beginTime: '8:00',
        endTime: null,
        placeName: ' 教1-101 ',
        weeksAndTeachers: '1-16周 · 张三',
        dayOfWeek: '1',
      },
      {
        courseCode: 'C2',
        courseName: ' ',
        beginSection: '3',
        endSection: '3',
        beginTime: null,
        endTime: null,
        placeName: '',
        weeksAndTeachers: '',
        dayOfWeek: '9',
      },
    ],
  })
}

function mockFetch(handler: (url: string) => Response): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (url: string) => handler(String(url)))
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('byxtStatus', () => {
  it('映射用户与当前学期', async () => {
    mockFetch((url) => {
      expect(url).toContain('currentUser.do')
      return currentUser()
    })

    await expect(byxtStatus()).resolves.toEqual({
      user: { id: 'u1', name: '张三' },
      term: { code: '2026', name: '2025-2026 学年春季学期' },
    })
  })

  it('登录失效时抛 AUTH_EXPIRED', async () => {
    mockFetch(() => new Response('<html>登录</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }))

    await expect(byxtStatus()).rejects.toMatchObject({ code: 'AUTH_EXPIRED' })
  })

  it('上游 5xx 抛 UPSTREAM_ERROR', async () => {
    mockFetch(() => new Response('bad gateway', { status: 502 }))
    await expect(byxtStatus()).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' })
  })
})

describe('byxtSchedule', () => {
  it('解析学期、周次、课程并按周次表定位当前周', async () => {
    mockFetch((url) => {
      if (url.includes('currentUser.do')) return currentUser()
      if (url.includes('getTermWeeks.do')) {
        return envelope([
          { serialNumber: '1', name: '第1周', startDate: '2026-02-23', endDate: '2026-03-01' },
          {
            serialNumber: '2',
            name: '第2周',
            startDate: '2026-03-02',
            endDate: '2026-03-08',
            curWeek: '1',
          },
        ])
      }
      if (url.includes('getMyScheduleDetail.do')) return scheduleDetail()
      return new Response('not found', { status: 404 })
    })

    const response = await byxtSchedule(
      new URL('http://127.0.0.1/api/byxt/schedule?week=2'),
    )

    expect(response.term.code).toBe('2026')
    expect(response.currentWeek).toBe(2)
    expect(response.weekSource).toBe('weeks')
    expect(response.warning).toBeNull()
    expect(response.week.number).toBe(2)
    expect(response.week.sectionTimes).toHaveLength(3)
    expect(response.week.courses[0]).toMatchObject({
      courseCode: 'C1',
      courseName: '高等数学',
      beginTime: '08:00',
      endTime: '09:35',
      placeName: '教1-101',
      dayOfWeek: 1,
    })
    expect(response.week.courses[1]).toMatchObject({
      courseName: '未知课程',
      beginTime: '09:50',
      endTime: '10:35',
      dayOfWeek: null,
    })
  })

  it('无周次表且无 classWeek 时默认第 1 周并带 warning', async () => {
    mockFetch((url) => {
      if (url.includes('currentUser.do')) {
        return currentUser({ classWeek: null })
      }
      if (url.includes('getTermWeeks.do')) return envelope([])
      if (url.includes('getMyScheduleDetail.do')) {
        return envelope({ sectionTimes: [], arrangedList: [] })
      }
      return new Response('not found', { status: 404 })
    })

    const response = await byxtSchedule(new URL('http://127.0.0.1/api/byxt/schedule'))
    expect(response.currentWeek).toBeNull()
    expect(response.weekSource).toBe('default')
    expect(response.week.number).toBe(1)
    expect(response.warning).toBe('无法确定当前教学周，已默认第 1 周')
    expect(response.week.sectionTimes).toHaveLength(14)
  })

  it('无周次表时使用 classWeek', async () => {
    mockFetch((url) => {
      if (url.includes('currentUser.do')) return currentUser({ classWeek: '5' })
      if (url.includes('getTermWeeks.do')) return envelope([])
      if (url.includes('getMyScheduleDetail.do')) {
        return envelope({ sectionTimes: [], arrangedList: [] })
      }
      return new Response('not found', { status: 404 })
    })

    const response = await byxtSchedule(new URL('http://127.0.0.1/api/byxt/schedule'))
    expect(response.currentWeek).toBe(5)
    expect(response.weekSource).toBe('classWeek')
    expect(response.warning).toBeNull()
  })

  it('非法周次参数抛 INVALID_WEEK', async () => {
    mockFetch((url) => {
      if (url.includes('currentUser.do')) return currentUser()
      if (url.includes('getTermWeeks.do')) return envelope([])
      return new Response('not found', { status: 404 })
    })

    await expect(
      byxtSchedule(new URL('http://127.0.0.1/api/byxt/schedule?week=abc')),
    ).rejects.toMatchObject({ code: 'INVALID_WEEK' })
    await expect(
      byxtSchedule(new URL('http://127.0.0.1/api/byxt/schedule?week=0')),
    ).rejects.toMatchObject({ code: 'INVALID_WEEK' })
  })
})

describe('byxtExams', () => {
  it('过滤未排定考试并保留可选字段', async () => {
    mockFetch((url) => {
      if (url.includes('currentUser.do')) return currentUser()
      if (url.includes('exams.do')) {
        return envelope([
          {
            courseName: '高等数学',
            courseNo: 'MATH1',
            examDate: '2026-03-10',
            startTime: '09:00',
            endTime: '11:00',
            examPlace: '主楼 101',
            examSeatNo: 'A1',
            week: '3',
            examTimeDescription: '以通知为准',
          },
          { courseName: '未排定' },
          null,
        ])
      }
      return new Response('not found', { status: 404 })
    })

    const response = await byxtExams()
    expect(response.term.code).toBe('2026')
    expect(response.exams).toHaveLength(1)
    expect(response.exams[0]).toMatchObject({
      courseName: '高等数学',
      courseNo: 'MATH1',
      week: 3,
      examSeatNo: 'A1',
    })
    expect(response.exams[0]?.examPlace).toBe('主楼 101')
  })

  it('datas 为 null 时返回空列表', async () => {
    mockFetch((url) => {
      if (url.includes('currentUser.do')) return currentUser()
      if (url.includes('exams.do')) return jsonResponse({ code: '0', datas: null })
      return new Response('not found', { status: 404 })
    })

    await expect(byxtExams()).resolves.toMatchObject({ exams: [] })
  })
})
