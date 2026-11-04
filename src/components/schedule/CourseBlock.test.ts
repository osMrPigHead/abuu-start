import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CourseBlock from "@/components/schedule/CourseBlock.vue";
import type { Course } from "@/types";
import { DEFAULT_SECTION_TIMES } from "@/utils/schedule";

const sectionTimes = [...DEFAULT_SECTION_TIMES];

function course(overrides: Partial<Course> = {}): Course {
  return {
    courseCode: "C1",
    courseName: "高等数学",
    beginSection: 1,
    endSection: 2,
    beginTime: null,
    endTime: null,
    placeName: "教1-101",
    weeksAndTeachers: "1-16周 · 张三",
    dayOfWeek: 1,
    ...overrides,
  };
}

describe("CourseBlock", () => {
  it("渲染课程名、节次、时间与地点", () => {
    const wrapper = mount(CourseBlock, {
      props: { course: course(), sectionTimes },
    });

    expect(wrapper.text()).toContain("第 1-2 节");
    expect(wrapper.text()).toContain("08:00-09:35");
    expect(wrapper.text()).toContain("高等数学");
    expect(wrapper.text()).toContain("教1-101 · 1-16周 · 张三");
  });

  it("博雅课程显示“博雅”而非节次", () => {
    const wrapper = mount(CourseBlock, {
      props: {
        course: course({
          source: "bykc",
          beginSection: null,
          endSection: null,
        }),
        sectionTimes,
      },
    });

    expect(wrapper.text()).toContain("博雅");
    expect(wrapper.text()).not.toContain("第 1-2 节");
  });

  it("没有时间信息时显示“时间待定”", () => {
    const wrapper = mount(CourseBlock, {
      props: {
        course: course({
          beginSection: null,
          endSection: null,
          beginTime: null,
          endTime: null,
        }),
        sectionTimes,
      },
    });

    expect(wrapper.text()).toContain("时间待定");
  });

  it("compact 模式使用紧凑 class", () => {
    const wrapper = mount(CourseBlock, {
      props: { course: course(), sectionTimes, compact: true },
    });

    expect(wrapper.get("article").classes()).toContain("w-[10.25rem]");
  });

  it("高亮状态设置 class、data 属性与 aria-label", () => {
    const ongoing = mount(CourseBlock, {
      props: {
        course: course(),
        sectionTimes,
        highlight: "ongoing",
      },
    });
    expect(ongoing.get("article").classes()).toContain(
      "course-highlight-ongoing",
    );
    expect(ongoing.get("article").attributes("data-highlight")).toBe("ongoing");
    expect(ongoing.get("article").attributes("aria-label")).toBe(
      "进行中：高等数学",
    );

    const upcoming = mount(CourseBlock, {
      props: {
        course: course(),
        sectionTimes,
        highlight: "upcoming",
      },
    });
    expect(upcoming.get("article").classes()).toContain(
      "course-highlight-upcoming",
    );
    expect(upcoming.get("article").attributes("aria-label")).toBe(
      "即将开始：高等数学",
    );
  });
});
