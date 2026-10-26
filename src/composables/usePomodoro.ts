/**
 * 番茄钟模块级单例：配置持久化、阶段机与 endsAt 计时校正，见 docs/trd.md 7.5。
 * 运行态只存在于当前页面，刷新后计时重置；已有完整配置时直接显示专注态。
 */
import { computed, reactive, ref } from 'vue'
import type { PomodoroSettings } from '@/types'
import {
  hasPomodoroSettings,
  nextPomodoroPhase,
  playPomodoroChime,
  pomodoroPhaseSeconds,
  primePomodoroAudio,
  sanitizePomodoroSettings,
  validatePomodoroSettings,
  type PomodoroPhase,
} from '@/utils/pomodoro'
import { readJson, STORAGE_KEYS, writeJson } from '@/utils/storage'

const storedSettings = readJson<unknown>(STORAGE_KEYS.pomodoroSettings)
const settings = reactive<PomodoroSettings>(sanitizePomodoroSettings(storedSettings))
const phase = ref<PomodoroPhase>('focus')
const remainingSeconds = ref(pomodoroPhaseSeconds(settings, phase.value))
const running = ref(false)
// 有完整配置时首屏直接进入专注态；没有配置时先显示配置页。
const started = ref(hasPomodoroSettings(storedSettings))
const paused = ref(false)
const completedRounds = ref(0)
const endsAt = ref<number | null>(null)

let ticker: number | null = null

export function usePomodoro() {
  const phaseSeconds = computed(() =>
    pomodoroPhaseSeconds(settings, phase.value),
  )

  const expectedFinishAt = computed(() => {
    const finish =
      running.value && endsAt.value !== null
        ? endsAt.value
        : Date.now() + remainingSeconds.value * 1000
    return new Date(finish)
  })

  const currentSettings = computed<PomodoroSettings>(() => ({ ...settings }))

  /** 设置态点击开始：校验并保存配置，从专注阶段第一轮开始计时。 */
  function start(next: PomodoroSettings): boolean {
    if (!saveSettings(next)) return false

    phase.value = 'focus'
    completedRounds.value = 0
    remainingSeconds.value = pomodoroPhaseSeconds(settings, 'focus')
    started.value = true
    running.value = false
    paused.value = false
    endsAt.value = null

    beginRunning()
    return true
  }

  /** 配置在设置态随输入自动保存；非法值不写入，也不影响当前计时。 */
  function saveSettings(next: PomodoroSettings): boolean {
    if (validatePomodoroSettings(next) !== null) return false

    Object.assign(settings, next)
    return writeJson(STORAGE_KEYS.pomodoroSettings, { ...settings })
  }

  /** 暂停保留剩余秒数，继续时从剩余时间重新计算结束时间戳。 */
  function pause(): void {
    if (!running.value || endsAt.value === null) return

    const remainingMs = endsAt.value - Date.now()
    if (remainingMs <= 0) {
      completePhase()
      return
    }

    remainingSeconds.value = Math.ceil(remainingMs / 1000)
    running.value = false
    paused.value = true
    endsAt.value = null
    stopTicker()
  }

  function resume(): void {
    if (!started.value || running.value) return

    if (remainingSeconds.value <= 0) {
      remainingSeconds.value = pomodoroPhaseSeconds(settings, phase.value)
    }

    paused.value = false
    beginRunning()
  }

  /** 重置回到当前阶段完整时长并停止，已完成轮次保持不变。 */
  function reset(): void {
    if (!started.value) return

    stopTicker()
    running.value = false
    paused.value = false
    endsAt.value = null
    remainingSeconds.value = pomodoroPhaseSeconds(settings, phase.value)
  }

  /** 从专注态回到配置页：停止并清空本次会话，保留已保存的配置值。 */
  function editSettings(): void {
    stopTicker()
    running.value = false
    paused.value = false
    endsAt.value = null
    started.value = false
    phase.value = 'focus'
    completedRounds.value = 0
    remainingSeconds.value = pomodoroPhaseSeconds(settings, 'focus')
  }

  function beginRunning(): void {
    primePomodoroAudio()
    endsAt.value = Date.now() + remainingSeconds.value * 1000
    running.value = true
    ensureTicker()
  }

  /**
   * 阶段自然结束：提示音、轮次 +1，按轮次进入短休/长休或回到专注。
   * 新阶段停在其起点，等待用户手动开始。
   */
  function completePhase(): void {
    stopTicker()
    running.value = false
    paused.value = false
    endsAt.value = null

    playPomodoroChime()

    if (phase.value === 'focus') {
      completedRounds.value += 1
    }

    phase.value = nextPomodoroPhase(phase.value, completedRounds.value, settings)
    remainingSeconds.value = pomodoroPhaseSeconds(settings, phase.value)
  }

  function ensureTicker(): void {
    if (ticker !== null) return
    ticker = window.setInterval(tick, 250)
  }

  function stopTicker(): void {
    if (ticker === null) return
    window.clearInterval(ticker)
    ticker = null
  }

  function tick(): void {
    if (!running.value || endsAt.value === null) {
      stopTicker()
      return
    }

    const remainingMs = endsAt.value - Date.now()
    if (remainingMs <= 0) {
      completePhase()
      return
    }

    remainingSeconds.value = Math.ceil(remainingMs / 1000)
  }

  return {
    settings: currentSettings,
    phase: computed(() => phase.value),
    phaseSeconds,
    remainingSeconds: computed(() => remainingSeconds.value),
    running: computed(() => running.value),
    started: computed(() => started.value),
    paused: computed(() => paused.value),
    completedRounds: computed(() => completedRounds.value),
    expectedFinishAt,
    start,
    saveSettings,
    pause,
    resume,
    reset,
    editSettings,
  }
}
