/**
 * 博雅业务层：课程广场与已选课程归一化，见 docs/api.md 3、docs/trd-phase2.md 3.2 / 3.3。
 *
 * 只读白名单：getUserProfile、queryStudentSemesterCourseByPage、queryCourseById。
 * 不调用选课、退课、签到等写接口；协议与加密在 upstreams/bykcApi.ts。
 */
import { bykcToken as sessionBykcToken } from "../auth/session.ts";
import { normalizeDateTime, toShanghaiEpochMs } from "../core/datetime.ts";
import { RelayError } from "../core/errors.ts";
import { isRecord, optionalText, readInteger } from "../core/guards.ts";
import { htmlToText } from "../core/htmlText.ts";
import { callBykc } from "../upstreams/bykcApi.ts";
import { BYKC_DEFAULT_PAGE_SIZE } from "../../shared/validation.ts";
import type {
  BykcChosenCourse,
  BykcChosenResponse,
  BykcChosenTerm,
  BykcCourse,
  BykcCourseDetail,
  BykcCoursePage,
  BykcCourseResponse,
  BykcCourseStatus,
  BykcStatusResponse,
} from "../../shared/api.ts";

/** 广场每页数量上限，见 docs/trd-phase2.md 3.2。 */
const BYKC_MAX_PAGE_SIZE = 50;
const PAGE_NUMBER_RE = /^\d{1,4}$/;
const COURSE_ID_RE = /^\d{1,16}$/;

/** 校验博雅 auth_token：调用 getUserProfile。 */
export async function bykcStatus(): Promise<BykcStatusResponse> {
  const token = requireBykcToken();
  const data = await callBykc(token, "getUserProfile", {});

  if (!isRecord(data)) {
    throw new RelayError("UPSTREAM_ERROR", "博雅资料响应异常");
  }

  return {
    user: { name: optionalText(data.realName) ?? "" },
    term: {
      name: isRecord(data.term) ? (optionalText(data.term.termName) ?? "") : "",
    },
  };
}

/**
 * 已选博雅课程：先用 getAllConfig 解析当前学期起止日期，再调 queryChosenCourse。
 * 只读：不调用选课、退课、签到。
 */
export async function bykcChosen(): Promise<BykcChosenResponse> {
  const token = requireBykcToken();
  const config = await callBykc(token, "getAllConfig", {});
  const term = resolveChosenTerm(config);

  const data = await callBykc(token, "queryChosenCourse", {
    startDate: term.startDate,
    endDate: term.endDate,
  });

  const list =
    isRecord(data) && Array.isArray(data.courseList) ? data.courseList : [];
  const courses: BykcChosenCourse[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    if (!isRecord(item) || !isRecord(item.courseInfo)) continue;

    const course = normalizeChosenCourse(item.courseInfo);
    if (!course) continue;

    const key = `${course.courseId}|${course.startTime ?? ""}`;
    if (seen.has(key)) continue;

    seen.add(key);
    courses.push(course);
  }

  return { term, courses };
}

/** 课程广场分页；不做状态过滤，状态由中继计算。 */
export async function bykcCourses(url: URL): Promise<BykcCoursePage> {
  const token = requireBykcToken();
  const { page, pageSize } = readPageQuery(url);
  const data = await callBykc(token, "queryStudentSemesterCourseByPage", {
    pageNumber: page,
    pageSize,
  });

  if (!isRecord(data)) {
    throw new RelayError("BAD_RESPONSE", "博雅课程列表响应异常");
  }

  const content = Array.isArray(data.content) ? data.content : [];
  const courses = content
    .map(normalizeCourse)
    .filter((course): course is BykcCourse => course !== null);

  return {
    page,
    pageSize,
    total: readInteger(data.totalElements) ?? 0,
    totalPages: Math.max(0, readInteger(data.totalPages) ?? 0),
    courses,
  };
}

/** 课程详情；简介转为纯文本后返回。 */
export async function bykcCourseDetail(
  idValue: string,
): Promise<BykcCourseResponse> {
  const token = requireBykcToken();
  const id = parseCourseId(idValue);
  const data = await callBykc(token, "queryCourseById", { id });

  if (
    !isRecord(data) ||
    typeof data.courseName !== "string" ||
    data.courseName.trim().length === 0
  ) {
    throw new RelayError("NOT_FOUND", "未找到该博雅课程");
  }

  const course = normalizeCourse(data);
  if (!course) {
    throw new RelayError("NOT_FOUND", "未找到该博雅课程");
  }

  const detail: BykcCourseDetail = {
    ...course,
    descriptionText: htmlToText(data.courseDesc) ?? "",
  };

  return { course: detail };
}

/* ------------------------------- 凭据与参数 ------------------------------- */

function requireBykcToken(): string {
  return sessionBykcToken();
}

