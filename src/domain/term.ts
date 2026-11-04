/** 学期字段归一化，缓存与接口响应共用。 */
import type { Term } from "@shared/api";
import { asString, isRecord } from "@/utils/guards";

export function normalizeTerm(value: unknown): Term {
  if (!isRecord(value)) return { code: "", name: "" };

  return {
    code: asString(value.code),
    name: asString(value.name),
  };
}
