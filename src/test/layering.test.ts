import { describe, expect, it } from "vitest";

type ModuleSource = Record<string, string>;

const utilsSources = import.meta.glob<string>("../utils/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});
const domainSources = import.meta.glob<string>("../domain/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});
const cacheSources = import.meta.glob<string>("../cache/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

const IMPORT_RE = /from\s+["']([^"']+)["']/g;

const FORBIDDEN_UTILS =
  /^(vue|vue-router|@\/(api|cache|domain|composables|components|views)(\/|$))/;
const FORBIDDEN_DOMAIN =
  /^(vue|vue-router|@\/(api|cache|composables|components|views)(\/|$))/;
const FORBIDDEN_CACHE =
  /^(vue|vue-router|@\/(api|composables|components|views)(\/|$))/;

function productionSources(pathPrefix: string, sources: ModuleSource) {
  return Object.entries(sources).filter(
    ([path]) => path.startsWith(pathPrefix) && !path.endsWith(".test.ts"),
  );
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(IMPORT_RE)].map((match) => match[1] ?? "");
}

function expectNoForbiddenImports(
  files: Array<[string, string]>,
  forbidden: RegExp,
): void {
  for (const [path, source] of files) {
    for (const specifier of importSpecifiers(source)) {
      expect(specifier, `${path} imports ${specifier}`).not.toMatch(forbidden);
    }
  }
}

describe("目录分层", () => {
  it("utils 只依赖通用模块与共享类型", () => {
    expectNoForbiddenImports(
      productionSources("../utils/", utilsSources),
      FORBIDDEN_UTILS,
    );
  });

  it("domain 不依赖 Vue、网络、缓存与 UI", () => {
    expectNoForbiddenImports(
      productionSources("../domain/", domainSources),
      FORBIDDEN_DOMAIN,
    );
  });

  it("cache 不依赖 Vue、网络与 UI", () => {
    expectNoForbiddenImports(
      productionSources("../cache/", cacheSources),
      FORBIDDEN_CACHE,
    );
  });
});
