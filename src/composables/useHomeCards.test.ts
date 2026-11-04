import { describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/utils/storage";

async function loadHomeCards(stored?: unknown) {
  window.localStorage.clear();
  if (stored !== undefined) {
    window.localStorage.setItem(STORAGE_KEYS.homeCards, JSON.stringify(stored));
  }
  vi.resetModules();
  return import("@/composables/useHomeCards");
}

describe("useHomeCards", () => {
  it("无存储时默认全部开启", async () => {
    const { useHomeCards } = await loadHomeCards();
    const { visibility } = useHomeCards();
    expect(visibility).toEqual({
      schedule: true,
      bykc: true,
      todo: true,
      focus: true,
      ygdk: true,
    });
  });

  it("只把明确的 false 当作关闭", async () => {
    const { useHomeCards } = await loadHomeCards({
      schedule: false,
      todo: "no",
    });
    const { visibility } = useHomeCards();
    expect(visibility.schedule).toBe(false);
    expect(visibility.todo).toBe(true);
  });

  it("setVisible 修改状态并持久化", async () => {
    const { useHomeCards } = await loadHomeCards();
    const { visibility, setVisible } = useHomeCards();
    expect(setVisible("focus", false)).toBe(true);
    expect(visibility.focus).toBe(false);
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEYS.homeCards) ?? "{}"),
    ).toMatchObject({
      focus: false,
    });
  });
});
