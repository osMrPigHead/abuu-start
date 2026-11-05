/**
 * tray-hook 适配器：启动托盘、应用状态展示、绑定退出事件。
 * tray-hook 在模块顶层解析平台二进制，缺失时会直接抛错；
 * 因此这里只静态引用类型，运行期用动态 import，失败即降级为不显示托盘。
 */
import { fileURLToPath } from "node:url";
import { TRAY_QUIT_ID, presentTray, type TrayState } from "./status.ts";
import type { MenuItemTemplate } from "tray-hook";

const RUNNING_ICON = fileURLToPath(
  new URL("./assets/running.png", import.meta.url),
);
const ERROR_ICON = fileURLToPath(
  new URL("./assets/error.png", import.meta.url),
);

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
  /** 测试注入点；缺省时动态加载 tray-hook。 */
  create?: () => TrayPort;
};

export async function startTray(
  options: StartTrayOptions,
): Promise<TrayController | null> {
  const tray = await createTray(options.create);
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
    await tray.defineStates({ running: RUNNING_ICON, error: ERROR_ICON });
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
    const { createTray: create } = await import("tray-hook");
    return create() as unknown as TrayPort;
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
