/**
 * 扩展身份常量：Chrome/Edge 固定扩展 ID 所需的公钥、派生 ID 与 Firefox gecko ID。
 * 公钥可以公开；对应私钥只保存在 gitignore 的 `private/extension-key.pem`，不进入仓库。
 *
 * Firefox 的 `moz-extension://` 主机是每次安装随机生成的内部 UUID，与 gecko ID
 * 没有派生关系，因此中继只能固定 Chrome/Edge 来源；Firefox 的来源限制见 docs/trd.md。
 */
import { createHash } from "node:crypto";

export const CHROME_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAobeU4Pk2qiS0hJdyAQf1s7/sMASu3X3EoqM4qX+yK07g3nSMC8EEtLRgJPcCTnw8lcgAXO8jmrEJ5DDW6tOC17pamTWquyS+Ia753iyxvCyOnSofsUSz1IozOyV+THsuUln3jZ3LabG6yMF7+5xFuQq2A/Aj+vAAq1TggUb1BJQ6MEy4yB1KsqP3FPQ9hwmmxu8XgciGJWM5SxgJs75Rr54IRNc1PgfTc7IXJl6X6k9n+Pe73SPXEW2Z/KcsOXNdC3+CCEx4OZfLLH3LbogaKV2Mx3e5/7LMcBHdGq0TNmeRpQq8fWNqjgMCEELIl9831KWq+Fl7NIo4CgULvqun7wIDAQAB";

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
