import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PORT,
  describeListenError,
  isTrayDisabled,
  readPort,
} from "./config.ts";

describe("readPort", () => {
  it("缺省与空值使用默认端口", () => {
    expect(readPort(undefined)).toBe(DEFAULT_PORT);
    expect(readPort("")).toBe(DEFAULT_PORT);
    expect(readPort("   ")).toBe(DEFAULT_PORT);
  });

  it("合法端口原样返回", () => {
    expect(readPort("4000")).toBe(4000);
    expect(readPort("65535")).toBe(65535);
  });

  it("非法端口告警并回退", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(readPort("abc")).toBe(DEFAULT_PORT);
    expect(readPort("0")).toBe(DEFAULT_PORT);
    expect(readPort("65536")).toBe(DEFAULT_PORT);
    expect(readPort("1.5")).toBe(DEFAULT_PORT);
    expect(warn).toHaveBeenCalled();
  });
});

describe("isTrayDisabled", () => {
  it("仅 TRAY=0 关闭托盘", () => {
    expect(isTrayDisabled("0")).toBe(true);
    expect(isTrayDisabled(" 0 ")).toBe(true);
    expect(isTrayDisabled("1")).toBe(false);
    expect(isTrayDisabled("false")).toBe(false);
    expect(isTrayDisabled(undefined)).toBe(false);
  });
});

describe("describeListenError", () => {
  it("映射常见监听错误码", () => {
    expect(
      describeListenError(
        Object.assign(new Error("listen"), { code: "EADDRINUSE" }),
        3000,
      ),
    ).toBe("端口 3000 已被占用");
    expect(
      describeListenError(
        Object.assign(new Error("listen"), { code: "EACCES" }),
        3000,
      ),
    ).toBe("端口 3000 无权限监听");
  });

  it("其余错误保留原始信息", () => {
    expect(describeListenError(new Error("boom"), 3000)).toBe("boom");
    expect(describeListenError("oops", 3000)).toBe("未知错误");
  });
});
