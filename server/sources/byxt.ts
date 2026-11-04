/**
 * byxt 业务层：上游调用与归一化，见 docs/trd.md 3.5、docs/api.md 1。
 *
 * 实现只读接口：currentUser、getTermWeeks、getMyScheduleDetail、exams。
 * 协议、URL 与信封判定在 upstreams/byxtApi.ts；本模块只做业务归一化。
 */
import { byxtCookieHeader } from "../auth/session.ts";
import { RelayError } from "../core/errors.ts";
import {
  isRecord,
  optionalText,
  textOrEmpty,
  toPositiveInteger,
} from "../core/guards.ts";
import { fetchByxt } from "../upstreams/byxtApi.ts";
import {
  normalizeDateKey,
  normalizeDayOfWeek,
  normalizeTime,
  parseSectionTimes,
} from "../../shared/schedule.ts";
import { parseRequestedWeek, resolveCurrentWeek } from "./byxtWeek.ts";
import type {
  ByxtStatusResponse,
  Course,
  Exam,
  ExamsResponse,
  ScheduleResponse,
  SectionTime,
  Term,
  Week,
} from "../../shared/api.ts";

const DEFAULT_WARNING = "无法确定当前教学周，已默认第 1 周";

type CurrentUser = {
  user: {
    id: string;
    name: string;
  };
  term: Term;
  classWeek: number | null;
};

async function fetchCurrentUser(cookie: string): Promise<CurrentUser> {
  const datas = await fetchByxt<unknown>(cookie, "api/home/currentUser.do");
  if (!isRecord(datas)) {
    throw new RelayError("BAD_RESPONSE", "当前用户响应格式异常");
  }

  const welcome = isRecord(datas.welcomeInfo) ? datas.welcomeInfo : {};
  return {
    user: {
      id: textOrEmpty(datas.userId),
      name: textOrEmpty(datas.userName),
    },
    term: {
      code: textOrEmpty(welcome.xnxqdm),
      name: textOrEmpty(welcome.xnxqmc),
    },
    classWeek: toPositiveInteger(welcome.classWeek),
  };
}

async function fetchTermWeeks(
  cookie: string,
  termCode: string,
): Promise<Week[]> {
  const query = new URLSearchParams({ termCode });
  const datas = await fetchByxt<unknown>(cookie, "api/home/getTermWeeks.do", {
    query,
  });
  if (!Array.isArray(datas)) return [];

  const weeks: Week[] = [];
  datas.forEach((item, index) => {
    if (!isRecord(item)) return;
    weeks.push({
      serialNumber: toPositiveInteger(item.serialNumber) ?? index + 1,
      name: textOrEmpty(item.name) || `第${index + 1}周`,
      startDate: normalizeDateKey(item.startDate),
      endDate: normalizeDateKey(item.endDate),
      curWeek: isTruthy(item.curWeek),
    });
  });

  return weeks.sort((left, right) => left.serialNumber - right.serialNumber);
}

async function fetchWeekSchedule(
  cookie: string,
  termCode: string,
  week: number,
): Promise<{ sectionTimes: SectionTime[]; courses: Course[] }> {
  const form = new URLSearchParams({
    termCode,
    type: "week",
    week: String(week),
  });
  const datas = await fetchByxt<unknown>(
    cookie,
    "api/home/student/getMyScheduleDetail.do",
    {
      method: "POST",
      form,
    },
  );

  const payload = isRecord(datas) ? datas : {};
  const sectionTimes = parseSectionTimes(payload.sectionTimes);
  const sectionMap = new Map(sectionTimes.map((item) => [item.section, item]));
  const rawCourses = Array.isArray(payload.arrangedList)
    ? payload.arrangedList
    : [];

  const courses: Course[] = [];
  for (const raw of rawCourses) {
    if (!isRecord(raw)) continue;
    const beginSection = toPositiveInteger(raw.beginSection);
    const endSection = toPositiveInteger(raw.endSection);
    const beginTime =
      normalizeTime(raw.beginTime) ??
      (beginSection === null
        ? null
        : (sectionMap.get(beginSection)?.start ?? null));
    const endTime =
      normalizeTime(raw.endTime) ??
      (endSection === null ? null : (sectionMap.get(endSection)?.end ?? null));

    courses.push({
      courseCode: textOrEmpty(raw.courseCode).trim(),
      courseName: textOrEmpty(raw.courseName).trim() || "未知课程",
      beginSection,
      endSection,
      beginTime,
      endTime,
      placeName: optionalText(raw.placeName),
      weeksAndTeachers: optionalText(raw.weeksAndTeachers),
      dayOfWeek: normalizeDayOfWeek(raw.dayOfWeek),
    });
  }

  return { sectionTimes, courses: sortCourses(courses) };
}

