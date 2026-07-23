import { promises as fs } from 'node:fs'
import path from 'node:path'

export function extractJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (fenced?.[1] ?? content).trim()
}

export function extractSingleJsonObject(content: string): string {
  const source = extractJson(content)
  const start = source.indexOf('{')
  if (start < 0) throw new Error('Agent response does not contain a JSON object')
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        const value = source.slice(start, index + 1)
        const trailing = source.slice(index + 1).trim()
        // Models occasionally append a short explanation after an otherwise
        // valid object. Only reject the trailing text when it is itself a
        // second complete JSON object, so harmless prose does not trigger a
        // protocol retry while duplicate actions remain fail-closed.
        if (trailing.startsWith('{')) {
          try {
            JSON.parse(trailing)
            throw new Error('Agent returned more than one action. Use one batch action for multiple read-only operations.')
          } catch (error) {
            if (error instanceof Error && /more than one action/.test(error.message)) throw error
          }
        }
        return value
      }
    }
  }
  throw new Error('Agent response contains an incomplete JSON object')
}

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

export async function restoreManagedTreeExact(
  snapshotRoot: string,
  destinationRoot: string,
  expectedFiles: string[],
  ignoreDirectory: (name: string) => boolean,
  copyTree: (source: string, destination: string) => Promise<unknown>
): Promise<void> {
  const expected = new Set(expectedFiles.map((file) => file.replaceAll('\\', '/')))
  await copyTree(snapshotRoot, destinationRoot)
  const currentFiles = await listManagedFiles(destinationRoot, ignoreDirectory)
  const root = path.resolve(destinationRoot)
  for (const relative of currentFiles) {
    if (expected.has(relative)) continue
    const target = path.resolve(destinationRoot, ...relative.split('/'))
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe snapshot deletion path: ${relative}`)
    await fs.rm(target, { force: true })
  }
}
