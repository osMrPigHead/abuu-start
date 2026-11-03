// @vitest-environment node
import { createCipheriv, createDecipheriv } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  decryptCredentials,
  encryptCredentials,
  generateKey,
  isValidKey,
} from './authCrypto.ts'
import { decryptResponse, encryptRequest } from './bykcCrypto.ts'
import { encryptSpocParam } from './spocCrypto.ts'

describe('auth crypto', () => {
  it('生成并校验 32 字节密钥', () => {
    const key = generateKey()
    expect(key).toHaveLength(32)
    expect(isValidKey(key)).toBe(true)
    expect(isValidKey(Buffer.alloc(16))).toBe(false)
  })

  it('AES-256-GCM 加密解密往返', () => {
    const key = generateKey()
    const plain = JSON.stringify({ username: '20370001', password: 'secret' })
    const envelope = encryptCredentials(plain, key)

    expect(envelope.version).toBe(1)
    expect(envelope.alg).toBe('AES-256-GCM')
    expect(decryptCredentials(envelope, key)).toBe(plain)
  })

  it('篡改密文或使用错误密钥时抛错', () => {
    const key = generateKey()
    const envelope = encryptCredentials('secret', key)
    const tampered = { ...envelope, data: Buffer.from('tampered').toString('base64') }

    expect(() => decryptCredentials(tampered, key)).toThrow()
    expect(() => decryptCredentials(envelope, generateKey())).toThrow()
  })

  it('不支持的版本或算法抛错', () => {
    const key = generateKey()
    const envelope = encryptCredentials('secret', key)
    expect(() => decryptCredentials({ ...envelope, version: 2 as 1 }, key)).toThrow()
    expect(() => decryptCredentials({ ...envelope, alg: 'AES-128-GCM' as 'AES-256-GCM' }, key)).toThrow()
  })

  it('非法 iv/tag 长度抛错', () => {
    const key = generateKey()
    const envelope = encryptCredentials('secret', key)
    expect(() => decryptCredentials({ ...envelope, iv: 'x' }, key)).toThrow()
    expect(() => decryptCredentials({ ...envelope, tag: 'x' }, key)).toThrow()
  })
})

describe('bykc crypto', () => {
  it('encryptRequest 生成随机 AES key 与 RSA 签名', () => {
    const request = encryptRequest('{"a":1}')
    expect(request.aesKey).toHaveLength(16)
    expect(request.body.length).toBeGreaterThan(0)
    expect(Buffer.from(request.ak, 'base64').length).toBeGreaterThan(0)
    expect(Buffer.from(request.sk, 'base64').length).toBeGreaterThan(0)
    expect(Number(request.ts)).toBeGreaterThan(0)
  })

  it('decryptResponse 解密 JSON 字符串包裹的 Base64', () => {
    const request = encryptRequest('{"a":1}')
    const cipher = createCipheriv('aes-128-ecb', request.aesKey, null)
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify({ status: '0', data: { ok: true } }), 'utf8'),
      cipher.final(),
    ]).toString('base64')

    const wrapped = JSON.stringify(encrypted)
    expect(JSON.parse(decryptResponse(wrapped, request.aesKey))).toEqual({
      status: '0',
      data: { ok: true },
    })
  })

  it('decryptResponse 支持裸 Base64', () => {
    const request = encryptRequest('{}')
    const cipher = createCipheriv('aes-128-ecb', request.aesKey, null)
    const encrypted = Buffer.concat([
      cipher.update('{"status":"0"}', 'utf8'),
      cipher.final(),
    ]).toString('base64')

    expect(decryptResponse(encrypted, request.aesKey)).toBe('{"status":"0"}')
  })

  it('解密失败时回退原始响应文本', () => {
    const request = encryptRequest('{}')
    expect(decryptResponse('not-encrypted', request.aesKey)).toBe('not-encrypted')
  })
})

describe('spoc crypto', () => {
  const KEY = Buffer.from('inco12345678ocni', 'utf8')
  const IV = Buffer.from('ocni12345678inco', 'utf8')

  function decryptSpocParam(encoded: string): string {
    const decipher = createDecipheriv('aes-128-cbc', KEY, IV)
    decipher.setAutoPadding(false)
    const plain = Buffer.concat([
      decipher.update(Buffer.from(encoded, 'base64')),
      decipher.final(),
    ])
    const end = plain.indexOf(0)
    return plain.subarray(0, end === -1 ? plain.length : end).toString('utf8')
  }

  it('加密结果可被固定 key/IV 解出原 JSON', () => {
    const payload = { pageSize: 15, pageNum: 1, xnxq: '2026' }
    const encoded = encryptSpocParam(payload)
    expect(JSON.parse(decryptSpocParam(encoded))).toEqual(payload)
  })

  it('相同输入产生确定结果', () => {
    const payload = { a: 1 }
    expect(encryptSpocParam(payload)).toBe(encryptSpocParam(payload))
  })

  it('按 16 字节块零填充，已对齐时不追加整块', () => {
    const aligned = JSON.stringify({ a: '12345678' })
    expect(Buffer.from(aligned, 'utf8')).toHaveLength(16)
    expect(Buffer.from(encryptSpocParam({ a: '12345678' }), 'base64')).toHaveLength(16)

    const unaligned = JSON.stringify({ a: '123456789' })
    expect(Buffer.from(unaligned, 'utf8')).toHaveLength(17)
    expect(Buffer.from(encryptSpocParam({ a: '123456789' }), 'base64')).toHaveLength(32)
  })
})
