import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { RelayError, toErrorBody, toRelayError } from './errors.ts'
import { resolveRoute } from './routes.ts'

type NextFunction = (error?: unknown) => void

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
const API_PREFIX = '/api'

/**
 * 本地只读中继：以 Vite 插件形式挂到 dev server 与 preview server。
 * 约束见 docs/trd.md 3.1 / 9。
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

    if (req.method !== 'GET') {
      throw new RelayError('METHOD_NOT_ALLOWED', '仅支持 GET')
    }

    const handler = resolveRoute(pathname)
    if (!handler) {
      throw new RelayError('NOT_FOUND', '未找到')
    }

    const url = new URL(req.url ?? pathname, 'http://127.0.0.1')
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
