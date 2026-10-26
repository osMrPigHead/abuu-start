/** 快捷方式 favicon 推导与首字母占位，见 docs/prd.md 3.2。 */

/** 取站点自身的 /favicon.ico；非 http(s) 或无法解析时返回 null。 */
export function faviconUrlFor(pageUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(pageUrl)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  return `${parsed.origin}/favicon.ico`
}

export function shortcutInitial(title: string): string {
  const first = Array.from(title.trim())[0]
  return first ? first.toUpperCase() : '?'
}
