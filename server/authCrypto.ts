/**
 * 凭据加密：AES-256-GCM + 独立密钥文件，见 docs/trd-phase3.md 4.2 / 4.3。
 * 只使用 Node 内置 node:crypto，不引入第三方加密库。
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { CredentialEnvelope } from './authTypes.ts'

const AAD = Buffer.from('buaa-start/credentials/v1', 'utf8')
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32

export function generateKey(): Buffer {
  return randomBytes(KEY_BYTES)
}

export function isValidKey(key: Buffer): boolean {
  return key.length === KEY_BYTES
}

export function encryptCredentials(plain: string, key: Buffer): CredentialEnvelope {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  cipher.setAAD(AAD)

  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    version: 1,
    alg: 'AES-256-GCM',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: data.toString('base64'),
  }
}

/** 解密失败（GCM 校验、长度、base64）一律抛错，由调用方按损坏处理。 */
export function decryptCredentials(envelope: CredentialEnvelope, key: Buffer): string {
  if (envelope.version !== 1 || envelope.alg !== 'AES-256-GCM') {
    throw new Error('unsupported credentials envelope')
  }

  const iv = Buffer.from(envelope.iv, 'base64')
  const tag = Buffer.from(envelope.tag, 'base64')
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('invalid credentials envelope')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAAD(AAD)
  decipher.setAuthTag(tag)

  return Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
