import { constants } from 'node:fs'
import { access, open, readFile, readdir, realpath, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, normalize, relative } from 'node:path'
import { RelayError } from './errors.ts'
import { readSettings, writeSettings } from './settingsStore.ts'

/** 背景扫描与图片读取，规则见 docs/trd-phase3.md 3.3 / 3.4。 */
export type BackgroundImage = {
  name: string
  size: number
  modifiedAt: string
}

export type BackgroundManifest = {
  directory: string | null
  configured: boolean
  images: BackgroundImage[]
  warning: string | null
}

export type BackgroundImageResult = {
  contentType: string
  data: Buffer
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_HEAD_BYTES = 32

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
}

const IMAGE_EXTENSIONS = new Set(Object.keys(CONTENT_TYPES))

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export async function getBackgroundManifest(): Promise<BackgroundManifest> {
  const settings = await readSettings()
  const directory = settings.backgroundDirectory

  if (!directory) {
    return { directory: null, configured: false, images: [], warning: null }
  }

  try {
    const images = await scanDirectory(directory)
    return {
      directory,
      configured: true,
      images,
      warning:
        images.length > 0 ? null : '目录中没有可用图片，已回退内置背景',
    }
  } catch {
    return {
      directory,
      configured: true,
      images: [],
      warning: '背景目录不可用，已回退内置背景',
    }
  }
}

export async function setBackgroundDirectory(input: unknown): Promise<BackgroundManifest> {
  if (input === null || input === '') {
    try {
      await writeSettings({ version: 1, backgroundDirectory: null })
    } catch {
      throw new RelayError('INTERNAL', '无法保存背景目录')
    }
    return { directory: null, configured: false, images: [], warning: null }
  }

  if (typeof input !== 'string') {
    throw new RelayError('INVALID_PATH', '背景目录必须是本机绝对路径')
  }

  const raw = input.trim()
  if (raw.length === 0 || raw.length > 1024 || raw.includes('\0')) {
    throw new RelayError('INVALID_PATH', '背景目录必须是本机绝对路径')
  }
  if (!isAbsolute(raw)) {
    throw new RelayError('INVALID_PATH', '背景目录必须是本机绝对路径')
  }

  const normalized = normalize(raw)
  // 拒绝 UNC（\\server\share）与设备路径（\\?\ / \\.\）。
  if (normalized.startsWith('\\\\') || normalized.startsWith('//')) {
    throw new RelayError('INVALID_PATH', '背景目录必须是本机绝对路径')
  }

  let resolved: string
  try {
    const info = await stat(normalized)
    if (!info.isDirectory()) {
      throw new RelayError('PATH_UNAVAILABLE', '背景目录不存在或不是目录')
    }
    await access(normalized, constants.R_OK)
    resolved = await realpath(normalized)
    const resolvedInfo = await stat(resolved)
    if (!resolvedInfo.isDirectory()) {
      throw new RelayError('PATH_UNAVAILABLE', '背景目录不存在或不是目录')
    }
  } catch (error) {
    if (error instanceof RelayError) throw error
    throw new RelayError('PATH_UNAVAILABLE', '背景目录不存在或无法访问')
  }

  try {
    await writeSettings({ version: 1, backgroundDirectory: resolved })
  } catch {
    throw new RelayError('INTERNAL', '无法保存背景目录')
  }

  return getBackgroundManifest()
}

export async function rescanBackground(): Promise<BackgroundManifest> {
  return getBackgroundManifest()
}

export async function readBackgroundImage(nameParam: string | null): Promise<BackgroundImageResult> {
  const settings = await readSettings()
  const directory = settings.backgroundDirectory

  if (!directory) {
    throw new RelayError('NOT_FOUND', '背景图片不存在')
  }

  const name = nameParam ?? ''
  if (!isValidImageName(name)) {
    throw new RelayError('INVALID_PATH', '背景图片名称不合法')
  }

  const extension = extname(name).slice(1).toLowerCase()
  const contentType = CONTENT_TYPES[extension]
  if (!contentType) {
    throw new RelayError('UNSUPPORTED_MEDIA', '不支持的背景图片格式')
  }

  const manifest = await getBackgroundManifest()
  if (!manifest.images.some((image) => image.name === name)) {
    throw new RelayError('NOT_FOUND', '背景图片不存在')
  }

  try {
    const resolvedDirectory = await realpath(directory)
    const resolvedFile = await realpath(join(directory, name))
    const pathWithinDirectory = relative(resolvedDirectory, resolvedFile)
    if (
      pathWithinDirectory.length === 0 ||
      pathWithinDirectory.startsWith('..') ||
      isAbsolute(pathWithinDirectory)
    ) {
      throw new RelayError('INVALID_PATH', '背景图片名称不合法')
    }

    const info = await stat(resolvedFile)
    if (!info.isFile() || info.size <= 0 || info.size > MAX_IMAGE_BYTES) {
      throw new RelayError('NOT_FOUND', '背景图片不存在')
    }

    const data = await readFile(resolvedFile)
    return { contentType, data }
  } catch (error) {
    if (error instanceof RelayError) throw error
    throw new RelayError('INTERNAL', '背景图片读取失败')
  }
}

async function scanDirectory(directory: string): Promise<BackgroundImage[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const images: BackgroundImage[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!isValidImageName(entry.name)) continue

    const extension = extname(entry.name).slice(1).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(extension)) continue

    const filePath = join(directory, entry.name)
    try {
      const info = await stat(filePath)
      if (!info.isFile() || info.size <= 0 || info.size > MAX_IMAGE_BYTES) continue

      const head = await readHead(filePath)
      if (!matchesImageFormat(extension, head)) continue

      images.push({
        name: entry.name,
        size: info.size,
        modifiedAt: info.mtime.toISOString(),
      })
    } catch {
      // 单张图片损坏或无法读取时跳过，不阻塞其他图片。
    }
  }

  return images
}

async function readHead(filePath: string): Promise<Buffer> {
  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(MAX_HEAD_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, MAX_HEAD_BYTES, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

function matchesImageFormat(extension: string, head: Buffer): boolean {
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
    case 'png':
      return head.length >= PNG_SIGNATURE.length && head.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
    case 'gif': {
      const signature = head.toString('latin1', 0, 6)
      return signature === 'GIF87a' || signature === 'GIF89a'
    }
    case 'webp':
      return (
        head.length >= 12 &&
        head.toString('latin1', 0, 4) === 'RIFF' &&
        head.toString('latin1', 8, 12) === 'WEBP'
      )
    case 'bmp':
      return head.length >= 2 && head[0] === 0x42 && head[1] === 0x4d
    case 'avif':
      return matchesAvif(head)
    default:
      return false
  }
}

function matchesAvif(head: Buffer): boolean {
  if (head.length < 12 || head.toString('latin1', 4, 8) !== 'ftyp') return false

  const brand = head.toString('latin1', 8, 12)
  if (brand === 'avif' || brand === 'avis') return true

  // 兼容品牌可能出现在 ftyp box 的后续位置。
  return head.toString('latin1').includes('avif') || head.toString('latin1').includes('avis')
}

function isValidImageName(name: string): boolean {
  if (name.length === 0 || name.length > 255) return false
  if (name.includes('\0') || name.includes('..')) return false
  if (name.includes('/') || name.includes('\\') || name.includes(':')) return false
  return basename(name) === name
}
