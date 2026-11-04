import { describe, expect, it } from "vitest";
import {
  cacheBadge,
  canRetrySource,
  needsSettingsSource,
  resolveAggregateSourceBadge,
  resolveSourceBadge,
} from "@/utils/sourceStatus";

describe("source status", () => {
  it("cacheBadge 显示缓存时间或兜底文案", () => {
    expect(cacheBadge(new Date(2026, 2, 2, 8, 5).toISOString())).toBe(
      "缓存于 2026-03-02 08:05",
    );
    expect(cacheBadge(null)).toBe("缓存");
  });

  it("resolveSourceBadge 按规定优先级返回标签", () => {
    expect(
      resolveSourceBadge({
        status: "auth-expired",
        savedAt: null,
        loading: true,
      }),
    ).toBe("已失效");
    expect(
      resolveSourceBadge({
        status: "no-credential",
        savedAt: null,
        loading: true,
      }),
    ).toBe("未登录");
    expect(
      resolveSourceBadge({ status: "error", savedAt: null, loading: false }),
    ).toBe("加载失败");
    expect(
      resolveSourceBadge({ status: "ok", savedAt: null, loading: true }),
    ).toBe("同步中");
    expect(
      resolveSourceBadge({
        status: "cached",
        savedAt: new Date(2026, 2, 2, 8, 5).toISOString(),
        loading: false,
      }),
    ).toBe("缓存于 2026-03-02 08:05");
    expect(
      resolveSourceBadge({ status: "ok", savedAt: null, loading: false }),
    ).toBe("已同步");
    expect(
      resolveSourceBadge({ status: "idle", savedAt: null, loading: false }),
    ).toBe("待接入");
  });

  it("resolveAggregateSourceBadge 聚合多个数据源", () => {
    expect(resolveAggregateSourceBadge([])).toBe("待接入");
    expect(
      resolveAggregateSourceBadge([
        { status: "error", savedAt: null, loading: false },
        { status: "auth-expired", savedAt: null, loading: false },
      ]),
    ).toBe("已失效");
    expect(
      resolveAggregateSourceBadge([
        {
          status: "cached",
          savedAt: new Date(2026, 2, 2, 8, 5).toISOString(),
          loading: false,
        },
        {
          status: "cached",
          savedAt: new Date(2026, 1, 1, 8, 0).toISOString(),
          loading: false,
        },
      ]),
    ).toBe("缓存于 2026-02-01 08:00");
    expect(
      resolveAggregateSourceBadge([
        { status: "ok", savedAt: null, loading: false },
        { status: "ok", savedAt: null, loading: false },
      ]),
    ).toBe("已同步");
    expect(
      resolveAggregateSourceBadge([
        { status: "ok", savedAt: null, loading: false },
        { status: "idle", savedAt: null, loading: false },
      ]),
    ).toBe("待接入");
  });

  it("canRetrySource / needsSettingsSource", () => {
    expect(canRetrySource({ status: "error", error: null })).toBe(true);
    expect(canRetrySource({ status: "cached", error: "boom" })).toBe(true);
    expect(canRetrySource({ status: "cached", error: null })).toBe(false);
    expect(needsSettingsSource({ status: "no-credential" })).toBe(true);
    expect(needsSettingsSource({ status: "auth-expired" })).toBe(true);
    expect(needsSettingsSource({ status: "ok" })).toBe(false);
  });
});
