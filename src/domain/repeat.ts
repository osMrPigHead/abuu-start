/** 重复待办的下一次截止时间计算，见 docs/trd.md 8.5。 */
import type { Todo } from "@/types";
import { formatDateTimeValue, parseDateTime } from "@/utils/dateTime";

const DAY_MS = 86_400_000;

/** "YYYY-MM-DDTHH:mm" 按本地时间解析；无效值返回 null。 */
export function parseLocalDateTime(
  value: string | null | undefined,
): Date | null {
  return parseDateTime(value, { allowSpace: false, allowT: true });
}

/** Date -> 本地 "YYYY-MM-DDTHH:mm"，与 Todo.dueAt 的存储格式一致。 */
export function formatLocalDateTime(date: Date): string {
  return formatDateTimeValue(date, "T");
}

/**
 * 计算重复待办的下一次截止时间：原截止时间加一个周期，
 * 若仍不晚于 now，则继续顺延到未来最近一次。
 */
export function nextRepeatDueAt(
  dueAt: string,
  repeat: Todo["repeat"],
  now: Date,
): string | null {
  if (repeat === "none") return null;

  const base = parseLocalDateTime(dueAt);
  if (!base) return null;

  const stepDays = repeat === "daily" ? 1 : 7;
  const stepMs = stepDays * DAY_MS;
  const elapsed = now.getTime() - base.getTime();

  // 先按毫秒差估算需要前进的周期数，再用本地日历日校正，避免夏令时造成偏差。
  let steps = Math.max(1, Math.floor(elapsed / stepMs) + 1);
  let next = addCalendarDays(base, steps * stepDays);

  while (next.getTime() <= now.getTime()) {
    steps += 1;
    next = addCalendarDays(base, steps * stepDays);
  }

  return formatLocalDateTime(next);
}

function addCalendarDays(base: Date, days: number): Date {
  const next = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    base.getHours(),
    base.getMinutes(),
  );
  next.setDate(next.getDate() + days);
  return next;
}
