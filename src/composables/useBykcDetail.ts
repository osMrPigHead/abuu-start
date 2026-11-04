/** 博雅课程详情：缓存优先、预览回退与独立数据源状态。 */
import { reactive } from "vue";
import { fetchBykcCourse } from "@/api/bykc";
import { createCachedDetailSource } from "@/composables/useSourceState";
import type { BykcCourse, BykcCourseDetail } from "@shared/api";
import type { SourceStatus } from "@/types";
import { readBykcCourseCache, writeBykcCourseCache } from "@/cache/bykc";

type BykcDetailState = {
  courseId: number | null;
  status: SourceStatus;
  /** 打开 modal 时已有的列表字段，详情失败时仍可展示。 */
  preview: BykcCourse | null;
  course: BykcCourseDetail | null;
  savedAt: string | null;
  error: string | null;
  loading: boolean;
  notFound: boolean;
};

const detailState = reactive<BykcDetailState>({
  courseId: null,
  status: "idle",
  preview: null,
  course: null,
  savedAt: null,
  error: null,
  loading: false,
  notFound: false,
});

const source = createCachedDetailSource({
  state: detailState,
  sourceId: "bykc",
  accessors: {
    getKey: () => detailState.courseId,
    setKey: (key) => {
      detailState.courseId = key;
    },
    getPreview: () => detailState.preview,
    setPreview: (preview) => {
      detailState.preview = preview;
    },
    getDetail: () => detailState.course,
    setDetail: (detail) => {
      detailState.course = detail;
    },
  },
  openKey: (preview) => preview.id,
  isValidKey: (courseId) => Number.isSafeInteger(courseId) && courseId > 0,
  readCache: (courseId) => {
    const cache = readBykcCourseCache(courseId);
    return cache ? { savedAt: cache.savedAt, detail: cache.course } : null;
  },
  fetch: async (courseId) => (await fetchBykcCourse(courseId)).course,
  apply: (detail) => {
    detailState.course = detail;
  },
  persist: () => {
    if (!detailState.course || detailState.savedAt === null) return;

    writeBykcCourseCache({
      savedAt: detailState.savedAt,
      course: detailState.course,
    });
  },
  hasData: () => detailState.course !== null || detailState.savedAt !== null,
  fallbackMessage: "博雅课程详情加载失败",
  notFoundMessage: "课程不存在或已下架",
  invalidKeyMessage: "课程不存在或已下架",
});

export function useBykcDetail() {
  return {
    state: detailState,
    open: source.open,
    refresh: source.refresh,
    close: source.close,
  };
}
