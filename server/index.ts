/**
 * 生产用 Express 入口：同源提供 dist 构建产物与 /api 中继。
 * dev / preview 仍由 vite.config.ts 的 relayPlugin 挂同一份 Router，接口不变。
 * 只监听 127.0.0.1；启动方式见 docs/trd.md 8。
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApiRouter } from "./app/routes.ts";
import { isAllowedHost } from "./app/relayHttp.ts";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const DIST_DIR = fileURLToPath(new URL("../dist/", import.meta.url));
const INDEX_FILE = join(DIST_DIR, "index.html");

const app = express();
app.disable("x-powered-by");

// 整站校验 Host：只接受本机域名，避免 DNS rebinding 读到本机服务。
app.use((req, res, next) => {
  if (isAllowedHost(req.headers.host)) {
    next();
    return;
  }

  res.status(404).type("text/plain; charset=utf-8").send("未找到");
});

// /api 白名单中继；非 /api 请求交给静态资源与 SPA fallback。
app.use(createApiRouter());

if (existsSync(INDEX_FILE)) {
  app.use(express.static(DIST_DIR, { index: false }));
}

// history 模式：非 /api 页面请求回退 index.html；未构建时给出提示。
app.use((req, res, next) => {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    next();
    return;
  }

  if (!req.accepts("html")) {
    next();
    return;
  }

  // 带扩展名的请求视为静态资源，未命中时直接 404，不回退 index.html。
  if (/\.[^/]+$/.test(req.path)) {
    next();
    return;
  }

  if (!existsSync(INDEX_FILE)) {
    res
      .status(503)
      .type("text/plain; charset=utf-8")
      .send("尚未构建前端，请先运行 npm run build");
    return;
  }

  res.sendFile(
    INDEX_FILE,
    { headers: { "Cache-Control": "no-store" } },
    (error) => {
      if (error) next(error);
    },
  );
});

app.use((_req, res) => {
  res.status(404).type("text/plain; charset=utf-8").send("未找到");
});

const port = readPort(process.env.PORT);
const server = app.listen(port, HOST, () => {
  console.info(`[relay] Express 已启动：http://${HOST}:${port}`);
  if (!existsSync(INDEX_FILE)) {
    console.info("[relay] 未找到 dist，先运行 npm run build；当前仅提供 /api");
  }
});

server.on("error", (error: Error) => {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "EADDRINUSE") {
    console.error(
      `[relay] 端口 ${port} 已被占用，可用 PORT=<端口> npm start 换端口`,
    );
  } else {
    console.error("[relay] 启动失败", error);
  }
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

function readPort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PORT;

  const value = Number(raw);
  if (Number.isInteger(value) && value > 0 && value < 65536) return value;

  console.warn(`[relay] PORT=${raw} 不合法，改用 ${DEFAULT_PORT}`);
  return DEFAULT_PORT;
}
