import type { IncomingMessage, ServerResponse } from "node:http";
import type { Request, Response } from "express";
import type { Plugin } from "vite";
import { createApiRouter } from "./app/routes.ts";

type NextFunction = (error?: unknown) => void;

/**
 * 本地只读中继：dev/preview 以 Vite 插件形式挂载同一份 express.Router。
 * 生产入口见 server/index.ts，挂同一份 Router；接口与错误约定见 docs/trd.md 3.1。
 * 业务数据只读；写方法仅限认证（登录、登出、预加载、单源重试）与背景目录设置。
 */
export function relayPlugin(): Plugin {
  const api = createApiRouter();
  // 包一层：connect 会把带 .handle 的对象当成子服务器并覆写 route 方法。
  const middleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: NextFunction,
  ): void => {
    api(req as unknown as Request, res as unknown as Response, next);
  };

  return {
    name: "buaa-start-relay",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
