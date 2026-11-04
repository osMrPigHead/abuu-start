/**
 * HTML 转文本：实体解码、标签剥离、段落换行与空白归一化。
 * 只服务中继的错误页/课程简介/作业正文，不引入 DOM。
 */

export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&amp;/gi, "&");
}

/**
 * HTML 片段转纯文本：保留段落换行，剔除 script/style 内容与所有标签。
 * 非字符串或清洗后为空时返回 null。
 */
export function htmlToText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.trim().length === 0) return null;

  const withBreaks = value
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n");

  const text = decodeEntities(withBreaks.replace(/<[^>]*>/g, " "));

  const plain = text
    .replace(/[ \t\u00a0]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return plain.length > 0 ? plain : null;
}

/** 单行化 HTML：用于错误提示等只需一行文本的场景。 */
export function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}
