import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Course, ScheduleCache, ScheduleResponse } from '@/types'
import { STORAGE_KEYS } from '@/utils/storage'

vi.mock('@/api/byxt', () => ({
  fetchByxtSchedule: vi.fn(),
}))

vi.mock('@/composables/useAuth', () => ({
  isAuthBlocked: vi.fn(() => false),
  markSourceExpired: vi.fn(),
}))

import { fetchByxtSchedule } from '@/api/byxt'
import { isAuthBlocked, markSourceExpired } from '@/composables/useAuth'

const fetchSchedule = vi.mocked(fetchByxtSchedule)
const authBlocked = vi.mocked(isAuthBlocked)
const markExpired = vi.mocked(markSourceExpired)

beforeEach(() => {
  authBlocked.mockReturnValue(false)
  fetchSchedule.mockReset()
  markExpired.mockClear()
})

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

function response(week = 2, overrides: Partial<ScheduleResponse['week']> = {}): ScheduleResponse {
  return {
    term: { code: '2026', name: '2025-2026 学年春季学期' },
    weeks: [
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
    ],
    currentWeek: 2,
    weekSource: 'weeks',
    week: {
      number: week,
      sectionTimes: [],
      courses: [course()],
      ...overrides,
    },
    warning: null,
  }
}

function cache(overrides: Partial<ScheduleCache> = {}): ScheduleCache {
  return {
    savedAt: new Date(2026, 2, 2, 8, 0).toISOString(),
    term: { code: '2026', name: '2025-2026 学年春季学期' },
    weeks: [
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
    ],
    currentWeek: 2,
    weekSource: 'weeks',
    lastWeek: 2,
    byWeek: {
      2: {
        savedAt: new Date(2026, 2, 2, 8, 0).toISOString(),
        sectionTimes: [],
        courses: [course({ courseName: '缓存课程' })],
      },
    },
    ...overrides,
  }
}

async function loadSchedule(cached?: ScheduleCache) {
  window.localStorage.clear()
  if (cached) {
    window.localStorage.setItem(STORAGE_KEYS.scheduleCache, JSON.stringify(cached))
  }
  vi.resetModules()
  const [mod, client] = await Promise.all([
    import('@/composables/useSchedule'),
    import('@/api/client'),
  ])
  return { ...mod, ApiError: client.ApiError }
}

describe('useSchedule hydration', () => {
  it('从缓存恢复 meta 与周条目', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 4, 10, 0))
    const { useSchedule } = await loadSchedule(cache())
    const schedule = useSchedule()

    expect(schedule.meta.term?.code).toBe('2026')
    expect(schedule.meta.currentWeek).toBe(2)
    expect(schedule.entries[2]?.status).toBe('cached')
    expect(schedule.entries[2]?.loaded).toBe(true)
    expect(schedule.entries[2]?.courses[0]?.courseName).toBe('缓存课程')
  })

  it('缓存中的周次表可重新定位当前周', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 4, 10, 0))
    const cached = cache({ currentWeek: 1, weekSource: 'default' })
    const { useSchedule } = await loadSchedule(cached)
    const schedule = useSchedule()
    expect(schedule.meta.currentWeek).toBe(2)
    expect(schedule.meta.weekSource).toBe('weeks')
    expect(schedule.meta.warning).toBeNull()
  })
})

describe('useSchedule refresh', () => {
  it('认证确认未登录时不请求并置 no-credential', async () => {
    authBlocked.mockReturnValue(true)
    const { useSchedule } = await loadSchedule(cache())
    const schedule = useSchedule()
    fetchSchedule.mockClear()

    await schedule.refreshCurrent()

    expect(fetchSchedule).not.toHaveBeenCalled()
    expect(schedule.boot.status).toBe('no-credential')
    expect(schedule.entries[2]?.status).toBe('no-credential')
    authBlocked.mockReturnValue(false)
  })

  it('刷新成功时更新条目并写入缓存', async () => {
    authBlocked.mockReturnValue(false)
    fetchSchedule.mockResolvedValue(response(2))
    const { useSchedule } = await loadSchedule()
    const schedule = useSchedule()

    await schedule.refreshCurrent()

    expect(schedule.boot.status).toBe('ok')
    expect(schedule.entries[2]?.status).toBe('ok')
    expect(schedule.entries[2]?.courses).toHaveLength(1)
    expect(window.localStorage.getItem(STORAGE_KEYS.scheduleCache)).not.toBeNull()
  })

  it('刷新失败但有缓存时保留 cached 并记录错误', async () => {
    authBlocked.mockReturnValue(false)
    const { useSchedule, ApiError } = await loadSchedule(cache())
    fetchSchedule.mockRejectedValue(new ApiError('UPSTREAM_ERROR', '上游故障', 502))
    const schedule = useSchedule()

    await schedule.refreshCurrent()

    expect(schedule.boot.status).toBe('error')
    expect(schedule.entries[2]?.status).toBe('cached')
    expect(schedule.entries[2]?.error).toBe('上游故障')
  })

  it('AUTH_EXPIRED 时标记数据源失效', async () => {
    authBlocked.mockReturnValue(false)
    markExpired.mockClear()
    const { useSchedule, ApiError } = await loadSchedule()
    fetchSchedule.mockRejectedValue(new ApiError('AUTH_EXPIRED', '登录已失效', 401))
    const schedule = useSchedule()

    await schedule.refreshCurrent()

    expect(markExpired).toHaveBeenCalledWith('byxt')
    expect(schedule.boot.status).toBe('auth-expired')
  })
})

describe('useSchedule week loading', () => {
  it('已加载周不重复请求，force 时重新请求', async () => {
    authBlocked.mockReturnValue(false)
    fetchSchedule.mockResolvedValue(response(3))
    const { useSchedule } = await loadSchedule()
    const schedule = useSchedule()

    await schedule.loadWeek(3)
    expect(fetchSchedule).toHaveBeenCalledTimes(1)
    expect(schedule.entries[3]?.loaded).toBe(true)

    await schedule.loadWeek(3)
    expect(fetchSchedule).toHaveBeenCalledTimes(1)

    await schedule.loadWeek(3, { force: true })
    expect(fetchSchedule).toHaveBeenCalledTimes(2)
  })

  it('非法周次直接忽略', async () => {
    authBlocked.mockReturnValue(false)
    fetchSchedule.mockClear()
    const { useSchedule } = await loadSchedule()
    const schedule = useSchedule()

    await schedule.loadWeek(0)
    await schedule.loadWeek(1.5)
    expect(fetchSchedule).not.toHaveBeenCalled()
  })

  it('clearScheduleData 清空缓存与内存状态', async () => {
    const { useSchedule } = await loadSchedule(cache())
    const schedule = useSchedule()
    schedule.clearScheduleData()

    expect(window.localStorage.getItem(STORAGE_KEYS.scheduleCache)).toBeNull()
    expect(schedule.meta.term).toBeNull()
    expect(schedule.entries[2]).toBeUndefined()
    expect(schedule.boot.status).toBe('idle')
  })
})
