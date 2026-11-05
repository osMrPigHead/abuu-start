// @vitest-environment node
import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { isAllowedHost, isAllowedPostOrigin, toUrl } from "./relayHttp.ts";

describe("relay http helpers", () => {
  it("isAllowedHost 只接受本机 Host", () => {
    expect(isAllowedHost("127.0.0.1:5173")).toBe(true);
    expect(isAllowedHost("localhost:3000")).toBe(true);
    expect(isAllowedHost("[::1]:3000")).toBe(true);
    expect(isAllowedHost("::1")).toBe(false);
    expect(isAllowedHost("0.0.0.0:3000")).toBe(false);
    expect(isAllowedHost("127.0.0.1.evil.com")).toBe(false);
    expect(isAllowedHost(undefined)).toBe(false);
  });

  it("toUrl 使用本机 base 解析请求地址", () => {
    const url = toUrl({ url: "/api/schedule?week=2" } as IncomingMessage);
    expect(url.pathname).toBe("/api/schedule");
    expect(url.searchParams.get("week")).toBe("2");

    const fallback = toUrl({ url: undefined } as IncomingMessage);
    expect(fallback.pathname).toBe("/");
  });

  it("isAllowedPostOrigin 只接受本机同源", () => {
    expect(
      isAllowedPostOrigin({
        origin: "http://127.0.0.1:3000",
        host: "127.0.0.1:3000",
        secFetchSite: "same-origin",
      }),
    ).toBe(true);
    expect(
      isAllowedPostOrigin({
        origin: "http://localhost:5173",
        host: "127.0.0.1:3000",
        secFetchSite: "same-origin",
      }),
    ).toBe(false);
    expect(
      isAllowedPostOrigin({
        origin: "http://127.0.0.1:3000",
        host: "127.0.0.1:3000",
        secFetchSite: "cross-site",
      }),
    ).toBe(false);
    expect(
      isAllowedPostOrigin({
        origin: "https://evil.example",
        host: "127.0.0.1:3000",
        secFetchSite: "same-origin",
      }),
    ).toBe(false);
    expect(
      isAllowedPostOrigin({
        origin: undefined,
        host: "127.0.0.1:3000",
        secFetchSite: "same-origin",
      }),
    ).toBe(false);
    expect(
      isAllowedPostOrigin({
        origin: "http://127.0.0.1:3000",
        host: "evil.example:3000",
        secFetchSite: "same-origin",
      }),
    ).toBe(false);
  });

  it("isAllowedPostOrigin 接受扩展来源", () => {
    expect(
      isAllowedPostOrigin({
        origin: "chrome-extension://abcdefghijklmnop",
        host: "127.0.0.1:3000",
        secFetchSite: "cross-site",
      }),
    ).toBe(true);
    expect(
      isAllowedPostOrigin({
        origin: "moz-extension://1234-5678",
        host: "localhost:3000",
        secFetchSite: "none",
      }),
    ).toBe(true);
    expect(
      isAllowedPostOrigin({
        origin: "chrome-extension://abcdefghijklmnop",
        host: "evil.example:3000",
        secFetchSite: "none",
      }),
    ).toBe(false);
  });
});
