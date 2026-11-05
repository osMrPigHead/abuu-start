// @vitest-environment node
import { createPublicKey } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import {
  CHROME_EXTENSION_ID,
  CHROME_PUBLIC_KEY,
  deriveChromeExtensionId,
} from "../../extension.config.ts";
import { isAllowedHost, isAllowedPostOrigin, toUrl } from "./relayHttp.ts";

const LOOPBACK_HOST = "127.0.0.1:3000";
const OTHER_CHROME_EXTENSION_ID = "a".repeat(32);

describe("relay http helpers", () => {
  it("Chrome 扩展 ID 与公钥一致且公钥可解析", () => {
    expect(CHROME_EXTENSION_ID).toMatch(/^[a-p]{32}$/);
    expect(CHROME_EXTENSION_ID).toBe("abdghklddbmipnehjhadmbclgjbknfah");
    expect(deriveChromeExtensionId(CHROME_PUBLIC_KEY)).toBe(
      CHROME_EXTENSION_ID,
    );
    expect(() =>
      createPublicKey({
        key: Buffer.from(CHROME_PUBLIC_KEY, "base64"),
        format: "der",
        type: "spki",
      }),
    ).not.toThrow();
  });

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

  it("isAllowedPostOrigin 只接受固定的 Chrome/Edge 扩展 ID", () => {
    expect(
      isAllowedPostOrigin({
        origin: `chrome-extension://${CHROME_EXTENSION_ID}`,
        host: LOOPBACK_HOST,
        secFetchSite: "cross-site",
      }),
    ).toBe(true);
    expect(
      isAllowedPostOrigin({
        origin: `chrome-extension://${OTHER_CHROME_EXTENSION_ID}`,
        host: LOOPBACK_HOST,
        secFetchSite: "none",
      }),
    ).toBe(false);
    expect(
      isAllowedPostOrigin({
        origin: `chrome-extension://${CHROME_EXTENSION_ID}:123`,
        host: LOOPBACK_HOST,
        secFetchSite: "none",
      }),
    ).toBe(false);
    expect(
      isAllowedPostOrigin({
        origin: `chrome-extension://${CHROME_EXTENSION_ID}`,
        host: "evil.example:3000",
        secFetchSite: "none",
      }),
    ).toBe(false);
  });

  it("isAllowedPostOrigin 仍放行 Firefox 扩展来源", () => {
    for (const origin of [
      "moz-extension://1234-5678",
      "moz-extension://8765-4321",
    ]) {
      expect(
        isAllowedPostOrigin({
          origin,
          host: "localhost:3000",
          secFetchSite: "none",
        }),
      ).toBe(true);
    }

    expect(
      isAllowedPostOrigin({
        origin: "moz-extension://1234-5678",
        host: "evil.example:3000",
        secFetchSite: "none",
      }),
    ).toBe(false);
  });
});
