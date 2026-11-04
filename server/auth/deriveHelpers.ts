/**
 * 派生流程中的 token / RoleCode / 分类提取，见 docs/api.md 2.3。
 * 从 auth/derive.ts 拆出，保持派生主流程只依赖协议层与状态。
 */
import { isRecord, readInteger } from "../core/guards.ts";

/**
 * 从原始 URL 中取查询参数并做一次 URL 解码。
 * 不用 URLSearchParams：它会把 `+` 当作空格，破坏博雅/阳光 token。
 */
export function readRawQueryParam(url: string, name: string): string | null {
  const match = new RegExp(`[?&]${name}=([^&#]*)`).exec(url);
  if (!match) return null;

  const raw = match[1] ?? "";
  if (raw.length === 0) return null;

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function readRawString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0) return null;

  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** RoleCode 优先级：jsdm → rolecode（字符串/数字/数组）→ jsdmList 首个非空。 */
export function readRoleCode(content: unknown): string | null {
  if (!isRecord(content)) return null;
  return (
    firstNonEmptyString(content.jsdm) ??
    firstNonEmptyString(content.rolecode) ??
    firstArrayString(content.jsdmList)
  );
}

/** 分类：名称含“体育”优先，其次 classify_id === 1，最后取第一项。 */
export function readClassifyId(list: unknown[]): number | null {
  for (const item of list) {
    if (!isRecord(item)) continue;
    const id = readInteger(item.classify_id);
    const name = typeof item.name === "string" ? item.name : "";
    if (id !== null && name.includes("体育")) return id;
  }

  for (const item of list) {
    if (!isRecord(item)) continue;
    const id = readInteger(item.classify_id);
    if (id === 1) return 1;
  }

  for (const item of list) {
    if (!isRecord(item)) continue;
    const id = readInteger(item.classify_id);
    if (id !== null) return id;
  }

  return null;
}

function firstNonEmptyString(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value))
    return String(value);
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function firstArrayString(value: unknown): string | null {
  if (!Array.isArray(value)) return null;

  for (const item of value) {
    const text = firstNonEmptyString(item);
    if (text !== null) return text;
  }

  return null;
}
