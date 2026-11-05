/**
 * 番茄钟配置校验、阶段推进与时间格式化，见 docs/trd.md 8.6。
 * Web Audio 与桌面通知在 utils 中实现，纯规则集中在本文件。
 */
import type { PomodoroSettings } from "@/types";
import { pad2 } from "@/utils/date";
import { isRecord } from "@/utils/guards";

export type PomodoroPhase = "focus" | "short-break" | "long-break";

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  roundsPerLongBreak: 4,
};

export const POMODORO_LIMITS = {
  focusMinutes: { min: 1, max: 180 },
  shortBreakMinutes: { min: 1, max: 60 },
  longBreakMinutes: { min: 1, max: 60 },
  roundsPerLongBreak: { min: 1, max: 12 },
} as const;

/** 结束前 1 分钟通知的边界；阶段时长必须大于该值才会触发。 */
export const POMODORO_ONE_MINUTE_SECONDS = 60;

export const POMODORO_PHASE_LABELS: Record<PomodoroPhase, string> = {
  focus: "专注",
  "short-break": "短休",
  "long-break": "长休",
};

const SETTINGS_FIELDS = [
  "focusMinutes",
  "shortBreakMinutes",
  "longBreakMinutes",
  "roundsPerLongBreak",
] as const;

type SettingsField = (typeof SETTINGS_FIELDS)[number];

/** 返回第一处不合法配置的中文提示；全部合法时返回 null。 */
export function validatePomodoroSettings(
  settings: PomodoroSettings,
): string | null {
  for (const field of SETTINGS_FIELDS) {
    const value = settings[field];
    const limit = POMODORO_LIMITS[field];
    if (!Number.isInteger(value) || value < limit.min || value > limit.max) {
      return `${fieldLabel(field)}需为 ${limit.min}–${limit.max} 的整数`;
    }
  }

  return null;
}

/** 读取本地配置或旧数据时的兜底：逐字段校验，非法字段回退默认值。 */
export function sanitizePomodoroSettings(value: unknown): PomodoroSettings {
  const record = isRecord(value) ? value : {};
  const result = { ...DEFAULT_POMODORO_SETTINGS };

  for (const field of SETTINGS_FIELDS) {
    const candidate = record[field];
    if (isValidFieldValue(field, candidate)) {
      result[field] = candidate;
    }
  }

  return result;
}

/**
 * 判断本地是否已经保存过一份完整可用的专注配置。
 * 只有四个字段都合法时才视为“已配置”，用于决定首屏显示配置页还是专注页。
 */
export function hasPomodoroSettings(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return SETTINGS_FIELDS.every((field) =>
    isValidFieldValue(field, value[field]),
  );
}

export function pomodoroPhaseSeconds(
  settings: PomodoroSettings,
  phase: PomodoroPhase,
): number {
  switch (phase) {
    case "short-break":
      return settings.shortBreakMinutes * 60;
    case "long-break":
      return settings.longBreakMinutes * 60;
    default:
      return settings.focusMinutes * 60;
  }
}

/** 专注结束后按已完成轮次决定短休/长休；休息结束后回到专注。 */
export function nextPomodoroPhase(
  phase: PomodoroPhase,
  completedRounds: number,
  settings: PomodoroSettings,
): PomodoroPhase {
  if (phase !== "focus") return "focus";

  return completedRounds > 0 &&
    completedRounds % settings.roundsPerLongBreak === 0
    ? "long-break"
    : "short-break";
}

/** 剩余时间按 mm:ss 显示；超过 99 分钟时分钟位自然增长。 */
export function formatPomodoroClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${pad2(seconds % 60)}`;
}

/** 预计完成时间显示为本地 HH:mm。 */
export function formatPomodoroFinish(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function fieldLabel(field: SettingsField): string {
  switch (field) {
    case "focusMinutes":
      return "专注时长";
    case "shortBreakMinutes":
      return "短休时长";
    case "longBreakMinutes":
      return "长休时长";
    default:
      return "每几轮进入长休";
  }
}

function isValidFieldValue(
  field: SettingsField,
  value: unknown,
): value is number {
  if (typeof value !== "number" || !Number.isInteger(value)) return false;

  const limit = POMODORO_LIMITS[field];
  return value >= limit.min && value <= limit.max;
}
