import { describe, expect, it } from "vitest";
import {
  normalizeShortcutRow,
  normalizeShortcutUrl,
  resolveShortcutDrop,
  shortcutWidthRem,
} from "@/utils/shortcut";

describe("shortcut utils", () => {
  it("normalizeShortcutUrl 只接受绝对 http(s)", () => {
    expect(normalizeShortcutUrl(" https://example.com ")).toBe(
      "https://example.com/",
    );
    expect(normalizeShortcutUrl("http://example.com/path?x=1")).toBe(
      "http://example.com/path?x=1",
    );
    expect(normalizeShortcutUrl("ftp://example.com")).toBeNull();
    expect(normalizeShortcutUrl("example.com")).toBeNull();
    expect(normalizeShortcutUrl("")).toBeNull();
  });

  it("normalizeShortcutRow 截断并钳制行号", () => {
    expect(normalizeShortcutRow(5)).toBe(5);
    expect(normalizeShortcutRow(3.9)).toBe(3);
    expect(normalizeShortcutRow(-1)).toBe(0);
    expect(normalizeShortcutRow(99)).toBe(10);
    expect(normalizeShortcutRow(Number.NaN, 4)).toBe(4);
  });

  it("shortcutWidthRem 按标题估算并钳制", () => {
    expect(shortcutWidthRem("")).toBe(7.5);
    expect(shortcutWidthRem("abcdefghi")).toBe(8.38);
    expect(shortcutWidthRem("一二三四五")).toBe(8.07);
    expect(shortcutWidthRem("这是一个非常非常非常长的标题")).toBe(10.5);
    expect(shortcutWidthRem("abcdefghi", true)).toBe(10.5);
  });

  it("resolveShortcutDrop 计算行、序号与插入线", () => {
    const base = {
      rect: { left: 0, top: 0, width: 100 },
      boardWidthRem: 50,
      rowCount: 11,
      rowStepRem: 3.75,
      rowGapRem: 0.75,
      rowStarts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      placements: [
        { id: "a", row: 0, xRem: 0, widthRem: 10 },
        { id: "b", row: 0, xRem: 10.75, widthRem: 10 },
      ],
      draggingId: "c",
    };

    expect(
      resolveShortcutDrop({
        ...base,
        pointerX: 15,
        pointerY: 2,
      }),
    ).toEqual({ row: 0, index: 1, insertX: 10.75 });

    expect(
      resolveShortcutDrop({
        ...base,
        pointerX: 40,
        pointerY: 2,
      }),
    ).toEqual({ row: 0, index: 2, insertX: 21.5 });
  });
});
