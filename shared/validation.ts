/**
 * 前端与本地中继共用的请求参数规则：分页默认值与路径 id 格式。
 * 只包含无副作用常量与纯校验函数。
 */

/** 博雅课程广场默认每页数量，见 docs/prd-phase2.md 4.2.3。 */
export const BYKC_DEFAULT_PAGE_SIZE = 12;

const SPOC_ASSIGNMENT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** SPOC 作业 id 只允许字母、数字、下划线与短横线。 */
export function isValidSpocAssignmentId(value: string): boolean {
  return SPOC_ASSIGNMENT_ID_RE.test(value);
}

const YGDK_UID_RE = /^\d{1,15}$/;

/** 阳光打卡 UID：1-15 位十进制整数且必须在安全整数范围内。 */
export function isValidYgdkUid(value: string): boolean {
  const text = value.trim();
  if (!YGDK_UID_RE.test(text)) return false;
  return Number.isSafeInteger(Number(text));
}
