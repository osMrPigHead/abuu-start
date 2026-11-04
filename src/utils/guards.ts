/** 缓存与未知输入的通用守卫，避免各数据源重复实现。 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function nullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const text = value.trim();
  return text.length > 0 ? text : null;
}

/** 数字或数字字符串 -> 正安全整数；其余返回 null。 */
export function toPositiveInteger(value: unknown): number | null {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  if (!Number.isSafeInteger(number) || number < 1) return null;
  return number;
}

/** 数字或整数字符串 -> 安全整数（允许 0 与负数）；其余返回 null。 */
export function readInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : null;
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  return null;
}
