import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ProjectInfo } from '../shared/types'

export interface ProjectRenameFilesResult {
  changedFiles: string[]
}

interface ProjectEntry {
  relative: string
  type: 'file' | 'directory'
}

const textExtensions = /\.(?:java|kt|kts|gradle|groovy|json|mcmeta|md|txt|toml|html?|xml|ya?ml|js|jsx|mjs|ts|tsx|py|lang|mcfunction|css|scss|properties|bat|cmd|sh|gitignore)$/i

function isIgnoredDirectory(name: string): boolean {
  return new Set(['.git', '.modmind', 'node_modules', 'build', '.gradle']).has(name)
}

async function collectEntries(root: string): Promise<ProjectEntry[]> {
  const entries: ProjectEntry[] = []
  const visit = async (directory: string): Promise<void> => {
    const children = await fs.readdir(directory, { withFileTypes: true })
    for (const child of children) {
      if (child.isSymbolicLink() || (child.isDirectory() && isIgnoredDirectory(child.name))) continue
      const relative = path.relative(root, path.join(directory, child.name)).replaceAll('\\', '/')
      if (child.isDirectory()) {
        entries.push({ relative, type: 'directory' })
        await visit(path.join(directory, child.name))
      } else if (child.isFile()) {
        entries.push({ relative, type: 'file' })
      }
    }
  }
  await visit(root)
  return entries
}

function renamedPath(relative: string, previousNamespace: string, nextNamespace: string): string {
  return relative.split('/').map((segment) => segment.replaceAll(previousNamespace, nextNamespace)).join('/')
}

function isBinary(content: Buffer): boolean {
  return content.indexOf(0) !== -1
}

/**
 * Rewrites project-owned references and path segments for a namespace change.
 * Tool state and generated build outputs are deliberately outside this tree.
 */
export async function renameProjectFiles(
  project: ProjectInfo,
  nextProject: ProjectInfo,
  manifestNames: readonly string[] = ['modmind.project.json']
): Promise<ProjectRenameFilesResult> {
  const root = path.resolve(project.path)
  const entries = await collectEntries(root)
  const manifestSet = new Set(manifestNames)
  const moves = entries
    .map((entry) => ({ ...entry, target: renamedPath(entry.relative, project.namespace, nextProject.namespace) }))
    .filter((entry) => entry.relative !== entry.target)

  const allPaths = new Set(entries.map((entry) => entry.relative))
  const moveSources = new Set(moves.map((entry) => entry.relative))
  const targets = new Set<string>()
  for (const move of moves) {
    if (targets.has(move.target)) throw new Error(`命名空间重命名产生重复路径：${move.target}`)
    targets.add(move.target)
    if (allPaths.has(move.target) && !moveSources.has(move.target)) {
      throw new Error(`命名空间重命名会覆盖现有路径：${move.target}`)
    }
  }

  const contents = new Map<string, Buffer>()
  for (const entry of entries) {
    if (entry.type !== 'file' || manifestSet.has(entry.relative)) continue
    const content = await fs.readFile(path.join(root, ...entry.relative.split('/')))
    if (!isBinary(content) && textExtensions.test(entry.relative)) contents.set(entry.relative, content)
  }

  const staging = path.join(root, `.modmind-rename-${process.pid}-${Date.now()}`)
  await fs.mkdir(staging)
  const staged = new Map<string, string>()
  try {
    // Stage changed entries first so directory moves cannot invalidate a child source path.
    for (const [index, move] of [...moves].sort((left, right) => right.relative.split('/').length - left.relative.split('/').length).entries()) {
      const source = path.join(root, ...move.relative.split('/'))
      const temporary = path.join(staging, String(index))
      await fs.rename(source, temporary)
      staged.set(move.relative, temporary)
    }

    // Recreate the destination tree with directories before files.
    for (const move of [...moves].sort((left, right) => {
      if (left.type !== right.type) return left.type === 'directory' ? -1 : 1
      return left.target.split('/').length - right.target.split('/').length
    })) {
      const temporary = staged.get(move.relative)
      if (!temporary) continue
      const destination = path.join(root, ...move.target.split('/'))
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.rename(temporary, destination)
    }

    const changedFiles: string[] = []
    for (const entry of entries) {
      if (entry.type !== 'file' || manifestSet.has(entry.relative)) continue
      const original = contents.get(entry.relative)
      if (!original) continue
      const previous = original.toString('utf8')
      const next = previous
        .replaceAll(project.namespace, nextProject.namespace)
        .replaceAll(project.name, nextProject.name)
      if (next === previous) continue
      const targetRelative = renamedPath(entry.relative, project.namespace, nextProject.namespace)
      await fs.writeFile(path.join(root, ...targetRelative.split('/')), next, 'utf8')
      changedFiles.push(targetRelative)
    }
    changedFiles.push(...moves.filter((entry) => entry.type === 'file').map((entry) => entry.target))
    return { changedFiles: [...new Set(changedFiles)].sort() }
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
}
