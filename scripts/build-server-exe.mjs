#!/usr/bin/env node
/**
 * 构建 Windows x64 单文件本地中继。
 *
 * server/index.ts -> esbuild CJS -> Node SEA blob -> postject 注入，
 * 再用 resedit 写入图标/版本信息，最后用 signtool 签名并附加时间戳。
 * tray-hook 客户端在构建时把原生二进制路径改为运行期环境变量，
 * 原生二进制、客户端、图标与许可作为 SEA 资产嵌入 exe。
 *
 * 用法：npm run build:server [-- --gui] [--no-smoke] [--no-sign]
 *       [--no-timestamp] [--timestamp [url]] [--icon <path>]
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
import { Data, NtExecutable, NtExecutableResource, Resource } from "resedit";
import { makeAppIcon } from "./make-app-icon.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIRECTORY = join(ROOT, "dist", "server");
const TEMP_DIRECTORY = join(OUTPUT_DIRECTORY, ".sea");
const EXECUTABLE_PATH = join(OUTPUT_DIRECTORY, "abuu-start-relay.exe");
const SERVER_BUNDLE_PATH = join(TEMP_DIRECTORY, "server.cjs");
const TRAY_CLIENT_PATH = join(TEMP_DIRECTORY, "tray-hook.cjs");
const SEA_CONFIG_PATH = join(TEMP_DIRECTORY, "sea-config.json");
const SEA_BLOB_PATH = join(TEMP_DIRECTORY, "sea-prep.blob");

const SERVER_ENTRY_PATH = join(ROOT, "server", "index.ts");
const PACKAGE_JSON_PATH = join(ROOT, "package.json");
const DEFAULT_ICON_PATH = join(ROOT, "server", "tray", "assets", "app.ico");
const SIGN_SCRIPT_PATH = join(ROOT, "scripts", "sign-server-exe.ps1");
const POWERSHELL_PATH = join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);
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
const TRAY_SPAWN_MARKER =
  'spawn(BINARY_PATH, [], { stdio: ["pipe", "pipe", "inherit"] })';
const TRAY_SPAWN_PATCHED =
  'spawn(BINARY_PATH, [], { stdio: ["pipe", "pipe", "inherit"], windowsHide: true })';
const SENTINEL_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const DEFAULT_TIMESTAMP_URL = "http://timestamp.digicert.com";
const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 12;

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
  } else {
    void main(options).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[build:server] 失败：${message}`);
      process.exitCode = 1;
    });
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[build:server] 失败：${message}`);
  process.exitCode = 1;
}

function parseArguments(argv) {
  const result = {
    smoke: true,
    sign: process.env.ABUU_SIGN !== "0",
    gui: false,
    timestampUrl:
      process.env.ABUU_SIGN_TIMESTAMP_URL?.trim() || DEFAULT_TIMESTAMP_URL,
    iconPath: process.env.ABUU_APP_ICON
      ? resolve(ROOT, process.env.ABUU_APP_ICON)
      : DEFAULT_ICON_PATH,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--no-smoke") {
      result.smoke = false;
      continue;
    }
    if (
      argument === "--gui" ||
      argument === "--windowed" ||
      argument === "--no-console"
    ) {
      result.gui = true;
      continue;
    }
    if (argument === "--no-sign") {
      result.sign = false;
      continue;
    }
    if (argument === "--no-timestamp") {
      result.timestampUrl = null;
      continue;
    }
    if (argument === "--timestamp") {
      const value = argv[index + 1];
      if (value && !value.startsWith("--")) {
        result.timestampUrl = value;
        index += 1;
      } else {
        result.timestampUrl = DEFAULT_TIMESTAMP_URL;
      }
      continue;
    }
    if (argument.startsWith("--timestamp=")) {
      const value = argument.slice("--timestamp=".length).trim();
      if (!value) {
        throw new Error("--timestamp 需要非空 URL");
      }
      result.timestampUrl = value;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      result.help = true;
      continue;
    }
    if (argument === "--icon") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--icon 需要指定 ICO 文件路径");
      }
      result.iconPath = resolve(ROOT, value);
      index += 1;
      continue;
    }
    throw new Error(`未知参数：${argument}`);
  }

  return result;
}

function printHelp() {
  console.log(
    [
      "用法：npm run build:server [-- --gui] [--no-smoke] [--no-sign]",
      "       [--no-timestamp] [--timestamp [url]] [--icon <path>]",
      "",
      "构建 Windows x64 单文件本地中继：dist/server/abuu-start-relay.exe",
      "  --gui             生成无控制台窗口的 GUI 子系统 exe（别名 --windowed/--no-console）",
      "  --no-smoke        跳过启动冒烟测试",
      "  --no-sign         跳过签名（也可设置 ABUU_SIGN=0）",
      "  --no-timestamp    不附带时间戳",
      `  --timestamp [url] 附带 RFC3161 时间戳，默认 ${DEFAULT_TIMESTAMP_URL}`,
      "  --icon <path>     使用指定 ICO，默认 server/tray/assets/app.ico",
      "  -h, --help        显示本帮助",
      "",
      "无控制台构建：npm run build:server:gui",
      "要求：Windows x64、Node >=22.12，且已执行 npm install（包含 optionalDependencies）。",
    ].join("\n"),
  );
}

async function ensureAppIcon(iconPath) {
  if (!(await isFile(iconPath))) {
    if (iconPath !== DEFAULT_ICON_PATH) {
      throw new Error(`缺少图标文件：${iconPath}`);
    }
    console.log(
      `[build:server] 默认图标缺失，生成 ${relative(ROOT, DEFAULT_ICON_PATH)}`,
    );
    await makeAppIcon({ outputPath: DEFAULT_ICON_PATH });
  }

  const header = await readFile(iconPath);
  if (
    header.length < 6 ||
    header.readUInt16LE(0) !== 0 ||
    header.readUInt16LE(2) !== 1
  ) {
    throw new Error(`不是有效 ICO 文件：${iconPath}`);
  }
}

async function applyWindowsResources(exePath, iconPath) {
  const versionString = await readPackageVersion();
  const iconData = await readFile(iconPath);
  const executable = NtExecutable.from(await readFile(exePath), {
    ignoreCert: true,
  });
  const resources = NtExecutableResource.from(executable);
  const iconFile = Data.IconFile.from(iconData);
  const iconGroups = Resource.IconGroupEntry.fromEntries(resources.entries);
  const iconGroupId = iconGroups[0]?.id ?? 1;
  const iconGroupLang = iconGroups[0]?.lang ?? 1033;

  Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    iconGroupId,
    iconGroupLang,
    iconFile.icons.map((icon) => icon.data),
  );

  const versions = Resource.VersionInfo.fromEntries(resources.entries);
  const versionInfo = versions[0] ?? Resource.VersionInfo.createEmpty();
  versionInfo.setFileVersion(versionString, 1033);
  versionInfo.setProductVersion(versionString, 1033);
  versionInfo.setStringValues(
    { lang: 1033, codepage: 1200 },
    {
      FileDescription: "航启本地中继",
      ProductName: "航启",
      CompanyName: "abuu-start",
      LegalCopyright: "MIT License",
      OriginalFilename: "abuu-start-relay.exe",
      InternalName: "abuu-start-relay",
      Comments: "abuu-start local relay",
    },
  );
  versionInfo.outputToResourceEntries(resources.entries);

  resources.outputResource(executable);
  await writeFile(exePath, Buffer.from(executable.generate()));

  const verification = NtExecutable.from(await readFile(exePath), {
    ignoreCert: true,
  });
  const verificationResources = NtExecutableResource.from(verification);
  if (
    Resource.IconGroupEntry.fromEntries(verificationResources.entries)
      .length === 0
  ) {
    throw new Error("写入后未找到图标资源");
  }
  if (
    Resource.VersionInfo.fromEntries(verificationResources.entries).length === 0
  ) {
    throw new Error("写入后未找到版本信息资源");
  }

  console.log(`[build:server] 图标与版本信息：${versionString}`);
}

/**
 * 设置 PE 可选头中的子系统：3 = 控制台，2 = Windows GUI。
 * 必须在 resedit 重写 PE 之后、签名之前执行，签名会覆盖后续字节修改。
 */
