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
  it("无存储时使用默认显示状态", async () => {
    const { useHomeDisplay } = await loadHomeDisplay();
    expect(useHomeDisplay().display).toEqual({
      showFunctionArea: true,
      showActionButtons: true,
      minimalMode: false,
    });
  });

  it("读取已保存的 false 与 minimalMode", async () => {
    const { useHomeDisplay } = await loadHomeDisplay({
      showFunctionArea: false,
      showActionButtons: false,
      minimalMode: true,
    });
    expect(useHomeDisplay().display).toEqual({
      showFunctionArea: false,
      showActionButtons: false,
      minimalMode: true,
    });
  });

  it("setter 修改并持久化", async () => {
    const { useHomeDisplay } = await loadHomeDisplay();
    const {
      display,
      setMinimalMode,
      setShowFunctionArea,
      setShowActionButtons,
    } = useHomeDisplay();

    expect(setMinimalMode(true)).toBe(true);
    expect(setShowFunctionArea(false)).toBe(true);
    expect(setShowActionButtons(false)).toBe(true);
    expect(display.minimalMode).toBe(true);
    expect(display.showFunctionArea).toBe(false);
    expect(display.showActionButtons).toBe(false);
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEYS.homeDisplay) ?? "{}"),
    ).toEqual({
      showFunctionArea: false,
      showActionButtons: false,
      minimalMode: true,
    });
  });
});
