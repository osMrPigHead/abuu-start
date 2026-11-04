/** 阳光打卡目标与进度的纯函数，口径见 docs/prd.md 3.10、docs/trd.md 8.4。 */
import type { YgdkSettings } from "@/types";
import { isValidYgdkUid } from "@shared/validation";

export { isValidYgdkUid };

export const DEFAULT_YGDK_TERM_TARGET = 16;
export const DEFAULT_YGDK_WEEK_TARGET = 4;
export const MIN_YGDK_TERM_TARGET = 1;
export const MAX_YGDK_TERM_TARGET = 100;
export const MIN_YGDK_WEEK_TARGET = 1;
export const MAX_YGDK_WEEK_TARGET = 14;

export const DEFAULT_YGDK_SETTINGS: YgdkSettings = {
  termTarget: DEFAULT_YGDK_TERM_TARGET,
  weekTarget: DEFAULT_YGDK_WEEK_TARGET,
};

export function isValidYgdkTermTarget(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_YGDK_TERM_TARGET &&
    value <= MAX_YGDK_TERM_TARGET
  );
}

export function isValidYgdkWeekTarget(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_YGDK_WEEK_TARGET &&
    value <= MAX_YGDK_WEEK_TARGET
  );
}

/** 学期目标优先取系统值；系统缺失或为 0 时用用户设置，用户值非法回退 20。 */
export function resolveYgdkTermTarget(
  systemTarget: number,
  userTarget: number,
): number {
  if (Number.isSafeInteger(systemTarget) && systemTarget > 0)
    return systemTarget;
  return isValidYgdkTermTarget(userTarget)
    ? userTarget
    : DEFAULT_YGDK_TERM_TARGET;
}

/** 周限制始终取用户设置，默认 4；不使用系统值。 */
export function resolveYgdkWeekLimit(userTarget: number): number {
  return isValidYgdkWeekTarget(userTarget)
    ? userTarget
    : DEFAULT_YGDK_WEEK_TARGET;
}

/** 进度百分比：超过目标时封顶 100，目标非正时为 0。 */
export function ygdkProgressPercent(count: number, target: number): number {
  if (!Number.isFinite(count) || !Number.isFinite(target) || target <= 0)
    return 0;
  return Math.min(100, Math.max(0, Math.round((count / target) * 100)));
}
