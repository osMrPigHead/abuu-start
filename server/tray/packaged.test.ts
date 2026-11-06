// @vitest-environment node
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureTrayRuntime,
  readEmbeddedTrayAssets,
  trayRuntimeId,
  type TrayRuntimeAsset,
} from "./packaged.ts";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const ASSETS: TrayRuntimeAsset[] = [
  { name: "tray-hook.cjs", data: Buffer.from("client"), mode: 0o600 },
  { name: "tray-hook.exe", data: Buffer.from("binary"), mode: 0o700 },
  { name: "running.png", data: Buffer.from("running"), mode: 0o600 },
  { name: "error.png", data: Buffer.from("error"), mode: 0o600 },
  { name: "tray-hook.LICENSE", data: Buffer.from("license"), mode: 0o600 },
];

async function createBaseDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "abuu-tray-"));
  tempDirectories.push(directory);
  return directory;
}

function runtimeDirectory(base: string): string {
  return join(base, "runtime", "tray-hook", trayRuntimeId());
}

describe("ensureTrayRuntime", () => {
  it("释放全部托盘资产并返回路径", async () => {
    const base = await createBaseDirectory();
    const runtime = await ensureTrayRuntime(ASSETS, base);
    const directory = runtimeDirectory(base);

    expect(runtime).toEqual({
      clientPath: join(directory, "tray-hook.cjs"),
      binaryPath: join(directory, "tray-hook.exe"),
      runningIconPath: join(directory, "running.png"),
      errorIconPath: join(directory, "error.png"),
    });

    for (const asset of ASSETS) {
      const target = join(directory, asset.name);
      await expect(readFile(target)).resolves.toEqual(asset.data);
      await expect(stat(target)).resolves.toMatchObject({
        size: asset.data.length,
      });
    }
  });

  it("已有文件大小一致时复用，不覆盖内容", async () => {
    const base = await createBaseDirectory();
    await ensureTrayRuntime(ASSETS, base);
    const target = join(runtimeDirectory(base), "tray-hook.cjs");
    await writeFile(target, "XXXXXX");

    await ensureTrayRuntime(ASSETS, base);

    await expect(readFile(target, "utf8")).resolves.toBe("XXXXXX");
  });

  it("大小不一致时重写为内嵌内容", async () => {
    const base = await createBaseDirectory();
    await ensureTrayRuntime(ASSETS, base);
    const target = join(runtimeDirectory(base), "tray-hook.cjs");
    await writeFile(target, "too-long");

    await ensureTrayRuntime(ASSETS, base);

    await expect(readFile(target, "utf8")).resolves.toBe("client");
  });

  it("目录不可用时抛错，由调用方降级", async () => {
    const base = await createBaseDirectory();
    const blocked = join(base, "blocked");
    await writeFile(blocked, "not-a-directory");

    await expect(ensureTrayRuntime(ASSETS, blocked)).rejects.toBeTruthy();
  });
});

describe("readEmbeddedTrayAssets", () => {
  it("源码/测试环境返回 null", () => {
    expect(readEmbeddedTrayAssets()).toBeNull();
  });
});
