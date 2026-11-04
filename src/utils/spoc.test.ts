import { describe, expect, it } from "vitest";
import type { SpocAssignment } from "@shared/api";
import {
  filterOpenSpocAssignments,
  formatSpocDateTime,
  formatSpocDue,
  formatSpocStart,
  isValidSpocAssignmentId,
  parseSpocDateTime,
  spocCourseLine,
  spocSubmissionLabel,
} from "@/utils/spoc";

function assignment(overrides: Partial<SpocAssignment> = {}): SpocAssignment {
  return {
    assignmentId: "abc_123",
    courseId: "C1",
    courseName: "软件工程",
    teacherName: "王五",
    title: "第一次作业",
    startTime: "2026-02-20 08:00:00",
    dueTime: "2026-03-10 23:59:59",
    submissionStatus: "unsubmitted",
    submissionStatusText: "未提交",
    ...overrides,
  };
}

describe("spoc utils", () => {
  it("isValidSpocAssignmentId 校验中继 id 格式", () => {
    expect(isValidSpocAssignmentId("abc_123-XYZ")).toBe(true);
    expect(isValidSpocAssignmentId("")).toBe(false);
    expect(isValidSpocAssignmentId("a".repeat(129))).toBe(false);
    expect(isValidSpocAssignmentId("abc/def")).toBe(false);
  });

  it("parseSpocDateTime / formatSpocDateTime", () => {
    const date = parseSpocDateTime("2026-03-02 08:05:06");
    expect(date?.getHours()).toBe(8);
    expect(date?.getSeconds()).toBe(6);
    expect(parseSpocDateTime("2026-03-02T08:05")?.getMinutes()).toBe(5);
    expect(parseSpocDateTime("2026-02-30 08:05:06")).toBeNull();

    expect(formatSpocDateTime("2026-03-02 08:05:06")).toBe("2026-03-02 08:05");
    expect(formatSpocDateTime("bad")).toBe("");
  });

  it("截止与开始时间缺失时回退文案", () => {
    expect(formatSpocDue(null)).toBe("无截止时间");
    expect(formatSpocDue("2026-03-02 08:05:06")).toBe("2026-03-02 08:05");
    expect(formatSpocStart(null)).toBe("未知");
    expect(formatSpocStart("2026-03-02 08:05:06")).toBe("2026-03-02 08:05");
  });

  it("spocCourseLine / spocSubmissionLabel", () => {
    expect(spocCourseLine(assignment())).toBe("软件工程·王五");
    expect(spocCourseLine(assignment({ teacherName: null }))).toBe("软件工程");
    expect(spocSubmissionLabel(assignment())).toBe("未提交");
    expect(
      spocSubmissionLabel(assignment({ submissionStatus: "submitted" })),
    ).toBe("未知");
  });

  it("filterOpenSpocAssignments 只保留未提交且未截止作业", () => {
    const now = new Date(2026, 2, 2, 12, 0);
    const items = [
      assignment({ assignmentId: "no-due", dueTime: null }),
      assignment({ assignmentId: "future", dueTime: "2026-03-03 00:00:00" }),
      assignment({ assignmentId: "past", dueTime: "2026-03-01 00:00:00" }),
      assignment({ assignmentId: "invalid", dueTime: "bad" }),
      assignment({ assignmentId: "submitted", submissionStatus: "submitted" }),
    ];
    expect(
      filterOpenSpocAssignments(items, now).map((item) => item.assignmentId),
    ).toEqual(["no-due", "future", "invalid"]);
  });
});
