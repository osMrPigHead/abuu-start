/**
 * 博雅请求加密与响应解密，协议见 docs/api.md 3.1、docs/trd-phase2.md 3.3。
 *
 * 固定协议：RSA/ECB/PKCS1Padding、AES-128-ECB/PKCS5Padding、SHA-1。
 * 只使用 Node 内置 node:crypto，不引入第三方加密库。
 */
import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  publicEncrypt,
  randomInt,
} from 'node:crypto'

/** 参考 B `BykcCrypto.kt` 中的固定 1024 位 RSA 公钥（Base64 DER / X.509）。 */
const RSA_PUBLIC_KEY_BASE64 =
  'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDlHMQ3B5GsWnCe7Nlo1YiG/YmHdlOiKOST5aRm4iaqYSvhvWmwcigoyWTM+8bv2+sf6nQBRDWTY4KmNV7DBk1eDnTIQo6ENA31k5/tYCLEXgjPbEjCK9spiyB62fCT6cqOhbamJB0lcDJRO6Vo1m3dy+fD0jbxfDVBBNtyltIsDQIDAQAB'

/** 每次请求随机 16 字节 AES key 的字符集，与参考 B 一致。 */
const KEY_CHARS = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678'
const AES_KEY_LENGTH = 16

const publicKey = createPublicKey({
  key: Buffer.from(RSA_PUBLIC_KEY_BASE64, 'base64'),
  format: 'der',
  type: 'spki',
})

export type EncryptedRequest = {
  /** AES-128-ECB 加密后的请求体（Base64 文本，不加引号）。 */
  body: string
  /** 本次请求的 AES key，仅用于解密响应。 */
  aesKey: Buffer
  /** RSA 加密后的 AES key。 */
  ak: string
  /** RSA 加密后的 SHA-1 签名。 */
  sk: string
  /** 毫秒时间戳。 */
  ts: string
}

/** 加密一次请求，返回请求体与响应解密所需的 ak/sk/ts。 */
export function encryptRequest(json: string): EncryptedRequest {
  const aesKey = generateAesKey()
  const ak = rsaEncrypt(aesKey)
  const sign = createHash('sha1').update(json, 'utf8').digest('hex')
  const sk = rsaEncrypt(Buffer.from(sign, 'utf8'))

  const cipher = createCipheriv('aes-128-ecb', aesKey, null)
  const body = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]).toString('base64')

  return {
    body,
    aesKey,
    ak,
    sk,
    ts: Date.now().toString(),
  }
}

/**
 * 解密响应：先去掉可选的 JSON 字符串包裹，再用本次 AES key 解密。
 * 解密失败时回退为原始响应文本，按普通 JSON 解析（见 docs/api.md 3.1）。
 */
export function decryptResponse(responseText: string, aesKey: Buffer): string {
  const base64 = unwrapJsonString(responseText.trim())

  try {
    const decipher = createDecipheriv('aes-128-ecb', aesKey, null)
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(base64, 'base64')),
      decipher.final(),
    ])

    return decrypted.toString('utf8')
  } catch {
    return responseText
  }
}

function generateAesKey(): Buffer {
  const chars: string[] = []
  for (let index = 0; index < AES_KEY_LENGTH; index += 1) {
    chars.push(KEY_CHARS[randomInt(KEY_CHARS.length)])
  }

  return Buffer.from(chars.join(''), 'utf8')
}

function rsaEncrypt(data: Buffer): string {
  return publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
    data,
  ).toString('base64')
}

/** 响应体可能是 JSON 字符串包裹的 Base64，也可能是裸 Base64。 */
function unwrapJsonString(text: string): string {
  if (!text.startsWith('"')) return text

  try {
    const parsed = JSON.parse(text) as unknown
    return typeof parsed === 'string' ? parsed : text
  } catch {
    return text
  }
}
