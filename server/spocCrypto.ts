import { createCipheriv } from 'node:crypto'

/**
 * SPOC 固定协议参数（不是部署密钥），见 docs/trd.md 3.3、docs/api.md 2.2。
 * AES-128-CBC / NoPadding，key 与 IV 均为 16 字节 ASCII，明文零填充后 Base64。
 */
const ALGORITHM = 'aes-128-cbc'
const KEY = Buffer.from('inco12345678ocni', 'utf8')
const IV = Buffer.from('ocni12345678inco', 'utf8')
const BLOCK_SIZE = 16

/**
 * 将对象序列化、按 16 字节零填充后加密为 Base64。
 * 已对齐时不再追加整块零字节。
 */
export function encryptSpocParam(payload: unknown): string {
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const paddingLength = (BLOCK_SIZE - (plaintext.length % BLOCK_SIZE)) % BLOCK_SIZE
  const padded =
    paddingLength === 0
      ? plaintext
      : Buffer.concat([plaintext, Buffer.alloc(paddingLength)])

  const cipher = createCipheriv(ALGORITHM, KEY, IV)
  cipher.setAutoPadding(false)

  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64')
}
