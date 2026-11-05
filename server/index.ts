/**
 * 生产入口：只提供 /api 中继，并用系统托盘指示运行状态、提供退出入口。
 * 托盘不可用或 TRAY=0 时退化为纯后台服务；只监听 127.0.0.1。
 */
import type { Server } from "node:http";
import type { Express } from "express";
import { createApp } from "./app/createApp.ts";
import {
  HOST,
  describeListenError,
  isTrayDisabled,
  readPort,
} from "./app/config.ts";
import { startTray } from "./tray/controller.ts";
import type { TrayController } from "./tray/controller.ts";

/** 优雅关闭时给在途请求的宽限，超时后强制断开。 */
const GRACEFUL_CLOSE_MS = 2_000;
/** 启动失败但托盘仍显示时，用长周期定时器保持进程存活。 */
const STARTUP_KEEPALIVE_MS = 1 << 30;

let httpServer: Server | null = null;
let tray: TrayController | null = null;
let keepAlive: ReturnType<typeof setInterval> | null = null;
let startupFailed = false;
let shuttingDown = false;

void main().catch((error: unknown) => {
  console.error("[relay] 启动失败", error);
  void shutdown(1);
});

async function main(): Promise<void> {
  const port = readPort(process.env.PORT);
  const trayDisabled = isTrayDisabled(process.env.TRAY);

  registerSignals();

  try {
    httpServer = await listen(createApp(), port);
  } catch (error) {
    await handleListenFailure(error, port, trayDisabled);
    return;
  }

  console.info(`[relay] 已启动：http://${HOST}:${port}`);

  if (trayDisabled) {
    console.info("[relay] 托盘已由 TRAY=0 关闭，仅提供 /api");
    return;
  }

  try {
    tray = await startTray({
      state: { phase: "running", port },
      onQuit: () => {
        void shutdown(0);
      },
    });
  } catch (error) {
    console.warn("[relay] 托盘初始化异常，继续仅提供 /api", error);
  }
}

function listen(app: Express, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, HOST);

    const onError = (error: Error) => {
      reject(error);
    };

    server.once("error", onError);
    server.once("listening", () => {
      server.off("error", onError);
      server.on("error", (error: Error) => {
        console.error("[relay] 监听错误", error);
      });
      resolve(server);
    });
  });
}

async function handleListenFailure(
  error: unknown,
  port: number,
  trayDisabled: boolean,
): Promise<void> {
  const reason = describeListenError(error, port);
  startupFailed = true;
  console.error(`[relay] 启动失败：${reason}`);

  if (trayDisabled) {
    process.exitCode = 1;
    return;
  }

  try {
    tray = await startTray({
      state: { phase: "error", port, reason },
      onQuit: () => {
        void shutdown(1);
      },
    });
  } catch (startError) {
    console.warn("[relay] 托盘初始化异常", startError);
    tray = null;
  }

  if (!tray) {
    process.exitCode = 1;
    return;
  }

  // 托盘仍可操作，保持进程存活，等待用户从菜单退出。
  keepAlive = setInterval(() => {}, STARTUP_KEEPALIVE_MS);
}

function registerSignals(): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void shutdown(startupFailed ? 1 : 0);
    });
  }
}

async function shutdown(code: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = code;

  if (keepAlive !== null) {
    clearInterval(keepAlive);
    keepAlive = null;
  }

  const currentServer = httpServer;
  httpServer = null;
  if (currentServer) {
    try {
      await closeServer(currentServer);
    } catch (error) {
      console.error("[relay] 关闭 HTTP 服务失败", error);
    }
  }

  const currentTray = tray;
  tray = null;
  if (currentTray) {
    try {
      await currentTray.quit();
    } catch (error) {
      console.error("[relay] 关闭托盘失败", error);
    }
  }

  // 在信号监听中直接 process.exit 会触发 Windows 上 libuv 的 uv_async 断言；
  // 服务与托盘关闭后让事件循环自然退出，退出码交给 Node。
}

async function closeServer(server: Server): Promise<void> {
  const closed = new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  server.closeIdleConnections();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const forced = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      server.closeAllConnections();
      resolve();
    }, GRACEFUL_CLOSE_MS);
  });

  try {
    await Promise.race([closed, forced]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    server.closeAllConnections();
  }
}
