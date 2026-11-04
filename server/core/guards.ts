/**
 * 中继值守卫：通用守卫位于 shared/guards.ts，本文件保留 server 内部导入路径，
 * 并放置仅中继使用的读取函数。
 */
import {
  isRecord,
  optionalText,
  readInteger,
  textOrEmpty,
  toPositiveInteger,
} from "../../shared/guards.ts";

export { isRecord, optionalText, readInteger, textOrEmpty, toPositiveInteger };

/** 有限数字按字符串返回（SPOC 分数可能是数字），其余同 optionalText。 */
export function optionalScalarText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return optionalText(value);
}
