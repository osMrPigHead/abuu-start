import { describe, expect, it, vi } from "vitest";
import {
  LEGACY_CREDENTIALS_KEY,
  STORAGE_KEYS,
  bykcCourseCacheKey,
  bykcCoursesCacheKey,
  clearBykcCaches,
  clearCache,
  clearSpocCaches,
  clearYgdkCaches,
  readJson,
  remove,
  removeKeysWithPrefix,
  removeLegacyCredentials,
  spocDetailCacheKey,
  writeJson,
} from "@/cache/storage";

describe("storage json helpers", () => {
  it("readJson / writeJson 往返", () => {
    expect(writeJson("test.key", { a: 1 })).toBe(true);
    expect(readJson<{ a: number }>("test.key")).toEqual({ a: 1 });
  });

  it("损坏 JSON 返回 null 并删除键", () => {
    window.localStorage.setItem("test.bad", "{not-json");
    expect(readJson("test.bad")).toBeNull();
    expect(window.localStorage.getItem("test.bad")).toBeNull();
  });

  it("无法序列化的值返回 false", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(writeJson("test.circular", value)).toBe(false);
  });

  it("remove 删除本地键", () => {
    writeJson("test.remove", 1);
    remove("test.remove");
    expect(readJson("test.remove")).toBeNull();
  });
});

describe("storage keys and cache clearing", () => {
  it("按 id/页码生成缓存键", () => {
    expect(spocDetailCacheKey("abc")).toBe(
      `${STORAGE_KEYS.spocDetailCachePrefix}abc`,
    );
    expect(bykcCoursesCacheKey(2, 12)).toBe(
      `${STORAGE_KEYS.bykcCoursesCachePrefix}2.12`,
    );
    expect(bykcCourseCacheKey(99)).toBe(
      `${STORAGE_KEYS.bykcCourseCachePrefix}99`,
    );
  });

  it("clearCache 只清除数据缓存前缀", () => {
    window.localStorage.setItem(`${STORAGE_KEYS.scheduleCache}`, "cache");
    window.localStorage.setItem(
      `${STORAGE_KEYS.bykcCoursesCachePrefix}1.12`,
      "cache",
    );
    window.localStorage.setItem(STORAGE_KEYS.todos, "todo");
    window.localStorage.setItem(STORAGE_KEYS.pomodoroSettings, "settings");

    clearCache();

    expect(window.localStorage.getItem(STORAGE_KEYS.scheduleCache)).toBeNull();
    expect(
      window.localStorage.getItem(`${STORAGE_KEYS.bykcCoursesCachePrefix}1.12`),
    ).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.todos)).toBe("todo");
    expect(window.localStorage.getItem(STORAGE_KEYS.pomodoroSettings)).toBe(
      "settings",
    );
  });

  it("removeKeysWithPrefix 删除指定前缀", () => {
    window.localStorage.setItem(`${STORAGE_KEYS.spocDetailCachePrefix}a`, "a");
    window.localStorage.setItem(`${STORAGE_KEYS.spocDetailCachePrefix}b`, "b");
    window.localStorage.setItem(STORAGE_KEYS.spocAssignmentsCache, "keep");

    removeKeysWithPrefix(STORAGE_KEYS.spocDetailCachePrefix);

    expect(
      window.localStorage.getItem(`${STORAGE_KEYS.spocDetailCachePrefix}a`),
    ).toBeNull();
    expect(
      window.localStorage.getItem(`${STORAGE_KEYS.spocDetailCachePrefix}b`),
    ).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.spocAssignmentsCache)).toBe(
      "keep",
    );
  });

  it("各数据源的清理函数只动自己的缓存", () => {
    window.localStorage.setItem(STORAGE_KEYS.spocAssignmentsCache, "spoc");
    window.localStorage.setItem(
      `${STORAGE_KEYS.spocDetailCachePrefix}a`,
      "detail",
    );
    window.localStorage.setItem(STORAGE_KEYS.bykcChosenCache, "bykc");
    window.localStorage.setItem(
      `${STORAGE_KEYS.bykcCoursesCachePrefix}1.12`,
      "courses",
    );
    window.localStorage.setItem(
      `${STORAGE_KEYS.bykcCourseCachePrefix}1`,
      "course",
    );
    window.localStorage.setItem(STORAGE_KEYS.ygdkOverviewCache, "ygdk");
    window.localStorage.setItem(STORAGE_KEYS.ygdkSettings, "ygdk-settings");

    clearSpocCaches();
    expect(
      window.localStorage.getItem(STORAGE_KEYS.spocAssignmentsCache),
    ).toBeNull();
    expect(
      window.localStorage.getItem(`${STORAGE_KEYS.spocDetailCachePrefix}a`),
    ).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.bykcChosenCache)).toBe(
      "bykc",
    );

    clearBykcCaches();
    expect(
      window.localStorage.getItem(STORAGE_KEYS.bykcChosenCache),
    ).toBeNull();
    expect(
      window.localStorage.getItem(`${STORAGE_KEYS.bykcCoursesCachePrefix}1.12`),
    ).toBeNull();
    expect(
      window.localStorage.getItem(`${STORAGE_KEYS.bykcCourseCachePrefix}1`),
    ).toBeNull();

    clearYgdkCaches();
    expect(
      window.localStorage.getItem(STORAGE_KEYS.ygdkOverviewCache),
    ).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.ygdkSettings)).toBe(
      "ygdk-settings",
    );
  });

  it("removeLegacyCredentials 删除旧明文凭据键", () => {
    window.localStorage.setItem(LEGACY_CREDENTIALS_KEY, "legacy");
    removeLegacyCredentials();
    expect(window.localStorage.getItem(LEGACY_CREDENTIALS_KEY)).toBeNull();
  });
});

describe("storage degradation", () => {
  it("localStorage 写入失败时降级到内存并标记", async () => {
    vi.resetModules();
    const storage = await import("@/cache/storage");
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(storage.writeJson("test.fallback", { ok: true })).toBe(false);
    expect(storage.isStorageDegraded()).toBe(true);
    expect(storage.readJson("test.fallback")).toEqual({ ok: true });
  });
});
