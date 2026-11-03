import { Router } from "express";
import {
  getAuthStatus,
  loginAuth,
  logoutAuth,
  preloadAuth,
  retryAuthSource,
  withSourceRetry,
} from "./authSession.ts";
import {
  getBackgroundManifest,
  readBackgroundImage,
  rescanBackground,
  setBackgroundDirectory,
} from "./background.ts";
import {
  bykcChosen,
  bykcCourseDetail,
  bykcCourses,
  bykcStatus,
} from "./bykc.ts";
import { byxtExams, byxtSchedule, byxtStatus } from "./byxt.ts";
import { RelayError } from "./errors.ts";
import {
  apiBoundary,
  apiNotFound,
  jsonPostRoute,
  jsonRoute,
  relayErrorHandler,
  sendImage,
  toUrl,
} from "./relayHttp.ts";
import { spocAssignmentDetail, spocAssignments, spocStatus } from "./spoc.ts";
import { ygdkOverview } from "./ygdk.ts";
import type { RelayHealthResponse } from "../shared/api.ts";

/**
 * 只读白名单路由。
 * 未列出的 /api/* 一律 404，不回退到 SPA；非 /api 请求直接退出 Router。
 * 业务接口的凭据由 authSession 注入，路由不读取任何 X-* 请求头。
 * 外部路径、方法与错误码见 docs/trd.md 3.1 / 3.2。
 */
export function createApiRouter(): Router {
  const router = Router({ caseSensitive: true, strict: true });

  router.use(apiBoundary());

  router.get(
    "/api/health",
    jsonRoute((): RelayHealthResponse => ({ ok: true })),
  );
  router.get(
    "/api/auth/status",
    jsonRoute(({ url }) =>
      getAuthStatus(url.searchParams.get("validate") === "1"),
    ),
  );
  router.get(
    "/api/byxt/status",
    jsonRoute(() => withSourceRetry("byxt", byxtStatus)),
  );
  router.get(
    "/api/byxt/schedule",
    jsonRoute(({ url }) => withSourceRetry("byxt", () => byxtSchedule(url))),
  );
  router.get(
    "/api/byxt/exams",
    jsonRoute(() => withSourceRetry("byxt", byxtExams)),
  );
  router.get(
    "/api/spoc/status",
    jsonRoute(() => withSourceRetry("spoc", spocStatus)),
  );
  router.get(
    "/api/spoc/assignments",
    jsonRoute(() => withSourceRetry("spoc", spocAssignments)),
  );
  router.get(
    "/api/spoc/assignments/:assignmentId",
    jsonRoute(({ params }) =>
      withSourceRetry("spoc", () => spocAssignmentDetail(params.assignmentId)),
    ),
  );
  router.get(
    "/api/bykc/status",
    jsonRoute(() => withSourceRetry("bykc", bykcStatus)),
  );
  router.get(
    "/api/bykc/chosen",
    jsonRoute(() => withSourceRetry("bykc", bykcChosen)),
  );
  router.get(
    "/api/bykc/courses",
    jsonRoute(({ url }) => withSourceRetry("bykc", () => bykcCourses(url))),
  );
  router.get(
    "/api/bykc/courses/:courseId",
    jsonRoute(({ params }) =>
      withSourceRetry("bykc", () => bykcCourseDetail(params.courseId)),
    ),
  );
  router.get(
    "/api/ygdk/overview",
    jsonRoute(() => withSourceRetry("ygdk", ygdkOverview)),
  );
  router.get("/api/background/image", async (req, res) => {
    const image = await readBackgroundImage(
      toUrl(req).searchParams.get("name"),
    );
    sendImage(res, image);
  });
  router.get(
    "/api/background",
    jsonRoute(() => getBackgroundManifest()),
  );

  // POST：仅白名单路径；未知 POST 与其他方法由 apiBoundary / apiNotFound 处理。
  router.post(
    "/api/auth/preload",
    jsonPostRoute(() => preloadAuth()),
  );
  router.post(
    "/api/auth/login",
    jsonPostRoute(({ body }) => loginAuth(body)),
  );
  router.post(
    "/api/auth/logout",
    jsonPostRoute(() => logoutAuth()),
  );
  router.post(
    "/api/auth/sources/:source/retry",
    jsonPostRoute(({ params }) => retryAuthSource(params.source)),
  );
  router.post(
    "/api/background/directory",
    jsonPostRoute(({ body }) =>
      setBackgroundDirectory(readDirectoryPath(body)),
    ),
  );
  router.post(
    "/api/background/rescan",
    jsonPostRoute(() => rescanBackground()),
  );

  router.use(apiNotFound());
  router.use(relayErrorHandler());

  return router;
}

function readDirectoryPath(body: unknown): unknown {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new RelayError("INVALID_REQUEST", "请求体必须是 JSON 对象");
  }
  if (!("path" in body)) {
    throw new RelayError("INVALID_REQUEST", "缺少 path");
  }
  return (body as { path?: unknown }).path;
}
