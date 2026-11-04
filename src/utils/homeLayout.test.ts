import { describe, expect, it } from "vitest";
import {
  HOME_ROW_COUNT,
  computeHomeLayout,
  type HomeCardVisibility,
} from "@/utils/homeLayout";

function visibility(
  overrides: Partial<HomeCardVisibility> = {},
): HomeCardVisibility {
  return {
    schedule: true,
    bykc: true,
    todo: true,
    focus: true,
    ygdk: true,
    ...overrides,
  };
}

describe("home layout", () => {
  it("五张卡片全部开启时使用固定布局", () => {
    const layout = computeHomeLayout(visibility());
    expect(layout.placements.schedule).toMatchObject({
      row: 0,
      rows: 5,
      xRem: 0,
    });
    expect(layout.placements.todo).toMatchObject({ row: 5, rows: 6, xRem: 0 });
    expect(layout.placements.bykc).toMatchObject({
      row: 0,
      rows: 5,
      xRem: 36.75,
    });
    expect(layout.placements.focus).toMatchObject({
      row: 5,
      rows: 4,
      xRem: 36.75,
    });
    expect(layout.placements.ygdk).toMatchObject({
      row: 9,
      rows: 2,
      xRem: 36.75,
    });
    expect(layout.rowEnds).toHaveLength(HOME_ROW_COUNT);
    expect(
      layout.rowStarts.every((start) => Math.abs(start - 59.9) < 0.001),
    ).toBe(true);
    expect(layout.boardWidthRem).toBeCloseTo(67.4, 6);
  });

  it("关闭卡片后同列后续卡片上移", () => {
    const layout = computeHomeLayout(
      visibility({ schedule: false, bykc: false }),
    );
    expect(layout.placements.schedule).toBeUndefined();
    expect(layout.placements.bykc).toBeUndefined();
    expect(layout.placements.todo).toMatchObject({ row: 0, xRem: 0 });
    expect(layout.placements.focus).toMatchObject({ row: 0, xRem: 36.75 });
    expect(layout.placements.ygdk).toMatchObject({ row: 4, xRem: 36.75 });
  });

  it("全部关闭时只保留快捷方式最小画布宽度", () => {
    const layout = computeHomeLayout(
      visibility({
        schedule: false,
        bykc: false,
        todo: false,
        focus: false,
        ygdk: false,
      }),
    );
    expect(layout.placements).toEqual({});
    expect(layout.rowEnds.every((end) => end === 0)).toBe(true);
    expect(layout.rowStarts.every((start) => start === 0)).toBe(true);
    expect(layout.boardWidthRem).toBe(7.5);
  });

  it("仅左列或仅右列时分别从 0 开始或紧贴左列", () => {
    const leftOnly = computeHomeLayout(
      visibility({ bykc: false, focus: false, ygdk: false }),
    );
    expect(leftOnly.rowStarts.every((start) => start === 36.75)).toBe(true);
    expect(leftOnly.boardWidthRem).toBe(44.25);

    const rightOnly = computeHomeLayout(
      visibility({ schedule: false, todo: false }),
    );
    expect(rightOnly.placements.bykc).toMatchObject({ xRem: 0 });
    expect(rightOnly.rowStarts[0]).toBeCloseTo(23.15, 6);
  });
});
