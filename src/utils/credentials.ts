/** 凭据规范化与掩码，不依赖 Vue。 */

/**
 * 从粘贴内容中提取 byxt Cookie：
 * - 支持整段 "Cookie: a=b; c=d"；
 * - 支持多行请求头，优先取 Cookie 行；
 * - 没有有效 name=value 时返回 null。
 */
export function normalizeByxtCookie(input: string): string | null {
  let text = input.trim()
  if (text.length === 0) return null

  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const cookieLine = lines.find((line) => /^cookie\s*:/i.test(line))
  text = cookieLine
    ? cookieLine.replace(/^cookie\s*:\s*/i, '')
    : lines.join('; ')

  text = text
    .replace(/^cookie\s*:\s*/i, '')
    .replace(/\s*;\s*/g, '; ')
    .replace(/;\s*$/, '')
    .trim()

  if (!hasCookiePairs(text)) return null
  return text
}

/** 至少存在一个 name=value 片段。 */
export function hasCookiePairs(cookie: string): boolean {
  return cookie
    .split(';')
    .map((part) => part.trim())
    .some((part) => /^[^=;\s]+=/.test(part))
}

/** 已保存凭据只显示固定长度的掩码。 */
export function maskSecret(value: string): string {
  return value.length > 0 ? '••••••••••••' : ''
}