async function applySubsystem(exePath, gui) {
  const buffer = await readFile(exePath);
  if (buffer.readUInt16LE(0) !== 0x5a4d) {
    throw new Error("不是有效的 MZ/PE 文件");
  }

  const peOffset = buffer.readUInt32LE(0x3c);
  if (
    peOffset + 24 > buffer.length ||
    buffer.readUInt32LE(peOffset) !== 0x00004550
  ) {
    throw new Error("PE 头无效");
  }

  const optionalHeaderOffset = peOffset + 24;
  if (optionalHeaderOffset + 0x46 > buffer.length) {
    throw new Error("PE 可选头越界");
  }

  const magic = buffer.readUInt16LE(optionalHeaderOffset);
  if (magic !== 0x10b && magic !== 0x20b) {
    throw new Error(`未知 PE 可选头 magic：0x${magic.toString(16)}`);
  }

  const subsystemOffset = optionalHeaderOffset + 0x44;
  const target = gui ? 2 : 3;
  if (buffer.readUInt16LE(subsystemOffset) !== target) {
    buffer.writeUInt16LE(target, subsystemOffset);
    await writeFile(exePath, buffer);
  }

  const verification = await readFile(exePath);
  const actual = verification.readUInt16LE(subsystemOffset);
  if (actual !== target) {
    throw new Error(`PE 子系统写入失败：期望 ${target}，实际 ${actual}`);
  }

  console.log(
    `[build:server] PE 子系统：${gui ? "Windows GUI（无控制台窗口）" : "控制台"} (${actual})`,
  );
}

