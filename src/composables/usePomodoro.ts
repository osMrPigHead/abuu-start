/**
 * 番茄钟模块级单例：配置持久化、阶段机、自动流转、通知与 endsAt 计时校正，
 * 见 docs/trd.md 7.5 与 docs/trd-phase2.md 7.5。
 * 运行态只存在于当前页面，刷新后计时重置；已有完整配置时直接显示专注态。
 */
import { computed, reactive, ref } from "vue";
import { usePomodoroNotifications } from "@/composables/usePomodoroNotifications";
import type { PomodoroRuntime, PomodoroSettings } from "@/types";
import {
  hasPomodoroSettings,
  nextPomodoroPhase,
  POMODORO_ONE_MINUTE_SECONDS,
  POMODORO_PHASE_LABELS,
  pomodoroPhaseSeconds,
  sanitizePomodoroSettings,
  validatePomodoroSettings,
  type PomodoroPhase,
} from "@/domain/pomodoro";
import { playPomodoroChime, primePomodoroAudio } from "@/utils/pomodoroAudio";
import { showPomodoroNotification } from "@/utils/pomodoroNotifications";
import { readJson, STORAGE_KEYS, writeJson } from "@/cache/storage";

/** 后台休眠跨过多个阶段时最多推进的次数，防止异常数据导致死循环。 */
const MAX_CATCH_UP_PHASES = 10_000;

const storedSettings = readJson<unknown>(STORAGE_KEYS.pomodoroSettings);
const settings = reactive<PomodoroSettings>(
  sanitizePomodoroSettings(storedSettings),
);
const phase = ref<PomodoroPhase>("focus");
const remainingSeconds = ref(pomodoroPhaseSeconds(settings, phase.value));
const running = ref(false);
// 有完整配置时首屏直接进入专注态；没有配置时先显示配置页。
const started = ref(hasPomodoroSettings(storedSettings));
const paused = ref(false);
const completedRounds = ref(0);
const endsAt = ref<number | null>(null);
const oneMinuteNotified = ref(false);
const notifications = usePomodoroNotifications();

let ticker: number | null = null;
let visibilityListenerRegistered = false;

