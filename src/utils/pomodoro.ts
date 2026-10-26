/**
 * 番茄钟配置校验、阶段推进、时间格式化、提示音与桌面通知，见
 * docs/trd.md 7.5 与 docs/trd-phase2.md 7.5。
 * 纯函数负责规则；Web Audio 只在用户手势后创建，播放失败不影响计时。
 */
import type { PomodoroSettings } from '@/types'
import { pad2 } from '@/utils/date'

export type PomodoroPhase = 'focus' | 'short-break' | 'long-break'

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  roundsPerLongBreak: 4,
}

export const POMODORO_LIMITS = {
  focusMinutes: { min: 1, max: 180 },
  shortBreakMinutes: { min: 1, max: 60 },
  longBreakMinutes: { min: 1, max: 60 },
  roundsPerLongBreak: { min: 1, max: 12 },
} as const

/** 结束前 1 分钟通知的边界；阶段时长必须大于该值才会触发。 */
export const POMODORO_ONE_MINUTE_SECONDS = 60

export const POMODORO_PHASE_LABELS: Record<PomodoroPhase, string> = {
  focus: '专注',
  'short-break': '短休',
  'long-break': '长休',
}

const SETTINGS_FIELDS = [
  'focusMinutes',
  'shortBreakMinutes',
  'longBreakMinutes',
  'roundsPerLongBreak',
] as const

type SettingsField = (typeof SETTINGS_FIELDS)[number]

/** 返回第一处不合法配置的中文提示；全部合法时返回 null。 */
export function validatePomodoroSettings(settings: PomodoroSettings): string | null {
  for (const field of SETTINGS_FIELDS) {
    const value = settings[field]
    const limit = POMODORO_LIMITS[field]
    if (!Number.isInteger(value) || value < limit.min || value > limit.max) {
      return `${fieldLabel(field)}需为 ${limit.min}–${limit.max} 的整数`
    }
  }

  return null
}

/** 读取本地配置或旧数据时的兜底：逐字段校验，非法字段回退默认值。 */
export function sanitizePomodoroSettings(value: unknown): PomodoroSettings {
  const record = isRecord(value) ? value : {}
  const result = { ...DEFAULT_POMODORO_SETTINGS }

  for (const field of SETTINGS_FIELDS) {
    const candidate = record[field]
    if (isValidFieldValue(field, candidate)) {
      result[field] = candidate
    }
  }

  return result
}

/**
 * 判断本地是否已经保存过一份完整可用的专注配置。
 * 只有四个字段都合法时才视为“已配置”，用于决定首屏显示配置页还是专注页。
 */
export function hasPomodoroSettings(value: unknown): boolean {
  if (!isRecord(value)) return false
  return SETTINGS_FIELDS.every((field) => isValidFieldValue(field, value[field]))
}

export function pomodoroPhaseSeconds(
  settings: PomodoroSettings,
  phase: PomodoroPhase,
): number {
  switch (phase) {
    case 'short-break':
      return settings.shortBreakMinutes * 60
    case 'long-break':
      return settings.longBreakMinutes * 60
    default:
      return settings.focusMinutes * 60
  }
}

/** 专注结束后按已完成轮次决定短休/长休；休息结束后回到专注。 */
export function nextPomodoroPhase(
  phase: PomodoroPhase,
  completedRounds: number,
  settings: PomodoroSettings,
): PomodoroPhase {
  if (phase !== 'focus') return 'focus'

  return completedRounds > 0 && completedRounds % settings.roundsPerLongBreak === 0
    ? 'long-break'
    : 'short-break'
}

