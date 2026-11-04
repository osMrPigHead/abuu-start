/** SPOC 作业列表与详情缓存读写、归一化，见 docs/trd.md 7.3。 */
import type { SpocAssignment, SpocAssignmentDetail } from "@shared/api";
import { spocSubmissionStatusText } from "@shared/api";
import type { SpocAssignmentsCache, SpocDetailCache } from "@/types";
import { asString, isRecord, nullableText } from "@/utils/guards";
import {
  readJson,
  spocDetailCacheKey,
  STORAGE_KEYS,
  writeJson,
} from "@/cache/storage";
import { normalizeTerm } from "@/domain/term";

export function readSpocAssignmentsCache(): SpocAssignmentsCache | null {
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

export function writeSpocAssignmentsCache(cache: SpocAssignmentsCache): void {
  writeJson(STORAGE_KEYS.spocAssignmentsCache, cache);
}

export function readSpocDetailCache(
  assignmentId: string,
): SpocDetailCache | null {
  const raw = readJson<unknown>(spocDetailCacheKey(assignmentId));
  if (!isRecord(raw)) return null;

  const assignment = normalizeDetail(raw.assignment);
  if (!assignment) return null;

  const savedAt = typeof raw.savedAt === "string" ? raw.savedAt : "";
  return { savedAt, assignment };
}

export function writeSpocDetailCache(
  assignmentId: string,
  cache: SpocDetailCache,
): void {
  writeJson(spocDetailCacheKey(assignmentId), cache);
}

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
      spocSubmissionStatusText(status),
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
