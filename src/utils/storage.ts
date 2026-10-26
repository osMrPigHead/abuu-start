import type { Credentials } from '@/types'

/** 本地存储键，见 docs/trd.md 5。 */
export const STORAGE_KEYS = {
  credentials: 'buaa-start.credentials.v1',
  scheduleCache: 'buaa-start.cache.byxt.schedule.v1',
  examsCache: 'buaa-start.cache.byxt.exams.v1',
  spocAssignmentsCache: 'buaa-start.cache.spoc.assignments.v1',
  spocDetailCachePrefix: 'buaa-start.cache.spoc.detail.v1.',
  todos: 'buaa-start.todos.v1',
  shortcuts: 'buaa-start.shortcuts.v1',
  pomodoroSettings: 'buaa-start.pomodoro.settings.v1',
  scheduleHighlightLeadMinutes: 'buaa-start.schedule.highlightLeadMinutes.v1',
} as const

const CACHE_PREFIX = 'buaa-start.cache.'

const EMPTY_CREDENTIALS: Credentials = {
  byxtCookie: '',
  spocToken: '',
  spocRoleCode: '',
}

/** localStorage 不可用时降级为内存，页面可据此提示一次。 */
let storageDegraded = false
const memoryFallback = new Map<string, string>()

export function spocDetailCacheKey(assignmentId: string): string {
  return `${STORAGE_KEYS.spocDetailCachePrefix}${assignmentId}`
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

export function clearCredentials(): void {
  removeRaw(STORAGE_KEYS.credentials)
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

export function readCredentials(): Credentials {
  const stored = readJson<Partial<Credentials>>(STORAGE_KEYS.credentials)
  if (!stored) return { ...EMPTY_CREDENTIALS }

  return {
    byxtCookie: asString(stored.byxtCookie),
    spocToken: asString(stored.spocToken),
    spocRoleCode: asString(stored.spocRoleCode),
  }
}

export function writeCredentials(credentials: Credentials): boolean {
  return writeJson(STORAGE_KEYS.credentials, credentials)
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

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
