// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getBackgroundManifest,
  readBackgroundImage,
  rescanBackground,
  setBackgroundDirectory,
} from './background.ts'

let tempDir: string
let imageDir: string

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const jpegSignature = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00])

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'abuu-bg-'))
  imageDir = join(tempDir, 'images')
  await mkdir(imageDir)
  vi.stubEnv('LOCALAPPDATA', tempDir)
  vi.stubEnv('XDG_STATE_HOME', tempDir)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(tempDir, { recursive: true, force: true })
})

async function writeImages(): Promise<void> {
  await writeFile(join(imageDir, 'photo.png'), Buffer.concat([pngSignature, Buffer.from('data')]))
  await writeFile(join(imageDir, 'photo.jpg'), Buffer.concat([jpegSignature, Buffer.from('data')]))
  await writeFile(join(imageDir, 'broken.png'), Buffer.from('not-an-image'))
  await writeFile(join(imageDir, 'empty.png'), Buffer.alloc(0))
  await writeFile(join(imageDir, 'notes.txt'), Buffer.from('hello'))
}

describe('setBackgroundDirectory', () => {
  it('拒绝相对路径、UNC、设备路径与不存在目录', async () => {
    await expect(setBackgroundDirectory('relative/images')).rejects.toMatchObject({
      code: 'INVALID_PATH',
    })
    await expect(setBackgroundDirectory('\\\\server\\share')).rejects.toMatchObject({
      code: 'INVALID_PATH',
    })
    await expect(setBackgroundDirectory('\\\\?\\C:\\images')).rejects.toMatchObject({
      code: 'INVALID_PATH',
    })
    await expect(setBackgroundDirectory(join(tempDir, 'missing'))).rejects.toMatchObject({
      code: 'PATH_UNAVAILABLE',
    })
  })

  it('接受真实目录并持久化，null/空串清除配置', async () => {
    const manifest = await setBackgroundDirectory(imageDir)
    expect(manifest.configured).toBe(true)
    expect(manifest.directory).toBe(imageDir)

    const cleared = await setBackgroundDirectory(null)
    expect(cleared).toEqual({
      directory: null,
      configured: false,
      images: [],
      warning: null,
    })

    const empty = await setBackgroundDirectory('')
    expect(empty.configured).toBe(false)
  })

  it('拒绝文件路径', async () => {
    const file = join(tempDir, 'file.txt')
    await writeFile(file, 'x')
    await expect(setBackgroundDirectory(file)).rejects.toMatchObject({
      code: 'PATH_UNAVAILABLE',
    })
  })
})

describe('getBackgroundManifest', () => {
  it('未配置时返回未配置状态', async () => {
    await expect(getBackgroundManifest()).resolves.toEqual({
      directory: null,
      configured: false,
      images: [],
      warning: null,
    })
  })

  it('扫描有效图片签名并跳过损坏、空文件与非图片', async () => {
    await writeImages()
    await setBackgroundDirectory(imageDir)

    const manifest = await getBackgroundManifest()
    expect(manifest.configured).toBe(true)
    expect(manifest.warning).toBeNull()
    expect(manifest.images.map((image) => image.name).sort()).toEqual(['photo.jpg', 'photo.png'])
    expect(manifest.images.every((image) => image.size > 0)).toBe(true)
  })

  it('目录为空时给出回退提示', async () => {
    await setBackgroundDirectory(imageDir)
    const manifest = await getBackgroundManifest()
    expect(manifest.warning).toBe('目录中没有可用图片，已回退内置背景')
  })

  it('目录不可用时给出回退提示', async () => {
    await setBackgroundDirectory(imageDir)
    await rm(imageDir, { recursive: true, force: true })
    const manifest = await getBackgroundManifest()
    expect(manifest.warning).toBe('背景目录不可用，已回退内置背景')
  })

  it('rescanBackground 复用清单逻辑', async () => {
    await writeImages()
    await setBackgroundDirectory(imageDir)
    await expect(rescanBackground()).resolves.toMatchObject({ configured: true })
  })
})

describe('readBackgroundImage', () => {
  it('未配置时抛 NOT_FOUND', async () => {
    await expect(readBackgroundImage('photo.png')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('拒绝路径穿越与非法名称', async () => {
    await setBackgroundDirectory(imageDir)
    for (const name of ['../photo.png', 'a/b.png', 'a\\b.png', 'a:b.png', 'a..b.png', '']) {
      await expect(readBackgroundImage(name)).rejects.toMatchObject({
        code: 'INVALID_PATH',
      })
    }
  })

  it('拒绝不在清单中的文件与不支持的扩展名', async () => {
    await writeImages()
    await setBackgroundDirectory(imageDir)

    await expect(readBackgroundImage('missing.png')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(readBackgroundImage('notes.txt')).rejects.toMatchObject({
      code: 'UNSUPPORTED_MEDIA',
    })
  })

  it('返回图片内容类型与数据', async () => {
    await writeImages()
    await setBackgroundDirectory(imageDir)

    const image = await readBackgroundImage('photo.png')
    expect(image.contentType).toBe('image/png')
    expect(image.data.subarray(0, 8)).toEqual(pngSignature)
  })
})
