import { describe, expect, it } from "vitest";
import { readYgdkOverviewCache, writeYgdkOverviewCache } from "@/cache/ygdk";
import { STORAGE_KEYS } from "@/cache/storage";

describe("ygdk cache", () => {
  it("概览缓存往返", () => {
    writeYgdkOverviewCache({
      savedAt: "2026-03-01T00:00:00.000Z",
      overview: {
        termName: "春季学期",
        termCount: 5,
        termTarget: 20,
        weekCount: 2,
        weekTarget: 4,
      },
    });

    expect(readYgdkOverviewCache()).toEqual({
      savedAt: "2026-03-01T00:00:00.000Z",
      overview: {
        termName: "春季学期",
        termCount: 5,
        termTarget: 20,
        weekCount: 2,
        weekTarget: 4,
      },
    });
  });

  it("缺字段与非法次数回退默认值", () => {
    window.localStorage.setItem(
      STORAGE_KEYS.ygdkOverviewCache,
      JSON.stringify({
        savedAt: "2026-03-01T00:00:00.000Z",
        overview: { termName: "   ", termCount: -1, weekCount: 1.8 },
      }),
    );

    expect(readYgdkOverviewCache()).toEqual({
      savedAt: "2026-03-01T00:00:00.000Z",
      overview: {
        termName: null,
        termCount: 0,
        termTarget: 0,
        weekCount: 1,
        weekTarget: 0,
      },
    });
  });

  it("缺失或损坏缓存返回 null", () => {
    expect(readYgdkOverviewCache()).toBeNull();

    window.localStorage.setItem(STORAGE_KEYS.ygdkOverviewCache, "{bad");
    expect(readYgdkOverviewCache()).toBeNull();
  });
});
