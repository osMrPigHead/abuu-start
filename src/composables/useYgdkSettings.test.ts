import { describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/utils/storage";

async function loadYgdkSettings(stored?: unknown) {
  window.localStorage.clear();
  if (stored !== undefined) {
    window.localStorage.setItem(
      STORAGE_KEYS.ygdkSettings,
      JSON.stringify(stored),
    );
  }
  vi.resetModules();
  return import("@/composables/useYgdkSettings");
}

describe("useYgdkSettings", () => {
  it("无存储时使用默认目标", async () => {
    const { useYgdkSettings } = await loadYgdkSettings();
    const settings = useYgdkSettings();
    expect(settings.termTarget.value).toBe(16);
    expect(settings.weekTarget.value).toBe(4);
  });

  it("接受数字字符串并回退非法值", async () => {
    const { useYgdkSettings } = await loadYgdkSettings({
      termTarget: "30",
      weekTarget: 99,
    });
    const settings = useYgdkSettings();
    expect(settings.termTarget.value).toBe(30);
    expect(settings.weekTarget.value).toBe(4);
  });

  it("setter 校验并持久化", async () => {
    const { useYgdkSettings } = await loadYgdkSettings();
    const settings = useYgdkSettings();
    expect(settings.setTermTarget(0)).toBe(false);
    expect(settings.setWeekTarget(15)).toBe(false);
    expect(settings.setTermTarget(40)).toBe(true);
    expect(settings.setWeekTarget(6)).toBe(true);
    expect(
      JSON.parse(
        window.localStorage.getItem(STORAGE_KEYS.ygdkSettings) ?? "{}",
      ),
    ).toEqual({
      termTarget: 40,
      weekTarget: 6,
    });
  });
});
