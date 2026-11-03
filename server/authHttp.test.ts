// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { CookieJar, downloadWithJar, requestWithJar } from "./authHttp.ts";

function setCookieHeaders(...values: string[]): Headers {
  const headers = new Headers();
  for (const value of values) headers.append("set-cookie", value);
  return headers;
}

describe("CookieJar", () => {
  it("保存 Set-Cookie 并按域名、路径、协议匹配", () => {
    const jar = new CookieJar();
    jar.applySetCookie(
      "https://byxt.buaa.edu.cn/jwapp/",
      setCookieHeaders(
        "sid=abc; Path=/; Domain=buaa.edu.cn; Max-Age=3600; Secure; HttpOnly",
        "pref=1; Path=/app",
      ),
    );

    expect(jar.headerFor("https://byxt.buaa.edu.cn/app/x")).toBe(
      "sid=abc; pref=1",
    );
    expect(jar.headerFor("https://sub.byxt.buaa.edu.cn/app/x")).toBe("sid=abc");
    expect(jar.headerFor("http://byxt.buaa.edu.cn/app/x")).toBe("pref=1");
    expect(jar.headerFor("https://byxt.buaa.edu.cn/application")).toBe(
      "sid=abc",
    );
  });

  it("host-only Cookie 不发送给子域名", () => {
    const jar = new CookieJar();
    jar.applySetCookie(
      "https://byxt.buaa.edu.cn/",
      setCookieHeaders("sid=abc; Path=/"),
    );
    expect(jar.headerFor("https://byxt.buaa.edu.cn/x")).toBe("sid=abc");
    expect(jar.headerFor("https://sub.byxt.buaa.edu.cn/x")).toBe("");
  });

  it("过期 Cookie 被清理", () => {
    const jar = new CookieJar();
    jar.applySetCookie(
      "https://example.com/",
      setCookieHeaders("sid=abc; Path=/; Max-Age=60"),
    );
    expect(jar.headerFor("https://example.com/")).toBe("sid=abc");

    jar.applySetCookie(
      "https://example.com/",
      setCookieHeaders("sid=; Path=/; Max-Age=0"),
    );
    expect(jar.headerFor("https://example.com/")).toBe("");
    expect(jar.serialize()).toEqual([]);
  });

  it("serialize / load / clear", () => {
    const jar = new CookieJar();
    jar.applySetCookie("https://example.com/", setCookieHeaders("a=1; Path=/"));
    const serialized = jar.serialize();
    expect(serialized).toHaveLength(1);

    const restored = new CookieJar();
    restored.load(serialized);
    expect(restored.headerFor("https://example.com/")).toBe("a=1");

    restored.clear();
    expect(restored.headerFor("https://example.com/")).toBe("");
  });

  it("忽略无法解析的 Set-Cookie", () => {
    const jar = new CookieJar();
    jar.applySetCookie(
      "https://example.com/",
      setCookieHeaders("invalid", "=value; Path=/"),
    );
    expect(jar.serialize()).toEqual([]);
  });
});

describe("requestWithJar", () => {
  it("跟随跳转、携带 Cookie 并记录 visited", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("http://sso.buaa.edu.cn/")) {
        return new Response("", {
          status: 302,
          headers: {
            location: "https://sso.buaa.edu.cn/login?token=1",
            "set-cookie": "sid=abc; Path=/",
          },
        });
      }

      expect(new Headers(init?.headers).get("cookie")).toBe("sid=abc");
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestWithJar(
      new CookieJar(),
      "http://sso.buaa.edu.cn/login",
      {},
      { maxRedirects: 2, upgradeSsoHttp: true },
    );

    expect(result.status).toBe(200);
    expect(result.json).toEqual({ ok: true });
    expect(result.url).toBe("https://sso.buaa.edu.cn/login?token=1");
    expect(result.visited[0]).toBe("http://sso.buaa.edu.cn/login");
    expect(result.visited[1]).toBe("https://sso.buaa.edu.cn/login?token=1");
  });

  it("超过最大跳转次数抛错", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("", {
            status: 302,
            headers: { location: "/next" },
          }),
      ),
    );

    await expect(
      requestWithJar(
        new CookieJar(),
        "https://example.com/start",
        {},
        { maxRedirects: 1 },
      ),
    ).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      message: "上游跳转次数过多",
    });
  });

  it("网络失败与超时映射为 RelayError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect failed");
      }),
    );
    await expect(
      requestWithJar(new CookieJar(), "https://example.com/"),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });

    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      ),
    );
    const promise = requestWithJar(
      new CookieJar(),
      "https://example.com/",
      {},
      { timeoutMs: 1000 },
    );
    const assertion = expect(promise).rejects.toMatchObject({
      code: "UPSTREAM_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("downloadWithJar 返回二进制数据与内容类型", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(Buffer.from("image-bytes"), {
            status: 200,
            headers: { "content-type": "image/png" },
          }),
      ),
    );

    const result = await downloadWithJar(
      new CookieJar(),
      "https://example.com/image.png",
    );
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("image/png");
    expect(result.data.toString()).toBe("image-bytes");
  });
});
