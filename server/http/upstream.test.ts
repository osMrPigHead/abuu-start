// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  fetchUpstream,
  isTransientStatus,
  looksLikeHtml,
  readEnvelope,
} from "./upstream.ts";

describe("fetchUpstream", () => {
  it("读取 JSON 响应与 Content-Type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const result = await fetchUpstream("https://example.com/api");
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("application/json");
    expect(result.text).toBe('{"ok":true}');
    expect(result.json).toEqual({ ok: true });
  });

  it("非 JSON 响应时 json 为 undefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html></html>", { status: 200 })),
    );
    const result = await fetchUpstream("https://example.com/api");
    expect(result.json).toBeUndefined();
    expect(looksLikeHtml(result.text)).toBe(true);
  });

  it("网络失败抛 UPSTREAM_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect failed");
      }),
    );
    await expect(
      fetchUpstream("https://example.com/api"),
    ).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
  });

  it("超时抛 UPSTREAM_TIMEOUT", async () => {
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

    const promise = fetchUpstream("https://example.com/api");
    const assertion = expect(promise).rejects.toMatchObject({
      code: "UPSTREAM_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  it("looksLikeHtml / isTransientStatus", () => {
    expect(looksLikeHtml("  <html>")).toBe(true);
    expect(looksLikeHtml('{"a":1}')).toBe(false);
    expect(isTransientStatus(408)).toBe(true);
    expect(isTransientStatus(429)).toBe(true);
    expect(isTransientStatus(500)).toBe(true);
    expect(isTransientStatus(401)).toBe(false);
  });
});

describe("readEnvelope", () => {
  const base = (json: unknown, status = 200) => ({
    status,
    text: JSON.stringify(json),
    json,
  });

  const rule = {
    label: "SPOC",
    isSuccess: (code: unknown) => Number(code) === 200,
    read: (json: Record<string, unknown>) => json.content,
    authPattern: /登录|未认证/,
    authMessage: "SPOC 登录状态已失效",
  };

  it("成功码返回 payload", () => {
    expect(
      readEnvelope(base({ code: 200, content: { ok: true } }), rule),
    ).toEqual({ ok: true });
  });

  it("认证文案映射 AUTH_EXPIRED 并保留上游消息", () => {
    expect(() =>
      readEnvelope(base({ code: 500, msg: "请重新登录" }), rule),
    ).toThrowError(
      expect.objectContaining({
        code: "AUTH_EXPIRED",
        message: "请重新登录",
      }),
    );
  });

  it("业务错误映射 UPSTREAM_ERROR", () => {
    expect(() =>
      readEnvelope(base({ code: 500, msg: "业务错误" }), rule),
    ).toThrowError(
      expect.objectContaining({
        code: "UPSTREAM_ERROR",
        message: "业务错误",
      }),
    );
  });

  it("非对象响应映射 BAD_RESPONSE", () => {
    expect(() => readEnvelope(base(null), rule)).toThrowError(
      expect.objectContaining({ code: "BAD_RESPONSE" }),
    );
  });

  it("useAuthMessageOnly 固定认证文案", () => {
    expect(() =>
      readEnvelope(base({ code: "1", errmsg: "会话已失效" }), {
        label: "博雅",
        codeKey: "status",
        messageKey: "errmsg",
        isSuccess: (code) => code === "0",
        read: (json) => json.data,
        authPattern: /会话/,
        authMessage: "博雅登录状态已失效",
        useAuthMessageOnly: true,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "AUTH_EXPIRED",
        message: "博雅登录状态已失效",
      }),
    );
  });
});
