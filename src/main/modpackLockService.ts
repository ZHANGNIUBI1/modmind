import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { JavaLoaderKind, ProjectInfo } from '../shared/types'
import type { ModDependency, ModFile, ModPlatform, ModSide } from './modProviderService'
import { isSafeModJarFileName } from './modpackFilename'
import { modpackModsRoot } from './modpackPaths'
import { readModpackManifest } from './modpackService'

export const MODPACK_LOCK_FILE = 'modmind.modpack.lock.json'

export interface LockedMod {
  provider: ModPlatform
  projectId: string
  versionId: string
  versionName: string
  fileName: string
  sha256: string
  size: number
  side: ModSide
  sources: string[]
  installedAt: string
  dependencies?: ModDependency[]
  publishedAt?: string
}

export interface ModpackLock {
  version: 1
  minecraftVersion: string
  loader: JavaLoaderKind
  generatedAt: string
  mods: LockedMod[]
}

function lockPath(project: ProjectInfo): string { return path.join(project.path, MODPACK_LOCK_FILE) }

function validHash(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) }

function validSource(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (/^https:\/\//i.test(value)) return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]')
  } catch { return false }
}

function validDependency(value: unknown): value is ModDependency {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (entry.provider === 'modrinth' || entry.provider === 'curseforge')
    && typeof entry.projectId === 'string'
    && /^[A-Za-z0-9._-]{1,160}$/.test(entry.projectId)
    && (entry.versionId === undefined || typeof entry.versionId === 'string')
    && (entry.fileName === undefined || typeof entry.fileName === 'string')
    && ['required', 'optional', 'incompatible', 'embedded'].includes(String(entry.kind))
}

function normalizeMod(value: unknown): LockedMod | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Record<string, unknown>
  if (!['modrinth', 'curseforge', 'mcmod'].includes(String(entry.provider)) || typeof entry.projectId !== 'string' || typeof entry.versionId !== 'string' || typeof entry.versionName !== 'string' || !isSafeModJarFileName(entry.fileName) || !validHash(entry.sha256) || typeof entry.size !== 'number' || !Number.isSafeInteger(entry.size) || entry.size < 1 || !['client', 'server', 'both', 'unknown'].includes(String(entry.side)) || !Array.isArray(entry.sources) || entry.sources.some((source) => !validSource(source)) || typeof entry.installedAt !== 'string') return null
  if (entry.dependencies !== undefined && (!Array.isArray(entry.dependencies) || entry.dependencies.some((dependency) => !validDependency(dependency)))) return null
  return { provider: entry.provider as ModPlatform, projectId: entry.projectId, versionId: entry.versionId, versionName: entry.versionName.slice(0, 180), fileName: entry.fileName, sha256: entry.sha256.toLowerCase(), size: entry.size, side: entry.side as ModSide, sources: entry.sources, installedAt: entry.installedAt, ...(Array.isArray(entry.dependencies) && entry.dependencies.length ? { dependencies: entry.dependencies as ModDependency[] } : {}), ...(typeof entry.publishedAt === 'string' ? { publishedAt: entry.publishedAt } : {}) }
}

export function createEmptyModpackLock(project: ProjectInfo): ModpackLock {
  if (!project.minecraftVersion || !['fabric', 'quilt', 'forge', 'neoforge'].includes(project.loader)) throw new Error('a Java modpack project is required')
  return { version: 1, minecraftVersion: project.minecraftVersion, loader: project.loader as JavaLoaderKind, generatedAt: new Date().toISOString(), mods: [] }
}

export async function readModpackLock(project: ProjectInfo): Promise<ModpackLock> {
  const fallback = createEmptyModpackLock(project)
  const parsed = await fs.readFile(lockPath(project), 'utf8').then((content) => JSON.parse(content) as Record<string, unknown>).catch((error) => {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : ''
    if (code === 'ENOENT') return null
    throw error
  })
  if (!parsed) return fallback
  if (parsed.version !== 1 || parsed.minecraftVersion !== project.minecraftVersion || parsed.loader !== project.loader || !Array.isArray(parsed.mods)) throw new Error(`${MODPACK_LOCK_FILE} does not match the current project`)
  const mods = parsed.mods.map(normalizeMod)
  if (mods.some((mod) => !mod)) throw new Error(`${MODPACK_LOCK_FILE} contains an invalid mod record`)
  const normalized = mods.filter((mod): mod is LockedMod => Boolean(mod))
  if (new Set(normalized.map((mod) => mod.fileName.toLowerCase())).size !== normalized.length) throw new Error(`${MODPACK_LOCK_FILE} contains duplicate file names`)
  if (new Set(normalized.map((mod) => `${mod.provider}:${mod.projectId}`)).size !== normalized.length) throw new Error(`${MODPACK_LOCK_FILE} contains duplicate provider project records`)
  return { ...fallback, generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : fallback.generatedAt, mods: normalized }
}

export async function writeModpackLock(project: ProjectInfo, lock: ModpackLock): Promise<ModpackLock> {
  if (lock.version !== 1 || lock.minecraftVersion !== project.minecraftVersion || lock.loader !== project.loader) throw new Error('lock metadata does not match the current project')
  for (const mod of lock.mods) if (!normalizeMod(mod)) throw new Error(`invalid locked mod: ${mod.fileName}`)
  if (new Set(lock.mods.map((mod) => `${mod.provider}:${mod.projectId}`)).size !== lock.mods.length) throw new Error('lock contains duplicate provider project records')
  const target = lockPath(project)
  const pending = `${target}.pending-${process.pid}`
  await fs.writeFile(pending, `${JSON.stringify({ ...lock, generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
  try { await fs.rename(pending, target) } finally { await fs.rm(pending, { force: true }).catch(() => undefined) }
  return readModpackLock(project)
}

export function lockedModFromFile(file: ModFile, result: { sha256: string; size: number }, fileName: string): LockedMod {
  return { provider: file.provider, projectId: file.projectId, versionId: file.versionId, versionName: file.versionName, fileName, sha256: result.sha256, size: result.size, side: file.side, sources: file.sources.map((source) => source.url), installedAt: new Date().toISOString(), ...(file.dependencies?.length ? { dependencies: file.dependencies } : {}), ...(file.publishedAt ? { publishedAt: file.publishedAt } : {}) }
}

export async function auditModpackLock(project: ProjectInfo): Promise<{ success: boolean; checked: number; errors: string[] }> {
  const lock = await readModpackLock(project)
  const manifest = await readModpackManifest(project)
  const modsRoot = modpackModsRoot(project, manifest)
  const errors: string[] = []
  for (const mod of lock.mods) {
    const target = path.join(modsRoot, mod.fileName)
    const bytes = await fs.readFile(target).catch(() => null)
    if (!bytes) { errors.push(`missing ${mod.fileName}`); continue }
    if (bytes.length !== mod.size) { errors.push(`size mismatch ${mod.fileName}`); continue }
    const { createHash } = await import('node:crypto')
    if (createHash('sha256').update(bytes).digest('hex') !== mod.sha256) errors.push(`sha256 mismatch ${mod.fileName}`)
  }
  return { success: !errors.length, checked: lock.mods.length, errors }
}
