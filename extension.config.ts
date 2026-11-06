/**
 * 扩展身份常量：Chrome/Edge 固定扩展 ID 所需的公钥、派生 ID 与 Firefox gecko ID。
 * 公钥可以公开；对应私钥只保存在 gitignore 的 `private/extension-key.pem`，不进入仓库。
 * 修改或轮换步骤见 `docs/trd.md` 10.1。
 *
 * Firefox 的 `moz-extension://` 主机是每次安装随机生成的内部 UUID，与 gecko ID
 * 没有派生关系，因此中继只能固定 Chrome/Edge 来源；Firefox 的来源限制见 docs/trd.md。
 */
import { createHash } from "node:crypto";

export const CHROME_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxezbPP3LDhK7cIb4pYIL5Q7knz/0w9kCxFqyDiHmFyZCbCernpbCQIhonVWS7GZxhPpGewsPVaD8aO9XsKToDJvN4cijLyugkSewXnwK8CM/G+lO/uYXAhdCUa3NwHqCMbp1X9MC+KR1+1Ib8s+XThwtxeU8lEATfJnZPBk/gog37Pm551UhSvIbiy5jEwhaMW5uCIYXGHdYMqF3achY/4wwlkp3zvyL2qxg9EWX8WqgQpsYRPYak0cuHgkEjdS6CT3VZgtUJuGy1MWZcxrjUXFP+g7M6kCQeBTmQTGmf39EhjE1W04Rvbgnyr1VS9u5s3naOj32S6u9igd6zucvDQIDAQAB";

export const FIREFOX_EXTENSION_ID = "abuu-start@abuu-start.local";

/**
 * Chrome/Edge 扩展 ID：对 SPKI DER 公钥做 SHA-256，取前 32 个十六进制字符，
 * 再把 0-9a-f 逐位映射为 a-p。
 */
export function deriveChromeExtensionId(publicKeyBase64: string): string {
  const digest = createHash("sha256")
    .update(publicKeyBase64, "base64")
    .digest("hex")
    .slice(0, 32);

  return [...digest]
    .map((digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)))
    .join("");
}

export const CHROME_EXTENSION_ID = deriveChromeExtensionId(CHROME_PUBLIC_KEY);
