import { RELAY_PORT } from "@shared/relay";
import { afterEach, describe, expect, it, vi } from "vitest";

const DEFAULT_ORIGIN = `http://127.0.0.1:${RELAY_PORT}`;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("api base", () => {
  it("默认指向本机中继端口并拼接路径", async () => {
    vi.resetModules();
    const { RELAY_ORIGIN, relayUrl } = await import("@/api/base");

    expect(RELAY_ORIGIN).toBe(DEFAULT_ORIGIN);
    expect(relayUrl("/api/health")).toBe(`${DEFAULT_ORIGIN}/api/health`);
    expect(relayUrl("api/health")).toBe(`${DEFAULT_ORIGIN}/api/health`);
  });

  it("WXT_RELAY_ORIGIN 覆盖默认地址并去掉末尾斜杠", async () => {
    vi.stubEnv("WXT_RELAY_ORIGIN", "http://127.0.0.1:5173/");
    vi.resetModules();
    const { RELAY_ORIGIN, relayUrl } = await import("@/api/base");

    expect(RELAY_ORIGIN).toBe("http://127.0.0.1:5173");
    expect(relayUrl("/api/health")).toBe("http://127.0.0.1:5173/api/health");
  });
});
