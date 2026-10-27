/**
 * 凭据文件读写，见 docs/trd-phase3.md 4.1 / 4.4。
 * 密文与密钥分开存放；损坏时重命名现场，不把密文当明文使用。
 */
import type { FileHandle } from 'node:fs/promises'
import { chmod, mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { decryptCredentials, encryptCredentials, generateKey, isValidKey } from './authCrypto.ts'
import {
  emptySourceState,
  SOURCE_IDS,
  type CredentialEnvelope,
  type CredentialFile,
  type SourceId,
  type SourceStatus,
  type StoredCookie,
} from './authTypes.ts'
import { appDataDirectory } from './settingsStore.ts'

const ENCRYPTED_FILE = 'credentials.enc'
const KEY_FILE = 'credentials.key'
const SOURCE_STATUSES: readonly SourceStatus[] = [
  'unconfigured',
  'pending',
  'ready',
  'failed',
  'expired',
]

export type LoadCredentialsResult =
  | { kind: 'missing' }
  | { kind: 'corrupt' }
  | { kind: 'loaded'; credentials: CredentialFile }

/** 写入串行化，避免并发派生互相覆盖。 */
let writeChain: Promise<unknown> = Promise.resolve()

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = writeChain.then(task, task)
  writeChain = next.catch(() => undefined)
  return next
}

export async function loadCredentials(): Promise<LoadCredentialsResult> {
  const directory = appDataDirectory()
  const encryptedPath = join(directory, ENCRYPTED_FILE)
  const keyPath = join(directory, KEY_FILE)

  let encryptedRaw: string
  try {
    encryptedRaw = await readFile(encryptedPath, 'utf8')
  } catch {
    return { kind: 'missing' }
  }

  const key = await readKey(keyPath)
  if (!key) {
    await quarantineEncryptedFile(encryptedPath)
    return { kind: 'corrupt' }
  }

  let plain: string
  try {
    const envelope = parseEnvelope(encryptedRaw)
    plain = decryptCredentials(envelope, key)
  } catch {
    await quarantineEncryptedFile(encryptedPath)
    return { kind: 'corrupt' }
  }

  const credentials = normalizeCredentialFile(plain)
  if (!credentials) {
    await quarantineEncryptedFile(encryptedPath)
    return { kind: 'corrupt' }
  }

  return { kind: 'loaded', credentials }
}

/** 写入成功返回 true；目录不可写等失败返回 false，保留内存会话。 */
export async function saveCredentials(credentials: CredentialFile): Promise<boolean> {
  return enqueueWrite(async () => {
    const directory = appDataDirectory()
    const keyPath = join(directory, KEY_FILE)
    const encryptedPath = join(directory, ENCRYPTED_FILE)

    try {
      await mkdir(directory, { recursive: true, mode: 0o700 })

      let key = await readKey(keyPath)
      if (!key) {
        key = generateKey()
        await writeAtomically(keyPath, key)
      }

      const envelope = encryptCredentials(JSON.stringify(credentials), key)
      await writeAtomically(encryptedPath, Buffer.from(JSON.stringify(envelope), 'utf8'))
      return true
    } catch {
      return false
    }
  })
}

/** 退出登录用：尽力删除，返回未能删除的文件名。 */
export async function deleteCredentials(): Promise<string[]> {
  return enqueueWrite(async () => {
    const directory = appDataDirectory()
    const failed: string[] = []

    for (const name of [ENCRYPTED_FILE, KEY_FILE]) {
      try {
        await unlink(join(directory, name))
      } catch (error) {
        if (isMissingFile(error)) continue
        failed.push(name)
      }
    }

    return failed
  })
}

async function readKey(keyPath: string): Promise<Buffer | null> {
  try {
    const key = await readFile(keyPath)
    return isValidKey(key) ? key : null
  } catch {
    return null
  }
}

async function writeAtomically(target: string, data: Buffer): Promise<void> {
  const directory = appDataDirectory()
  const temporary = join(
    directory,
    `.${basename(target)}.${process.pid}.${Date.now()}.tmp`,
  )

  let handle: FileHandle | null = null
  try {
    handle = await open(temporary, 'w', 0o600)
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle?.close()
  }

  await rename(temporary, target)
  await chmod(target, 0o600).catch(() => undefined)
}

