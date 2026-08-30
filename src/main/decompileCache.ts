import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { DecompileProvenance } from '../shared/decompile'

export const DECOMPILE_CACHE_SCHEMA_VERSION = 1
export const DECOMPILE_PROVENANCE_FILE = 'provenance.json'
export const DECOMPILE_OUTPUT_DIRECTORY = 'sources'
export const DEFAULT_DECOMPILE_CACHE_LIMIT_BYTES = 2 * 1024 * 1024 * 1024

export interface DecompileCacheEntry {
  directory: string
  provenance: DecompileProvenance | null
}

function entryDirectory(cacheRoot: string, sha256: string): string {
  if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error('invalid decompile cache key')
  return path.join(cacheRoot, 'jars', sha256.toLowerCase())
}

/** Returns the existing cache entry for a jar hash, or null when nothing usable is cached. */
export async function readDecompileCacheEntry(cacheRoot: string, sourceSha256: string): Promise<DecompileCacheEntry | null> {
  const directory = entryDirectory(cacheRoot, sourceSha256)
  const sources = path.join(directory, DECOMPILE_OUTPUT_DIRECTORY)
  const stat = await fs.stat(sources).catch(() => null)
  if (!stat?.isDirectory()) return null
  const rawProvenance = await fs.readFile(path.join(directory, DECOMPILE_PROVENANCE_FILE), 'utf8').catch(() => null)
  let provenance: DecompileProvenance | null = null
  if (rawProvenance) {
    try {
      const parsed = JSON.parse(rawProvenance) as DecompileProvenance
      if (parsed?.schemaVersion === DECOMPILE_CACHE_SCHEMA_VERSION && parsed.readOnly === true) provenance = parsed
    } catch {
      provenance = null
    }
  }
  // Touch the access stamp so LRU cleanup can rank entries by last use.
  await fs.writeFile(path.join(directory, 'last-access'), new Date().toISOString(), 'utf8').catch(() => undefined)
  return { directory, provenance }
}

interface StagingHandle {
  staging: string
  finalize: (provenance: DecompileProvenance) => Promise<DecompileCacheEntry>
  abandon: () => Promise<void>
}

/**
 * Prepares a private staging directory for a new cache entry. The caller writes the
 * decompiled tree into `<staging>/sources`, then calls `finalize`, which stamps
 * provenance and atomically moves the entry into place. On failure `abandon` removes
 * all traces so partial output never looks like a valid cache hit.
 */
export async function createDecompileCacheStaging(cacheRoot: string, sourceSha256: string): Promise<StagingHandle> {
  const directory = entryDirectory(cacheRoot, sourceSha256)
  const staging = `${directory}.staging-${process.pid}-${Date.now()}`
  await fs.rm(staging, { recursive: true, force: true })
  await fs.mkdir(path.join(staging, DECOMPILE_OUTPUT_DIRECTORY), { recursive: true })
  return {
    staging,
    finalize: async (provenance: DecompileProvenance): Promise<DecompileCacheEntry> => {
      await fs.writeFile(path.join(staging, DECOMPILE_PROVENANCE_FILE), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8')
      await fs.writeFile(path.join(staging, 'last-access'), provenance.createdAt, 'utf8')
      await fs.rm(directory, { recursive: true, force: true })
      await fs.mkdir(path.dirname(directory), { recursive: true })
      await fs.rename(staging, directory)
      return { directory, provenance }
    },
    abandon: async (): Promise<void> => {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

interface CacheSweepItem {
  directory: string
  lastAccess: number
  size: number
}

async function directorySize(root: string): Promise<number> {
  let total = 0
  const queue = [root]
  while (queue.length) {
    const current = queue.shift()!
    for (const entry of await fs.readdir(current, { withFileTypes: true }).catch(() => [])) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) queue.push(absolute)
      else if (entry.isFile()) total += (await fs.stat(absolute).catch(() => null))?.size ?? 0
    }
  }
  return total
}

/** Enforces an LRU byte budget across cached decompilation entries. Never touches active stagings. */
export async function enforceDecompileCacheLimit(
  cacheRoot: string,
  limitBytes = DEFAULT_DECOMPILE_CACHE_LIMIT_BYTES,
  keepSha256?: string
): Promise<string[]> {
  const jarsRoot = path.join(cacheRoot, 'jars')
  const items: CacheSweepItem[] = []
  for (const entry of await fs.readdir(jarsRoot, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue
    const directory = path.join(jarsRoot, entry.name)
    const lastAccess = Date.parse((await fs.readFile(path.join(directory, 'last-access'), 'utf8').catch(() => ''))) || 0
    items.push({ directory, lastAccess, size: await directorySize(directory) })
  }
  const removed: string[] = []
  let total = items.reduce((sum, item) => sum + item.size, 0)
  const ordered = items.sort((left, right) => left.lastAccess - right.lastAccess || left.directory.localeCompare(right.directory))
  for (const item of ordered) {
    if (total <= limitBytes) break
    if (keepSha256 && path.basename(item.directory).toLowerCase() === keepSha256.toLowerCase()) continue
    await fs.rm(item.directory, { recursive: true, force: true }).catch(() => undefined)
    total -= item.size
    removed.push(path.basename(item.directory))
  }
  return removed
}
