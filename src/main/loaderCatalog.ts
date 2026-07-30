import { promises as fs } from 'node:fs'
import path from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import type { LoaderKind, LoaderVersionOption } from '../shared/types'
import { javaVersionForMinecraft, supportsProjectCreation } from './loaderCompatibility'

export { javaVersionForMinecraft } from './loaderCompatibility'

const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 30_000
const xmlParser = new XMLParser({ ignoreAttributes: false })

interface CatalogCache {
  updatedAt: string
  options: LoaderVersionOption[]
}

function supportedOptions(options: LoaderVersionOption[]): LoaderVersionOption[] {
  const seen = new Set<string>()
  return options.filter((option) => {
    if (!option || !['fabric', 'quilt', 'forge', 'neoforge'].includes(option.loader)) return false
    if (!supportsProjectCreation(option.loader, option.minecraftVersion)) return false
    if (!option.loaderVersion || !Number.isInteger(option.javaVersion) || !Array.isArray(option.notes)) return false
    const key = `${option.loader}:${option.minecraftVersion}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function completeCatalog(options: LoaderVersionOption[]): boolean {
  return (['fabric', 'quilt', 'forge', 'neoforge'] as const).every((loader) => options.some((option) => option.loader === loader))
}

const fallbackOptions: LoaderVersionOption[] = [
  { loader: 'fabric', minecraftVersion: '1.20.1', loaderVersion: '0.16.10', apiVersion: '0.92.9+1.20.1', javaVersion: 17, channel: 'release', supportTier: 'stable', notes: [] },
  { loader: 'fabric', minecraftVersion: '1.20.6', loaderVersion: '0.16.10', apiVersion: '0.100.8+1.20.6', javaVersion: 21, channel: 'release', supportTier: 'stable', notes: [] },
  { loader: 'fabric', minecraftVersion: '1.21.1', loaderVersion: '0.16.10', apiVersion: '0.116.13+1.21.1', javaVersion: 21, channel: 'release', supportTier: 'stable', notes: [] },
  { loader: 'quilt', minecraftVersion: '1.20.1', loaderVersion: '0.27.1', apiVersion: '7.7.0+0.92.2-1.20.1', qslVersion: '6.3.0+1.20.1', javaVersion: 17, channel: 'release', supportTier: 'experimental', notes: ['Quilt 与 Quilted Fabric API 支持处于兼容验证阶段'] },
  { loader: 'forge', minecraftVersion: '1.20.1', loaderVersion: '1.20.1-47.4.0', javaVersion: 17, channel: 'release', supportTier: 'stable', notes: ['离线兼容目录，联网后会刷新 Forge 版本'] },
  { loader: 'neoforge', minecraftVersion: '1.20.4', loaderVersion: '20.4.251', javaVersion: 17, channel: 'release', supportTier: 'stable', notes: [] },
  { loader: 'neoforge', minecraftVersion: '1.21.1', loaderVersion: '21.1.244', javaVersion: 21, channel: 'release', supportTier: 'stable', notes: [] }
]

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.match(/\d+|[A-Za-z]+/g) ?? []
  const rightParts = right.match(/\d+|[A-Za-z]+/g) ?? []
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const a = leftParts[index]
    const b = rightParts[index]
    if (a === b) continue
    if (a === undefined) return -1
    if (b === undefined) return 1
    const aNumber = Number(a)
    const bNumber = Number(b)
    if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber
    if (Number.isFinite(aNumber)) return 1
    if (Number.isFinite(bNumber)) return -1
    return a.localeCompare(b)
  }
  return 0
}

async function fetchText(url: string, productVersion = 'development'): Promise<string> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': `ModMind/${productVersion} (loader-catalog)` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
      if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 350))
    }
  }
  throw lastError
}

async function fetchOptionalText(url: string, fallback: string, productVersion: string): Promise<string> {
  return await fetchText(url, productVersion).catch(() => fallback)
}

function metadataVersions(xml: string): string[] {
  const parsed = xmlParser.parse(xml) as {
    metadata?: { versioning?: { versions?: { version?: string | string[] } } }
  }
  return asArray(parsed.metadata?.versioning?.versions?.version).map(String)
}

function newest(values: string[]): string | undefined {
  return [...values].sort(compareVersions).at(-1)
}

function newestRelease(values: string[]): { version?: string; channel: 'release' | 'beta' } {
  const releases = values.filter((value) => !/(?:alpha|beta|rc)/i.test(value))
  return { version: newest(releases.length ? releases : values), channel: releases.length ? 'release' : 'beta' }
}

function minecraftSort(left: LoaderVersionOption, right: LoaderVersionOption): number {
  return compareVersions(right.minecraftVersion, left.minecraftVersion) || left.loader.localeCompare(right.loader)
}

export async function downloadLoaderCatalog(productVersion = 'development'): Promise<LoaderVersionOption[]> {
  const [manifestText, fabricGamesText, fabricLoadersText, fabricApiXml, quiltGamesText, quiltLoadersText, quiltedFabricApiXml, qslXml, forgeXml, neoForgeXml, neoTransitionXml] = await Promise.all([
    fetchText('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', productVersion),
    fetchOptionalText('https://meta.fabricmc.net/v2/versions/game', '[]', productVersion),
    fetchOptionalText('https://meta.fabricmc.net/v2/versions/loader', '[]', productVersion),
    fetchOptionalText('https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/maven-metadata.xml', '<metadata/>', productVersion),
    fetchOptionalText('https://meta.quiltmc.org/v3/versions/game', '[]', productVersion),
    fetchOptionalText('https://meta.quiltmc.org/v3/versions/loader', '[]', productVersion),
    fetchOptionalText('https://maven.quiltmc.org/repository/release/org/quiltmc/quilted-fabric-api/quilted-fabric-api/maven-metadata.xml', '<metadata/>', productVersion),
    fetchOptionalText('https://maven.quiltmc.org/repository/release/org/quiltmc/qsl/maven-metadata.xml', '<metadata/>', productVersion),
    fetchOptionalText('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml', '<metadata/>', productVersion),
    fetchOptionalText('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml', '<metadata/>', productVersion),
    fetchOptionalText('https://maven.neoforged.net/releases/net/neoforged/forge/maven-metadata.xml', '<metadata/>', productVersion)
  ])

  const manifest = JSON.parse(manifestText) as { versions: Array<{ id: string; type: string }> }
  const releases = manifest.versions.filter((entry) => entry.type === 'release').map((entry) => entry.id)
  const releaseByLength = [...releases].sort((left, right) => right.length - left.length || compareVersions(right, left))
  const fabricGames = JSON.parse(fabricGamesText) as Array<{ version: string; stable: boolean }>
  const fabricLoaders = JSON.parse(fabricLoadersText) as Array<{ version: string; stable: boolean }>
  const loaderVersion = fabricLoaders.find((entry) => entry.stable)?.version ?? fabricLoaders[0]?.version

  const fabricApiByGame = new Map<string, string>()
  for (const version of metadataVersions(fabricApiXml)) {
    const game = version.slice(version.lastIndexOf('+') + 1)
    if (releases.includes(game)) fabricApiByGame.set(game, version)
  }

  const options: LoaderVersionOption[] = []
  for (const game of loaderVersion ? fabricGames.filter((entry) => entry.stable && releases.includes(entry.version)) : []) {
    const apiVersion = fabricApiByGame.get(game.version)
    options.push({
      loader: 'fabric', minecraftVersion: game.version, loaderVersion, apiVersion,
      javaVersion: javaVersionForMinecraft(game.version), channel: 'release',
      supportTier: apiVersion ? 'stable' : 'experimental',
      notes: apiVersion ? [] : ['未找到对应的 Fabric API，模板将只包含 Fabric Loader']
    })
  }

  const quiltGames = JSON.parse(quiltGamesText) as Array<{ version: string }>
  const quiltLoaders = JSON.parse(quiltLoadersText) as Array<{ version: string }>
  const quiltLoaderVersion = quiltLoaders
    .map((entry) => entry.version)
    .filter((version) => !/(?:alpha|beta|rc)/i.test(version))
    .sort(compareVersions)
    .at(-1)
  const quiltedFabricApiByGame = new Map<string, string>()
  for (const version of metadataVersions(quiltedFabricApiXml)) {
    const game = releases.find((candidate) => version.endsWith(`-${candidate}`))
    if (game) quiltedFabricApiByGame.set(game, version)
  }
  const qslByGame = new Map<string, string>()
  for (const version of metadataVersions(qslXml)) {
    const game = releases.find((candidate) => version.endsWith(`+${candidate}`))
    if (!game) continue
    const existing = qslByGame.get(game)
    if (!existing || compareVersions(version, existing) > 0) qslByGame.set(game, version)
  }
  if (quiltLoaderVersion) {
    for (const game of quiltGames.map((entry) => entry.version).filter((version) => releases.includes(version))) {
      const apiVersion = quiltedFabricApiByGame.get(game)
      const qslVersion = qslByGame.get(game)
      if (!apiVersion || !qslVersion) continue
      options.push({
        loader: 'quilt', minecraftVersion: game, loaderVersion: quiltLoaderVersion, apiVersion, qslVersion,
        javaVersion: javaVersionForMinecraft(game), channel: 'release', supportTier: 'experimental',
        notes: ['Quilt 与 Quilted Fabric API 支持处于兼容验证阶段']
      })
    }
  }

  const forgeGroups = new Map<string, string[]>()
  for (const version of metadataVersions(forgeXml)) {
    const game = releaseByLength.find((candidate) => version.startsWith(`${candidate}-`))
    if (!game) continue
    forgeGroups.set(game, [...(forgeGroups.get(game) ?? []), version])
  }
  for (const [game, versions] of forgeGroups) {
    const version = newest(versions)
    if (!version) continue
    const modern = compareVersions(game, '1.18') >= 0
    options.push({
      loader: 'forge', minecraftVersion: game, loaderVersion: version,
      javaVersion: javaVersionForMinecraft(game), channel: 'release',
      supportTier: modern ? 'stable' : 'experimental',
      notes: modern ? [] : ['旧版 Forge 使用遗留构建工具链，需要额外验证']
    })
  }

  const neoGroups = new Map<string, string[]>()
  for (const version of metadataVersions(neoForgeXml)) {
    const game = releaseByLength.find((candidate) => {
      const prefix = candidate === '1.21' ? '21.0' : candidate.startsWith('1.') ? candidate.slice(2) : candidate
      return version.startsWith(`${prefix}.`)
    })
    if (!game) continue
    neoGroups.set(game, [...(neoGroups.get(game) ?? []), version])
  }
  for (const [game, versions] of neoGroups) {
    const selected = newestRelease(versions)
    if (!selected.version) continue
    options.push({
      loader: 'neoforge', minecraftVersion: game, loaderVersion: selected.version,
      javaVersion: javaVersionForMinecraft(game), channel: selected.channel,
      supportTier: selected.channel === 'release' ? 'stable' : 'experimental',
      notes: selected.channel === 'beta' ? ['当前 Minecraft 版本只有 NeoForge 测试版'] : []
    })
  }

  const transitionVersions = metadataVersions(neoTransitionXml).filter((version) => version.startsWith('1.20.1-'))
  const transition = newest(transitionVersions)
  if (transition) {
    options.push({
      loader: 'neoforge', minecraftVersion: '1.20.1', loaderVersion: transition,
      javaVersion: 17, channel: 'release', supportTier: 'experimental',
      notes: ['NeoForge 1.20.1 过渡构件使用 net.neoforged:forge']
    })
  }
  const supported = supportedOptions(options).sort(minecraftSort)
  if (!completeCatalog(supported)) throw new Error('上游 Loader 元数据未提供完整的受支持模板目录')
  return supported
}

export class LoaderCatalog {
  private memory: LoaderVersionOption[] | null = null

  constructor(private readonly cachePath: string, private readonly productVersion = 'development') {}

  async list(refresh = false): Promise<LoaderVersionOption[]> {
    if (!refresh && this.memory) return structuredClone(this.memory)
    if (!refresh) {
      try {
        const cached = JSON.parse(await fs.readFile(this.cachePath, 'utf8')) as CatalogCache
        const options = supportedOptions(cached.options)
        if (Date.now() - Date.parse(cached.updatedAt) < CACHE_TTL_MS && completeCatalog(options)) {
          this.memory = options
          return structuredClone(options)
        }
      } catch {
        // A stale or missing cache is refreshed below.
      }
    }
    try {
      const options = await downloadLoaderCatalog(this.productVersion)
      this.memory = options
      await fs.mkdir(path.dirname(this.cachePath), { recursive: true })
      await fs.writeFile(this.cachePath, JSON.stringify({ updatedAt: new Date().toISOString(), options }, null, 2), 'utf8')
      return structuredClone(options)
    } catch (error) {
      try {
        const cached = JSON.parse(await fs.readFile(this.cachePath, 'utf8')) as CatalogCache
        const options = supportedOptions(cached.options)
        if (completeCatalog(options)) {
          this.memory = options
          return structuredClone(options)
        }
      } catch {
        // The bundled fallback keeps project creation available offline.
      }
      this.memory = supportedOptions(fallbackOptions).map((option) => ({
        ...option,
        notes: [...option.notes, `兼容目录刷新失败：${error instanceof Error ? error.message : String(error)}`]
      }))
      return structuredClone(this.memory)
    }
  }

  async resolve(loader: LoaderKind, minecraftVersion: string): Promise<LoaderVersionOption> {
    const options = await this.list()
    const match = options.find((option) => option.loader === loader && option.minecraftVersion === minecraftVersion)
    if (!match) throw new Error(`${loader} 不支持 Minecraft ${minecraftVersion}`)
    return match
  }
}
