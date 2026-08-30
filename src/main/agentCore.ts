import { promises as fs } from 'node:fs'
import path from 'node:path'

export function redactSensitiveContent(relativePath: string, content: string): string {
  const lower = relativePath.toLowerCase()
  if (lower.endsWith('.properties') || lower.endsWith('.gradle') || lower.endsWith('.kts')) {
    return content.replace(
      /^(\s*(?:[^#\r\n]*?(?:api[_-]?key|token|password|passwd|secret|credential)[^=:\r\n]*?)\s*[=:]\s*)(.*)$/gim,
      '$1<redacted>'
    )
  }
  if (lower.endsWith('.json')) {
    return content.replace(
      /("[^"]*(?:api[_-]?key|token|password|passwd|secret|credential)[^"]*"\s*:\s*)"(?:\\.|[^"\\])*"/gi,
      '$1"<redacted>"'
    )
  }
  return content
}

export function validateSnapshotId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9A-Za-z._-]{1,120}$/.test(value)) {
    throw new Error('Invalid snapshot ID')
  }
  return value
}

export function snapshotManifestBelongsToProject(value: unknown, id: string, projectPath: string): boolean {
  if (!value || typeof value !== 'object') return false
  const manifest = value as { id?: unknown; projectPath?: unknown }
  if (manifest.id !== id) return false
  return manifest.projectPath === undefined
    || (typeof manifest.projectPath === 'string' && path.resolve(manifest.projectPath) === path.resolve(projectPath))
}

export async function listManagedFiles(root: string, ignoreDirectory: (name: string) => boolean): Promise<string[]> {
  const files: string[] = []
  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.isSymbolicLink() || ignoreDirectory(entry.name)) continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolute)
      else if (entry.isFile()) files.push(path.relative(root, absolute).replaceAll('\\', '/'))
    }
  }
  await visit(root)
  return files.sort()
}

async function listManagedDirectories(root: string, ignoreDirectory: (name: string) => boolean): Promise<string[]> {
  const directories: string[] = []
  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || ignoreDirectory(entry.name)) continue
      const absolute = path.join(directory, entry.name)
      directories.push(path.relative(root, absolute).replaceAll('\\', '/'))
      await visit(absolute)
    }
  }
  await visit(root)
  return directories.sort()
}

export async function restoreManagedTreeExact(
  snapshotRoot: string,
  destinationRoot: string,
  expectedFiles: string[],
  ignoreDirectory: (name: string) => boolean,
  copyTree: (source: string, destination: string) => Promise<unknown>
): Promise<void> {
  const expected = new Set(expectedFiles.map((file) => file.replaceAll('\\', '/')))
  const expectedDirectories = new Set(await listManagedDirectories(snapshotRoot, ignoreDirectory))
  await copyTree(snapshotRoot, destinationRoot)
  const currentFiles = await listManagedFiles(destinationRoot, ignoreDirectory)
  const root = path.resolve(destinationRoot)
  for (const relative of currentFiles) {
    if (expected.has(relative)) continue
    const target = path.resolve(destinationRoot, ...relative.split('/'))
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe snapshot deletion path: ${relative}`)
    await fs.rm(target, { force: true })
  }
  const currentDirectories = await listManagedDirectories(destinationRoot, ignoreDirectory)
  for (const relative of currentDirectories.sort((left, right) => right.split('/').length - left.split('/').length)) {
    if (expectedDirectories.has(relative)) continue
    const target = path.resolve(destinationRoot, ...relative.split('/'))
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe snapshot directory deletion path: ${relative}`)
    await fs.rmdir(target).catch((error: unknown) => {
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : ''
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(code)) throw error
    })
  }
}

function resolveManagedPath(root: string, relativePath: string): string {
  const normalized = relativePath.trim().replaceAll('\\', '/')
  if (!normalized || path.posix.isAbsolute(normalized) || path.win32.isAbsolute(relativePath)) {
    throw new Error(`Unsafe managed recovery path: ${relativePath}`)
  }
  const segments = normalized.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Unsafe managed recovery path: ${relativePath}`)
  }
  const resolvedRoot = path.resolve(root)
  const target = path.resolve(resolvedRoot, ...segments)
  const relative = path.relative(resolvedRoot, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe managed recovery path: ${relativePath}`)
  }
  return target
}

/**
 * Rolls back only files attributed to an interrupted Agent task. A path that
 * existed in the snapshot is restored; a path created after the snapshot is
 * removed. Unrelated project edits and deletions are deliberately untouched.
 */
export async function restoreManagedPathsFromSnapshot(
  snapshotRoot: string,
  destinationRoot: string,
  changedFiles: string[]
): Promise<void> {
  const uniquePaths = [...new Set(changedFiles.map((file) => file.trim()).filter(Boolean))]
  for (const relativePath of uniquePaths) {
    const source = resolveManagedPath(snapshotRoot, relativePath)
    const destination = resolveManagedPath(destinationRoot, relativePath)
    const sourceStat = await fs.stat(source).catch((error: unknown) => {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      if (code === 'ENOENT') return null
      throw error
    })
    if (!sourceStat) {
      await fs.rm(destination, { recursive: true, force: true })
      continue
    }
    if (!sourceStat.isFile()) throw new Error(`Snapshot recovery path is not a file: ${relativePath}`)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(source, destination)
  }
}
