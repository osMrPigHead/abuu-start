/**
 * tray-hook 适配器：启动托盘、应用状态展示、绑定退出事件。
 * 源码模式动态 import tray-hook；SEA 模式从本机运行时目录加载释放出的客户端。
 * 任一环节失败都降级为不显示托盘，API 继续提供。
 */
import { TRAY_QUIT_ID, presentTray, type TrayState } from "./status.ts";
import {
  loadTrayModule,
  resolveTrayRuntime,
  type TrayRuntime,
} from "./packaged.ts";
import type { MenuItemTemplate } from "tray-hook";

const QUIT_TIMEOUT_MS = 1_500;

/** 只声明实际用到的方法，便于测试注入假实现。 */
export type TrayPort = {
  start(): Promise<void>;
  defineStates(states: Record<string, string>): Promise<void>;
  setState(stateName: string): Promise<void>;
  setTooltip(title: string): Promise<void>;
  setMenu(template: MenuItemTemplate[]): Promise<void>;
  on(event: "click", listener: (id: string) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "exit", listener: (code: number | null) => void): unknown;
  quit(): Promise<void>;
  destroy(): void;
};

export type TrayController = {
  quit(): Promise<void>;
  destroy(): void;
};

export type StartTrayOptions = {
  state: TrayState;
  onQuit: () => void;
  /** 测试注入点；缺省时加载 tray-hook。 */
  create?: () => TrayPort;
  /** 测试注入点；缺省时按源码/SEA 模式解析托盘运行时。 */
  runtime?: TrayRuntime | null;
};

export async function startTray(
  options: StartTrayOptions,
): Promise<TrayController | null> {
  const runtime =
    options.runtime === undefined
      ? await resolveTrayRuntime()
      : options.runtime;
  if (!runtime) {
    console.warn("[relay] 托盘运行时不可用，继续仅提供 /api");
    return null;
  }

  const tray = await createTray(options.create, runtime);
  if (!tray) return null;

  let exited = false;
  let resolveExit: (() => void) | undefined;
  const exitPromise = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });

  // 必须先注册 error：tray-hook 在没有 error 监听时会把错误抛成未捕获异常。
  tray.on("error", (error) => {
    console.warn(`[relay] 托盘错误：${error.message}`);
  });
  tray.on("exit", (code) => {
    exited = true;
    resolveExit?.();
    if (code !== 0) {
      console.warn(`[relay] 托盘进程退出（code=${String(code)}）`);
    }
  });
  tray.on("click", (id) => {
    if (id === TRAY_QUIT_ID) options.onQuit();
  });

  const presentation = presentTray(options.state);

  try {
    await tray.start();
    await tray.defineStates({
      running: runtime.runningIconPath,
      error: runtime.errorIconPath,
    });
    await tray.setState(presentation.stateName);
    await tray.setTooltip(presentation.tooltip);
    await tray.setMenu(presentation.menu);
  } catch (error) {
    console.warn("[relay] 托盘不可用，继续仅提供 /api", error);
    destroyQuietly(tray);
    return null;
  }

  // 进程因其他原因退出时同步杀掉 daemon，避免托盘图标残留。
  const exitHook = () => {
    destroyQuietly(tray);
  };
  process.once("exit", exitHook);

  let quitting = false;
  const quit = async (): Promise<void> => {
    if (quitting) return;
    quitting = true;
    process.off("exit", exitHook);

    try {
      await tray.quit();
    } catch (error) {
      console.warn("[relay] 关闭托盘失败", error);
    }

    if (!exited) await waitForExit(exitPromise, QUIT_TIMEOUT_MS);
    if (!exited) destroyQuietly(tray);
  };

  return {
    quit,
    destroy: () => {
      destroyQuietly(tray);
    },
  };
}

async function createTray(
  factory: (() => TrayPort) | undefined,
  runtime: TrayRuntime,
): Promise<TrayPort | null> {
  if (factory) {
    try {
      return factory();
    } catch (error) {
      console.warn("[relay] 托盘不可用，继续仅提供 /api", error);
      return null;
    }
  }

  try {
    const trayModule = await loadTrayModule(runtime);
    if (!trayModule) return null;
    return trayModule.createTray() as TrayPort;
  } catch (error) {
    console.warn("[relay] 托盘不可用，继续仅提供 /api", error);
    return null;
  }
}

async function waitForExit(
  exitPromise: Promise<void>,
  timeoutMs: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      exitPromise,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function destroyQuietly(tray: TrayPort): void {
  try {
    tray.destroy();
  } catch {
    // 进程退出阶段忽略清理错误。
  }
}
