import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ProjectInfo } from '../shared/types'

const LEGACY_MANIFEST = 'modtool.project.json'
const CURRENT_MANIFEST = 'modmind.project.json'

export interface LegacyProjectConversion {
  converted: boolean
  project?: ProjectInfo
  reportPath?: string
}

async function isFile(target: string): Promise<boolean> {
  return fs.stat(target).then((stat) => stat.isFile()).catch(() => false)
}

async function isDirectory(target: string): Promise<boolean> {
  return fs.stat(target).then((stat) => stat.isDirectory()).catch(() => false)
}

async function writeJsonAtomically(target: string, value: unknown): Promise<void> {
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await fs.rename(temporary, target)
  } finally {
    await fs.rm(temporary, {force: true}).catch(() => undefined)
  }
}

function normalizedLegacyProject(parsed: ProjectInfo, root: string): ProjectInfo {
  return {...parsed, path: root, toolDataDirectory: '.modmind'}
}

function sameImportedProject(left: ProjectInfo, right: ProjectInfo): boolean {
  return left.name === right.name
    && left.namespace === right.namespace
    && left.loader === right.loader
    && left.minecraftVersion === right.minecraftVersion
    && left.createdAt === right.createdAt
}

/** Reads legacy metadata for project discovery only; callers must convert before use. */
export async function readLegacyModtoolProject(rootPath: string): Promise<ProjectInfo | null> {
  const root = path.resolve(rootPath)
  const manifestPath = path.join(root, LEGACY_MANIFEST)
  if (!await isFile(manifestPath)) return null
  const parsed = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as ProjectInfo
  return normalizedLegacyProject(parsed, root)
}

/** Converts the abandoned .modtool layout once, at explicit import/open time. */
export async function convertLegacyModtoolProject(rootPath: string): Promise<LegacyProjectConversion> {
  const root = path.resolve(rootPath)
  const legacyManifestPath = path.join(root, LEGACY_MANIFEST)
  const currentManifestPath = path.join(root, CURRENT_MANIFEST)
  const project = await readLegacyModtoolProject(root)
  if (!project) return {converted: false}

  // A previous conversion may have exited after writing the new manifest but
  // before removing the old one. Matching manifests are safe to finalize.
  if (await isFile(currentManifestPath)) {
    const current = normalizedLegacyProject(JSON.parse(await fs.readFile(currentManifestPath, 'utf8')) as ProjectInfo, root)
    if (!sameImportedProject(project, current)) {
      throw new Error('Legacy and current project manifests contain different projects; automatic conversion is unsafe')
    }
  }

  const legacyData = path.join(root, '.modtool')
  const currentData = path.join(root, '.modmind')
  const hasLegacyData = await isDirectory(legacyData)
  const hasCurrentData = await isDirectory(currentData)
  if (hasLegacyData && hasCurrentData) {
    throw new Error('Legacy and current project data directories both exist; resolve the conflict before importing')
  }
  if (hasLegacyData) await fs.rename(legacyData, currentData)
  else await fs.mkdir(currentData, {recursive: true})

  const reportDirectory = path.join(currentData, 'imports')
  await fs.mkdir(reportDirectory, {recursive: true})
  const reportPath = path.join(reportDirectory, `modtool-conversion-${Date.now()}.json`)
  await writeJsonAtomically(reportPath, {
    type: 'modtool-to-modmind',
    sourceManifest: LEGACY_MANIFEST,
    sourceDataDirectory: '.modtool',
    targetManifest: CURRENT_MANIFEST,
    targetDataDirectory: '.modmind',
    convertedAt: new Date().toISOString(),
    project
  })
  if (!await isFile(currentManifestPath)) await writeJsonAtomically(currentManifestPath, project)
  await fs.rm(legacyManifestPath, {force: true})
  return {converted: true, project, reportPath}
}
