/** 本地日期时间解析与格式化，供待办、SPOC、博雅等严格格式复用。 */
import { pad2 } from "@/utils/date";

export type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})([ T])(\d{2}):(\d{2})(?::(\d{2}))?$/;

type ParseOptions = {
  allowSpace?: boolean;
  allowT?: boolean;
};

/**
 * 严格解析 `YYYY-MM-DD HH:mm[:ss]` / `YYYY-MM-DDTHH:mm[:ss]`（本地时间）。
 * 非法日期、非法时分秒或不允许的分隔符返回 null。
 */
export function parseDateTimeParts(
  value: string | null | undefined,
  options: ParseOptions = {},
): DateTimeParts | null {
  if (typeof value !== "string") return null;

  const match = DATE_TIME_RE.exec(value.trim());
  if (!match) return null;

  const separator = match[4];
  if (separator === " " && options.allowSpace === false) return null;
  if (separator === "T" && options.allowT === false) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[5]);
  const minute = Number(match[6]);
  const second = match[7] === undefined ? 0 : Number(match[7]);

  if (hour > 23 || minute > 59 || second > 59) return null;

  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null;
  }

  return { year, month, day, hour, minute, second };
}

export function parseDateTime(
  value: string | null | undefined,
  options: ParseOptions = {},
): Date | null {
  const parts = parseDateTimeParts(value, options);
  if (!parts) return null;

  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0,
  );
}

/** Date -> 本地 `YYYY-MM-DD HH:mm`（或 `T` 分隔）；与存储格式一致。 */
export function formatDateTimeValue(
  date: Date,
  separator: " " | "T" = " ",
): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}${separator}${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