export async function byxtStatus(): Promise<ByxtStatusResponse> {
  const cookie = byxtCookieHeader();
  const current = await fetchCurrentUser(cookie);

  return {
    user: current.user,
    term: current.term,
  };
}

export async function byxtSchedule(url: URL): Promise<ScheduleResponse> {
  const cookie = byxtCookieHeader();
  const current = await fetchCurrentUser(cookie);

  if (current.term.code.length === 0) {
    throw new RelayError("UPSTREAM_ERROR", "未获取到当前学期信息");
  }

  // 周次表只用于周次边界与当前周定位；失败不应阻塞本周课表。
  let weeks: Week[] = [];
  try {
    weeks = await fetchTermWeeks(cookie, current.term.code);
  } catch (error) {
    if (error instanceof RelayError && error.code === "AUTH_EXPIRED")
      throw error;
  }

  const resolution = resolveCurrentWeek(weeks, current.classWeek, new Date());
  const requestedWeek = parseRequestedWeek(url.searchParams.get("week"), weeks);
  const week = requestedWeek ?? resolution.currentWeek ?? 1;
  const schedule = await fetchWeekSchedule(cookie, current.term.code, week);

  return {
    term: current.term,
    weeks,
    currentWeek: resolution.currentWeek,
    weekSource: resolution.weekSource,
    week: {
      number: week,
      sectionTimes: schedule.sectionTimes,
      courses: schedule.courses,
    },
    warning: resolution.weekSource === "default" ? DEFAULT_WARNING : null,
  };
}

export async function byxtExams(): Promise<ExamsResponse> {
  const cookie = byxtCookieHeader();
  const current = await fetchCurrentUser(cookie);

  if (current.term.code.length === 0) {
    throw new RelayError("UPSTREAM_ERROR", "未获取到当前学期信息");
  }

  const query = new URLSearchParams({ termCode: current.term.code });
  const datas = await fetchByxt<unknown>(cookie, "api/home/student/exams.do", {
    query,
  });

  if (datas !== null && !Array.isArray(datas)) {
    throw new RelayError("BAD_RESPONSE", "考试响应格式异常");
  }

  const exams: Exam[] = [];
  for (const raw of datas ?? []) {
    const exam = normalizeExam(raw);
    if (exam) exams.push(exam);
  }

  return { term: current.term, exams };
}

/* ------------------------------- 归一化辅助 ------------------------------- */

/**
 * 考试字段按 docs/api.md 1.2 原样保留时间字符串，由前端兼容多格式解析。
 * 缺 examDate 且缺 startTime 的未排定条目不在本期展示。
 */
function normalizeExam(value: unknown): Exam | null {
  if (!isRecord(value)) return null;

  const examDate = optionalText(value.examDate);
  const startTime = optionalText(value.startTime);
  if (!examDate && !startTime) return null;

  const exam: Exam = {
    courseName: textOrEmpty(value.courseName).trim() || "未知考试",
  };

  const courseNo = optionalText(value.courseNo);
  if (courseNo) exam.courseNo = courseNo;
  if (examDate) exam.examDate = examDate;
  if (startTime) exam.startTime = startTime;

  const endTime = optionalText(value.endTime);
  if (endTime) exam.endTime = endTime;
  const examPlace = optionalText(value.examPlace);
  if (examPlace) exam.examPlace = examPlace;
  const examSeatNo = optionalText(value.examSeatNo);
  if (examSeatNo) exam.examSeatNo = examSeatNo;

  const week = toPositiveInteger(value.week);
  if (week !== null) exam.week = week;
  const examTimeDescription = optionalText(value.examTimeDescription);
  if (examTimeDescription) exam.examTimeDescription = examTimeDescription;

  return exam;
}

function sortCourses(courses: readonly Course[]): Course[] {
  return [...courses].sort((left, right) => {
    const leftDay = left.dayOfWeek ?? Number.MAX_SAFE_INTEGER;
    const rightDay = right.dayOfWeek ?? Number.MAX_SAFE_INTEGER;
    if (leftDay !== rightDay) return leftDay - rightDay;

    const leftSection = left.beginSection ?? Number.MAX_SAFE_INTEGER;
    const rightSection = right.beginSection ?? Number.MAX_SAFE_INTEGER;
    if (leftSection !== rightSection) return leftSection - rightSection;

    return left.courseName.localeCompare(right.courseName, "zh-Hans-CN");
  });
}

function isTruthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}
