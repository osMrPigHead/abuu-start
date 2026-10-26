/** 阳光打卡概览：缓存优先、独立数据源状态，见 docs/trd-phase2.md 7.4 / 7.6。 */
import { reactive } from 'vue'
import { ApiError } from '@/api/client'
import { fetchYgdkOverview } from '@/api/ygdk'
import { markYgdkAuthExpired } from '@/composables/useCredentials'
import type { SourceStatus, YgdkOverview, YgdkOverviewCache } from '@/types'
import {
  clearYgdkCaches,
  readCredentials,
  readJson,
  STORAGE_KEYS,
  writeJson,
} from '@/utils/storage'

type YgdkState = {
  status: SourceStatus
  overview: YgdkOverview | null
  savedAt: string | null
  error: string | null
  loading: boolean
  hydrated: boolean
}

type MappedError = {
  status: SourceStatus
  message: string
}

const state = reactive<YgdkState>({
  status: 'idle',
  overview: null,
  savedAt: null,
  error: null,
  loading: false,
  hydrated: false,
})

let requestId = 0

export function useYgdk() {
  hydrate()

  return {
    state,
    hydrate,
    refresh,
    clearYgdkData,
  }
}

function hydrate(): void {
  if (state.hydrated) return
  state.hydrated = true

  const cache = readOverviewCache()
  if (!cache) return

  state.overview = cache.overview
  state.savedAt = cache.savedAt
  state.status = hasYgdkCredentials() ? 'cached' : 'no-credential'
}

async function refresh(): Promise<void> {
  hydrate()

  if (!hasYgdkCredentials()) {
    state.status = 'no-credential'
    state.error = null
    state.loading = false
    return
  }

  const hadData = state.savedAt !== null
  const currentRequest = ++requestId

  state.loading = true
  state.error = null
  if (!hadData) {
    state.status = 'loading'
  } else if (state.status === 'no-credential' || state.status === 'auth-expired') {
    state.status = 'cached'
  }

  try {
    const overview = await fetchYgdkOverview()
    if (currentRequest !== requestId) return

    state.overview = overview
    state.savedAt = new Date().toISOString()
    state.status = 'ok'
    state.error = null
    state.loading = false
    persistOverview()
  } catch (error) {
    if (currentRequest !== requestId) return

    const mapped = mapYgdkError(error)
    if (mapped.status === 'auth-expired') markYgdkAuthExpired()

    state.loading = false
    state.error = mapped.message

    if (hadData) {
      state.status = mapped.status === 'error' ? 'cached' : mapped.status
    } else {
      state.status = mapped.status
      state.overview = null
      state.savedAt = null
    }
  }
}

function clearYgdkData(): void {
  clearYgdkCaches()

  state.status = 'idle'
  state.overview = null
  state.savedAt = null
  state.error = null
  state.loading = false
  state.hydrated = true
  requestId += 1
}

/* ------------------------------- 缓存读写 ------------------------------- */

function readOverviewCache(): YgdkOverviewCache | null {
  const raw = readJson<unknown>(STORAGE_KEYS.ygdkOverviewCache)
  if (!isRecord(raw)) return null

  const overview = normalizeOverview(raw.overview)
  if (!overview) return null

  const savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : ''
  return { savedAt, overview }
}

function persistOverview(): void {
  if (!state.overview || state.savedAt === null) return

  writeJson(STORAGE_KEYS.ygdkOverviewCache, {
    savedAt: state.savedAt,
    overview: state.overview,
  } satisfies YgdkOverviewCache)
}

/* ------------------------------- 归一化 ------------------------------- */

function normalizeOverview(value: unknown): YgdkOverview | null {
  if (!isRecord(value)) return null

  return {
    termName: typeof value.termName === 'string' && value.termName.trim().length > 0
      ? value.termName.trim()
      : null,
    termCount: readCount(value.termCount),
    termTarget: readCount(value.termTarget),
    weekCount: readCount(value.weekCount),
    weekTarget: readCount(value.weekTarget),
  }
}

function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

/* ------------------------------- 错误映射 ------------------------------- */

function mapYgdkError(error: unknown): MappedError {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'NO_CREDENTIAL':
        return { status: 'no-credential', message: '未配置阳光打卡 UID 与 token' }
      case 'AUTH_EXPIRED':
        return {
          status: 'auth-expired',
          message: '阳光打卡登录状态已失效，请到设置页更新 UID 与 token',
        }
      default:
        return { status: 'error', message: error.message || '阳光打卡概览加载失败' }
    }
  }

  return { status: 'error', message: '阳光打卡概览加载失败，请稍后重试' }
}

/* ------------------------------- 基础辅助 ------------------------------- */

function hasYgdkCredentials(): boolean {
  const credentials = readCredentials()
  return credentials.ygdkUid.trim().length > 0 && credentials.ygdkToken.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
