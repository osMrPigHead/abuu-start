import type { BackgroundManifest } from '@/types'
import { postJson, request } from './client'

/** 背景接口映射，见 docs/trd-phase3.md 3.3。 */
export function fetchBackgroundManifest(signal?: AbortSignal): Promise<BackgroundManifest> {
  return request<BackgroundManifest>('/api/background', { signal })
}

export function saveBackgroundDirectory(path: string): Promise<BackgroundManifest> {
  return postJson<BackgroundManifest>('/api/background/directory', { path })
}

export function rescanBackgroundDirectory(): Promise<BackgroundManifest> {
  return postJson<BackgroundManifest>('/api/background/rescan', {})
}

export function backgroundImageUrl(name: string): string {
  return `/api/background/image?name=${encodeURIComponent(name)}`
}
