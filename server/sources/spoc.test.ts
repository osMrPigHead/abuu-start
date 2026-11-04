// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { spocAssignmentDetail, spocAssignments, spocStatus } from "./spoc.ts";

vi.mock("../auth/session.ts", () => ({
  spocCredentials: vi.fn(() => ({ token: "token-1", roleCode: "role-1" })),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function spocEnvelope(content: unknown): Response {
  return jsonResponse({ code: 200, content });
}

function mockFetch(
  handler: (url: string) => Response,
): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (url: string) => handler(String(url)));
  vi.stubGlobal("fetch", mock);
  return mock;
}

const termContent = { mrxq: "2026", dqxq: "2025-2026 学年春季学期" };
const teachers = [{ kcid: "C1", skjs: "王五" }];

function assignmentList(): unknown[] {
  return [
    {
      zyid: "a1",
      sskcid: "C1",
      kcmc: "软件工程",
      zymc: "第一次作业",
      tjzt: "0",
      zykssj: "2026-02-19T16:00:00Z",
      zyjzsj: "2026-03-10T15:59:59Z",
    },
    {
      zyid: "a2",
      sskcid: "C2",
      kcmc: "数据库",
      zymc: "第二次作业",
      tjzt: "1",
      zykssj: null,
      zyjzsj: null,
    },
    {
      zyid: "a3",
      sskcid: "C1",
      kcmc: "未命名课程",
      zymc: "",
      tjzt: "未知状态",
      zyjzsj: "2026-03-01 08:00:00",
    },
  ];
}

function standardFetch(url: string): Response {
  if (url.includes("inco/ht/queryOne")) return spocEnvelope(termContent);
  if (url.includes("jxkj/queryKclb")) return spocEnvelope(teachers);
  if (url.includes("inco/ht/queryListByPage")) {
    return spocEnvelope({
      list: assignmentList(),
      hasNextPage: false,
      pages: 1,
    });
  }
  if (url.includes("kczy/queryKczyInfoByid")) {
    return spocEnvelope({
      pf: "90",
      zyfs: "100",
      zynr: "<p>作业内容</p><br><p>第二段</p>",
      zyfjid: "1",
      zyfjInfo: { wjysmc: "附件.pdf" },
    });
  }
  if (url.includes("kczy/queryXsSubmitKczyInfo")) {
    return spocEnvelope({ tjzt: "1", tjsj: "2026-03-01T00:00:00Z" });
  }
  return new Response("not found", { status: 404 });
}

describe("spocStatus", () => {
  it("从 queryOne 读取当前学期", async () => {
    mockFetch((url) => {
      expect(url).toContain("inco/ht/queryOne");
      return spocEnvelope(termContent);
    });

    await expect(spocStatus()).resolves.toEqual({
      term: { code: "2026", name: "2025-2026 学年春季学期" },
    });
  });

  it("queryOne 失败时回退 queryList 当前学期", async () => {
    mockFetch((url) => {
      if (url.includes("inco/ht/queryOne")) {
        return spocEnvelope({ dqxq: "缺少学期代码" });
      }
      if (url.includes("inco/ht/queryList")) {
        return spocEnvelope([
          { xnxq: "2025", xnxqmc: "秋季", sfdqxq: "0" },
          { xnxq: "2026", xnxqmc: "春季", sfdqxq: "1" },
        ]);
      }
      return new Response("not found", { status: 404 });
    });

    await expect(spocStatus()).resolves.toEqual({
      term: { code: "2026", name: "春季" },
    });
  });

  it("登录失效时抛 AUTH_EXPIRED", async () => {
    mockFetch(
      () => new Response("", { status: 302, headers: { location: "/login" } }),
    );
    await expect(spocStatus()).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
  });
});

describe("spocAssignments", () => {
  it("归一化作业、关联教师并按截止时间排序", async () => {
    mockFetch(standardFetch);

    const response = await spocAssignments();
    expect(response.term.code).toBe("2026");
    expect(response.assignments.map((item) => item.assignmentId)).toEqual([
      "a3",
      "a1",
      "a2",
    ]);
    expect(response.assignments[0]).toMatchObject({
      assignmentId: "a3",
      courseName: "未命名课程",
      title: "未命名作业",
      teacherName: "王五",
      submissionStatus: "unknown",
      submissionStatusText: "未知",
    });
    expect(response.assignments[1]).toMatchObject({
      assignmentId: "a1",
      teacherName: "王五",
      startTime: "2026-02-20 00:00:00",
      dueTime: "2026-03-10 23:59:59",
      submissionStatus: "unsubmitted",
    });
    expect(response.assignments[2]).toMatchObject({
      assignmentId: "a2",
      teacherName: null,
      startTime: null,
      dueTime: null,
      submissionStatus: "submitted",
    });
  });

  it("教师查询失败不阻塞作业列表", async () => {
    mockFetch((url) => {
      if (url.includes("inco/ht/queryOne")) return spocEnvelope(termContent);
      if (url.includes("jxkj/queryKclb"))
        return new Response("error", { status: 500 });
      if (url.includes("inco/ht/queryListByPage")) {
        return spocEnvelope({
          list: assignmentList(),
          hasNextPage: false,
          pages: 1,
        });
      }
      return new Response("not found", { status: 404 });
    });

    const response = await spocAssignments();
    expect(
      response.assignments.every((item) => item.teacherName === null),
    ).toBe(true);
  });

  it("按 hasNextPage/pages 翻页并在空页停止", async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes("inco/ht/queryOne")) return spocEnvelope(termContent);
      if (url.includes("jxkj/queryKclb")) return spocEnvelope([]);
      if (url.includes("inco/ht/queryListByPage")) {
        const call = fetchMock.mock.calls.filter(([callUrl]) =>
          String(callUrl).includes("queryListByPage"),
        ).length;
        if (call <= 1) {
          return spocEnvelope({
            list: [
              {
                zyid: "p1",
                sskcid: "C1",
                kcmc: "课程",
                zymc: "第一页",
                tjzt: "0",
              },
            ],
            hasNextPage: true,
            pages: 2,
          });
        }
        return spocEnvelope({ list: [], hasNextPage: true, pages: 2 });
      }
      return new Response("not found", { status: 404 });
    });

    const response = await spocAssignments();
    expect(response.assignments.map((item) => item.assignmentId)).toEqual([
      "p1",
    ]);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("queryListByPage"),
      ),
    ).toHaveLength(2);
  });
});

