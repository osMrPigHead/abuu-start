import backgroundSourcesJson from '@/assets/backgrounds/sources.json'

export type BuiltinBackground = {
  fileName: string
  url: string
  author: string
  sourceName: string
  sourceUrl: string | null
}

type BackgroundSource = {
  name: string
  url: string
}

/** 仓库内置背景；构建时收集 backgrounds 下的图片，新增图片无需改代码。 */
const backgroundModules = import.meta.glob<string>('../assets/backgrounds/*.{jpg,jpeg,png,webp,gif,bmp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const backgroundSources: Record<string, BackgroundSource> = backgroundSourcesJson

/** 文件名格式为“来源_作者_序号”；作者名可能含下划线，因此只切第一个和最后一个下划线。 */
function parseBackgroundName(fileName: string): {
  sourceKey: string
  author: string
} | null {
  const extensionIndex = fileName.lastIndexOf('.')
  const stem = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
  const firstSeparator = stem.indexOf('_')
  const lastSeparator = stem.lastIndexOf('_')

  if (firstSeparator <= 0 || lastSeparator <= firstSeparator + 1) return null

  const sourceKey = stem.slice(0, firstSeparator)
  const author = stem.slice(firstSeparator + 1, lastSeparator)
  const sequence = stem.slice(lastSeparator + 1)

  if (!author || !/^\d+$/.test(sequence)) return null

  return { sourceKey, author }
}

function createBuiltinBackground(path: string, url: string): BuiltinBackground | null {
  const fileName = path.slice(path.lastIndexOf('/') + 1)
  const parsed = parseBackgroundName(fileName)
  if (!parsed) return null

  const source = backgroundSources[parsed.sourceKey]

  return {
    fileName,
    url,
    author: parsed.author,
    sourceName: source?.name ?? parsed.sourceKey,
    sourceUrl: source?.url ?? null,
  }
}

/** 每次页面加载随机选一张；模块级调用，保证同一 SPA 会话内所有页面一致。 */
export function pickBuiltinBackground(): BuiltinBackground | null {
  const candidates = Object.entries(backgroundModules)
    .map(([path, url]) => createBuiltinBackground(path, url))
    .filter((background): background is BuiltinBackground => background !== null)

  if (candidates.length === 0) return null

  return candidates[Math.floor(Math.random() * candidates.length)] ?? null
}
