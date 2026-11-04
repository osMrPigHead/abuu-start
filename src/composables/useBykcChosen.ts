/** 博雅已选课程：缓存优先、独立数据源状态。 */
import { reactive } from "vue";
import { fetchBykcChosen } from "@/api/bykc";
import { createCachedSource } from "@/composables/useSourceState";
import type { BykcChosenCourse, BykcChosenTerm } from "@shared/api";
import type { BykcChosenCache, SourceStatus } from "@/types";
import { readBykcChosenCache, writeBykcChosenCache } from "@/utils/bykcCache";

type BykcChosenState = {
  status: SourceStatus;
  term: BykcChosenTerm | null;
  courses: BykcChosenCourse[];
  savedAt: string | null;
  error: string | null;
  loading: boolean;
  hydrated: boolean;
};

const state = reactive<BykcChosenState>({
  status: "idle",
  term: null,
  courses: [],
  savedAt: null,
  error: null,
  loading: false,
  hydrated: false,
});

const source = createCachedSource({
  state,
  sourceId: "bykc",
  hydrateCache: hydrateCache,
  clearData: clearData,
  fetch: () => fetchBykcChosen(),
  apply: (response) => {
    state.term = response.term;
    state.courses = response.courses;
  },
  persist: persistChosen,
  hasData: () => state.courses.length > 0 || state.savedAt !== null,
  fallbackMessage: "博雅已选课程加载失败",
});

export function useBykcChosen() {
  hydrateChosen();

  return {
    state,
    hydrate: hydrateChosen,
    refresh: refreshChosen,
    clearBykcChosenData,
  };
}

function hydrateChosen(): void {
  source.hydrate();
}

async function refreshChosen(): Promise<void> {
  await source.refresh();
}

function clearBykcChosenData(): void {
  source.reset({ hydrated: true });
}

function hydrateCache(): boolean {
  const cache = readBykcChosenCache();
  if (!cache) return false;

  state.term = cache.term;
  state.courses = cache.courses;
  state.savedAt = cache.savedAt || null;
  return true;
}

function clearData(): void {
  state.term = null;
  state.courses = [];
}

function persistChosen(): void {
  if (state.savedAt === null || state.term === null) return;

  const cache: BykcChosenCache = {
    savedAt: state.savedAt,
    term: state.term,
    courses: state.courses,
  };
  writeBykcChosenCache(cache);
}
