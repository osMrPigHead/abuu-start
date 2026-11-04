#!/usr/bin/env node
/**
 * 检查 shared/ 中的每个导出符号是否都同时被 src/ 与 server/ 引用。
 * 未同时引用的符号会按“仅 src”“仅 server”“两侧均未引用”分组输出。
 *
 * 用法：node scripts/check-shared-usage.mjs [--include-tests]
 * 退出码：全部同时引用时为 0，否则为 1。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHARED_DIR = path.join(ROOT, "shared");
const GROUPS = [
  { name: "src", dir: path.join(ROOT, "src") },
  { name: "server", dir: path.join(ROOT, "server") },
];
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
]);
const TEST_FILE_RE = /\.(?:test|spec)\.[^.]+$/i;
const COMPILER_OPTIONS = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ESNext,
  allowImportingTsExtensions: true,
  baseUrl: ROOT,
  paths: {
    "@shared/*": ["shared/*"],
  },
};

const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  process.stdout.write(
    [
      "用法：node scripts/check-shared-usage.mjs [--include-tests]",
      "",
      "检查 shared/ 中的每个导出符号是否都同时被 src/ 与 server/ 引用。",
      "默认忽略 .test.* / .spec.* 测试文件；加上 --include-tests 可一并统计。",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

const unknownArgs = [...args].filter((arg) => arg !== "--include-tests");
if (unknownArgs.length > 0) {
  process.stderr.write(`未知参数：${unknownArgs.join(" ")}\n`);
  process.exit(1);
}

const includeTests = args.has("--include-tests");

try {
  const exitCode = main();
  process.exitCode = exitCode;
} catch (error) {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`检查失败：${message}\n`);
  process.exitCode = 1;
}

function main() {
  for (const dir of [SHARED_DIR, ...GROUPS.map((group) => group.dir)]) {
    if (!fs.existsSync(dir)) {
      throw new Error(`目录不存在：${toDisplayPath(dir)}`);
    }
  }

  const sharedFiles = listSourceFiles(SHARED_DIR);
  const sharedByKey = new Map(sharedFiles.map((file) => [pathKey(file), file]));
  const exportsCache = new Map();

  const symbols = [];
  for (const file of sharedFiles) {
    for (const name of getExports(file, sharedByKey, exportsCache, new Set())) {
      symbols.push({
        file,
        name,
        displayFile: toDisplayPath(file),
        key: symbolKey(file, name),
      });
    }
  }
  symbols.sort(
    (left, right) =>
      left.displayFile.localeCompare(right.displayFile) ||
      left.name.localeCompare(right.name),
  );

  const used = new Map(
    GROUPS.map((group) => [
      group.name,
      collectGroupUsage(group.dir, sharedByKey, exportsCache),
    ]),
  );

  const missing = symbols.filter((symbol) => {
    const srcUsed = used.get("src").has(symbol.key);
    const serverUsed = used.get("server").has(symbol.key);
    return !srcUsed || !serverUsed;
  });

  const onlySrc = [];
  const onlyServer = [];
  const neither = [];

  for (const symbol of missing) {
    const srcUsed = used.get("src").has(symbol.key);
    const serverUsed = used.get("server").has(symbol.key);
    if (srcUsed && !serverUsed) onlySrc.push(symbol);
    else if (!srcUsed && serverUsed) onlyServer.push(symbol);
    else neither.push(symbol);
  }

  const write = (line = "") => process.stdout.write(`${line}\n`);

  if (missing.length === 0) {
    write(
      `全部 ${symbols.length} 个 shared 导出符号均同时被 src 与 server 引用。`,
    );
    return 0;
  }

  write(
    `未同时被 src 与 server 引用的 shared 导出符号：${missing.length} / ${symbols.length}`,
  );
  write();

  printSection("仅 src 引用（server 未引用）", onlySrc, write);
  printSection("仅 server 引用（src 未引用）", onlyServer, write);
  printSection("src 与 server 均未引用", neither, write);

  write(`已同时引用：${symbols.length - missing.length} / ${symbols.length}`);
  return 1;
}

function printSection(title, items, write) {
  write(`${title}（${items.length} 个）`);
  if (items.length === 0) {
    write("  （无）");
  } else {
    for (const item of items) {
      write(`  ${item.displayFile}  ${item.name}`);
    }
  }
  write();
}

function listSourceFiles(dir) {
  const result = [];

  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (
        entry.isFile() &&
        SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
        (includeTests || !TEST_FILE_RE.test(entry.name))
      ) {
        result.push(fullPath);
      }
    }
  };

  visit(dir);
  return result;
}

function collectGroupUsage(dir, sharedByKey, exportsCache) {
  const usage = new Set();

  for (const file of listSourceFiles(dir)) {
    const sourceFile = parseSourceFile(file);

    const namespaces = new Map();

    const visitImports = (node) => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        const target = resolveSharedModule(
          node.moduleSpecifier.text,
          file,
          sharedByKey,
        );
        if (target && node.importClause) {
          const clause = node.importClause;
          if (clause.name) {
            usage.add(symbolKey(target, "default"));
          }

          if (clause.namedBindings) {
            if (ts.isNamespaceImport(clause.namedBindings)) {
              namespaces.set(clause.namedBindings.name.text, target);
            } else if (ts.isNamedImports(clause.namedBindings)) {
              for (const element of clause.namedBindings.elements) {
                const importedName = (element.propertyName ?? element.name)
                  .text;
                usage.add(symbolKey(target, importedName));
              }
            }
          }
        }
      }

      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        const target = resolveSharedModule(
          node.moduleSpecifier.text,
          file,
          sharedByKey,
        );
        if (target) {
          if (!node.exportClause) {
            for (const name of getExports(
              target,
              sharedByKey,
              exportsCache,
              new Set(),
            )) {
              if (name === "default" || name === "export=") continue;
              usage.add(symbolKey(target, name));
            }
          } else if (ts.isNamedExports(node.exportClause)) {
            for (const element of node.exportClause.elements) {
              const importedName = (element.propertyName ?? element.name).text;
              usage.add(symbolKey(target, importedName));
            }
          }
        }
      }

      ts.forEachChild(node, visitImports);
    };

    visitImports(sourceFile);

    const visitNamespaceUsage = (node) => {
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression)
      ) {
        const target = namespaces.get(node.expression.text);
        if (target) usage.add(symbolKey(target, node.name.text));
      }

      if (
        ts.isElementAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.argumentExpression &&
        ts.isStringLiteralLike(node.argumentExpression)
      ) {
        const target = namespaces.get(node.expression.text);
        if (target) usage.add(symbolKey(target, node.argumentExpression.text));
      }

      if (ts.isQualifiedName(node) && ts.isIdentifier(node.left)) {
        const target = namespaces.get(node.left.text);
        if (target) usage.add(symbolKey(target, node.right.text));
      }

      ts.forEachChild(node, visitNamespaceUsage);
    };

    visitNamespaceUsage(sourceFile);
  }

  return usage;
}

function getExports(file, sharedByKey, cache, stack) {
  const key = pathKey(file);
  const cached = cache.get(key);
  if (cached) return cached;

  if (stack.has(key)) return new Set();
  stack.add(key);

  const sourceFile = parseSourceFile(file);
  const names = new Set();

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause) {
        if (ts.isNamedExports(statement.exportClause)) {
          for (const element of statement.exportClause.elements) {
            names.add(element.name.text);
          }
        } else if (ts.isNamespaceExport(statement.exportClause)) {
          names.add(statement.exportClause.name.text);
        }
      } else if (
        statement.moduleSpecifier &&
        ts.isStringLiteralLike(statement.moduleSpecifier)
      ) {
        const target = resolveSharedModule(
          statement.moduleSpecifier.text,
          file,
          sharedByKey,
        );
        if (target) {
          for (const name of getExports(target, sharedByKey, cache, stack)) {
            if (name !== "default" && name !== "export=") names.add(name);
          }
        }
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      names.add(statement.isExportEquals ? "export=" : "default");
      continue;
    }

    const modifiers = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)
      : undefined;
    const isExported = modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!isExported) continue;

    const isDefault = modifiers.some(
      (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
    );

    if (isDefault) {
      names.add("default");
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        collectBindingNames(declaration.name, names);
      }
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement) ||
        ts.isImportEqualsDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
    }
  }

  stack.delete(key);
  const result = new Set(names);
  cache.set(key, result);
  return result;
}

function collectBindingNames(name, names) {
  if (ts.isIdentifier(name)) {
    names.add(name.text);
    return;
  }

  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) {
        collectBindingNames(element.name, names);
      }
    }
  }
}

function resolveSharedModule(specifier, containingFile, sharedByKey) {
  const resolved = ts.resolveModuleName(
    specifier,
    containingFile,
    COMPILER_OPTIONS,
    ts.sys,
  ).resolvedModule;
  if (resolved) {
    const file = sharedByKey.get(pathKey(resolved.resolvedFileName));
    if (file) return file;
  }

  let base;
  if (specifier === "@shared") {
    base = path.join(ROOT, "shared");
  } else if (specifier.startsWith("@shared/")) {
    base = path.join(ROOT, "shared", specifier.slice("@shared/".length));
  } else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(containingFile), specifier);
  } else {
    return null;
  }

  for (const candidate of moduleCandidates(base)) {
    const file = sharedByKey.get(pathKey(candidate));
    if (file) return file;
  }

  return null;
}

function moduleCandidates(base) {
  const candidates = [base];

  if (path.extname(base) === "") {
    for (const extension of SOURCE_EXTENSIONS) {
      candidates.push(`${base}${extension}`);
    }
    for (const extension of SOURCE_EXTENSIONS) {
      candidates.push(path.join(base, `index${extension}`));
    }
  }

  return candidates;
}

function parseSourceFile(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const scriptText =
    path.extname(file).toLowerCase() === ".vue" ? extractVueScript(text) : text;

  return ts.createSourceFile(
    file,
    scriptText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
}

function extractVueScript(text) {
  const blocks = text.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? [];
  return blocks
    .map((block) =>
      block.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, ""),
    )
    .join("\n");
}

function scriptKind(file) {
  switch (path.extname(file).toLowerCase()) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function symbolKey(file, name) {
  return `${pathKey(file)}#${name}`;
}

function pathKey(file) {
  const resolved = path.resolve(file);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function toDisplayPath(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}
