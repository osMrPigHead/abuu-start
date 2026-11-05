// @vitest-environment node
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { startTray, type TrayPort } from "./controller.ts";
import type { MenuItemTemplate } from "tray-hook";

function createFakeTray() {
  const emitter = new EventEmitter();

  return {
    start: vi.fn(async () => {}),
    defineStates: vi.fn(async () => {}),
    setState: vi.fn(async () => {}),
    setTooltip: vi.fn(async () => {}),
    setMenu: vi.fn(async (template: MenuItemTemplate[]) => template),
    on: vi.fn((event: string, listener: (...args: never[]) => void) => {
      emitter.on(event, listener as (...args: unknown[]) => void);
      return emitter;
    }),
    quit: vi.fn(async () => {
      emitter.emit("exit", 0);
    }),
    destroy: vi.fn(),
    emit(event: string, ...args: unknown[]): void {
      emitter.emit(event, ...args);
    },
  };
}

function trayFactory(fake: ReturnType<typeof createFakeTray>) {
  return () => fake as unknown as TrayPort;
}

describe("startTray", () => {
  it("配置运行态图标、文案与菜单，并绑定退出项", async () => {
    const fake = createFakeTray();
    const onQuit = vi.fn();
    const controller = await startTray({
      state: { phase: "running", port: 3000 },
      onQuit,
      create: trayFactory(fake),
    });

    expect(controller).not.toBeNull();
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.defineStates).toHaveBeenCalledWith({
      running: expect.stringContaining("running.png"),
      error: expect.stringContaining("error.png"),
    });
    expect(fake.setState).toHaveBeenCalledWith("running");
    expect(fake.setTooltip).toHaveBeenCalledWith(
      expect.stringContaining("127.0.0.1:3000"),
    );

    const menu = fake.setMenu.mock.calls[0]?.[0] ?? [];
    expect(menu).toHaveLength(3);
    expect(menu[0]).toMatchObject({ id: "status", enabled: false });
    expect(menu[2]).toMatchObject({ id: "quit", title: "退出" });

    fake.emit("click", "status");
    expect(onQuit).not.toHaveBeenCalled();
    fake.emit("click", "quit");
    expect(onQuit).toHaveBeenCalledTimes(1);

    await controller?.quit();
    expect(fake.quit).toHaveBeenCalledTimes(1);
    expect(fake.destroy).not.toHaveBeenCalled();
  });

  it("配置异常态文案", async () => {
    const fake = createFakeTray();
    const controller = await startTray({
      state: { phase: "error", port: 3000, reason: "端口 3000 已被占用" },
      onQuit: vi.fn(),
      create: trayFactory(fake),
    });

    expect(fake.setState).toHaveBeenCalledWith("error");
    expect(fake.setTooltip).toHaveBeenCalledWith(
      expect.stringContaining("端口 3000 已被占用"),
    );

    await controller?.quit();
  });

  it("启动失败时销毁托盘并返回 null", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = createFakeTray();
    fake.start.mockRejectedValueOnce(new Error("spawn failed"));

    const controller = await startTray({
      state: { phase: "running", port: 3000 },
      onQuit: vi.fn(),
      create: trayFactory(fake),
    });

    expect(controller).toBeNull();
    expect(fake.destroy).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("退出等待超时后兜底销毁，且重复调用幂等", async () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeTray();
      fake.quit.mockImplementationOnce(async () => {});
      const controller = await startTray({
        state: { phase: "running", port: 3000 },
        onQuit: vi.fn(),
        create: trayFactory(fake),
      });

      const first = controller?.quit();
      await vi.advanceTimersByTimeAsync(1_600);
      await first;

      expect(fake.quit).toHaveBeenCalledTimes(1);
      expect(fake.destroy).toHaveBeenCalledTimes(1);

      await controller?.quit();
      expect(fake.quit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
