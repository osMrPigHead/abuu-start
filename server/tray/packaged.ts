/**
 * SEA 可执行文件的托盘运行时。
 *
 * 源码模式直接使用仓库内的 tray-hook 与图标；SEA 模式把内嵌的托盘客户端、
 * 原生二进制、图标与许可释放到本机用户目录，再加载释放出的客户端。
 */
import { createRequire } from "node:module";
import { chmod, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAsset, isSea } from "node:sea";
import { appDataDirectory } from "../local/settingsStore.ts";

declare const __ABUU_TRAY_RUNTIME_ID__: string;

const RUNTIME_DIR_NAME = "tray-hook";
const TRAY_CLIENT_FILE = "tray-hook.cjs";
const TRAY_BINARY_FILE = "tray-hook.exe";
const RUNNING_ICON_FILE = "running.png";
const ERROR_ICON_FILE = "error.png";
const LICENSE_FILE = "tray-hook.LICENSE";

const ASSET_DEFINITIONS = [
  { key: TRAY_CLIENT_FILE, name: TRAY_CLIENT_FILE, mode: 0o600 },
  { key: TRAY_BINARY_FILE, name: TRAY_BINARY_FILE, mode: 0o700 },
  { key: RUNNING_ICON_FILE, name: RUNNING_ICON_FILE, mode: 0o600 },
  { key: ERROR_ICON_FILE, name: ERROR_ICON_FILE, mode: 0o600 },
  { key: LICENSE_FILE, name: LICENSE_FILE, mode: 0o600 },
] as const;

export type TrayRuntimeAsset = {
  name: string;
  data: Buffer;
  mode: number;
};

export type TrayRuntime = {
  clientPath: string | null;
  binaryPath: string | null;
  runningIconPath: string;
  errorIconPath: string;
};

export type TrayModule = {
  createTray: () => unknown;
};

/** 构建脚本注入资产哈希；源码与测试环境回退到 dev。 */
export function trayRuntimeId(): string {
  return typeof __ABUU_TRAY_RUNTIME_ID__ === "string" &&
    __ABUU_TRAY_RUNTIME_ID__.trim() !== ""
    ? __ABUU_TRAY_RUNTIME_ID__
    : "dev";
}

/** 只在 SEA 中读取内嵌资产；源码模式返回 null。 */
export function readEmbeddedTrayAssets(): TrayRuntimeAsset[] | null {
  if (!isSea()) return null;

  try {
    return ASSET_DEFINITIONS.map((asset) => ({
      name: asset.name,
      data:
        asset.name === LICENSE_FILE
          ? Buffer.from(getAsset(asset.key, "utf8"), "utf8")
          : Buffer.from(getAsset(asset.key)),
      mode: asset.mode,
    }));
  } catch {
    return null;
  }
}

/** 释放资产并返回托盘所需路径；失败由调用方降级处理。 */
export async function ensureTrayRuntime(
  assets: readonly TrayRuntimeAsset[],
  baseDirectory: string = appDataDirectory(),
): Promise<TrayRuntime> {
  const directory = join(
    baseDirectory,
    "runtime",
    RUNTIME_DIR_NAME,
    trayRuntimeId(),
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });

  for (const asset of assets) {
    await writeAsset(directory, asset);
  }

  return {
    clientPath: join(directory, TRAY_CLIENT_FILE),
    binaryPath: join(directory, TRAY_BINARY_FILE),
    runningIconPath: join(directory, RUNNING_ICON_FILE),
    errorIconPath: join(directory, ERROR_ICON_FILE),
  };
}

export async function resolveTrayRuntime(): Promise<TrayRuntime | null> {
  if (!isSea()) {
    const assetsDirectory = fileURLToPath(
      new URL("./assets/", import.meta.url),
    );
    return {
      clientPath: null,
      binaryPath: null,
      runningIconPath: join(assetsDirectory, RUNNING_ICON_FILE),
      errorIconPath: join(assetsDirectory, ERROR_ICON_FILE),
    };
  }

  const assets = readEmbeddedTrayAssets();
  if (!assets) {
    console.warn("[relay] 托盘内嵌资产不可用，继续仅提供 /api");
    return null;
  }

  try {
    return await ensureTrayRuntime(assets);
  } catch (error) {
    console.warn("[relay] 托盘组件释放失败，继续仅提供 /api", error);
    return null;
  }
}

export async function loadTrayModule(
  runtime: TrayRuntime,
): Promise<TrayModule | null> {
  if (!isSea()) {
    return asTrayModule((await import("tray-hook")) as unknown);
  }

  if (!runtime.clientPath || !runtime.binaryPath) return null;

  const previous = process.env.ABUU_TRAY_HOOK_BINARY;
  process.env.ABUU_TRAY_HOOK_BINARY = runtime.binaryPath;

  try {
    const require = createRequire(process.execPath);
    return asTrayModule(require(runtime.clientPath) as unknown);
  } finally {
    if (previous === undefined) {
      delete process.env.ABUU_TRAY_HOOK_BINARY;
    } else {
      process.env.ABUU_TRAY_HOOK_BINARY = previous;
    }
  }
}

async function writeAsset(
  directory: string,
  asset: TrayRuntimeAsset,
): Promise<void> {
  const target = join(directory, asset.name);
  if (await hasExpectedSize(target, asset.data.byteLength)) return;

  const temporary = join(
    directory,
    `.${asset.name}.${process.pid}.${Date.now()}.tmp`,
  );

  await writeFile(temporary, asset.data, { mode: asset.mode });
  try {
    await rm(target, { force: true });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }

  await chmod(target, asset.mode).catch(() => undefined);
}

async function hasExpectedSize(path: string, size: number): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile() && info.size === size;
  } catch {
    return false;
  }
}

function asTrayModule(value: unknown): TrayModule | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("createTray" in value) ||
    typeof (value as { createTray?: unknown }).createTray !== "function"
  ) {
    return null;
  }

  return value as TrayModule;
}
