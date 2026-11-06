#!/usr/bin/env node
/**
 * 从 public/icon 下的多尺寸 PNG 生成 exe 用的 app.ico。
 *
 * 用法：node scripts/make-app-icon.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SOURCE_DIRECTORY = join(ROOT, "public", "icon");
const DEFAULT_OUTPUT_PATH = join(ROOT, "server", "tray", "assets", "app.ico");
const ICON_SIZES = [16, 32, 48, 96, 128];

export async function makeAppIcon(options = {}) {
  const sourceDirectory = options.sourceDirectory ?? DEFAULT_SOURCE_DIRECTORY;
  const outputPath = options.outputPath ?? DEFAULT_OUTPUT_PATH;
  const images = [];

  for (const size of ICON_SIZES) {
    const path = join(sourceDirectory, `${size}.png`);
    const data = await readFile(path);
    assertPng(data, path, size);
    images.push({ size, data });
  }

  const icon = buildIcon(images);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, icon);

  return { outputPath, sizes: ICON_SIZES };
}

function assertPng(data, path, expectedSize) {
  if (data.length < 24 || data.readUInt32BE(0) !== 0x89504e47) {
    throw new Error(`不是有效 PNG：${path}`);
  }

  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width !== expectedSize || height !== expectedSize) {
    throw new Error(
      `PNG 尺寸不符：${path} 为 ${width}x${height}，期望 ${expectedSize}x${expectedSize}`,
    );
  }
}

function buildIcon(images) {
  const headerSize = 6 + images.length * 16;
  let dataOffset = headerSize;
  const header = Buffer.alloc(headerSize);

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let entryOffset = 6;
  for (const image of images) {
    const dimension = image.size >= 256 ? 0 : image.size;
    header.writeUInt8(dimension, entryOffset);
    header.writeUInt8(dimension, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(image.data.length, entryOffset + 8);
    header.writeUInt32LE(dataOffset, entryOffset + 12);
    entryOffset += 16;
    dataOffset += image.data.length;
  }

  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const result = await makeAppIcon();
    console.log(
      `[icon] 已生成 ${result.outputPath}（${result.sizes.join("/")}）`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[icon] 失败：${message}`);
    process.exitCode = 1;
  }
}
