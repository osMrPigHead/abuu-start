import { afterEach, vi } from "vitest";

afterEach(() => {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }

  vi.clearAllTimers();
  vi.useRealTimers();
});
