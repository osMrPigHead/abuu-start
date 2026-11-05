import { describe, expect, it, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("api base", () => {
  it("默认指向 127.0.0.1:3000 并拼接路径", async () => {
    vi.resetModules();
    const { RELAY_ORIGIN, relayUrl } = await import("@/api/base");

    expect(RELAY_ORIGIN).toBe("http://127.0.0.1:3000");
    expect(relayUrl("/api/health")).toBe("http://127.0.0.1:3000/api/health");
    expect(relayUrl("api/health")).toBe("http://127.0.0.1:3000/api/health");
  });

  it("WXT_RELAY_ORIGIN 覆盖默认地址并去掉末尾斜杠", async () => {
    vi.stubEnv("WXT_RELAY_ORIGIN", "http://127.0.0.1:5173/");
    vi.resetModules();
    const { RELAY_ORIGIN, relayUrl } = await import("@/api/base");

    expect(RELAY_ORIGIN).toBe("http://127.0.0.1:5173");
    expect(relayUrl("/api/health")).toBe("http://127.0.0.1:5173/api/health");
  });
});
