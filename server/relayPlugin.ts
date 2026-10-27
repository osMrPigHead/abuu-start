import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { readBackgroundImage, type BackgroundImageResult } from './background.ts'
import { RelayError, toErrorBody, toRelayError } from './errors.ts'
import { resolvePostRoute, resolveRoute } from './routes.ts'

type NextFunction = (error?: unknown) => void

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
const API_PREFIX = '/api'
const BACKGROUND_IMAGE_PATH = '/api/background/image'
const MAX_BODY_BYTES = 16 * 1024
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;|$)/i

/**
 * 本地只读中继：以 Vite 插件形式挂到 dev server 与 preview server。
 * 业务数据只读；仅背景目录设置与本机背景扫描使用白名单 POST。
 * 约束见 docs/trd.md 3.1、docs/trd-phase3.md 3.1 / 3.3 / 9。
 */
export function relayPlugin(): Plugin {
  const middleware = createRelayMiddleware()

  return {
    name: 'buaa-start-relay',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

function createRelayMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: NextFunction): void => {
    const pathname = readPathname(req.url)

    if (!pathname.startsWith(API_PREFIX)) {
      next()
      return
    }

    void handleApiRequest(req, res, pathname)
  }
}

async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  const startedAt = performance.now()
  let status = 500

  try {
    if (!isAllowedHost(req.headers.host)) {
      throw new RelayError('NOT_FOUND', '未找到')
    }

    const method = req.method ?? ''
    if (method === 'POST') {
      const handler = resolvePostRoute(pathname)
      if (!handler) {
        throw new RelayError('NOT_FOUND', '未找到')
      }

      assertPostOrigin(req)
      const body = await readJsonBody(req)
      const url = new URL(req.url ?? pathname, 'http://127.0.0.1')
      const data = await handler({ url, headers: req.headers, body })

      status = 200
      sendJson(res, status, data)
      return
    }

    if (method !== 'GET') {
      throw new RelayError('METHOD_NOT_ALLOWED', '仅支持 GET 与白名单 POST')
    }

    const url = new URL(req.url ?? pathname, 'http://127.0.0.1')

    if (pathname === BACKGROUND_IMAGE_PATH) {
      const image = await readBackgroundImage(url.searchParams.get('name'))
      status = 200
      sendImage(res, image)
      return
    }

    const handler = resolveRoute(pathname)
    if (!handler) {
      throw new RelayError('NOT_FOUND', '未找到')
    }

    const data = await handler({ url, headers: req.headers })

    status = 200
    sendJson(res, status, data)
  } catch (error) {
    const relayError = toRelayError(error)
    status = relayError.status
    sendJson(res, status, toErrorBody(relayError))
  } finally {
    const durationMs = Math.round(performance.now() - startedAt)
    console.info(`[relay] ${req.method ?? '-'} ${pathname} ${status} ${durationMs}ms`)
  }
}

function isAllowedHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false

  try {
    return ALLOWED_HOSTS.has(new URL(`http://${hostHeader}`).hostname)
  } catch {
    return false
  }
}

/** POST 同源校验，见 docs/trd-phase3.md 3.1。 */
function assertPostOrigin(req: IncomingMessage): void {
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    throw new RelayError('FORBIDDEN_ORIGIN', '请求来源不合法')
  }

  const origin = req.headers.origin
  if (typeof origin !== 'string') {
    throw new RelayError('FORBIDDEN_ORIGIN', '请求来源不合法')
  }

  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    throw new RelayError('FORBIDDEN_ORIGIN', '请求来源不合法')
  }

  if (
    parsed.protocol !== 'http:' ||
    !ALLOWED_HOSTS.has(parsed.hostname) ||
    parsed.host !== req.headers.host
  ) {
    throw new RelayError('FORBIDDEN_ORIGIN', '请求来源不合法')
  }
}

/** 有请求体时必须是 JSON 对象；无请求体允许。 */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const contentLength = req.headers['content-length']
  if (typeof contentLength === 'string' && Number(contentLength) > MAX_BODY_BYTES) {
    throw new RelayError('PAYLOAD_TOO_LARGE', '请求体过大')
  }

  const chunks: Buffer[] = []
  let total = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    total += buffer.length
    if (total > MAX_BODY_BYTES) {
      throw new RelayError('PAYLOAD_TOO_LARGE', '请求体过大')
    }
    chunks.push(buffer)
  }

  if (total === 0) return undefined

  const contentType = req.headers['content-type'] ?? ''
  if (!JSON_CONTENT_TYPE.test(contentType)) {
    throw new RelayError('UNSUPPORTED_MEDIA', '请求体必须是 JSON')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new RelayError('INVALID_REQUEST', '请求体不是合法 JSON')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new RelayError('INVALID_REQUEST', '请求体必须是 JSON 对象')
  }

  return parsed
}

/** 只取路径，不信任 Host；Host 单独校验。 */
function readPathname(rawUrl: string | undefined): string {
  if (!rawUrl) return '/'

  try {
    return new URL(rawUrl, 'http://127.0.0.1').pathname
  } catch {
    return '/'
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded) return

  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function sendImage(res: ServerResponse, image: BackgroundImageResult): void {
  if (res.writableEnded) return

  res.statusCode = 200
  res.setHeader('Content-Type', image.contentType)
  res.setHeader('Content-Length', image.data.byteLength)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(image.data)
}