function readPageQuery(url: URL): { page: number; pageSize: number } {
  const page = parsePageNumber(url.searchParams.get("page"), 1);
  const pageSize = parsePageNumber(
    url.searchParams.get("pageSize"),
    BYKC_DEFAULT_PAGE_SIZE,
  );

  if (page === null) {
    throw new RelayError("INVALID_PAGE", "页码必须是从 1 开始的整数");
  }

  if (pageSize === null || pageSize < 1 || pageSize > BYKC_MAX_PAGE_SIZE) {
    throw new RelayError(
      "INVALID_PAGE",
      `每页数量必须是 1–${BYKC_MAX_PAGE_SIZE} 的整数`,
    );
  }

  return { page, pageSize };
}

function parsePageNumber(
  value: string | null,
  fallback: number,
): number | null {
  if (value === null || value.trim().length === 0) return fallback;
  if (!PAGE_NUMBER_RE.test(value.trim())) return null;

  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

function parseCourseId(value: string): number {
  const trimmed = value.trim();
  if (!COURSE_ID_RE.test(trimmed)) {
    throw new RelayError("INVALID_REQUEST", "课程 id 必须是十进制整数");
  }

  const id = Number(trimmed);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new RelayError("INVALID_REQUEST", "课程 id 超出安全整数范围");
  }

  return id;
}

/* ------------------------------- 归一化 ------------------------------- */

/** 当前学期起止日期：优先时间落在起止内的一项，否则取结束最晚的一项。 */
function resolveChosenTerm(config: unknown): BykcChosenTerm {
  const semesters =
    isRecord(config) && Array.isArray(config.semester)
      ? config.semester.filter(isRecord)
      : [];

  const candidates: BykcChosenTerm[] = [];
  for (const semester of semesters) {
    const startDate = normalizeDateTime(semester.semesterStartDate);
    const endDate = normalizeDateTime(semester.semesterEndDate);
    if (startDate === null || endDate === null) continue;

    candidates.push({
      name: optionalText(semester.semesterName) ?? "",
      startDate,
      endDate,
    });
  }

  if (candidates.length === 0) {
    throw new RelayError("UPSTREAM_ERROR", "博雅学期配置缺少起止日期");
  }

  const nowMs = Date.now();
  const current = candidates.find((semester) => {
    const start = toShanghaiEpochMs(semester.startDate);
    const end = toShanghaiEpochMs(semester.endDate);
    return start !== null && end !== null && nowMs >= start && nowMs <= end;
  });
  if (current) return current;

  return candidates.reduce((latest, semester) =>
    (toShanghaiEpochMs(semester.endDate) ?? 0) >
    (toShanghaiEpochMs(latest.endDate) ?? 0)
      ? semester
      : latest,
  );
}

/** 已选课程记录里的 courseInfo；没有课程名或 id 时跳过。 */
function normalizeChosenCourse(
  courseInfo: Record<string, unknown>,
): BykcChosenCourse | null {
  const courseId = readInteger(courseInfo.id);
  const courseName = optionalText(courseInfo.courseName);
  if (courseId === null || courseId <= 0 || !courseName) return null;

  return {
    courseId,
    courseName,
    startTime: normalizeDateTime(courseInfo.courseStartDate),
    endTime: normalizeDateTime(courseInfo.courseEndDate),
    place: optionalText(courseInfo.coursePosition),
    teacher: optionalText(courseInfo.courseTeacher),
  };
}

function normalizeCourse(value: unknown): BykcCourse | null {
  if (!isRecord(value)) return null;

  const id = readInteger(value.id);
  const courseName = optionalText(value.courseName);
  if (id === null || id <= 0 || !courseName) return null;

  return {
    id,
    courseName,
    startTime: normalizeDateTime(value.courseStartDate),
    endTime: normalizeDateTime(value.courseEndDate),
    place: optionalText(value.coursePosition),
    teacher: optionalText(value.courseTeacher),
    status: resolveCourseStatus(value),
    selected: value.selected === true,
    currentCount: readInteger(value.courseCurrentCount),
    maxCount: Math.max(0, readInteger(value.courseMaxCount) ?? 0),
  };
}

/** 状态判定顺序见 docs/api.md 3.3；时间按 Asia/Shanghai（+08:00）比较。 */
function resolveCourseStatus(
  course: Record<string, unknown>,
): BykcCourseStatus {
  const nowMs = Date.now();
  const startMs = toShanghaiEpochMs(course.courseStartDate);
  const selectStartMs = toShanghaiEpochMs(course.courseSelectStartDate);
  const selectEndMs = toShanghaiEpochMs(course.courseSelectEndDate);
  const maxCount = Math.max(0, readInteger(course.courseMaxCount) ?? 0);
  const currentCount = readInteger(course.courseCurrentCount);

  if (startMs !== null && nowMs > startMs) return "expired";
  if (course.selected === true) return "selected";
  if (selectEndMs !== null && nowMs > selectEndMs) return "ended";
  if (currentCount !== null && maxCount > 0 && currentCount >= maxCount)
    return "full";
  if (selectStartMs !== null && nowMs < selectStartMs) return "preview";
  return "available";
}
