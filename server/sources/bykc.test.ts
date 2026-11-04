// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  bykcChosen,
  bykcCourseDetail,
  bykcCourses,
  bykcStatus,
} from "./bykc.ts";

vi.mock("../auth/session.ts", () => ({
  bykcToken: vi.fn(() => "token-1"),
}));

vi.mock("../upstreams/bykcCrypto.ts", () => ({
  encryptRequest: vi.fn(() => ({
    body: "encrypted-body",
    aesKey: Buffer.alloc(16),
    ak: "ak",
    sk: "sk",
    ts: "0",
  })),
  decryptResponse: vi.fn((text: string) => text),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bykcEnvelope(data: unknown): Response {
  return jsonResponse({ status: "0", data, errmsg: "" });
}

function mockFetch(
  handler: (url: string) => Response,
): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (url: string) => handler(String(url)));
  vi.stubGlobal("fetch", mock);
  return mock;
}

function course(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 1,
    courseName: "艺术与审美",
    courseStartDate: "2026-03-02 08:00:00",
    courseEndDate: "2026-03-02 09:30:00",
    coursePosition: "主楼 101",
    courseTeacher: "李四",
    courseSelectStartDate: "2026-02-20 08:00:00",
    courseSelectEndDate: "2026-03-01 08:00:00",
    courseCurrentCount: 10,
    courseMaxCount: 30,
    selected: false,
    ...overrides,
  };
}

describe("bykcStatus", () => {
  it("映射用户与学期", async () => {
    mockFetch(() =>
      bykcEnvelope({ realName: "张三", term: { termName: "春季" } }),
    );
    await expect(bykcStatus()).resolves.toEqual({
      user: { name: "张三" },
      term: { name: "春季" },
    });
  });

  it("会话失效文案抛 AUTH_EXPIRED", async () => {
    mockFetch(() =>
      jsonResponse({ status: "-1", data: null, errmsg: "会话已失效" }),
    );
    await expect(bykcStatus()).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
  });
});

describe("bykcCourses", () => {
  it("解析分页参数与课程字段", async () => {
    mockFetch(() =>
      bykcEnvelope({
        content: [course()],
        totalElements: 1,
        totalPages: 1,
      }),
    );

    const page = await bykcCourses(
      new URL("http://127.0.0.1/api/bykc/courses?page=2&pageSize=20"),
    );
    expect(page).toMatchObject({
      page: 2,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(page.courses[0]).toMatchObject({
      id: 1,
      courseName: "艺术与审美",
      place: "主楼 101",
      teacher: "李四",
      maxCount: 30,
      currentCount: 10,
      selected: false,
    });
  });

  it("非法页码或每页数量抛 INVALID_PAGE", async () => {
    mockFetch(() =>
      bykcEnvelope({ content: [], totalElements: 0, totalPages: 0 }),
    );
    await expect(
      bykcCourses(new URL("http://127.0.0.1/api/bykc/courses?page=0")),
    ).rejects.toMatchObject({ code: "INVALID_PAGE" });
    await expect(
      bykcCourses(new URL("http://127.0.0.1/api/bykc/courses?pageSize=51")),
    ).rejects.toMatchObject({ code: "INVALID_PAGE" });
  });

  it("课程状态按优先级判定", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T04:00:00Z"));

    mockFetch(() =>
      bykcEnvelope({
        content: [
          course({
            id: 1,
            selected: true,
            courseStartDate: "2026-03-01 08:00:00",
          }),
          course({
            id: 2,
            selected: true,
            courseStartDate: "2026-03-03 08:00:00",
          }),
          course({
            id: 3,
            courseStartDate: "2026-03-03 08:00:00",
            courseSelectEndDate: "2026-03-01 08:00:00",
          }),
          course({
            id: 4,
            courseStartDate: "2026-03-03 08:00:00",
            courseSelectEndDate: "2026-03-04 08:00:00",
            courseCurrentCount: 30,
            courseMaxCount: 30,
          }),
          course({
            id: 5,
            courseStartDate: "2026-03-03 08:00:00",
            courseSelectStartDate: "2026-03-03 08:00:00",
            courseSelectEndDate: "2026-03-04 08:00:00",
          }),
          course({
            id: 6,
            courseStartDate: "2026-03-03 08:00:00",
            courseSelectStartDate: "2026-02-20 08:00:00",
            courseSelectEndDate: "2026-03-04 08:00:00",
          }),
        ],
        totalElements: 6,
        totalPages: 1,
      }),
    );

    const page = await bykcCourses(
      new URL("http://127.0.0.1/api/bykc/courses"),
    );
    expect(page.courses.map((item) => item.status)).toEqual([
      "expired",
      "selected",
      "ended",
      "full",
      "preview",
      "available",
    ]);
  });
});

describe("bykcChosen", () => {
  it("选择当前学期、去重并归一化已选课程", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T04:00:00Z"));

    mockFetch((url) => {
      if (url.includes("getAllConfig")) {
        return bykcEnvelope({
          semester: [
            {
              semesterName: "秋季",
              semesterStartDate: "2025-09-01 00:00:00",
              semesterEndDate: "2026-01-15 00:00:00",
            },
            {
              semesterName: "春季",
              semesterStartDate: "2026-02-23 00:00:00",
              semesterEndDate: "2026-07-01 00:00:00",
            },
          ],
        });
      }
      return bykcEnvelope({
        courseList: [
          {
            courseInfo: {
              id: 1,
              courseName: "艺术与审美",
              courseStartDate: "2026-03-02 08:00:00",
              courseEndDate: "2026-03-02 09:30:00",
              coursePosition: "主楼",
              courseTeacher: "李四",
            },
          },
          {
            courseInfo: {
              id: 1,
              courseName: "艺术与审美",
              courseStartDate: "2026-03-02 08:00:00",
              courseEndDate: "2026-03-02 09:30:00",
              coursePosition: "主楼",
              courseTeacher: "李四",
            },
          },
          { courseInfo: { id: 0, courseName: "无效课程" } },
          { courseInfo: { id: 2, courseName: "" } },
        ],
      });
    });

    const response = await bykcChosen();
    expect(response.term.name).toBe("春季");
    expect(response.courses).toHaveLength(1);
    expect(response.courses[0]).toMatchObject({
      courseId: 1,
      courseName: "艺术与审美",
      startTime: "2026-03-02 08:00:00",
      endTime: "2026-03-02 09:30:00",
      place: "主楼",
      teacher: "李四",
    });
  });

  it("学期配置缺少起止日期时抛 UPSTREAM_ERROR", async () => {
    mockFetch(() => bykcEnvelope({ semester: [] }));
    await expect(bykcChosen()).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
  });
});

describe("bykcCourseDetail", () => {
  it("返回纯文本简介并校验课程 id", async () => {
    mockFetch((url) => {
      expect(url).toContain("queryCourseById");
      return bykcEnvelope({
        ...course(),
        courseDesc: "<p>简介</p><script>x</script><p>A &amp; B</p>",
      });
    });

    const response = await bykcCourseDetail("1");
    expect(response.course.descriptionText).toBe("简介\nA & B");

    await expect(bykcCourseDetail("abc")).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(bykcCourseDetail("0")).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });

  it("课程不存在时抛 NOT_FOUND", async () => {
    mockFetch(() => bykcEnvelope({ id: 1 }));
    await expect(bykcCourseDetail("1")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
