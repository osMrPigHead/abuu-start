/** 考试缓存优先加载与独立数据源状态，见 docs/trd.md 7.2 / 7.6。 */
import { reactive } from "vue";
import { fetchByxtExams } from "@/api/byxt";
import { createCachedSource } from "@/composables/useSourceState";
import type { Exam, Term } from "@shared/api";
import type { ExamsCache, SourceStatus } from "@/types";
import { readExamsCache, writeExamsCache } from "@/utils/examsCache";
import { remove, STORAGE_KEYS } from "@/utils/storage";

type ExamsState = {
  status: SourceStatus;
  term: Term | null;
  exams: Exam[];
  savedAt: string | null;
  error: string | null;
  loading: boolean;
  hydrated: boolean;
};

const state = reactive<ExamsState>({
  status: "idle",
  term: null,
  exams: [],
  savedAt: null,
  error: null,
  loading: false,
  hydrated: false,
});

const source = createCachedSource({
  state,
  sourceId: "byxt",
  hydrateCache: hydrateCache,
  clearData: clearData,
  fetch: () => fetchByxtExams(),
  apply: (response) => {
    state.term = response.term;
    state.exams = response.exams;
  },
  persist: persistCache,
  hasData: () => state.exams.length > 0 || state.savedAt !== null,
  fallbackMessage: "考试加载失败",
});

export function useExams() {
  hydrate();

  return {
    state,
    hydrate,
    refresh,
    clearExamsData,
  };
}

function hydrate(): void {
  source.hydrate();
}

async function refresh(): Promise<void> {
  await source.refresh();
}

function hydrateCache(): boolean {
  const cache = readExamsCache();
  if (!cache) return false;

  state.term = cache.term;
  state.exams = cache.exams;
  state.savedAt = cache.savedAt || null;
  return true;
}

function clearData(): void {
  state.term = null;
  state.exams = [];
}

function clearExamsData(): void {
  remove(STORAGE_KEYS.examsCache);
  source.reset({ hydrated: true });
}

function persistCache(): void {
  if (!state.term || state.savedAt === null) return;

  const cache: ExamsCache = {
    savedAt: state.savedAt,
    term: state.term,
    exams: state.exams,
  };
  writeExamsCache(cache);
}
