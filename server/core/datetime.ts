/**
 * 校历时间工具：上游时间统一按 Asia/Shanghai 解释，不依赖服务器时区。
 */

/** 上游时间统一为 "YYYY-MM-DD HH:mm:ss"；空值或格式异常返回 null。 */
export function normalizeDateTime(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const match = value
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/);
  if (!match) return null;

  const date = match[1];
  const time = match[2] ?? "";
  return time.length === 5 ? `${date} ${time}:00` : `${date} ${time}`;
}

/** 按 Asia/Shanghai（+08:00）解析为毫秒；无效值返回 null。 */
export function toShanghaiEpochMs(value: unknown): number | null {
  const text = normalizeDateTime(value);
  if (!text) return null;

  const parsed = Date.parse(`${text.replace(" ", "T")}+08:00`);
  return Number.isNaN(parsed) ? null : parsed;
}

/** 带偏移的 ISO 时间转 Asia/Shanghai 的 "YYYY-MM-DD HH:mm:ss"；无偏移按学校本地时间保留。 */
export function toShanghaiDateTime(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const text = value.trim();
  if (text.length === 0) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return text;

  const localIso = text.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?$/,
  );
  if (localIso) {
    return `${localIso[1]} ${localIso[2]}:${localIso[3] ?? "00"}`;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString("sv-SE", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
}
