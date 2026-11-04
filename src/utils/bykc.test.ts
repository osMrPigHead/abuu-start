import { describe, expect, it } from "vitest";
import type { BykcChosenCourse } from "@shared/api";
import {
  bykcChosenCourseOnDate,
  bykcChosenCoursesOnDate,
  bykcMetaLine,
  bykcPlaceText,
  bykcStatusLabel,
  formatBykcCardTime,
  formatBykcDetailTime,
  formatBykcListTime,
  parseBykcDateTime,
} from "@/utils/bykc";

function chosen(overrides: Partial<BykcChosenCourse> = {}): BykcChosenCourse {
  return {
    courseId: 1,
    courseName: "艺术与审美",
    startTime: "2026-03-02 08:00",
    endTime: "2026-03-02 09:30",
    place: "主楼 101",
    teacher: "李四",
    ...overrides,
  };
}

describe("bykc utils", () => {
  it("bykcStatusLabel 覆盖所有状态", () => {
    expect(bykcStatusLabel("expired")).toBe("已过期");
    expect(bykcStatusLabel("selected")).toBe("已选");
    expect(bykcStatusLabel("preview")).toBe("预告");
    expect(bykcStatusLabel("ended")).toBe("选课结束");
    expect(bykcStatusLabel("full")).toBe("人数已满");
    expect(bykcStatusLabel("available")).toBe("可选");
  });

  it("parseBykcDateTime 严格解析日期时间", () => {
    const date = parseBykcDateTime("2026-03-02 08:05");
    expect(date).toEqual({ year: 2026, month: 3, day: 2, hour: 8, minute: 5 });
    expect(parseBykcDateTime("2026-03-02T08:05:06")?.hour).toBe(8);
    expect(parseBykcDateTime("2026-02-30 08:05")).toBeNull();
    expect(parseBykcDateTime(null)).toBeNull();
  });

  it("formatBykcCardTime / formatBykcListTime / formatBykcDetailTime", () => {
    expect(formatBykcCardTime("2026-03-02 08:05")).toBe("03-02 08:05");
    expect(formatBykcCardTime(null)).toBe("时间待定");

    expect(formatBykcListTime("2026-03-02 08:05", "2026-03-02 09:30")).toBe(
      "03-02 08:05 – 09:30",
    );
    expect(formatBykcListTime("2026-03-02 23:00", "2026-03-03 01:00")).toBe(
      "03-02 23:00 – 03-03 01:00",
    );
    expect(formatBykcListTime("2026-03-02 08:05", null)).toBe("03-02 08:05");
    expect(formatBykcListTime("bad", "2026-03-02 09:30")).toBe("时间待定");

    expect(formatBykcDetailTime("2026-03-02 08:05", "2026-03-02 09:30")).toBe(
      "2026-03-02 08:05 – 09:30",
    );
    expect(formatBykcDetailTime("2026-03-02 23:00", "2026-03-03 01:00")).toBe(
      "2026-03-02 23:00 – 2026-03-03 01:00",
    );
  });

  it("bykcPlaceText / bykcMetaLine", () => {
    expect(bykcPlaceText(null)).toBe("地点待定");
    expect(bykcPlaceText("  主楼  ")).toBe("主楼");
    expect(bykcMetaLine({ place: "主楼", teacher: "李四" })).toBe(
      "主楼 · 李四",
    );
    expect(bykcMetaLine({ place: null, teacher: null })).toBe("地点待定");
    expect(bykcMetaLine({ place: "主楼", teacher: null })).toBe("主楼");
  });

  it("bykcChosenCourseOnDate 转换指定日期的已选课程", () => {
    const converted = bykcChosenCourseOnDate(chosen(), new Date(2026, 2, 2));
    expect(converted).toEqual({
      courseCode: "bykc-1",
      courseName: "艺术与审美",
      beginSection: null,
      endSection: null,
      beginTime: "08:00",
      endTime: "09:30",
      placeName: "主楼 101",
      weeksAndTeachers: "李四",
      dayOfWeek: 1,
      source: "bykc",
    });
  });

  it("bykcChosenCourseOnDate 处理日期不匹配、跨天与非法开始时间", () => {
    expect(bykcChosenCourseOnDate(chosen(), new Date(2026, 2, 3))).toBeNull();
    expect(
      bykcChosenCourseOnDate(
        chosen({ endTime: "2026-03-03 01:00" }),
        new Date(2026, 2, 2),
      )?.endTime,
    ).toBeNull();
    expect(
      bykcChosenCourseOnDate(
        chosen({ startTime: "bad" }),
        new Date(2026, 2, 2),
      ),
    ).toBeNull();
  });

  it("bykcChosenCoursesOnDate 过滤无法转换的条目", () => {
    const courses = [
      chosen(),
      chosen({ courseId: 2, startTime: "2026-03-03 08:00" }),
      chosen({ courseId: 3, startTime: "bad" }),
    ];
    expect(bykcChosenCoursesOnDate(courses, new Date(2026, 2, 2))).toHaveLength(
      1,
    );
  });
});