/** 剩余时间按 mm:ss 显示；超过 99 分钟时分钟位自然增长。 */
export function formatPomodoroClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${pad2(seconds % 60)}`
}

/** 预计完成时间显示为本地 HH:mm。 */
export function formatPomodoroFinish(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function fieldLabel(field: SettingsField): string {
  switch (field) {
    case 'focusMinutes':
      return '专注时长'
    case 'shortBreakMinutes':
      return '短休时长'
    case 'longBreakMinutes':
      return '长休时长'
    default:
      return '每几轮进入长休'
  }
}

function isValidFieldValue(field: SettingsField, value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return false

  const limit = POMODORO_LIMITS[field]
  return value >= limit.min && value <= limit.max
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/* ---------- 提示音 ---------- */

let audioContext: AudioContext | null = null
let audioUnavailable = false

/**
 * 在用户点击开始时调用，提前创建/恢复 AudioContext。
 * 浏览器若拦截自动播放，后续提示音播放失败也不会影响计时。
 */
export function primePomodoroAudio(): void {
  const context = resolveAudioContext()
  if (!context) return

  if (context.state === 'suspended') {
    void context.resume().catch(() => {})
  }
}

/** 阶段结束时播放三音提示；播放失败静默忽略。 */
export function playPomodoroChime(): void {
  const context = resolveAudioContext()
  if (!context) return

  const schedule = (): void => {
    const startAt = context.currentTime + 0.02
    const tones = [
      { frequency: 880, offset: 0, duration: 0.16 },
      { frequency: 1174.66, offset: 0.2, duration: 0.16 },
      { frequency: 1567.98, offset: 0.4, duration: 0.34 },
    ]

    for (const tone of tones) {
      const begin = startAt + tone.offset
      const end = begin + tone.duration
      const oscillator = context.createOscillator()
      const gain = context.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(tone.frequency, begin)
      gain.gain.setValueAtTime(0.0001, begin)
      gain.gain.exponentialRampToValueAtTime(0.16, begin + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, end)

      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(begin)
      oscillator.stop(end + 0.02)
    }
  }

  if (context.state === 'suspended') {
    void context.resume().then(schedule).catch(() => {})
    return
  }

  try {
    schedule()
  } catch {
    // 提示音失败不能阻塞阶段推进。
  }
}

function resolveAudioContext(): AudioContext | null {
  if (audioUnavailable || typeof window === 'undefined') return null
  if (audioContext) return audioContext

  const Constructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Constructor) {
    audioUnavailable = true
    return null
  }

  try {
    audioContext = new Constructor()
  } catch {
    audioUnavailable = true
    return null
  }

  return audioContext
}

/* ---------- 桌面通知 ---------- */

export type PomodoroNotificationKind = 'one-minute' | 'phase-end'

const NOTIFICATION_TITLE = '航启番茄钟'
const NOTIFICATION_TAGS: Record<PomodoroNotificationKind, string> = {
  'one-minute': 'buaa-start-pomodoro-one-minute',
  'phase-end': 'buaa-start-pomodoro-phase-end',
}

/** 保留通知引用，避免对象被回收后点击回调失效。 */
const activeNotifications = new Set<Notification>()

export function isPomodoroNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function pomodoroNotificationPermission(): NotificationPermission | null {
  if (!isPomodoroNotificationSupported()) return null

  try {
    return Notification.permission
  } catch {
    return null
  }
}

export async function requestPomodoroNotificationPermission(): Promise<NotificationPermission | null> {
  if (!isPomodoroNotificationSupported()) return null

  try {
    return await Notification.requestPermission()
  } catch {
    return null
  }
}

/** 发送固定标题的通知；权限不足或浏览器不支持时静默失败。 */
export function showPomodoroNotification(
  body: string,
  kind: PomodoroNotificationKind,
): boolean {
  if (pomodoroNotificationPermission() !== 'granted') return false

  try {
    const options: NotificationOptions & { renotify?: boolean } = {
      body,
      tag: NOTIFICATION_TAGS[kind],
      // 同一 tag 替换旧通知时仍提醒用户，避免后续阶段静默替换。
      renotify: true,
    }
    const notification = new Notification(NOTIFICATION_TITLE, options)

    activeNotifications.add(notification)
    const release = (): void => {
      activeNotifications.delete(notification)
    }

    notification.onclose = release
    notification.onclick = () => {
      release()
      notification.close()
      window.focus()
    }

    return true
  } catch {
    return false
  }
}
