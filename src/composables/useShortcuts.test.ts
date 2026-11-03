import { describe, expect, it, vi } from "vitest";
import type { Shortcut } from "@/types";
import { STORAGE_KEYS } from "@/utils/storage";

async function loadShortcuts(stored?: unknown) {
  window.localStorage.clear();
  if (stored !== undefined) {
    window.localStorage.setItem(STORAGE_KEYS.shortcuts, JSON.stringify(stored));
  }
  vi.resetModules();
  return import("@/composables/useShortcuts");
}

function shortcut(overrides: Partial<Shortcut> = {}): Shortcut {
  return {
    id: "s1",
    title: "示例",
    url: "https://example.com/",
    row: 0,
    ...overrides,
  };
}

describe("useShortcuts loading", () => {
  it("无存储时加载 19 个预置快捷方式", async () => {
    const { useShortcuts } = await loadShortcuts();
    const { shortcuts } = useShortcuts();
    expect(shortcuts.value).toHaveLength(19);
    expect(shortcuts.value[0]).toMatchObject({ id: "preset-it", row: 0 });
    expect(shortcuts.value.filter((item) => item.row === 10)).toHaveLength(3);
  });

  it("旧数据缺少 row 时按每行 4 条迁移", async () => {
    const stored = Array.from({ length: 5 }, (_, index) =>
      shortcut({
        id: `s${index}`,
        title: `站点${index}`,
        url: `https://example.com/${index}`,
      }),
    ).map((item) => ({ id: item.id, title: item.title, url: item.url }));

    const { useShortcuts } = await loadShortcuts(stored);
    const { shortcuts } = useShortcuts();
    expect(shortcuts.value.map((item) => item.row)).toEqual([0, 0, 0, 0, 1]);
  });

  it("跳过非法标题/URL 与重复 id", async () => {
    const { useShortcuts } = await loadShortcuts([
      shortcut({ id: "a" }),
      shortcut({ id: "a", title: "重复" }),
      shortcut({ id: "b", title: " ", url: "https://example.com/" }),
      shortcut({ id: "c", url: "ftp://example.com/" }),
      shortcut({ id: "d", url: "https://example.org/" }),
    ]);
    const { shortcuts } = useShortcuts();
    expect(shortcuts.value.map((item) => item.id)).toEqual(["a", "d"]);
  });
});

describe("useShortcuts mutations", () => {
  it("addShortcut 校验并持久化", async () => {
    const { useShortcuts } = await loadShortcuts([]);
    const { addShortcut, shortcuts } = useShortcuts();

    const created = addShortcut(
      { title: "  新站点  ", url: "https://example.com" },
      3,
    );
    expect(created).not.toBeNull();
    expect(created?.title).toBe("新站点");
    expect(created?.row).toBe(3);
    expect(addShortcut({ title: " ", url: "https://example.com" })).toBeNull();
    expect(addShortcut({ title: "x", url: "ftp://example.com" })).toBeNull();
    expect(shortcuts.value).toHaveLength(1);
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEYS.shortcuts) ?? "[]"),
    ).toHaveLength(1);
  });

  it("updateShortcut 更新存在条目，拒绝非法草稿", async () => {
    const { useShortcuts } = await loadShortcuts([shortcut({ id: "a" })]);
    const { updateShortcut, shortcuts } = useShortcuts();

    expect(
      updateShortcut("a", {
        title: "更新",
        url: "https://updated.example.com",
      }),
    ).toBe(true);
    expect(shortcuts.value[0]?.title).toBe("更新");
    expect(updateShortcut("a", { title: "", url: "https://example.com" })).toBe(
      false,
    );
    expect(
      updateShortcut("missing", { title: "x", url: "https://example.com" }),
    ).toBe(false);
  });

  it("removeShortcut 删除存在条目", async () => {
    const { useShortcuts } = await loadShortcuts([shortcut({ id: "a" })]);
    const { removeShortcut, shortcuts } = useShortcuts();
    removeShortcut("missing");
    expect(shortcuts.value).toHaveLength(1);
    removeShortcut("a");
    expect(shortcuts.value).toHaveLength(0);
  });

  it("moveShortcutTo 支持同行与跨行移动", async () => {
    const { useShortcuts } = await loadShortcuts([
      shortcut({ id: "a", title: "A", row: 0 }),
      shortcut({ id: "b", title: "B", row: 0 }),
      shortcut({ id: "c", title: "C", row: 1 }),
    ]);
    const { moveShortcutTo, shortcuts } = useShortcuts();

    moveShortcutTo("a", 0, 1);
    expect(
      shortcuts.value.filter((item) => item.row === 0).map((item) => item.id),
    ).toEqual(["b", "a"]);

    moveShortcutTo("c", 0, 0);
    expect(
      shortcuts.value.filter((item) => item.row === 0).map((item) => item.id),
    ).toEqual(["c", "b", "a"]);
    expect(shortcuts.value.find((item) => item.id === "c")?.row).toBe(0);
  });

  it("moveShortcutTo 对未知 id 或越界目标索引安全处理", async () => {
    const { useShortcuts } = await loadShortcuts([shortcut({ id: "a" })]);
    const { moveShortcutTo, shortcuts } = useShortcuts();

    moveShortcutTo("missing", 0, 0);
    expect(shortcuts.value).toHaveLength(1);

    moveShortcutTo("a", 99, 99);
    expect(shortcuts.value[0]?.row).toBe(10);
  });
});
