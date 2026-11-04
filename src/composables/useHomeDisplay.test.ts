import { describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/cache/storage";

async function loadHomeDisplay(stored?: unknown) {
  window.localStorage.clear();
  if (stored !== undefined) {
    window.localStorage.setItem(
      STORAGE_KEYS.homeDisplay,
      JSON.stringify(stored),
    );
  }
  vi.resetModules();
  return import("@/composables/useHomeDisplay");
}

describe("useHomeDisplay", () => {
  it("无存储时默认关闭仅时钟模式", async () => {
    const { useHomeDisplay } = await loadHomeDisplay();
    expect(useHomeDisplay().display).toEqual({ minimalMode: false });
  });

  it("读取已保存的 minimalMode", async () => {
    const { useHomeDisplay } = await loadHomeDisplay({ minimalMode: true });
    expect(useHomeDisplay().display).toEqual({ minimalMode: true });
  });

  it("进入与退出仅时钟模式并持久化", async () => {
    const { useHomeDisplay } = await loadHomeDisplay();
    const { display, enterMinimalMode, exitMinimalMode } = useHomeDisplay();

    expect(enterMinimalMode()).toBe(true);
    expect(display.minimalMode).toBe(true);
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEYS.homeDisplay) ?? "{}"),
    ).toEqual({ minimalMode: true });

    expect(exitMinimalMode()).toBe(true);
    expect(display.minimalMode).toBe(false);
  });
});
