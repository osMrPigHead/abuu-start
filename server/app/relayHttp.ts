/**
 * 中继 HTTP 边界工具：Host / Origin 校验、JSON body 读取、JSON 与图片响应、
 * 日志与错误映射。dev/preview 的 Vite 插件与生产 Express 共用，见 docs/trd.md 3.1。
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import type { BackgroundImageResult } from "../local/background.ts";
import { RelayError, toErrorBody, toRelayError } from "../core/errors.ts";

const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const API_PREFIX = "/api";
const MAX_BODY_BYTES = 16 * 1024;
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;|$)/i;

/** 路由 handler 的输入；params 由 express.Router 解码。 */
export type RelayContext = {
  url: URL;
  params: Record<string, string>;
  /** 仅 POST 接口提供；无请求体时为 undefined。 */
  body?: unknown;
};

export type RelayHandler = (
  context: RelayContext,
) => Promise<unknown> | unknown;

/**
 * /api 入口中间件：非 /api 请求直接退出 Router，交给 Vite 或静态资源；
 * 然后按“日志 → Host → 方法白名单”的顺序校验，顺序与改造前一致。
 */
export function apiBoundary(): RequestHandler {
  return (req, res, next) => {
    if (!isApiPath(req.url)) {
      next("router");
      return;
    }

    const startedAt = performance.now();
    res.on("finish", () => {
      const durationMs = Math.round(performance.now() - startedAt);
      console.info(
        `[relay] ${req.method} ${readPathname(req.originalUrl ?? req.url)} ${res.statusCode} ${durationMs}ms`,
      );
    });

    if (!isAllowedHost(req.headers.host)) {
      sendRelayError(res, new RelayError("NOT_FOUND", "未找到"));
      return;
    }

    if (req.method !== "GET" && req.method !== "POST") {
      sendRelayError(
        res,
        new RelayError("METHOD_NOT_ALLOWED", "仅支持 GET 与白名单 POST"),
      );
      return;
    }

    next();
  };
}

/** GET 路由：handler 返回业务数据，由本层写 JSON 响应。 */
export function jsonRoute(handler: RelayHandler): RequestHandler {
  return async (req, res) => {
    const data = await handler(toContext(req));
    sendJson(res, 200, data);
  };
}

/** POST 路由：同源校验 → 读取 JSON body → handler，顺序不变。 */
export function jsonPostRoute(handler: RelayHandler): RequestHandler[] {
  return [
    assertPostOrigin,
    async (req, res) => {
      const body = await readJsonBody(req);
      const data = await handler({ ...toContext(req), body });
      sendJson(res, 200, data);
    },
  ];
}

/** 未列出的 /api/* 一律 404，不回退到 SPA。 */
export function apiNotFound(): RequestHandler {
  return (_req, res) => {
    sendRelayError(res, new RelayError("NOT_FOUND", "未找到"));
  };
}

/** 统一错误响应：RelayError 原样映射，其余按内部错误处理。 */
export function relayErrorHandler(): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.writableEnded) {
      next(error);
      return;
    }

    sendRelayError(res, normalizeRelayError(error));
  };
}

export function isAllowedHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;

  try {
    return ALLOWED_HOSTS.has(new URL(`http://${hostHeader}`).hostname);
  } catch {
    return false;
  }
}

export function toUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", "http://127.0.0.1");
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  if (res.writableEnded) return;

  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function sendImage(
  res: ServerResponse,
  image: BackgroundImageResult,
): void {
  if (res.writableEnded) return;

  res.statusCode = 200;
  res.setHeader("Content-Type", image.contentType);
  res.setHeader("Content-Length", image.data.byteLength);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(image.data);
}

/**
 * POST 来源校验，见 docs/trd.md 3.1。
 * 浏览器扩展页面与中继不同源，但扩展来源无法被网页伪造，因此额外放行
 * chrome-extension:// 与 moz-extension://；Host 仍必须是本机地址。
 */
export function isAllowedPostOrigin(input: {
  origin: string | undefined;
  host: string | undefined;
  secFetchSite: string | undefined;
}): boolean {
  if (!isAllowedHost(input.host)) return false;
  if (typeof input.origin !== "string") return false;

  let parsed: URL;
  try {
    parsed = new URL(input.origin);
  } catch {
    return false;
  }

  if (
    parsed.protocol === "chrome-extension:" ||
    parsed.protocol === "moz-extension:"
  ) {
    return true;
  }

  if (input.secFetchSite === "cross-site") return false;

  return (
    parsed.protocol === "http:" &&
    ALLOWED_HOSTS.has(parsed.hostname) &&
    parsed.host === input.host
  );
}

const assertPostOrigin: RequestHandler = (req, _res, next) => {
  const allowed = isAllowedPostOrigin({
    origin: req.headers.origin,
    host: req.headers.host,
    secFetchSite: req.headers["sec-fetch-site"],
  });

  if (!allowed) {
    next(new RelayError("FORBIDDEN_ORIGIN", "请求来源不合法"));
    return;
  }

  next();
};

/** 有请求体时必须是 JSON 对象；无请求体允许。 */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const contentLength = req.headers["content-length"];
  if (
    typeof contentLength === "string" &&
    Number(contentLength) > MAX_BODY_BYTES
  ) {
    throw new RelayError("PAYLOAD_TOO_LARGE", "请求体过大");
  }

  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new RelayError("PAYLOAD_TOO_LARGE", "请求体过大");
    }
    chunks.push(buffer);
  }

  if (total === 0) return undefined;

  const contentType = req.headers["content-type"] ?? "";
  if (!JSON_CONTENT_TYPE.test(contentType)) {
    throw new RelayError("UNSUPPORTED_MEDIA", "请求体必须是 JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new RelayError("INVALID_REQUEST", "请求体不是合法 JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new RelayError("INVALID_REQUEST", "请求体必须是 JSON 对象");
  }

  return parsed;
}

function normalizeRelayError(error: unknown): RelayError {
  if (error instanceof RelayError) return error;
  if (isClientInputError(error)) {
    return new RelayError("INVALID_REQUEST", "请求路径或参数不合法");
  }

  return toRelayError(error);
}

/** express.Router 对非法百分号编码会抛带 status=400 的 URIError。 */
function isClientInputError(error: unknown): boolean {
  if (error instanceof URIError) return true;

  return (
    typeof error === "object" &&
    error !== null &&
    (error as { status?: unknown }).status === 400
  );
}

function sendRelayError(res: ServerResponse, error: RelayError): void {
  sendJson(res, error.status, toErrorBody(error));
}

function toContext(req: Request): RelayContext {
  return { url: toUrl(req), params: readParams(req) };
}

/** express 的 ParamsDictionary 允许数组值；本项目路由没有重复参数，取首项。 */
function readParams(req: Request): Record<string, string> {
  const params: Record<string, string> = {};

  for (const [key, value] of Object.entries(req.params)) {
    params[key] = Array.isArray(value) ? (value[0] ?? "") : value;
  }

  return params;
}

function isApiPath(rawUrl: string | undefined): boolean {
  return readPathname(rawUrl).startsWith(API_PREFIX);
}

/** 只取路径，不信任 Host；Host 单独校验。 */
function readPathname(rawUrl: string | undefined): string {
  if (!rawUrl) return "/";

  try {
    return new URL(rawUrl, "http://127.0.0.1").pathname;
  } catch {
    return "/";
  }
}
