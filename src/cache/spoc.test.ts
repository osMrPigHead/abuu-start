import { describe, expect, it } from "vitest";
import {
  readSpocAssignmentsCache,
  readSpocDetailCache,
  writeSpocAssignmentsCache,
  writeSpocDetailCache,
} from "@/cache/spoc";
import { STORAGE_KEYS } from "@/cache/storage";
import type { SpocAssignment, SpocAssignmentDetail } from "@shared/api";

const assignment: SpocAssignment = {
  assignmentId: "a1",
  courseId: "C1",
  courseName: "软件工程",
  teacherName: "王五",
  title: "第一次作业",
  startTime: "2026-02-20 00:00:00",
  dueTime: "2026-03-10 23:59:59",
  submissionStatus: "unsubmitted",
  submissionStatusText: "未提交",
};

const detail: SpocAssignmentDetail = {
  ...assignment,
  score: "90",
  totalScore: "100",
  contentText: "作业说明",
  attachments: [{ name: "说明.pdf" }],
  submittedAt: null,
};

describe("spoc cache", () => {
  it("列表缓存往返并归一化空白字段", () => {
    writeSpocAssignmentsCache({
      savedAt: "2026-03-01T00:00:00.000Z",
      term: { code: "2026", name: "春季学期" },
      assignments: [assignment],
    });

    expect(readSpocAssignmentsCache()).toEqual({
      savedAt: "2026-03-01T00:00:00.000Z",
      term: { code: "2026", name: "春季学期" },
      assignments: [assignment],
    });
  });

  it("非法列表项和损坏 JSON 回退为 null", () => {
    window.localStorage.setItem(
      STORAGE_KEYS.spocAssignmentsCache,
      JSON.stringify({
        savedAt: "2026-03-01T00:00:00.000Z",
        term: {},
        assignments: [{ assignmentId: "", title: "" }, assignment],
      }),
    );
    expect(readSpocAssignmentsCache()?.assignments).toEqual([assignment]);

    window.localStorage.setItem(
      STORAGE_KEYS.spocAssignmentsCache,
      "{not-json",
    );
    expect(readSpocAssignmentsCache()).toBeNull();
  });

  it("详情缓存往返并保留附件", () => {
    writeSpocDetailCache("a1", {
      savedAt: "2026-03-01T00:00:00.000Z",
      assignment: detail,
    });

    expect(readSpocDetailCache("a1")).toEqual({
      savedAt: "2026-03-01T00:00:00.000Z",
      assignment: detail,
    });
    expect(readSpocDetailCache("missing")).toBeNull();
  });
});
