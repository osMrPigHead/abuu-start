/** 本地存储键，见 docs/trd.md 5。 */
export const STORAGE_KEYS = {
  scheduleCache: 'buaa-start.cache.byxt.schedule.v1',
  examsCache: 'buaa-start.cache.byxt.exams.v1',
  spocAssignmentsCache: 'buaa-start.cache.spoc.assignments.v1',
  spocDetailCachePrefix: 'buaa-start.cache.spoc.detail.v1.',
  bykcCoursesCachePrefix: 'buaa-start.cache.bykc.courses.v1.',
  bykcCourseCachePrefix: 'buaa-start.cache.bykc.course.v1.',
  bykcChosenCache: 'buaa-start.cache.bykc.chosen.v1',
  ygdkOverviewCache: 'buaa-start.cache.ygdk.overview.v1',
  ygdkSettings: 'buaa-start.ygdk.settings.v1',
  todos: 'buaa-start.todos.v1',
  shortcuts: 'buaa-start.shortcuts.v1',
  pomodoroSettings: 'buaa-start.pomodoro.settings.v1',
  pomodoroNotifications: 'buaa-start.pomodoro.notifications.v1',
  scheduleHighlightLeadMinutes: 'buaa-start.schedule.highlightLeadMinutes.v1',
  homeCards: 'buaa-start.home.cards.v1',
  homeDisplay: 'buaa-start.home.display.v1',
} as const

const CACHE_PREFIX = 'buaa-start.cache.'


/** localStorage 不可用时降级为内存，页面可据此提示一次。 */
let storageDegraded = false
const memoryFallback = new Map<string, string>()

export function spocDetailCacheKey(assignmentId: string): string {
  return `${STORAGE_KEYS.spocDetailCachePrefix}${assignmentId}`
}

/** 广场缓存按页码与每页数量分键，见 docs/trd-phase2.md 5。 */
export function bykcCoursesCacheKey(page: number, pageSize: number): string {
  return `${STORAGE_KEYS.bykcCoursesCachePrefix}${page}.${pageSize}`
}

export function bykcCourseCacheKey(courseId: number): string {
  return `${STORAGE_KEYS.bykcCourseCachePrefix}${courseId}`
}

export function isStorageDegraded(): boolean {
  return storageDegraded
}

export function readJson<T>(key: string): T | null {
  const raw = readRaw(key)
  if (raw === null) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    removeRaw(key)
    return null
  }
}

export function writeJson(key: string, value: unknown): boolean {
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    return false
  }

  return writeRaw(key, serialized)
}

export function remove(key: string): void {
  removeRaw(key)
}

/** 旧明文凭据键；三阶段启动时删除，不尝试迁移，见 docs/trd-phase3.md 4.5。 */
export const LEGACY_CREDENTIALS_KEY = 'buaa-start.credentials.v1'

export function removeLegacyCredentials(): void {
  removeRaw(LEGACY_CREDENTIALS_KEY)
}

/** 只清理数据缓存，不碰凭据与本地待办。 */
export function clearCache(): void {
  const keys = new Set<string>()

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key?.startsWith(CACHE_PREFIX)) keys.add(key)
    }
  } catch {
    storageDegraded = true
  }

  for (const key of keys) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      storageDegraded = true
    }
  }

  for (const key of [...memoryFallback.keys()]) {
    if (key.startsWith(CACHE_PREFIX)) memoryFallback.delete(key)
  }
}

/** 删除指定前缀的缓存键；SPOC 详情按 id 分键。 */
export function removeKeysWithPrefix(prefix: string): void {
  const keys = new Set<string>()

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key?.startsWith(prefix)) keys.add(key)
    }
  } catch {
    storageDegraded = true
  }

  for (const key of keys) {
    removeRaw(key)
  }

  for (const key of [...memoryFallback.keys()]) {
    if (key.startsWith(prefix)) memoryFallback.delete(key)
  }
}

/** 只清理 SPOC 缓存，不碰凭据与本地待办。 */
export function clearSpocCaches(): void {
  removeRaw(STORAGE_KEYS.spocAssignmentsCache)
  removeKeysWithPrefix(STORAGE_KEYS.spocDetailCachePrefix)
}

/** 只清理阳光概览缓存；阳光目标属于用户偏好，不清除。 */
export function clearYgdkCaches(): void {
  removeRaw(STORAGE_KEYS.ygdkOverviewCache)
}

/** 只清理博雅广场列表、课程详情与已选课程缓存，不碰博雅凭据。 */
export function clearBykcCaches(): void {
  removeRaw(STORAGE_KEYS.bykcChosenCache)
  removeKeysWithPrefix(STORAGE_KEYS.bykcCoursesCachePrefix)
  removeKeysWithPrefix(STORAGE_KEYS.bykcCourseCachePrefix)
}


function readRaw(key: string): string | null {
  try {
    const value = window.localStorage.getItem(key)
    if (value !== null) return value
    return memoryFallback.get(key) ?? null
  } catch {
    storageDegraded = true
    return memoryFallback.get(key) ?? null
  }
}

function writeRaw(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
    memoryFallback.delete(key)
    return true
  } catch {
    storageDegraded = true
    memoryFallback.set(key, value)
    return false
  }
}

function removeRaw(key: string): void {
  memoryFallback.delete(key)
  try {
    window.localStorage.removeItem(key)
  } catch {
    storageDegraded = true
  }
}


