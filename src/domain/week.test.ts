import { describe, expect, it } from "vitest";
import {
  createEmptyWeekEntry,
  resolveMaxWeek,
  weekRowState,
} from "@/domain/week";

describe("week utils", () => {
  it("resolveMaxWeek 取当前周与周次表的最大值", () => {
    expect(resolveMaxWeek({ weeks: [], currentWeek: null })).toBe(1);
    expect(
      resolveMaxWeek({
        weeks: [
          {
            serialNumber: 3,
            name: "第3周",
            startDate: "2026-03-09",
            endDate: "2026-03-15",
            curWeek: false,
          },
          {
            serialNumber: 1,
            name: "第1周",
            startDate: "2026-02-23",
            endDate: "2026-03-01",
            curWeek: false,
          },
        ],
        currentWeek: 2,
      }),
    ).toBe(3);
    expect(resolveMaxWeek({ weeks: [], currentWeek: 5 })).toBe(5);
  });

  it("weekRowState 区分加载、就绪与不可用", () => {
    expect(
      weekRowState({ ...createEmptyWeekEntry(), status: "loading" }),
    ).toBe("loading");
    expect(
      weekRowState({ ...createEmptyWeekEntry(), status: "error" }),
    ).toBe("unavailable");
    expect(
      weekRowState({ ...createEmptyWeekEntry(), status: "no-credential" }),
    ).toBe("unavailable");
    expect(
      weekRowState({ ...createEmptyWeekEntry(), status: "auth-expired" }),
    ).toBe("unavailable");
    expect(
      weekRowState({ ...createEmptyWeekEntry(), status: "error", loaded: true }),
    ).toBe("ready");
  });
});
