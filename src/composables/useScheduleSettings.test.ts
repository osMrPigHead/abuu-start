import { describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/utils/storage";

async function loadScheduleSettings(stored?: unknown) {
  window.localStorage.clear();
  if (stored !== undefined) {
    window.localStorage.setItem(
      STORAGE_KEYS.scheduleHighlightLeadMinutes,
      JSON.stringify(stored),
    );
  }
  vi.resetModules();
  return import("@/composables/useScheduleSettings");
}

describe("useScheduleSettings", () => {
  it("无存储时默认 30 分钟", async () => {
    const { useScheduleSettings } = await loadScheduleSettings();
    expect(useScheduleSettings().highlightLeadMinutes.value).toBe(30);
  });

  it("读取合法数字或数字字符串", async () => {
    const first = await loadScheduleSettings(45);
    expect(first.useScheduleSettings().highlightLeadMinutes.value).toBe(45);

    const second = await loadScheduleSettings("60");
    expect(second.useScheduleSettings().highlightLeadMinutes.value).toBe(60);
  });

  it("非法值回退默认，setter 校验并持久化", async () => {
    const { useScheduleSettings } = await loadScheduleSettings(999);
    const settings = useScheduleSettings();
    expect(settings.highlightLeadMinutes.value).toBe(30);

    expect(settings.setHighlightLeadMinutes(181)).toBe(false);
    expect(settings.setHighlightLeadMinutes(0)).toBe(true);
    expect(settings.highlightLeadMinutes.value).toBe(0);
    expect(
      JSON.parse(
        window.localStorage.getItem(
          STORAGE_KEYS.scheduleHighlightLeadMinutes,
        ) ?? "null",
      ),
    ).toBe(0);
  });
});
