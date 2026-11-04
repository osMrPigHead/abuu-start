/** 博雅广场、课程详情与已选课程的缓存读取/归一化。 */
import type {
  BykcChosenCourse,
  BykcChosenTerm,
  BykcCourse,
  BykcCourseDetail,
  BykcCourseStatus,
} from "@shared/api";
import { BYKC_COURSE_STATUSES } from "@shared/api";
import type {
  BykcChosenCache,
  BykcCourseCache,
  BykcCoursesCache,
} from "@/types";
import { isRecord, nullableText, readInteger } from "@/utils/guards";
import {
  bykcCourseCacheKey,
  bykcCoursesCacheKey,
  readJson,
  STORAGE_KEYS,
  writeJson,
} from "@/cache/storage";

export function readBykcPageCache(
  page: number,
  pageSize: number,
): BykcCoursesCache | null {
  const raw = readJson<unknown>(bykcCoursesCacheKey(page, pageSize));
  if (!isRecord(raw)) return null;

  const courses = Array.isArray(raw.courses)
    ? raw.courses
        .map(normalizeCourse)
        .filter((course): course is BykcCourse => course !== null)
    : [];
  const savedAt = typeof raw.savedAt === "string" ? raw.savedAt : "";
  if (savedAt.length === 0 && courses.length === 0) return null;

  return {
    savedAt,
    page,
    pageSize,
    total: readInteger(raw.total) ?? courses.length,
    totalPages: Math.max(0, readInteger(raw.totalPages) ?? 0),
    courses,
  };
}

export function writeBykcPageCache(cache: BykcCoursesCache): void {
  writeJson(
    bykcCoursesCacheKey(cache.page, cache.pageSize),
    cache satisfies BykcCoursesCache,
  );
}

export function readBykcCourseCache(courseId: number): BykcCourseCache | null {
  const raw = readJson<unknown>(bykcCourseCacheKey(courseId));
  if (!isRecord(raw)) return null;

  const course = normalizeCourseDetail(raw.course);
  if (!course || course.id !== courseId) return null;

  const savedAt = typeof raw.savedAt === "string" ? raw.savedAt : "";
  return { savedAt, course };
}

export function writeBykcCourseCache(cache: BykcCourseCache): void {
  writeJson(bykcCourseCacheKey(cache.course.id), cache);
}

export function readBykcChosenCache(): BykcChosenCache | null {
  const raw = readJson<unknown>(STORAGE_KEYS.bykcChosenCache);
  if (!isRecord(raw)) return null;

  const term = normalizeChosenTerm(raw.term);
  const courses = Array.isArray(raw.courses)
    ? raw.courses
        .map(normalizeChosenCourse)
        .filter((course): course is BykcChosenCourse => course !== null)
    : [];
  const savedAt = typeof raw.savedAt === "string" ? raw.savedAt : "";
  if (savedAt.length === 0 && courses.length === 0) return null;

  return { savedAt, term, courses };
}

export function writeBykcChosenCache(cache: BykcChosenCache): void {
  writeJson(STORAGE_KEYS.bykcChosenCache, cache);
}

function normalizeChosenCourse(value: unknown): BykcChosenCourse | null {
  if (!isRecord(value)) return null;

  const courseId = readInteger(value.courseId);
  const courseName = nullableText(value.courseName);
  if (courseId === null || courseId <= 0 || !courseName) return null;

  return {
    courseId,
    courseName,
    startTime: nullableText(value.startTime),
    endTime: nullableText(value.endTime),
    place: nullableText(value.place),
    teacher: nullableText(value.teacher),
  };
}

function normalizeChosenTerm(value: unknown): BykcChosenTerm {
  if (!isRecord(value)) return { name: "", startDate: "", endDate: "" };

  return {
    name: nullableText(value.name) ?? "",
    startDate: nullableText(value.startDate) ?? "",
    endDate: nullableText(value.endDate) ?? "",
  };
}

function normalizeCourse(value: unknown): BykcCourse | null {
  if (!isRecord(value)) return null;

  const id = readInteger(value.id);
  const courseName = nullableText(value.courseName);
  if (id === null || id <= 0 || !courseName) return null;

  return {
    id,
    courseName,
    startTime: nullableText(value.startTime),
    endTime: nullableText(value.endTime),
    place: nullableText(value.place),
    teacher: nullableText(value.teacher),
    status: normalizeStatus(value.status),
    selected: value.selected === true,
    currentCount: readInteger(value.currentCount),
    maxCount: Math.max(0, readInteger(value.maxCount) ?? 0),
  };
}

function normalizeCourseDetail(value: unknown): BykcCourseDetail | null {
  const base = normalizeCourse(value);
  if (!base || !isRecord(value)) return null;

  return {
    ...base,
    descriptionText: nullableText(value.descriptionText),
  };
}

function normalizeStatus(value: unknown): BykcCourseStatus {
  return BYKC_COURSE_STATUSES.includes(value as BykcCourseStatus)
    ? (value as BykcCourseStatus)
    : "available";
}
