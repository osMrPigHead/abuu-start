import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 非敏感的本机设置，见 docs/trd-phase3.md 3.4 / 4.1。 */
export type AppSettings = {
  version: 1
  backgroundDirectory: string | null
}

const SETTINGS_FILE = 'settings.json'

export function appDataDirectory(): string {
  const localAppData = process.env.LOCALAPPDATA
  if (process.platform === 'win32' && localAppData) {
    return join(localAppData, 'buaa-start')
  }

  const stateHome = process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state')
  return join(stateHome, 'buaa-start')
}

function settingsFilePath(): string {
  return join(appDataDirectory(), SETTINGS_FILE)
}

/** 配置文件损坏时按未配置处理，不阻塞应用。 */
export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(settingsFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      version: 1,
      backgroundDirectory:
        typeof parsed.backgroundDirectory === 'string' && parsed.backgroundDirectory.length > 0
          ? parsed.backgroundDirectory
          : null,
    }
  } catch {
    return { version: 1, backgroundDirectory: null }
  }
}

export async function writeSettings(settings: AppSettings): Promise<void> {
  const directory = appDataDirectory()
  await mkdir(directory, { recursive: true, mode: 0o700 })

  const target = settingsFilePath()
  const temporary = join(directory, `.settings.${process.pid}.${Date.now()}.tmp`)
  await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  await rename(temporary, target)
}
