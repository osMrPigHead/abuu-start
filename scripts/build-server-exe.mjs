#!/usr/bin/env node
/**
 * 构建 Windows x64 单文件本地中继。
 *
 * server/index.ts -> esbuild CJS -> Node SEA blob -> postject 注入。
 * tray-hook 客户端在构建时把原生二进制路径改为运行期环境变量，
 * 原生二进制、客户端、图标与许可作为 SEA 资产嵌入 exe。
 *
 * 用法：npm run build:server [-- --no-smoke]
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIRECTORY = join(ROOT, "dist", "server");
const TEMP_DIRECTORY = join(OUTPUT_DIRECTORY, ".sea");
const EXECUTABLE_PATH = join(OUTPUT_DIRECTORY, "abuu-start-relay.exe");
const SERVER_BUNDLE_PATH = join(TEMP_DIRECTORY, "server.cjs");
const TRAY_CLIENT_PATH = join(TEMP_DIRECTORY, "tray-hook.cjs");
const SEA_CONFIG_PATH = join(TEMP_DIRECTORY, "sea-config.json");
const SEA_BLOB_PATH = join(TEMP_DIRECTORY, "sea-prep.blob");

const SERVER_ENTRY_PATH = join(ROOT, "server", "index.ts");
const TRAY_HOOK_SOURCE_PATH = join(
  ROOT,
  "node_modules",
  "tray-hook",
  "index.js",
);
const TRAY_BINARY_PATH = join(
  ROOT,
  "node_modules",
  "@phtdacosta",
  "tray-hook-win32-x64",
  "tray-hook.exe",
);
const RUNNING_ICON_PATH = join(ROOT, "server", "tray", "assets", "running.png");
const ERROR_ICON_PATH = join(ROOT, "server", "tray", "assets", "error.png");
const LICENSE_PATH = join(ROOT, "server", "tray", "tray-hook.LICENSE");

const TRAY_HOOK_MARKER = "const BINARY_PATH = resolveBinaryPath();";
const TRAY_HOOK_PATCHED =
  "const BINARY_PATH = process.env.ABUU_TRAY_HOOK_BINARY || resolveBinaryPath();";
const SENTINEL_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 12;

const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  printHelp();
  process.exit(0);
}

const unknownArgs = [...args].filter((arg) => arg !== "--no-smoke");
if (unknownArgs.length > 0) {
  console.error(`[build:server] 未知参数：${unknownArgs.join(" ")}`);
  process.exit(1);
}

const smoke = !args.has("--no-smoke");

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[build:server] 失败：${message}`);
  process.exitCode = 1;
});

function printHelp() {
  console.log(
    [
      "用法：npm run build:server [-- --no-smoke]",
      "",
      "构建 Windows x64 单文件本地中继：dist/server/abuu-start-relay.exe",
      "  --no-smoke   跳过启动冒烟测试",
      "  -h, --help   显示本帮助",
      "",
      "要求：Windows x64、Node >=22.12，且已执行 npm install（包含 optionalDependencies）。",
    ].join("\n"),
  );
}

async function main() {
  assertEnvironment();
  await assertFile(
    TRAY_HOOK_SOURCE_PATH,
    "node_modules/tray-hook/index.js 缺失，请先执行 npm install（不要使用 --omit=optional）",
  );
  await assertFile(
    TRAY_BINARY_PATH,
    "未找到 @phtdacosta/tray-hook-win32-x64，请先在 Windows x64 上执行 npm install",
  );
  await assertFile(RUNNING_ICON_PATH, `缺少托盘图标：${RUNNING_ICON_PATH}`);
  await assertFile(ERROR_ICON_PATH, `缺少托盘图标：${ERROR_ICON_PATH}`);
  await assertFile(LICENSE_PATH, `缺少第三方许可：${LICENSE_PATH}`);

  console.log(`[build:server] Node ${process.versions.node}`);
  await rm(OUTPUT_DIRECTORY, { recursive: true, force: true });
  await mkdir(TEMP_DIRECTORY, { recursive: true });

  console.log("[build:server] 打包 tray-hook 客户端");
  await buildTrayClient();

  console.log("[build:server] 打包 server 入口");
  const runtimeId = await computeRuntimeId();
  await buildServerBundle(runtimeId);

  console.log("[build:server] 生成 SEA blob 并注入 exe");
  await writeSeaConfig();
  await runNode(["--experimental-sea-config", SEA_CONFIG_PATH]);
  await copyFile(process.execPath, EXECUTABLE_PATH);
  await injectSeaBlob();

  if (smoke) {
    console.log("[build:server] 运行启动冒烟测试（TRAY=0）");
    await smokeTest();
  } else {
    console.log("[build:server] 已跳过启动冒烟测试");
  }

  await rm(TEMP_DIRECTORY, { recursive: true, force: true });
  const info = await stat(EXECUTABLE_PATH);
  const sizeMb = (info.size / 1024 / 1024).toFixed(1);
  console.log(
    `[build:server] 完成：${relative(ROOT, EXECUTABLE_PATH)} (${sizeMb} MB)`,
  );
}

function assertEnvironment() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error(
      `仅支持 Windows x64，当前为 ${process.platform}/${process.arch}`,
    );
  }

  const [major, minor] = process.versions.node.split(".").map(Number);
  if (
    major < MIN_NODE_MAJOR ||
    (major === MIN_NODE_MAJOR && minor < MIN_NODE_MINOR)
  ) {
    throw new Error(
      `需要 Node >=${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}，当前为 ${process.versions.node}`,
    );
  }
}

async function buildTrayClient() {
  const source = await readFile(TRAY_HOOK_SOURCE_PATH, "utf8");
  const occurrences = source.split(TRAY_HOOK_MARKER).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      "tray-hook 源码中的二进制路径标记不唯一或已变化，请更新 scripts/build-server-exe.mjs",
    );
  }

  const patched = source.replace(TRAY_HOOK_MARKER, TRAY_HOOK_PATCHED);
  await build({
    stdin: {
      contents: patched,
      resolveDir: dirname(TRAY_HOOK_SOURCE_PATH),
      sourcefile: "tray-hook-entry.mjs",
      loader: "js",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    outfile: TRAY_CLIENT_PATH,
    logLevel: "silent",
    legalComments: "inline",
  });

  const bundled = await readFile(TRAY_CLIENT_PATH, "utf8");
  if (!bundled.includes("ABUU_TRAY_HOOK_BINARY")) {
    throw new Error("tray-hook 客户端补丁未生效");
  }
}

async function buildServerBundle(runtimeId) {
  await build({
    entryPoints: [SERVER_ENTRY_PATH],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    outfile: SERVER_BUNDLE_PATH,
    external: ["tray-hook"],
    define: {
      __ABUU_TRAY_RUNTIME_ID__: JSON.stringify(runtimeId),
    },
    logLevel: "silent",
    legalComments: "inline",
  });
}

async function computeRuntimeId() {
  const hash = createHash("sha256");
  for (const path of [
    TRAY_CLIENT_PATH,
    TRAY_BINARY_PATH,
    RUNNING_ICON_PATH,
    ERROR_ICON_PATH,
    LICENSE_PATH,
  ]) {
    hash.update(await readFile(path));
  }

  return hash.digest("hex").slice(0, 16);
}

async function writeSeaConfig() {
  const config = {
    main: SERVER_BUNDLE_PATH,
    output: SEA_BLOB_PATH,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    assets: {
      "tray-hook.cjs": TRAY_CLIENT_PATH,
      "tray-hook.exe": TRAY_BINARY_PATH,
      "running.png": RUNNING_ICON_PATH,
      "error.png": ERROR_ICON_PATH,
      "tray-hook.LICENSE": LICENSE_PATH,
    },
  };

  await writeFile(
    SEA_CONFIG_PATH,
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

async function injectSeaBlob() {
  const require = createRequire(import.meta.url);
  const postjectEntry = require.resolve("postject");
  const postjectCli = join(dirname(postjectEntry), "cli.js");
  await assertFile(postjectCli, "postject CLI 缺失，请先执行 npm install");

  await run(process.execPath, [
    postjectCli,
    EXECUTABLE_PATH,
    "NODE_SEA_BLOB",
    SEA_BLOB_PATH,
    "--sentinel-fuse",
    SENTINEL_FUSE,
  ]);
}

async function smokeTest() {
  const port = await findFreePort();
  const output = { text: "" };
  const child = spawn(EXECUTABLE_PATH, [], {
    cwd: ROOT,
    env: { ...process.env, TRAY: "0", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout?.on("data", (chunk) => {
    output.text += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    output.text += chunk.toString();
  });

  const exited = new Promise((resolveExit) => {
    child.once("exit", (code, signal) => {
      resolveExit({ code, signal });
    });
  });

  try {
    await waitForHealth(port, child);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const tail = output.text.trim().split(/\r?\n/).slice(-10).join("\n");
    throw new Error(
      `${message}${tail === "" ? "" : `\n--- exe 输出 ---\n${tail}`}`,
      { cause: error },
    );
  } finally {
    if (child.exitCode === null) child.kill();
    const result = await Promise.race([exited, delay(3_000).then(() => null)]);
    if (result === null) {
      child.kill("SIGKILL");
      await exited;
    }
  }

  console.log(`[build:server] 冒烟测试通过：/api/health (PORT=${port})`);
}

async function waitForHealth(port, child) {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`exe 提前退出（code=${String(child.exitCode)}）`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        const body = await response.json();
        if (body?.ok === true) return;
      }
    } catch {
      // 服务尚未开始监听，继续等待。
    }

    await delay(150);
  }

  throw new Error("等待 /api/health 超时");
}

function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => {
        if (port === 0) {
          reject(new Error("无法分配空闲端口"));
          return;
        }
        resolvePort(port);
      });
    });
  });
}

function runNode(args) {
  return run(process.execPath, args);
}

function run(command, commandArgs) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: ROOT,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(
        new Error(
          `${relative(ROOT, command)} 退出码 ${code === null ? String(signal) : String(code)}`,
        ),
      );
    });
  });
}

async function assertFile(path, message) {
  try {
    const info = await stat(path);
    if (info.isFile()) return;
  } catch (error) {
    throw new Error(message, { cause: error });
  }

  throw new Error(message);
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}
