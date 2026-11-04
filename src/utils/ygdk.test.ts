import { describe, expect, it } from "vitest";
import {
  DEFAULT_YGDK_TERM_TARGET,
  DEFAULT_YGDK_WEEK_TARGET,
  isValidYgdkTermTarget,
  isValidYgdkUid,
  isValidYgdkWeekTarget,
  resolveYgdkTermTarget,
  resolveYgdkWeekLimit,
  ygdkProgressPercent,
} from "@/utils/ygdk";

describe("ygdk utils", () => {
  it("目标校验上下界", () => {
    expect(isValidYgdkTermTarget(1)).toBe(true);
    expect(isValidYgdkTermTarget(100)).toBe(true);
    expect(isValidYgdkTermTarget(0)).toBe(false);
    expect(isValidYgdkTermTarget(101)).toBe(false);
    expect(isValidYgdkWeekTarget(1)).toBe(true);
    expect(isValidYgdkWeekTarget(14)).toBe(true);
    expect(isValidYgdkWeekTarget(15)).toBe(false);
  });

  it("UID 必须是十进制安全整数", () => {
    expect(isValidYgdkUid("12345")).toBe(true);
    expect(isValidYgdkUid(" 12345 ")).toBe(true);
    expect(isValidYgdkUid("")).toBe(false);
    expect(isValidYgdkUid("12a")).toBe(false);
    expect(isValidYgdkUid("1234567890123456")).toBe(false);
  });

  it("resolveYgdkTermTarget 优先系统值，其次用户值，最后默认值", () => {
    expect(resolveYgdkTermTarget(20, 30)).toBe(20);
    expect(resolveYgdkTermTarget(0, 30)).toBe(30);
    expect(resolveYgdkTermTarget(0, 0)).toBe(DEFAULT_YGDK_TERM_TARGET);
    expect(resolveYgdkTermTarget(Number.NaN, 30)).toBe(30);
  });

  it("resolveYgdkWeekLimit 只使用用户设置", () => {
    expect(resolveYgdkWeekLimit(7)).toBe(7);
    expect(resolveYgdkWeekLimit(0)).toBe(DEFAULT_YGDK_WEEK_TARGET);
  });

  it("ygdkProgressPercent 封顶并取整", () => {
    expect(ygdkProgressPercent(0, 16)).toBe(0);
    expect(ygdkProgressPercent(8, 16)).toBe(50);
    expect(ygdkProgressPercent(20, 16)).toBe(100);
    expect(ygdkProgressPercent(1, 3)).toBe(33);
    expect(ygdkProgressPercent(1, 0)).toBe(0);
    expect(ygdkProgressPercent(Number.NaN, 16)).toBe(0);
  });
});
