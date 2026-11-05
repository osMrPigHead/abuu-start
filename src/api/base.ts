/**
 * 本地中继地址。
 * 扩展页面与中继不同源，所有 /api 请求都必须补全绝对地址；
 * 默认监听根项目 `npm start` 的 127.0.0.1:3000，可用 WXT_RELAY_ORIGIN 覆盖。
 */
const DEFAULT_RELAY_ORIGIN = "http://127.0.0.1:3000";

function normalizeOrigin(origin: string | undefined): string {
  const trimmed = origin?.trim();
  if (!trimmed) return DEFAULT_RELAY_ORIGIN;
  return trimmed.replace(/\/+$/, "");
}

export const RELAY_ORIGIN = normalizeOrigin(import.meta.env.WXT_RELAY_ORIGIN);

/** 把中继路径（以 / 开头）拼成绝对 URL。 */
export function relayUrl(path: string): string {
  return `${RELAY_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}