export function usePomodoro() {
  // 页面恢复可见时立即校正一次，不等待下一个 250ms 定时器。
  if (!visibilityListenerRegistered && typeof document !== "undefined") {
    visibilityListenerRegistered = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") tick();
    });
  }

  const phaseSeconds = computed(() =>
    pomodoroPhaseSeconds(settings, phase.value),
  );

  const expectedFinishAt = computed(() => {
    const finish =
      running.value && endsAt.value !== null
        ? endsAt.value
        : Date.now() + remainingSeconds.value * 1000;
    return new Date(finish);
  });

  const currentSettings = computed<PomodoroSettings>(() => ({ ...settings }));

  const runtime = computed<PomodoroRuntime>(() => ({
    phase: phase.value,
    endsAt: endsAt.value,
    remainingSeconds: remainingSeconds.value,
    running: running.value,
    paused: paused.value,
    completedRounds: completedRounds.value,
    phaseDurationSeconds: phaseSeconds.value,
    oneMinuteNotified: oneMinuteNotified.value,
  }));

  /** 设置态点击开始：校验配置，从专注阶段第一轮开始自动计时。 */
  function start(next: PomodoroSettings): boolean {
    if (validatePomodoroSettings(next) !== null) return false;

    // 存储不可用时只降级到内存，不阻塞本次计时。
    saveSettings(next);

    stopTicker();
    phase.value = "focus";
    completedRounds.value = 0;
    remainingSeconds.value = pomodoroPhaseSeconds(settings, "focus");
    started.value = true;
    running.value = false;
    paused.value = false;
    endsAt.value = null;
    oneMinuteNotified.value = false;

    beginRunning();
    return true;
  }

  /** 配置在设置态随输入自动保存；非法值不写入，也不影响当前计时。 */
  function saveSettings(next: PomodoroSettings): boolean {
    if (validatePomodoroSettings(next) !== null) return false;

    Object.assign(settings, next);
    return writeJson(STORAGE_KEYS.pomodoroSettings, { ...settings });
  }

  /** 暂停保留剩余秒数，继续时从剩余时间重新计算结束时间戳。 */
  function pause(): void {
    if (!running.value || endsAt.value === null) return;

    const now = Date.now();
    const remainingMs = endsAt.value - now;
    if (remainingMs <= 0) {
      completePhase(now);
      return;
    }

    remainingSeconds.value = Math.ceil(remainingMs / 1000);
    // 已进入结束前 1 分钟再暂停时，恢复后不补发这条通知。
    if (
      pomodoroPhaseSeconds(settings, phase.value) >
        POMODORO_ONE_MINUTE_SECONDS &&
      remainingMs <= POMODORO_ONE_MINUTE_SECONDS * 1000
    ) {
      oneMinuteNotified.value = true;
    }

    running.value = false;
    paused.value = true;
    endsAt.value = null;
    stopTicker();
  }

  function resume(): void {
    if (!started.value || running.value) return;

    if (remainingSeconds.value <= 0) {
      remainingSeconds.value = pomodoroPhaseSeconds(settings, phase.value);
      oneMinuteNotified.value = false;
    }

    paused.value = false;
    beginRunning();
  }

  /** 重置回到当前阶段完整时长并停止，已完成轮次保持不变。 */
  function reset(): void {
    if (!started.value) return;

    stopTicker();
    running.value = false;
    paused.value = false;
    endsAt.value = null;
    remainingSeconds.value = pomodoroPhaseSeconds(settings, phase.value);
    oneMinuteNotified.value = false;
  }

  /** 从专注态回到配置页：停止并清空本次会话，保留已保存的配置值。 */
  function editSettings(): void {
    stopTicker();
    running.value = false;
    paused.value = false;
    endsAt.value = null;
    started.value = false;
    phase.value = "focus";
    completedRounds.value = 0;
    remainingSeconds.value = pomodoroPhaseSeconds(settings, "focus");
    oneMinuteNotified.value = false;
  }

  function beginRunning(): void {
    // 首次开始时仍处于用户手势内，可在这里请求通知权限。
    notifications.ensurePermission();
    primePomodoroAudio();
    endsAt.value = Date.now() + remainingSeconds.value * 1000;
    running.value = true;
    paused.value = false;

    // 继续时若剩余时间已不足 1 分钟，说明该边界已过，不再补发通知。
    if (
      pomodoroPhaseSeconds(settings, phase.value) >
        POMODORO_ONE_MINUTE_SECONDS &&
      remainingSeconds.value <= POMODORO_ONE_MINUTE_SECONDS
    ) {
      oneMinuteNotified.value = true;
    }

    ensureTicker();
  }

  /**
   * 阶段自然结束：按旧结束时间推进一个或多个阶段，新阶段立即开始。
   * 只跨过一个阶段时播放提示音并发送结束通知；跨过多个阶段不补发历史通知。
   */
  function completePhase(now: number): void {
    if (!running.value || endsAt.value === null) return;

    let boundary = endsAt.value;
    let currentPhase = phase.value;
    let rounds = completedRounds.value;
    let crossed = 0;
    let singleEnded: PomodoroPhase | null = null;
    let singleNext: PomodoroPhase | null = null;

    while (boundary <= now && crossed < MAX_CATCH_UP_PHASES) {
      const ended = currentPhase;
      if (ended === "focus") rounds += 1;

      const next = nextPomodoroPhase(ended, rounds, settings);
      if (crossed === 0) {
        singleEnded = ended;
        singleNext = next;
      }

      boundary += pomodoroPhaseSeconds(settings, next) * 1000;
      currentPhase = next;
      crossed += 1;
    }

    if (crossed === 0) return;

    if (boundary <= now) {
      // 异常数据或极长休眠的兜底：从当前阶段完整时长重新开始，避免 ticker 空转。
      boundary = now + pomodoroPhaseSeconds(settings, currentPhase) * 1000;
    }

    phase.value = currentPhase;
    completedRounds.value = rounds;
    endsAt.value = boundary;
    remainingSeconds.value = Math.max(1, Math.ceil((boundary - now) / 1000));
    running.value = true;
    paused.value = false;
    // 跨过多个阶段后，当前阶段如果已不足 1 分钟，也不补发历史通知。
    oneMinuteNotified.value =
      remainingSeconds.value <= POMODORO_ONE_MINUTE_SECONDS;

    if (crossed === 1 && singleEnded !== null && singleNext !== null) {
      playPomodoroChime();
      notifyPhaseEnd(singleEnded, singleNext);
    }

    ensureTicker();
  }

  function notifyOneMinute(): void {
    if (!notifications.enabled.value) return;

    showPomodoroNotification(
      `${POMODORO_PHASE_LABELS[phase.value]}还剩 1 分钟`,
      "one-minute",
    );
  }

  function notifyPhaseEnd(ended: PomodoroPhase, next: PomodoroPhase): void {
    if (!notifications.enabled.value) return;

    const minutes = pomodoroPhaseSeconds(settings, next) / 60;
    showPomodoroNotification(
      `${POMODORO_PHASE_LABELS[ended]}结束，已开始 ${minutes} 分钟${POMODORO_PHASE_LABELS[next]}`,
      "phase-end",
    );
  }

  function ensureTicker(): void {
    if (ticker !== null) return;
    ticker = window.setInterval(tick, 250);
  }

  function stopTicker(): void {
    if (ticker === null) return;
    window.clearInterval(ticker);
    ticker = null;
  }

  /**
   * 每 250ms 按结束时间戳校正剩余秒数；跨过阶段终点时自动进入下一阶段。
   * 页面恢复可见时也会立即调用一次。
   */
  function tick(): void {
    if (!running.value || endsAt.value === null) {
      stopTicker();
      return;
    }

    ensureTicker();

    const now = Date.now();
    const remainingMs = endsAt.value - now;

    if (remainingMs <= 0) {
      completePhase(now);
      return;
    }

    remainingSeconds.value = Math.ceil(remainingMs / 1000);

    if (
      !oneMinuteNotified.value &&
      pomodoroPhaseSeconds(settings, phase.value) >
        POMODORO_ONE_MINUTE_SECONDS &&
      remainingMs <= POMODORO_ONE_MINUTE_SECONDS * 1000
    ) {
      oneMinuteNotified.value = true;
      notifyOneMinute();
    }
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
    runtime,
    notificationsEnabled: notifications.enabled,
    notificationBusy: notifications.busy,
    notificationMessage: notifications.message,
    notificationPermission: notifications.permission,
    refreshNotificationPermission: notifications.refreshPermission,
    testNotification: notifications.testNotification,
    start,
    saveSettings,
    pause,
    resume,
    reset,
    editSettings,
    setNotificationsEnabled: notifications.setEnabled,
  };
}
