/** 博雅课程广场列表：缓存优先、页码切换与独立数据源状态。 */
import { reactive } from "vue";
import { BYKC_PAGE_SIZE, fetchBykcCourses } from "@/api/bykc";
import { createCachedSource } from "@/composables/useSourceState";
import type { BykcCourse } from "@shared/api";
import type { BykcCoursesCache, SourceStatus } from "@/types";
import { readBykcPageCache, writeBykcPageCache } from "@/utils/bykcCache";
import { clearBykcCaches } from "@/utils/storage";

type BykcPageState = {
  page: number;
  pageSize: number;
  status: SourceStatus;
  total: number;
  totalPages: number;
  courses: BykcCourse[];
  savedAt: string | null;
  error: string | null;
  loading: boolean;
  hydrated: boolean;
};

const state = reactive<BykcPageState>({
  page: 1,
  pageSize: BYKC_PAGE_SIZE,
  status: "idle",
  total: 0,
  totalPages: 0,
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
  fetch: () => fetchBykcCourses(state.page, state.pageSize),
  apply: (response) => {
    state.page = response.page;
    state.pageSize = response.pageSize;
    state.courses = response.courses;
    state.total = response.total;
    state.totalPages = response.totalPages;
  },
  persist: persistPage,
  hasData: () => state.courses.length > 0 || state.savedAt !== null,
  fallbackMessage: "博雅课程广场加载失败",
  messageOverrides: { INVALID_PAGE: "页码无效" },
});

/**
 * 分页数据源：缓存入口是 `loadPage(page)`，而不是无参 `hydrate`。
 * `loadPage` 会先按新页码 reset 再 hydrate，避免把上一页缓存当成本页数据。
 */
export function useBykcList() {
  return {
    state,
    loadPage,
    refresh,
    clearBykcData,
  };
}

/**
 * 打开某一页：先读该页缓存渲染，再后台请求最新数据。
 * 页码与每页数量变化时清空旧页数据，避免翻页时显示上一页内容。
 */
async function loadPage(
  page: number,
  pageSize: number = BYKC_PAGE_SIZE,
): Promise<void> {
  const targetPage = Number.isSafeInteger(page) && page >= 1 ? page : 1;

  if (
    state.page !== targetPage ||
    state.pageSize !== pageSize ||
    !state.hydrated
  ) {
    state.page = targetPage;
    state.pageSize = pageSize;
    source.reset({ hydrated: false });
    source.hydrate();
  }

  await source.refresh();
}

async function refresh(): Promise<void> {
  await source.refresh();
}

function clearBykcData(): void {
  clearBykcCaches();
  source.reset({ hydrated: true });
  state.page = 1;
  state.pageSize = BYKC_PAGE_SIZE;
}

/* ------------------------------- 缓存读写 ------------------------------- */

function hydrateCache(): boolean {
  const cache = readBykcPageCache(state.page, state.pageSize);
  if (!cache) return false;

  state.courses = cache.courses;
  state.total = cache.total;
  state.totalPages = cache.totalPages;
  state.savedAt = cache.savedAt || null;
  return true;
}

function clearData(): void {
  state.courses = [];
  state.total = 0;
  state.totalPages = 0;
}

function persistPage(): void {
  if (state.savedAt === null) return;

  const cache: BykcCoursesCache = {
    savedAt: state.savedAt,
    page: state.page,
    pageSize: state.pageSize,
    total: state.total,
    totalPages: state.totalPages,
    courses: state.courses,
  };
  writeBykcPageCache(cache);
}
