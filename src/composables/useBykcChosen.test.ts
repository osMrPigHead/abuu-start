import { describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/utils/storage";

async function loadChosen(stored?: unknown) {
  window.localStorage.clear();
  if (stored !== undefined) {
    window.localStorage.setItem(
      STORAGE_KEYS.bykcChosenCache,
      JSON.stringify(stored),
    );
  }
  vi.resetModules();
  return import("@/composables/useBykcChosen");
}

describe("useBykcChosen", () => {
  it("首次调用自动读取缓存，与单键数据源标准一致", async () => {
    const { useBykcChosen } = await loadChosen({
      savedAt: new Date(2026, 2, 2, 8, 0).toISOString(),
      term: {
        name: "2025-2026 学年春季学期",
        startDate: "2026-02-23",
        endDate: "2026-07-05",
      },
      courses: [
        {
          courseId: 1,
          courseName: "艺术与审美",
          startTime: "2026-03-02 08:00",
          endTime: "2026-03-02 09:30",
          place: "主楼 101",
          teacher: "李四",
        },
      ],
    });

    const { state } = useBykcChosen();

    expect(state.status).toBe("cached");
    expect(state.hydrated).toBe(true);
    expect(state.courses).toHaveLength(1);
    expect(state.courses[0]?.courseName).toBe("艺术与审美");
  });
});
