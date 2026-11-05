/**
 * 生产 Express 应用：只提供 /api 中继。
 * 页面与静态资源不再由中继托管；非 /api 请求统一 404。
 */
import express from "express";
import type { Express, Response } from "express";
import { createApiRouter } from "./routes.ts";
import { isAllowedHost } from "./relayHttp.ts";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");

  // 整站校验 Host：只接受本机域名，避免 DNS rebinding 读到本机服务。
  app.use((req, res, next) => {
    if (isAllowedHost(req.headers.host)) {
      next();
      return;
    }

    sendNotFound(res);
  });

  // /api 白名单中继；未列出的 /api/* 由 Router 返回 JSON 404。
  app.use(createApiRouter());

  // 非 /api 请求没有页面或静态资源可回退，一律 404。
  app.use((_req, res) => {
    sendNotFound(res);
  });

  return app;
}

function sendNotFound(res: Response): void {
  res.status(404).type("text/plain; charset=utf-8").send("未找到");
}
