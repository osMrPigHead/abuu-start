/** SPOC 作业列表与详情：缓存优先、独立数据源状态，见 docs/trd.md 7.3 / 7.6。 */
import { reactive } from "vue";
import { fetchSpocAssignmentDetail, fetchSpocAssignments } from "@/api/spoc";
import {
  createCachedDetailSource,
  createCachedSource,
} from "@/composables/useSourceState";
import type { SpocAssignment, SpocAssignmentDetail, Term } from "@shared/api";
import type {
  SourceStatus,
  SpocAssignmentsCache,
  SpocDetailCache,
} from "@/types";
import { asString, isRecord, nullableText } from "@/utils/guards";
import { isValidSpocAssignmentId } from "@/utils/spoc";
import {
  clearSpocCaches,
  readJson,
  spocDetailCacheKey,
  STORAGE_KEYS,
  writeJson,
} from "@/utils/storage";
import { normalizeTerm } from "@/utils/term";

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
  readCache: readDetailCache,
  fetch: async (key) => (await fetchSpocAssignmentDetail(key)).assignment,
  apply: (detail) => {
    detailState.assignment = detail;
  },
  persist: persistDetail,
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
  const cache = readAssignmentsCache();
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

/* ------------------------------- 缓存读写 ------------------------------- */

function readAssignmentsCache(): SpocAssignmentsCache | null {
  const raw = readJson<unknown>(STORAGE_KEYS.spocAssignmentsCache);
  if (!isRecord(raw)) return null;

  const assignments = Array.isArray(raw.assignments)
    ? raw.assignments
        .map(normalizeAssignment)
        .filter((item): item is SpocAssignment => item !== null)
    : [];

  const savedAt = typeof raw.savedAt === "string" ? raw.savedAt : "";
  if (savedAt.length === 0 && assignments.length === 0) return null;

  return {
    savedAt,
    term: normalizeTerm(raw.term),
    assignments,
  };
}

function persistAssignments(): void {
  if (!state.term || state.savedAt === null) return;

  const cache: SpocAssignmentsCache = {
    savedAt: state.savedAt,
    term: state.term,
    assignments: state.assignments,
  };
  writeJson(STORAGE_KEYS.spocAssignmentsCache, cache);
}

function readDetailCache(
  assignmentId: string,
): { savedAt: string; detail: SpocAssignmentDetail } | null {
  const raw = readJson<unknown>(spocDetailCacheKey(assignmentId));
  if (!isRecord(raw)) return null;

  const assignment = normalizeDetail(raw.assignment);
  if (!assignment) return null;

  const savedAt = typeof raw.savedAt === "string" ? raw.savedAt : "";
  return { savedAt, detail: assignment };
}

function persistDetail(assignmentId: string): void {
  if (!detailState.assignment || detailState.savedAt === null) return;

  const cache: SpocDetailCache = {
    savedAt: detailState.savedAt,
    assignment: detailState.assignment,
  };
  writeJson(spocDetailCacheKey(assignmentId), cache);
}

/* ------------------------------- 归一化 ------------------------------- */

function normalizeAssignment(value: unknown): SpocAssignment | null {
  if (!isRecord(value)) return null;

  const assignmentId = asString(value.assignmentId).trim();
  const title = asString(value.title).trim();
  if (assignmentId.length === 0 || title.length === 0) return null;

  const status = normalizeSubmissionStatus(value.submissionStatus);

  return {
    assignmentId,
    courseId: asString(value.courseId).trim(),
    courseName: asString(value.courseName).trim() || "未知课程",
    teacherName: nullableText(value.teacherName),
    title,
    startTime: nullableText(value.startTime),
    dueTime: nullableText(value.dueTime),
    submissionStatus: status,
    submissionStatusText:
      asString(value.submissionStatusText).trim() ||
      submissionStatusText(status),
  };
}

function normalizeDetail(value: unknown): SpocAssignmentDetail | null {
  const base = normalizeAssignment(value);
  if (!base || !isRecord(value)) return null;

  const attachments = Array.isArray(value.attachments)
    ? value.attachments
        .map((item) => (isRecord(item) ? asString(item.name).trim() : ""))
        .filter((name) => name.length > 0)
        .map((name) => ({ name }))
    : [];

  return {
    ...base,
    score: nullableText(value.score),
    totalScore: nullableText(value.totalScore),
    contentText: nullableText(value.contentText),
    attachments,
    submittedAt: nullableText(value.submittedAt),
  };
}

function normalizeSubmissionStatus(
  value: unknown,
): SpocAssignment["submissionStatus"] {
  return value === "submitted" || value === "unsubmitted" || value === "unknown"
    ? value
    : "unknown";
}

function submissionStatusText(
  status: SpocAssignment["submissionStatus"],
): string {
  switch (status) {
    case "submitted":
      return "已提交";
    case "unsubmitted":
      return "未提交";
    default:
      return "未知";
  }
}