/** 损坏文件保留现场，便于排查；重命名失败不阻塞。 */
async function quarantineEncryptedFile(encryptedPath: string): Promise<void> {
  const target = `${encryptedPath}.corrupt-${Date.now()}`
  try {
    await rename(encryptedPath, target)
  } catch {
    // 现场保留失败时仍按损坏处理，不影响后续登录。
  }
}

function parseEnvelope(raw: string): CredentialEnvelope {
  const parsed = JSON.parse(raw) as unknown
  if (!isRecord(parsed)) throw new Error('invalid envelope')

  const { version, alg, iv, tag, data } = parsed
  if (version !== 1 || alg !== 'AES-256-GCM') throw new Error('invalid envelope')
  if (typeof iv !== 'string' || typeof tag !== 'string' || typeof data !== 'string') {
    throw new Error('invalid envelope')
  }

  return { version: 1, alg: 'AES-256-GCM', iv, tag, data }
}

function normalizeCredentialFile(plain: string): CredentialFile | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(plain) as unknown
  } catch {
    return null
  }

  if (!isRecord(parsed) || parsed.version !== 1) return null

  const username = typeof parsed.username === 'string' ? parsed.username : ''
  const authenticatedAt = typeof parsed.authenticatedAt === 'string' ? parsed.authenticatedAt : ''
  if (username.length === 0 || authenticatedAt.length === 0) return null

  const user = isRecord(parsed.user) ? parsed.user : {}
  const cookies = Array.isArray(parsed.cookies) ? parsed.cookies : []
  const sources = isRecord(parsed.sources) ? parsed.sources : {}

  return {
    version: 1,
    username,
    password: typeof parsed.password === 'string' ? parsed.password : null,
    user: {
      name: typeof user.name === 'string' ? user.name : '',
      schoolid: typeof user.schoolid === 'string' ? user.schoolid : '',
    },
    authenticatedAt,
    cookies: cookies
      .map(normalizeStoredCookie)
      .filter((cookie): cookie is StoredCookie => cookie !== null),
    spoc: normalizeSpoc(parsed.spoc),
    bykc: normalizeBykc(parsed.bykc),
    ygdk: normalizeYgdk(parsed.ygdk),
    sources: normalizeSources(sources),
  }
}

function normalizeStoredCookie(value: unknown): StoredCookie | null {
  if (!isRecord(value)) return null

  const name = typeof value.name === 'string' ? value.name : ''
  const domain = typeof value.domain === 'string' ? value.domain : ''
  if (name.length === 0 || domain.length === 0) return null

  return {
    name,
    value: typeof value.value === 'string' ? value.value : '',
    domain,
    path: typeof value.path === 'string' && value.path.startsWith('/') ? value.path : '/',
    expiresAt:
      typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt)
        ? value.expiresAt
        : null,
    secure: value.secure === true,
    httpOnly: value.httpOnly === true,
    hostOnly: value.hostOnly !== false,
  }
}

function normalizeSpoc(value: unknown): CredentialFile['spoc'] {
  if (!isRecord(value)) return null
  if (typeof value.token !== 'string' || typeof value.roleCode !== 'string') return null
  if (value.token.length === 0 || value.roleCode.length === 0) return null
  return { token: value.token, roleCode: value.roleCode }
}

function normalizeBykc(value: unknown): CredentialFile['bykc'] {
  if (!isRecord(value)) return null
  if (typeof value.token !== 'string' || value.token.length === 0) return null
  return { token: value.token }
}

function normalizeYgdk(value: unknown): CredentialFile['ygdk'] {
  if (!isRecord(value)) return null
  if (typeof value.token !== 'string' || value.token.length === 0) return null
  if (typeof value.uid !== 'number' || !Number.isSafeInteger(value.uid)) return null
  return { uid: value.uid, token: value.token }
}

function normalizeSources(value: Record<string, unknown>): CredentialFile['sources'] {
  const sources = {} as CredentialFile['sources']
  for (const source of SOURCE_IDS) {
    const raw = value[source]
    if (!isRecord(raw)) {
      sources[source] = { status: 'unconfigured', updatedAt: null }
      continue
    }

    const status = SOURCE_STATUSES.includes(raw.status as SourceStatus)
      ? (raw.status as SourceStatus)
      : emptySourceState().status
    sources[source] = {
      status,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    }
  }
  return sources
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 仅用于类型收敛：sources 键必须来自 SOURCE_IDS。 */
export function isSourceKey(value: string): value is SourceId {
  return (SOURCE_IDS as readonly string[]).includes(value)
}