async function readPackageVersion() {
  const packageJson = JSON.parse(await readFile(PACKAGE_JSON_PATH, "utf8"));
  const version =
    typeof packageJson.version === "string" ? packageJson.version : "0.1.0";
  const parts = version
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  while (parts.length < 4) parts.push(0);
  return parts.slice(0, 4).join(".");
}

async function signExecutable(timestampUrl) {
  await assertFile(POWERSHELL_PATH, "未找到 Windows PowerShell 5.1");
  await assertFile(
    SIGN_SCRIPT_PATH,
    "缺少签名脚本 scripts/sign-server-exe.ps1",
  );

  await run(POWERSHELL_PATH, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    SIGN_SCRIPT_PATH,
    "-FilePath",
    EXECUTABLE_PATH,
    "-TimestampUrl",
    timestampUrl ?? "",
  ]);
}

async function verifySignature(timestampRequired) {
  const script = [
    '$env:PSModulePath = "$env:SystemRoot\\system32\\WindowsPowerShell\\v1.0\\Modules"',
    "Import-Module Microsoft.PowerShell.Security",
    `$signature = Get-AuthenticodeSignature -FilePath ${quotePowerShellLiteral(EXECUTABLE_PATH)}`,
    "if ($null -eq $signature.SignerCertificate) { Write-Error 'no signer certificate'; exit 2 }",
    "if ($signature.Status -in @('HashMismatch', 'NotSigned', 'NotSupported', 'Incompatible')) { Write-Error \"bad signature status: $($signature.Status)\"; exit 3 }",
    'Write-Output "STATUS=$($signature.Status)"',
    'Write-Output "THUMBPRINT=$($signature.SignerCertificate.Thumbprint)"',
    'if ($null -ne $signature.TimeStamperCertificate) { Write-Output "TIMESTAMP=$($signature.TimeStamperCertificate.Subject)" } else { Write-Output "TIMESTAMP=" }',
  ].join("; ");

  const result = await capture(POWERSHELL_PATH, [
    "-NoProfile",
    "-Command",
    script,
  ]);
  if (result.code !== 0) {
    throw new Error(
      `签名验证失败：${result.stderr.trim() || result.stdout.trim()}`,
    );
  }

  const status =
    result.stdout.match(/^STATUS=(.+)$/m)?.[1]?.trim() ?? "unknown";
  const thumbprint =
    result.stdout.match(/^THUMBPRINT=(.+)$/m)?.[1]?.trim() ?? "";
  const timestamp = result.stdout.match(/^TIMESTAMP=(.*)$/m)?.[1]?.trim() ?? "";

  if (timestampRequired && timestamp === "") {
    throw new Error("签名验证失败：未找到 RFC3161 时间戳");
  }

  console.log(
    `[build:server] 签名状态：${status}${thumbprint ? ` (${thumbprint})` : ""}`,
  );
  console.log(`[build:server] 时间戳：${timestamp === "" ? "无" : timestamp}`);
}

async function main(options) {
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
  await ensureAppIcon(options.iconPath);

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

  console.log("[build:server] 写入图标与版本信息");
  await applyWindowsResources(EXECUTABLE_PATH, options.iconPath);
  await applySubsystem(EXECUTABLE_PATH, options.gui);

  if (options.sign) {
    console.log(
      options.timestampUrl
        ? `[build:server] 签名 exe（时间戳：${options.timestampUrl}）`
        : "[build:server] 签名 exe（不附带时间戳）",
    );
    await signExecutable(options.timestampUrl);
    await verifySignature(options.timestampUrl !== null);
  } else {
    console.log("[build:server] 已跳过签名（--no-sign / ABUU_SIGN=0）");
  }

  if (options.smoke) {
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

  const spawnOccurrences = source.split(TRAY_SPAWN_MARKER).length - 1;
  if (spawnOccurrences !== 1) {
    throw new Error(
      "tray-hook 源码中的 spawn 选项标记不唯一或已变化，请更新 scripts/build-server-exe.mjs",
    );
  }

  const patched = source
    .replace(TRAY_HOOK_MARKER, TRAY_HOOK_PATCHED)
    .replace(TRAY_SPAWN_MARKER, TRAY_SPAWN_PATCHED);
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
  if (!bundled.includes("windowsHide: true")) {
    throw new Error("tray-hook 客户端未隐藏 daemon 控制台窗口");
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

function capture(command, commandArgs) {
  return new Promise((resolveCapture, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolveCapture({ code, signal, stdout, stderr });
    });
  });
}

function quotePowerShellLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
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

async function isFile(path) {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}
