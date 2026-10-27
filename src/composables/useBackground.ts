import { reactive } from 'vue'
import {
  backgroundImageUrl,
  fetchBackgroundManifest,
  rescanBackgroundDirectory,
  saveBackgroundDirectory,
} from '@/api/background'
import { ApiError } from '@/api/client'
import type { BackgroundImage, BackgroundManifest } from '@/types'
import { pickBuiltinBackground } from '@/utils/builtinBackground'

export type BackgroundBusyAction = 'save' | 'rescan' | 'clear'

type BackgroundState = {
  directory: string | null
  configured: boolean
  images: BackgroundImage[]
  selectedName: string | null
  warning: string | null
  message: string
  messageKind: 'info' | 'error'
  busy: BackgroundBusyAction | null
  fallback: boolean
  hydrated: boolean
}

const MAX_LOAD_ATTEMPTS = 3

const state = reactive<BackgroundState>({
  directory: null,
  configured: false,
  images: [],
  selectedName: null,
  warning: null,
  message: '',
  messageKind: 'info',
  busy: null,
  fallback: true,
  hydrated: false,
})

const failedNames = new Set<string>()
let consecutiveFailures = 0
let hydratePromise: Promise<void> | null = null
const builtinBackground = pickBuiltinBackground()

/**
 * 自定义随机背景的模块级单例。
 * 同一 SPA 会话内所有页面共用同一张图；刷新后重新随机。
 * 加载状态由 App.vue 的 img load/error 事件驱动，规则见 docs/trd-phase3.md 7.5 / 7.6。
 */
export function useBackground() {
  return {
    state,
    builtinBackground,
    hydrate,
    saveDirectory,
    clearDirectory,
    rescan,
    imageUrl: backgroundImageUrl,
    markLoaded,
    markFailed,
  }
}

function hydrate(): Promise<void> {
  if (hydratePromise) return hydratePromise

  hydratePromise = (async () => {
    try {
      const manifest = await fetchBackgroundManifest()
      applyManifest(manifest, true)
    } catch (error) {
      state.warning = backgroundErrorMessage(error)
      state.selectedName = null
      state.fallback = true
    } finally {
      state.hydrated = true
    }
  })()

  return hydratePromise
}

async function saveDirectory(path: string): Promise<boolean> {
  const trimmed = path.trim()
  if (trimmed.length === 0) {
    state.messageKind = 'error'
    state.message = '请输入背景目录的绝对路径'
    return false
  }

  state.busy = 'save'
  state.message = ''
  state.messageKind = 'info'

  try {
    const manifest = await saveBackgroundDirectory(trimmed)
    applyManifest(manifest, true)
    state.message = manifest.warning ? '已保存' : '已保存，背景已更新'
    return true
  } catch (error) {
    state.messageKind = 'error'
    state.message = backgroundErrorMessage(error)
    return false
  } finally {
    state.busy = null
  }
}

async function clearDirectory(): Promise<boolean> {
  state.busy = 'clear'
  state.message = ''
  state.messageKind = 'info'

  try {
    const manifest = await saveBackgroundDirectory('')
    applyManifest(manifest, false)
    state.message = '已清除，使用内置背景'
    return true
  } catch (error) {
    state.messageKind = 'error'
    state.message = backgroundErrorMessage(error)
    return false
  } finally {
    state.busy = null
  }
}

async function rescan(): Promise<boolean> {
  state.busy = 'rescan'
  state.message = ''
  state.messageKind = 'info'

  try {
    const manifest = await rescanBackgroundDirectory()
    applyManifest(manifest, false)
    state.message = '已重新扫描'
    return true
  } catch (error) {
    state.messageKind = 'error'
    state.message = backgroundErrorMessage(error)
    return false
  } finally {
    state.busy = null
  }
}

/** 应用清单；图片加载由 App.vue 的 img 事件驱动，不在此预加载。 */
function applyManifest(manifest: BackgroundManifest, pickNew: boolean): void {
  failedNames.clear()
  consecutiveFailures = 0
  state.directory = manifest.directory
  state.configured = manifest.configured
  state.images = manifest.images
  state.warning = manifest.warning
  state.hydrated = true

  if (!manifest.configured || manifest.images.length === 0) {
    state.selectedName = null
    state.fallback = true
    return
  }

  const currentStillAvailable =
    state.selectedName !== null &&
    manifest.images.some((image) => image.name === state.selectedName)

  if (!pickNew && currentStillAvailable) {
    state.fallback = false
    return
  }

  selectRandomImage(false)
}

/** 随机选图；同一会话内所有页面共用 selectedName。 */
function selectRandomImage(warnOnEmpty: boolean): void {
  const current = state.selectedName
  const available = state.images.filter((image) => !failedNames.has(image.name))
  let candidates = available.filter((image) => image.name !== current)

  // 只有当前图可用时允许重复，避免无谓回退内置背景。
  if (candidates.length === 0) candidates = available

  if (candidates.length === 0) {
    state.selectedName = null
    state.fallback = true
    if (warnOnEmpty) {
      state.warning = mergeWarning(state.warning, '自定义背景图片读取失败，已回退内置背景')
    }
    return
  }

  const index = Math.floor(Math.random() * candidates.length)
  state.selectedName = candidates[index]?.name ?? null
  state.fallback = state.selectedName === null
}

/** App.vue 的 img @load 调用；重置连续失败计数。 */
function markLoaded(name: string): void {
  if (state.selectedName !== name) return
  consecutiveFailures = 0
  state.fallback = false
}

/** App.vue 的 img @error 调用；换下一张，连续 3 张或全部失败后回退内置背景。 */
function markFailed(name: string): void {
  if (state.selectedName !== name) return
  if (!state.images.some((image) => image.name === name)) return
  if (failedNames.has(name)) return

  failedNames.add(name)
  consecutiveFailures += 1

  if (consecutiveFailures >= MAX_LOAD_ATTEMPTS) {
    state.selectedName = null
    state.fallback = true
    state.warning = mergeWarning(state.warning, '自定义背景图片读取失败，已回退内置背景')
    return
  }

  selectRandomImage(true)
}

function mergeWarning(existing: string | null, next: string): string {
  return existing ? `${existing}；${next}` : next
}

function backgroundErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return '背景加载失败，请确认本地中继已启动'
}
