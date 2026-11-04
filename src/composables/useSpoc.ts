/** SPOC 作业列表与详情：缓存优先、独立数据源状态，见 docs/trd.md 7.3 / 7.6。 */
import { reactive } from "vue";
import { fetchSpocAssignmentDetail, fetchSpocAssignments } from "@/api/spoc";
import {
  createCachedDetailSource,
  createCachedSource,
} from "@/composables/useSourceState";
import type { SpocAssignment, SpocAssignmentDetail, Term } from "@shared/api";
import type { SourceStatus, SpocAssignmentsCache } from "@/types";
import { isValidSpocAssignmentId } from "@/domain/spoc";
import { clearSpocCaches } from "@/cache/storage";
import {
  readSpocAssignmentsCache,
  readSpocDetailCache,
  writeSpocAssignmentsCache,
  writeSpocDetailCache,
} from "@/cache/spoc";

type SpocState = {
  status: SourceStatus;
  term: Term | null;
  assignments: SpocAssignment[];
  savedAt: string | null;
  error: string | null;
  loading: boolean;
  hydrated: boolean;
};

type SpocDetailState = {
  assignmentId: string | null;
  /** 打开 modal 时列表已有的字段，详情失败时仍可展示。 */
  preview: SpocAssignment | null;
  status: SourceStatus;
  assignment: SpocAssignmentDetail | null;
  savedAt: string | null;
  error: string | null;
  loading: boolean;
  notFound: boolean;
};

const state = reactive<SpocState>({
  status: "idle",
  term: null,
  assignments: [],
  savedAt: null,
  error: null,
  loading: false,
  hydrated: false,
});

const detailState = reactive<SpocDetailState>({
  assignmentId: null,
  preview: null,
  status: "idle",
  assignment: null,
  savedAt: null,
  error: null,
  loading: false,
  notFound: false,
});

const listSource = createCachedSource({
  state,
  sourceId: "spoc",
  hydrateCache: hydrateCache,
  clearData: clearData,
  fetch: () => fetchSpocAssignments(),
  apply: (response) => {
    state.term = response.term;
    state.assignments = response.assignments;
  },
  persist: persistAssignments,
  hasData: () => state.assignments.length > 0 || state.savedAt !== null,
  fallbackMessage: "SPOC 作业加载失败",
});

const detailSource = createCachedDetailSource({
  state: detailState,
  sourceId: "spoc",
  accessors: {
    getKey: () => detailState.assignmentId,
    setKey: (key) => {
      detailState.assignmentId = key;
    },
    getPreview: () => detailState.preview,
    setPreview: (preview) => {
      detailState.preview = preview;
    },
    getDetail: () => detailState.assignment,
    setDetail: (detail) => {
      detailState.assignment = detail;
    },
  },
  openKey: (preview) => preview.assignmentId,
  isValidKey: (key) => isValidSpocAssignmentId(key),
  readCache: (assignmentId) => {
    const cache = readSpocDetailCache(assignmentId);
    return cache ? { savedAt: cache.savedAt, detail: cache.assignment } : null;
  },
  fetch: async (key) => (await fetchSpocAssignmentDetail(key)).assignment,
  apply: (detail) => {
    detailState.assignment = detail;
  },
  persist: (assignmentId) => {
    if (!detailState.assignment || detailState.savedAt === null) return;

    writeSpocDetailCache(assignmentId, {
      savedAt: detailState.savedAt,
      assignment: detailState.assignment,
    });
  },
  hasData: () =>
    detailState.assignment !== null || detailState.savedAt !== null,
  fallbackMessage: "SPOC 作业加载失败",
  notFoundMessage: "未找到该 SPOC 作业",
  invalidKeyMessage: "未找到该作业",
});

export function useSpoc() {
  hydrate();

  return {
    state,
    hydrate,
    refresh,
    clearSpocData,
  };
}

export function useSpocDetail() {
  return {
    state: detailState,
    open: detailSource.open,
    openById: detailSource.openById,
    refresh: detailSource.refresh,
    close: detailSource.close,
  };
}

function hydrate(): void {
  listSource.hydrate();
}

async function refresh(): Promise<void> {
  await listSource.refresh();
}

function hydrateCache(): boolean {
  const cache = readSpocAssignmentsCache();
  if (!cache) return false;

  state.term = cache.term;
  state.assignments = cache.assignments;
  state.savedAt = cache.savedAt || null;
  return true;
}

function clearData(): void {
  state.term = null;
  state.assignments = [];
}

function clearSpocData(): void {
  clearSpocCaches();
  listSource.reset({ hydrated: true });
  detailSource.close();
}

function persistAssignments(): void {
  if (!state.term || state.savedAt === null) return;

  const cache: SpocAssignmentsCache = {
    savedAt: state.savedAt,
    term: state.term,
    assignments: state.assignments,
  };
  writeSpocAssignmentsCache(cache);
}
