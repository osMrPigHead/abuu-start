/** JSON 文本解析：失败返回 undefined；JSON 的 null 仍是有效值。 */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
