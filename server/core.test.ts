// @vitest-environment node
import type { IncomingMessage } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { RelayError, toErrorBody, toRelayError } from './errors.ts'
import { fetchUpstream, isTransientStatus, looksLikeHtml } from './http.ts'
import { isAllowedHost, toUrl } from './relayHttp.ts'

describe('relay errors', () => {
  it('RelayError 映射 HTTP 状态', () => {
    expect(new RelayError('AUTH_EXPIRED', 'expired').status).toBe(401)
    expect(new RelayError('SOURCE_BUSY', 'busy').status).toBe(409)
    expect(new RelayError('UPSTREAM_TIMEOUT', 'timeout').status).toBe(504)
    expect(new RelayError('INTERNAL', 'internal').status).toBe(500)
  })

  it('toRelayError 透传 RelayError，其余转 INTERNAL', () => {
    const original = new RelayError('BAD_RESPONSE', 'bad')
    expect(toRelayError(original)).toBe(original)

    const converted = toRelayError(new Error('boom'))
    expect(converted.code).toBe('INTERNAL')
    expect(converted.message).toBe('本地中继内部错误')
  })

  it('toErrorBody 仅在有 upstreamStatus 时附带该字段', () => {
    expect(toErrorBody(new RelayError('UPSTREAM_ERROR', '上游错误', 502))).toEqual({
      error: { code: 'UPSTREAM_ERROR', message: '上游错误', upstreamStatus: 502 },
    })
    expect(toErrorBody(new RelayError('NOT_FOUND', '未找到'))).toEqual({
      error: { code: 'NOT_FOUND', message: '未找到' },
    })
  })
})

describe('fetchUpstream', () => {
  it('读取 JSON 响应与 Content-Type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    const result = await fetchUpstream('https://example.com/api')
    expect(result.status).toBe(200)
    expect(result.contentType).toBe('application/json')
    expect(result.text).toBe('{"ok":true}')
    expect(result.json).toEqual({ ok: true })
  })

  it('非 JSON 响应时 json 为 undefined', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html></html>', { status: 200 })),
    )
    const result = await fetchUpstream('https://example.com/api')
    expect(result.json).toBeUndefined()
    expect(looksLikeHtml(result.text)).toBe(true)
  })

  it('网络失败抛 UPSTREAM_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect failed')
      }),
    )
    await expect(fetchUpstream('https://example.com/api')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
    })
  })

  it('超时抛 UPSTREAM_TIMEOUT', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      ),
    )

    const promise = fetchUpstream('https://example.com/api')
    const assertion = expect(promise).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(15_000)
    await assertion
  })

  it('looksLikeHtml / isTransientStatus', () => {
    expect(looksLikeHtml('  <html>')).toBe(true)
    expect(looksLikeHtml('{"a":1}')).toBe(false)
    expect(isTransientStatus(408)).toBe(true)
    expect(isTransientStatus(429)).toBe(true)
    expect(isTransientStatus(500)).toBe(true)
    expect(isTransientStatus(401)).toBe(false)
  })
})

describe('relay http helpers', () => {
  it('isAllowedHost 只接受本机 Host', () => {
    expect(isAllowedHost('127.0.0.1:5173')).toBe(true)
    expect(isAllowedHost('localhost:3000')).toBe(true)
    expect(isAllowedHost('[::1]:3000')).toBe(true)
    expect(isAllowedHost('::1')).toBe(false)
    expect(isAllowedHost('0.0.0.0:3000')).toBe(false)
    expect(isAllowedHost('127.0.0.1.evil.com')).toBe(false)
    expect(isAllowedHost(undefined)).toBe(false)
  })

  it('toUrl 使用本机 base 解析请求地址', () => {
    const url = toUrl({ url: '/api/schedule?week=2' } as IncomingMessage)
    expect(url.pathname).toBe('/api/schedule')
    expect(url.searchParams.get('week')).toBe('2')

    const fallback = toUrl({ url: undefined } as IncomingMessage)
    expect(fallback.pathname).toBe('/')
  })
})
