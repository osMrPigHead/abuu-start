/**
 * 前端与本地中继共用的纯值守卫：只做类型收窄与文本/整数读取，不含业务规则。
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 非字符串统一为空串；用于必填字段的默认值。 */
export function textOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 去首尾空白；空串、纯空白与非字符串返回 null。 */
export function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

/** 安全整数；接受数字或十进制整数字符串，其余返回 null。 */
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

/** 从 1 开始的正整数；接受数字或数字字符串。 */
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
