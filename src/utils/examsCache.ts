/** 考试缓存读写与归一化，与博雅、课表缓存模块保持同一分层。 */
import type { Exam } from "@shared/api";
import type { ExamsCache } from "@/types";
import {
  asString,
  isRecord,
  nullableText,
  toPositiveInteger,
} from "@/utils/guards";
import { readJson, STORAGE_KEYS, writeJson } from "@/utils/storage";
import { normalizeTerm } from "@/utils/term";

export function readExamsCache(): ExamsCache | null {
  const raw = readJson<unknown>(STORAGE_KEYS.examsCache);
  if (!isRecord(raw)) return null;

  const exams = Array.isArray(raw.exams)
    ? raw.exams.map(normalizeExam).filter((exam): exam is Exam => exam !== null)
    : [];

  const term = normalizeTerm(raw.term);
  const savedAt = typeof raw.savedAt === "string" ? raw.savedAt : "";
  if (savedAt.length === 0 && exams.length === 0) return null;

  return { savedAt, term, exams };
}

export function writeExamsCache(cache: ExamsCache): void {
  writeJson(STORAGE_KEYS.examsCache, cache);
}

function normalizeExam(value: unknown): Exam | null {
  if (!isRecord(value)) return null;

  const courseName = asString(value.courseName).trim();
  if (courseName.length === 0) return null;

  const examDate = nullableText(value.examDate);
  const startTime = nullableText(value.startTime);
  if (!examDate && !startTime) return null;

  const exam: Exam = { courseName };
  const courseNo = nullableText(value.courseNo);
  if (courseNo) exam.courseNo = courseNo;
  if (examDate) exam.examDate = examDate;
  if (startTime) exam.startTime = startTime;

  const endTime = nullableText(value.endTime);
  if (endTime) exam.endTime = endTime;
  const examPlace = nullableText(value.examPlace);
  if (examPlace) exam.examPlace = examPlace;
  const examSeatNo = nullableText(value.examSeatNo);
  if (examSeatNo) exam.examSeatNo = examSeatNo;

  const week = toPositiveInteger(value.week);
  if (week !== null) exam.week = week;
  const examTimeDescription = nullableText(value.examTimeDescription);
  if (examTimeDescription) exam.examTimeDescription = examTimeDescription;

  return exam;
}