describe("spocAssignmentDetail", () => {
  it("合并详情、分数、正文、附件与提交时间", async () => {
    mockFetch(standardFetch);

    const response = await spocAssignmentDetail("a1");
    expect(response.assignment).toMatchObject({
      assignmentId: "a1",
      score: "90",
      totalScore: "100",
      contentText: "作业内容\n\n第二段",
      attachments: [{ name: "附件.pdf" }],
      submittedAt: "2026-03-01 08:00:00",
      submissionStatus: "submitted",
      submissionStatusText: "已提交",
    });
  });

  it("提交信息查询失败时保留列表状态", async () => {
    mockFetch((url) => {
      if (url.includes("inco/ht/queryOne")) return spocEnvelope(termContent);
      if (url.includes("jxkj/queryKclb")) return spocEnvelope([]);
      if (url.includes("inco/ht/queryListByPage")) {
        return spocEnvelope({
          list: assignmentList(),
          hasNextPage: false,
          pages: 1,
        });
      }
      if (url.includes("kczy/queryKczyInfoByid")) return spocEnvelope({});
      if (url.includes("kczy/queryXsSubmitKczyInfo"))
        return new Response("error", { status: 500 });
      return new Response("not found", { status: 404 });
    });

    const response = await spocAssignmentDetail("a1");
    expect(response.assignment.submissionStatus).toBe("unsubmitted");
    expect(response.assignment.submittedAt).toBeNull();
  });

  it("非法 id 与未找到作业分别报错", async () => {
    await expect(spocAssignmentDetail("../bad")).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });

    mockFetch((url) => {
      if (url.includes("inco/ht/queryOne")) return spocEnvelope(termContent);
      if (url.includes("jxkj/queryKclb")) return spocEnvelope([]);
      if (url.includes("inco/ht/queryListByPage")) {
        return spocEnvelope({ list: [], hasNextPage: false, pages: 1 });
      }
      return new Response("not found", { status: 404 });
    });

    await expect(spocAssignmentDetail("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
