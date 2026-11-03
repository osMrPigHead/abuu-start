// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ygdkOverview } from "./ygdk.ts";

vi.mock("./authSession.ts", () => ({
  ygdkCredentials: vi.fn(() => ({ uid: 123, token: "token-1" })),
}));

import { ygdkCredentials } from "./authSession.ts";

const credentials = vi.mocked(ygdkCredentials);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function ygdkEnvelope(result: unknown): Response {
  return jsonResponse({ code: 1, result });
}

function mockFetch(
  handler: (url: string) => Response,
): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (url: string) => handler(String(url)));
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  credentials.mockReturnValue({ uid: 123, token: "token-1" });
});

describe("ygdkOverview", () => {
  it("解析分类、学期与当周次数", async () => {
    mockFetch((url) => {
      if (url.includes("Classify/getList")) {
        return ygdkEnvelope({
          list: [
            { classify_id: 2, name: "体育", term_num: 20, week_num: 4 },
            { classify_id: 1, name: "其他", term_num: 10, week_num: 2 },
          ],
        });
      }
      if (url.includes("Clockin/getCount")) {
        return ygdkEnvelope({
          term_good_count_show: 5,
          term_good_count: 6,
          term_count_show: 7,
          term_count: 8,
          term_num: 20,
          week_count: 3,
          week_num: 4,
        });
      }
      if (url.includes("Term/get")) return ygdkEnvelope({ name: "春季" });
      return new Response("not found", { status: 404 });
    });

    await expect(ygdkOverview()).resolves.toEqual({
      termName: "春季",
      termCount: 5,
      termTarget: 20,
      weekCount: 3,
      weekTarget: 4,
    });
  });

  it("分类优先体育，其次 id 1，最后第一项", async () => {
    const cases = [
      {
        list: [
          { classify_id: 5, name: "其他", term_num: 1 },
          { classify_id: 2, name: "体育", term_num: 20 },
        ],
        expected: 20,
      },
      {
        list: [
          { classify_id: 5, name: "其他", term_num: 1 },
          { classify_id: 1, name: "默认", term_num: 10 },
        ],
        expected: 10,
      },
      {
        list: [{ classify_id: 5, name: "其他", term_num: 1 }],
        expected: 1,
      },
    ];

    for (const item of cases) {
      mockFetch((url) => {
        if (url.includes("Classify/getList"))
          return ygdkEnvelope({ list: item.list });
        if (url.includes("Clockin/getCount"))
          return ygdkEnvelope({ term_good_count: 1 });
        if (url.includes("Term/get")) return ygdkEnvelope({ name: "春季" });
        return new Response("not found", { status: 404 });
      });

      await expect(ygdkOverview()).resolves.toMatchObject({
        termTarget: item.expected,
      });
    }
  });

  it("学期名请求失败不影响概览", async () => {
    mockFetch((url) => {
      if (url.includes("Classify/getList")) {
        return ygdkEnvelope({ list: [{ classify_id: 1, name: "体育" }] });
      }
      if (url.includes("Clockin/getCount")) {
        return ygdkEnvelope({ term_count: 2, week_count: 1 });
      }
      if (url.includes("Term/get"))
        return new Response("error", { status: 500 });
      return new Response("not found", { status: 404 });
    });

    await expect(ygdkOverview()).resolves.toMatchObject({
      termName: null,
      termCount: 2,
      termTarget: 0,
      weekCount: 1,
      weekTarget: 0,
    });
  });

  it("认证失效、业务错误与非 JSON 响应分别报错", async () => {
    mockFetch(() => jsonResponse({ code: -98, msg: "expired" }));
    await expect(ygdkOverview()).rejects.toMatchObject({
      code: "AUTH_EXPIRED",
    });

    mockFetch(() => jsonResponse({ code: 0, msg: "业务错误" }));
    await expect(ygdkOverview()).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      message: "业务错误",
    });

    mockFetch(() => new Response("not-json", { status: 200 }));
    await expect(ygdkOverview()).rejects.toMatchObject({
      code: "BAD_RESPONSE",
    });
  });

  it("没有可用分类时抛 UPSTREAM_ERROR", async () => {
    mockFetch(() => ygdkEnvelope({ list: [] }));
    await expect(ygdkOverview()).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      message: "未获取到阳光打卡分类",
    });
  });

  it("UID 非十进制整数时抛 INVALID_REQUEST", async () => {
    credentials.mockReturnValue({
      uid: "abc" as unknown as number,
      token: "token-1",
    });
    await expect(ygdkOverview()).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });
});
