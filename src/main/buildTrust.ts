import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const rootBuildFiles = new Set([
  'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts', 'gradle.properties',
  'gradlew', 'gradlew.bat'
])
const buildExtensions = new Set(['.gradle', '.kts', '.kt', '.java', '.groovy', '.properties', '.toml', '.jar'])
const ignoredDirectories = new Set(['.git', '.gradle', 'build', 'out', 'run', 'logs', 'node_modules'])

async function collectDirectory(root: string, directory: string, files: Set<string>): Promise<void> {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.isSymbolicLink() || ignoredDirectories.has(entry.name)) continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await collectDirectory(root, absolute, files)
    } else if (entry.isFile() && buildExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.add(path.relative(root, absolute).replaceAll('\\', '/'))
    }
  }
}

function referencedBuilds(settings: string): string[] {
  return [...settings.matchAll(/\bincludeBuild\s*(?:\(\s*)?["']([^"']+)["']/g)].map((match) => match[1])
}

export async function buildScriptFingerprint(projectRoot: string): Promise<string> {
  const root = path.resolve(projectRoot)
  const files = new Set<string>()
  for (const file of rootBuildFiles) {
    if (await fs.access(path.join(root, file)).then(() => true).catch(() => false)) files.add(file)
  }
  for (const directory of ['gradle', 'buildSrc', 'build-logic']) {
    const absolute = path.join(root, directory)
    if (await fs.stat(absolute).then((stat) => stat.isDirectory()).catch(() => false)) await collectDirectory(root, absolute, files)
  }

  const settingsFile = files.has('settings.gradle.kts') ? 'settings.gradle.kts' : files.has('settings.gradle') ? 'settings.gradle' : ''
  if (settingsFile) {
    const settings = await fs.readFile(path.join(root, settingsFile), 'utf8')
    for (const reference of referencedBuilds(settings)) {
      const included = path.resolve(root, reference)
      if (included !== root && !included.startsWith(`${root}${path.sep}`)) {
        throw new Error(`Gradle included build is outside the project and cannot be trusted safely: ${reference}`)
      }
      if (await fs.stat(included).then((stat) => stat.isDirectory()).catch(() => false)) await collectDirectory(root, included, files)
    }
  }

  const hash = createHash('sha256')
  for (const relative of [...files].sort()) {
    const content = await fs.readFile(path.join(root, ...relative.split('/')))
    hash.update(relative)
    hash.update('\0')
    hash.update(content)
    hash.update('\0')
  }
  return hash.digest('hex')
}
