import { describe, expect, it, vi } from "vitest";
import { ApiError, postJson, request } from "@/api/client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function stubFetch(implementation: typeof fetch): ReturnType<typeof vi.fn> {
  const mock = vi.fn(implementation);
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("api client request", () => {
  it("GET 成功时返回 JSON 并使用 no-store", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ ok: true }));
    await expect(request<{ ok: boolean }>("/api/health")).resolves.toEqual({
      ok: true,
    });

    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/health");
    expect(init).toMatchObject({ method: "GET", cache: "no-store" });
  });

  it("postJson 发送 JSON body 与 Content-Type", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ ok: true }));
    await postJson("/api/background/directory", { path: "D:/pics" });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init).toMatchObject({
      method: "POST",
      cache: "no-store",
      body: JSON.stringify({ path: "D:/pics" }),
    });
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("非 JSON Content-Type 视为中继不可达", async () => {
    stubFetch(async () => new Response("hello", { status: 200 }));
    await expect(request("/api/x")).rejects.toMatchObject({
      name: "ApiError",
      code: "RELAY_UNREACHABLE",
      status: 200,
    });
  });

  it("JSON 解析失败视为中继不可达", async () => {
    stubFetch(
      async () =>
        new Response("{bad", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(request("/api/x")).rejects.toMatchObject({
      code: "RELAY_UNREACHABLE",
      message: "本地中继返回了无法解析的响应",
    });
  });

  it("错误响应解析为 ApiError", async () => {
    stubFetch(async () =>
      jsonResponse(
        {
          error: {
            code: "AUTH_EXPIRED",
            message: "登录已失效",
            upstreamStatus: 401,
          },
        },
        401,
      ),
    );

    const error = await request("/api/x").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "AUTH_EXPIRED",
      message: "登录已失效",
      status: 401,
      upstreamStatus: 401,
    });
  });

  it("错误码非法或信封不完整时回退通用错误", async () => {
    stubFetch(async () =>
      jsonResponse({ error: { code: "UNKNOWN", message: "x" } }, 500),
    );
    await expect(request("/api/x")).rejects.toMatchObject({
      code: "RELAY_UNREACHABLE",
      message: "请求失败（HTTP 500）",
    });
  });

  it("网络失败提示本地中继未启动", async () => {
    stubFetch(async () => {
      throw new Error("connect refused");
    });
    await expect(request("/api/x")).rejects.toMatchObject({
      code: "RELAY_UNREACHABLE",
      message: "无法连接本地中继，请确认 npm run dev 已启动",
    });
  });

  it("已取消的请求返回取消文案", async () => {
    stubFetch(async () => {
      throw new Error("aborted");
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      request("/api/x", { signal: controller.signal }),
    ).rejects.toMatchObject({
      code: "RELAY_UNREACHABLE",
      message: "请求已取消",
    });
  });
});
