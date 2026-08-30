import { createHash } from 'node:crypto'
import type { DownloadSource } from './downloadService'
import { verifiedDownload } from './downloadService'
import { fetchJsonWithRetry, postJsonWithRetry } from './networkRequest'
import type { JavaLoaderKind, ProjectInfo } from '../shared/types'
import { isSafeModJarFileName } from './modpackFilename'

export type AutomaticModPlatform = 'modrinth' | 'curseforge'
export type ModPlatform = AutomaticModPlatform | 'mcmod'
export type ModSide = 'client' | 'server' | 'both' | 'unknown'
export type ModDependencyKind = 'required' | 'optional' | 'incompatible' | 'embedded'

export interface ModSearchQuery {
  query: string
  minecraftVersion: string
  loader: JavaLoaderKind
  offset?: number
  limit?: number
  index?: 'downloads' | 'newest' | 'updated'
}

export interface ModCandidate {
  provider: AutomaticModPlatform
  projectId: string
  slug: string
  name: string
  summary: string
  projectUrl: string
  clientSide: ModSide
  serverSide: ModSide
  downloads: number
  iconUrl?: string
  updatedAt?: string
  license?: string
}

export interface ModDependency {
  provider: AutomaticModPlatform
  projectId: string
  versionId?: string
  fileName?: string
  kind: ModDependencyKind
}

export interface ModFile {
  provider: AutomaticModPlatform
  projectId: string
  versionId: string
  versionName: string
  filename: string
  primary: boolean
  side: ModSide
  size?: number
  sha512?: string
  sha1?: string
  sources: DownloadSource[]
  dependencies?: ModDependency[]
  referenceArtifacts?: ModReferenceArtifact[]
  publishedAt?: string
}

export interface ModReferenceArtifact {
  kind: 'sources' | 'javadoc' | 'development'
  filename: string
  size?: number
  sha512?: string
  sha1?: string
  sources: DownloadSource[]
}

export interface ModProjectDetails {
  provider: AutomaticModPlatform
  projectId: string
  slug: string
  name: string
  projectUrl: string
  sourceUrl?: string
  license?: string
}

export interface IdentifiedModFile {
  candidate: ModCandidate
  file: ModFile
}

export interface ModProvider {
  readonly id: AutomaticModPlatform
  search(query: ModSearchQuery): Promise<{ total: number; hits: ModCandidate[] }>
  versions(projectId: string, query: Pick<ModSearchQuery, 'minecraftVersion' | 'loader'>): Promise<ModFile[]>
  details(projectId: string): Promise<ModProjectDetails>
  identify?(input: { sha1: string; bytes: Buffer }, query: Pick<ModSearchQuery, 'minecraftVersion' | 'loader'>): Promise<IdentifiedModFile | null>
}

const MODRINTH_API = 'https://api.modrinth.com/v2'
const CURSEFORGE_API = 'https://api.curseforge.com/v1'

function safeId(value: string, label: string): string {
  const normalized = value.trim()
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(normalized)) throw new Error(`${label} is invalid`)
  return normalized
}

function side(value: unknown): ModSide {
  if (value === 'required' || value === 'optional') return 'both'
  if (value === 'unsupported') return 'unknown'
  return 'unknown'
}

function safeIconUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function sideFromEnvironments(client: unknown, server: unknown): ModSide {
  const clientSide = side(client)
  const serverSide = side(server)
  if (clientSide === 'both' && serverSide === 'unknown') return 'client'
  if (clientSide === 'unknown' && serverSide === 'both') return 'server'
  if (clientSide === 'both' && serverSide === 'both') return 'both'
  return 'unknown'
}

export function candidateRuntimeSide(candidate: Pick<ModCandidate, 'clientSide' | 'serverSide'>): ModSide {
  if (candidate.clientSide === 'both' && candidate.serverSide === 'unknown') return 'client'
  if (candidate.clientSide === 'unknown' && candidate.serverSide === 'both') return 'server'
  if (candidate.clientSide === 'both' && candidate.serverSide === 'both') return 'both'
  return 'unknown'
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  return await fetchJsonWithRetry<T>(url, { headers: { 'User-Agent': 'ModMind/1.3 (mod-provider)', ...headers } })
}

function modrinthFacets(query: ModSearchQuery): string {
  return JSON.stringify([[`categories:${query.loader}`], [`versions:${query.minecraftVersion}`], ['project_type:mod']])
}

interface ModrinthHit {
  project_id?: unknown
  slug?: unknown
  title?: unknown
  description?: unknown
  project_type?: unknown
  client_side?: unknown
  server_side?: unknown
  project_url?: unknown
  downloads?: unknown
  icon_url?: unknown
  date_modified?: unknown
  license?: { id?: unknown }
}

interface ModrinthVersion {
  id?: unknown
  project_id?: unknown
  name?: unknown
  version_number?: unknown
  files?: Array<{ url?: unknown; filename?: unknown; primary?: unknown; size?: unknown; hashes?: { sha1?: unknown; sha512?: unknown } }>
  loaders?: unknown
  game_versions?: unknown
  client_side?: unknown
  server_side?: unknown
  date_published?: unknown
  dependencies?: Array<{ project_id?: unknown; version_id?: unknown; file_name?: unknown; dependency_type?: unknown }>
}

interface ModrinthProject {
  id?: unknown
  slug?: unknown
  title?: unknown
  description?: unknown
  client_side?: unknown
  server_side?: unknown
  downloads?: unknown
  icon_url?: unknown
  source_url?: unknown
  license?: { id?: unknown }
}

function normalizeDependency(provider: AutomaticModPlatform, value: { project_id?: unknown; version_id?: unknown; file_name?: unknown; dependency_type?: unknown }): ModDependency | null {
  if (typeof value.project_id !== 'string' || !/^[A-Za-z0-9._-]{1,160}$/.test(value.project_id)) return null
  const kind = value.dependency_type
  if (kind !== 'required' && kind !== 'optional' && kind !== 'incompatible' && kind !== 'embedded') return null
  return {
    provider,
    projectId: value.project_id,
    ...(typeof value.version_id === 'string' && value.version_id ? { versionId: value.version_id } : {}),
    ...(typeof value.file_name === 'string' && value.file_name ? { fileName: value.file_name } : {}),
    kind
  }
}

export class ModrinthProvider implements ModProvider {
  readonly id = 'modrinth' as const

  async search(query: ModSearchQuery): Promise<{ total: number; hits: ModCandidate[] }> {
    const params = new URLSearchParams({ query: query.query.trim().slice(0, 120), limit: String(Math.min(Math.max(query.limit ?? 20, 1), 100)), offset: String(Math.max(query.offset ?? 0, 0)), facets: modrinthFacets(query), ...(query.index ? { index: query.index } : {}) })
    const payload = await getJson<{ total_hits?: number; hits?: ModrinthHit[] }>(`${MODRINTH_API}/search?${params}`)
    const hits = (payload.hits ?? []).flatMap((hit) => {
      if (typeof hit.project_id !== 'string' || typeof hit.slug !== 'string' || typeof hit.title !== 'string') return []
      const iconUrl = safeIconUrl(hit.icon_url)
      return [{ provider: this.id, projectId: hit.project_id, slug: hit.slug, name: hit.title.slice(0, 180), summary: typeof hit.description === 'string' ? hit.description.slice(0, 500) : '', projectUrl: typeof hit.project_url === 'string' ? hit.project_url : `https://modrinth.com/mod/${hit.slug}`, clientSide: side(hit.client_side), serverSide: side(hit.server_side), downloads: typeof hit.downloads === 'number' ? hit.downloads : 0, ...(iconUrl ? { iconUrl } : {}), ...(typeof hit.date_modified === 'string' ? { updatedAt: hit.date_modified } : {}), ...(typeof hit.license?.id === 'string' ? { license: hit.license.id } : {}) }]
    })
    return { total: typeof payload.total_hits === 'number' ? payload.total_hits : hits.length, hits }
  }

  async versions(projectId: string, query: Pick<ModSearchQuery, 'minecraftVersion' | 'loader'>): Promise<ModFile[]> {
    const params = new URLSearchParams({ loaders: JSON.stringify([query.loader]), game_versions: JSON.stringify([query.minecraftVersion]) })
    const payload = await getJson<ModrinthVersion[]>(`${MODRINTH_API}/project/${encodeURIComponent(safeId(projectId, 'Modrinth project ID'))}/version?${params}`)
    return payload.flatMap((version) => this.normalizeVersion(projectId, version))
  }

  private normalizeVersion(projectId: string, version: ModrinthVersion): ModFile[] {
      if (typeof version.id !== 'string' || !Array.isArray(version.files)) return []
      const file = version.files.find((candidate) => candidate.primary) ?? version.files[0]
      if (!file || typeof file.url !== 'string' || !isSafeModJarFileName(file.filename)) return []
      const dependencies = (version.dependencies ?? []).flatMap((dependency) => {
        const normalized = normalizeDependency(this.id, dependency)
        return normalized ? [normalized] : []
      })
      const referenceArtifacts = version.files.flatMap((candidate): ModReferenceArtifact[] => {
        if (candidate === file || typeof candidate.url !== 'string' || typeof candidate.filename !== 'string') return []
        const lower = candidate.filename.toLowerCase()
        const kind: ModReferenceArtifact['kind'] | null = /(?:^|[-_.])sources?(?:[-_.]|\.jar$)/.test(lower)
          ? 'sources'
          : /(?:^|[-_.])javadoc(?:[-_.]|\.jar$)/.test(lower) ? 'javadoc'
            : /(?:^|[-_.])(?:dev|development)(?:[-_.]|\.jar$)/.test(lower) ? 'development' : null
        if (!kind || !candidate.filename.toLowerCase().endsWith('.jar')) return []
        return [{ kind, filename: pathSafeFileName(candidate.filename), size: typeof candidate.size === 'number' ? candidate.size : undefined, sha1: typeof candidate.hashes?.sha1 === 'string' ? candidate.hashes.sha1 : undefined, sha512: typeof candidate.hashes?.sha512 === 'string' ? candidate.hashes.sha512 : undefined, sources: [{ id: 'modrinth-cdn', label: 'Modrinth CDN', url: candidate.url }] }]
      })
      return [{ provider: this.id, projectId, versionId: version.id, versionName: typeof version.version_number === 'string' ? version.version_number : typeof version.name === 'string' ? version.name : version.id, filename: file.filename, primary: Boolean(file.primary), side: sideFromEnvironments(version.client_side, version.server_side), size: typeof file.size === 'number' ? file.size : undefined, sha1: typeof file.hashes?.sha1 === 'string' ? file.hashes.sha1 : undefined, sha512: typeof file.hashes?.sha512 === 'string' ? file.hashes.sha512 : undefined, sources: [{ id: 'modrinth-cdn', label: 'Modrinth CDN', url: file.url }], ...(dependencies.length ? { dependencies } : {}), ...(referenceArtifacts.length ? { referenceArtifacts } : {}), ...(typeof version.date_published === 'string' ? { publishedAt: version.date_published } : {}) } satisfies ModFile]
  }

  async details(projectId: string): Promise<ModProjectDetails> {
    const value = await getJson<ModrinthProject>(`${MODRINTH_API}/project/${encodeURIComponent(safeId(projectId, 'Modrinth project ID'))}`)
    const slug = typeof value.slug === 'string' ? value.slug : projectId
    return {
      provider: this.id,
      projectId,
      slug,
      name: typeof value.title === 'string' ? value.title : slug,
      projectUrl: `https://modrinth.com/mod/${slug}`,
      ...(safeIconUrl(value.source_url) ? { sourceUrl: safeIconUrl(value.source_url) } : {}),
      ...(typeof value.license?.id === 'string' ? { license: value.license.id } : {})
    }
  }

  async identify(input: { sha1: string }, query: Pick<ModSearchQuery, 'minecraftVersion' | 'loader'>): Promise<IdentifiedModFile | null> {
    let version: ModrinthVersion
    try {
      version = await fetchJsonWithRetry<ModrinthVersion>(`${MODRINTH_API}/version_file/${encodeURIComponent(input.sha1)}?algorithm=sha1`, { headers: { 'User-Agent': 'ModMind/1.3 (mod-provider)' } })
    } catch (error) {
      if (/HTTP 404/.test(error instanceof Error ? error.message : String(error))) return null
      throw new Error(`Modrinth fingerprint request failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (!Array.isArray(version.loaders) || !version.loaders.includes(query.loader) || !Array.isArray(version.game_versions) || !version.game_versions.includes(query.minecraftVersion)) return null
    const projectId = typeof version.project_id === 'string' ? version.project_id : ''
    if (!projectId) return null
    const file = this.normalizeVersion(projectId, version)[0]
    if (!file) return null
    const details = await this.details(projectId)
    return { candidate: { provider: this.id, projectId, slug: details.slug, name: details.name, summary: '', projectUrl: details.projectUrl, clientSide: 'unknown', serverSide: 'unknown', downloads: 0, ...(details.license ? { license: details.license } : {}) }, file }
  }
}

function pathSafeFileName(value: string): string {
  const name = value.split(/[\\/]/).at(-1) ?? ''
  if (!name || name.length > 180) throw new Error('provider returned an invalid reference artifact name')
  return name
}

interface CurseForgeMod {
  id?: unknown
  slug?: unknown
  name?: unknown
  summary?: unknown
  links?: { websiteUrl?: unknown; sourceUrl?: unknown }
  downloadCount?: unknown
  logo?: { thumbnailUrl?: unknown; url?: unknown }
  clientSide?: unknown
  serverSide?: unknown
}

interface CurseForgeFile {
  id?: unknown
  displayName?: unknown
  fileName?: unknown
  downloadUrl?: unknown
  fileLength?: unknown
  hashes?: Array<{ algo?: unknown; value?: unknown }>
  gameVersions?: unknown
  modLoader?: unknown
  dependencies?: Array<{ modId?: unknown; relationType?: unknown }>
}

function curseForgeLoader(loader: JavaLoaderKind): number {
  return loader === 'forge' ? 1 : loader === 'fabric' ? 4 : loader === 'quilt' ? 5 : 6
}

function curseSide(value: unknown): ModSide {
  if (value === 0 || value === 'required') return 'both'
  if (value === 1 || value === 'optional') return 'both'
  return 'unknown'
}

function curseDependencyKind(value: unknown): ModDependencyKind | null {
  if (value === 1) return 'embedded'
  if (value === 2) return 'optional'
  if (value === 3) return 'required'
  if (value === 5) return 'incompatible'
  return null
}

export class CurseForgeProvider implements ModProvider {
  readonly id = 'curseforge' as const

  constructor(private readonly apiKey: string) {
    if (!apiKey.trim()) throw new Error('CurseForge API key is required for marketplace downloads')
  }

  private headers(): Record<string, string> { return { 'x-api-key': this.apiKey.trim() } }

  async search(query: ModSearchQuery): Promise<{ total: number; hits: ModCandidate[] }> {
    const params = new URLSearchParams({ gameId: '432', classId: '6', gameVersion: query.minecraftVersion, modLoaderType: String(curseForgeLoader(query.loader)), searchFilter: query.query.trim().slice(0, 120), pageSize: String(Math.min(Math.max(query.limit ?? 20, 1), 50)), index: String(Math.max(query.offset ?? 0, 0)), ...(query.index === 'downloads' ? { sortField: '6', sortOrder: 'desc' } : {}) })
    const payload = await getJson<{ pagination?: { totalCount?: number }; data?: CurseForgeMod[] }>(`${CURSEFORGE_API}/mods/search?${params}`, this.headers())
    const hits = (payload.data ?? []).flatMap((mod) => {
      if (typeof mod.id !== 'number' || typeof mod.slug !== 'string' || typeof mod.name !== 'string') return []
      const iconUrl = safeIconUrl(mod.logo?.thumbnailUrl) ?? safeIconUrl(mod.logo?.url)
      return [{ provider: this.id, projectId: String(mod.id), slug: mod.slug, name: mod.name.slice(0, 180), summary: typeof mod.summary === 'string' ? mod.summary.slice(0, 500) : '', projectUrl: typeof mod.links?.websiteUrl === 'string' ? mod.links.websiteUrl : `https://www.curseforge.com/minecraft/mc-mods/${mod.slug}`, clientSide: curseSide(mod.clientSide), serverSide: curseSide(mod.serverSide), downloads: typeof mod.downloadCount === 'number' ? mod.downloadCount : 0, ...(iconUrl ? { iconUrl } : {}) }]
    })
    return { total: typeof payload.pagination?.totalCount === 'number' ? payload.pagination.totalCount : hits.length, hits }
  }

  async versions(projectId: string, query: Pick<ModSearchQuery, 'minecraftVersion' | 'loader'>): Promise<ModFile[]> {
    const params = new URLSearchParams({ gameVersion: query.minecraftVersion, modLoaderType: String(curseForgeLoader(query.loader)), pageSize: '100' })
    const payload = await getJson<{ data?: CurseForgeFile[] }>(`${CURSEFORGE_API}/mods/${encodeURIComponent(safeId(projectId, 'CurseForge mod ID'))}/files?${params}`, this.headers())
    return (payload.data ?? []).flatMap((file) => this.normalizeFile(projectId, file))
  }

  private normalizeFile(projectId: string, file: CurseForgeFile): ModFile[] {
      if (typeof file.id !== 'number' || !isSafeModJarFileName(file.fileName)) return []
      const sha1Value = file.hashes?.find((hash) => hash.algo === 1 && typeof hash.value === 'string')?.value
      const sha1 = typeof sha1Value === 'string' ? sha1Value : undefined
      const downloadUrl = typeof file.downloadUrl === 'string' ? file.downloadUrl : `https://edge.forgecdn.net/files/${Math.floor(file.id / 1000)}/${file.id % 1000}/${encodeURIComponent(file.fileName)}`
      const dependencies = (file.dependencies ?? []).flatMap((dependency) => {
        if (typeof dependency.modId !== 'number') return []
        const kind = curseDependencyKind(dependency.relationType)
        return kind ? [{ provider: this.id, projectId: String(dependency.modId), kind } satisfies ModDependency] : []
      })
      return [{ provider: this.id, projectId, versionId: String(file.id), versionName: typeof file.displayName === 'string' ? file.displayName : file.fileName, filename: file.fileName, primary: true, side: 'both', size: typeof file.fileLength === 'number' ? file.fileLength : undefined, ...(sha1 ? { sha1 } : {}), sources: [{ id: 'curseforge-cdn', label: 'CurseForge CDN', url: downloadUrl }], ...(dependencies.length ? { dependencies } : {}) } satisfies ModFile]
  }

  async details(projectId: string): Promise<ModProjectDetails> {
    const payload = await getJson<{ data?: CurseForgeMod }>(`${CURSEFORGE_API}/mods/${encodeURIComponent(safeId(projectId, 'CurseForge project ID'))}`, this.headers())
    const value = payload.data
    if (!value || typeof value.id !== 'number') throw new Error('CurseForge project details are unavailable')
    const slug = typeof value.slug === 'string' ? value.slug : projectId
    return {
      provider: this.id,
      projectId,
      slug,
      name: typeof value.name === 'string' ? value.name : slug,
      projectUrl: typeof value.links?.websiteUrl === 'string' ? value.links.websiteUrl : `https://www.curseforge.com/minecraft/mc-mods/${slug}`,
      ...(safeIconUrl(value.links?.sourceUrl) ? { sourceUrl: safeIconUrl(value.links?.sourceUrl) } : {})
    }
  }

  async identify(input: { bytes: Buffer }, query: Pick<ModSearchQuery, 'minecraftVersion' | 'loader'>): Promise<IdentifiedModFile | null> {
    const fingerprint = curseForgeFingerprint(input.bytes)
    const payload = await postJsonWithRetry<{ data?: { exactMatches?: Array<{ id?: unknown; file?: CurseForgeFile }> } }>(
      `${CURSEFORGE_API}/fingerprints/432`,
      { fingerprints: [fingerprint] },
      { headers: { ...this.headers(), 'User-Agent': 'ModMind/1.3 (mod-provider)' } }
    )
    const match = payload.data?.exactMatches?.find((entry) => typeof entry.id === 'number' && entry.file)
    if (!match || typeof match.id !== 'number' || !match.file) return null
    const gameVersions = Array.isArray(match.file.gameVersions) ? match.file.gameVersions : []
    if (gameVersions.length && !gameVersions.includes(query.minecraftVersion)) return null
    const projectId = String(match.id)
    const file = this.normalizeFile(projectId, match.file)[0]
    if (!file) return null
    const details = await this.details(projectId)
    return { candidate: { provider: this.id, projectId, slug: details.slug, name: details.name, summary: '', projectUrl: details.projectUrl, clientSide: 'unknown', serverSide: 'unknown', downloads: 0 }, file }
  }
}

export function curseForgeFingerprint(bytes: Buffer): number {
  const filtered = Buffer.allocUnsafe(bytes.length)
  let length = 0
  for (const value of bytes) {
    if (value === 9 || value === 10 || value === 13 || value === 32) continue
    filtered[length] = value
    length += 1
  }
  const data = filtered.subarray(0, length)
  const m = 0x5bd1e995
  let hash = (1 ^ data.length) >>> 0
  let offset = 0
  while (offset + 4 <= data.length) {
    let value = data.readUInt32LE(offset)
    value = Math.imul(value, m) >>> 0
    value ^= value >>> 24
    value = Math.imul(value, m) >>> 0
    hash = Math.imul(hash, m) >>> 0
    hash ^= value
    offset += 4
  }
  const remaining = data.length - offset
  if (remaining === 3) hash ^= data[offset + 2] << 16
  if (remaining >= 2) hash ^= data[offset + 1] << 8
  if (remaining >= 1) { hash ^= data[offset]; hash = Math.imul(hash, m) >>> 0 }
  hash ^= hash >>> 13
  hash = Math.imul(hash, m) >>> 0
  hash ^= hash >>> 15
  return hash >>> 0
}

export interface ProviderRegistryOptions {
  curseForgeApiKey?: string
}

export class ModProviderRegistry {
  private readonly providers: ModProvider[]
  private readonly searchCache = new Map<string, { expiresAt: number; value: { provider: AutomaticModPlatform; total: number; hits: ModCandidate[]; error?: string } }>()
  private readonly versionsCache = new Map<string, { expiresAt: number; value: ModFile[] }>()

  constructor(options: ProviderRegistryOptions = {}) {
    this.providers = [new ModrinthProvider()]
    if (options.curseForgeApiKey?.trim()) this.providers.push(new CurseForgeProvider(options.curseForgeApiKey))
  }

  list(): AutomaticModPlatform[] { return this.providers.map((provider) => provider.id) }

  clearCache(): void {
    this.searchCache.clear()
    this.versionsCache.clear()
  }

  async search(query: ModSearchQuery, providers: AutomaticModPlatform[] = this.list()): Promise<{ provider: AutomaticModPlatform; total: number; hits: ModCandidate[]; error?: string }[]> {
    const now = Date.now()
    return Promise.all(this.providers.filter((provider) => providers.includes(provider.id)).map(async (provider) => {
      const key = `${provider.id}:${JSON.stringify(query)}`
      const cached = this.searchCache.get(key)
      if (cached && cached.expiresAt > now) return cached.value
      try {
        const value = { provider: provider.id, ...(await provider.search(query)) }
        this.searchCache.set(key, { expiresAt: now + 5 * 60_000, value })
        return value
      } catch (error) {
        const value = { provider: provider.id, total: 0, hits: [], error: error instanceof Error ? error.message : String(error) }
        this.searchCache.set(key, { expiresAt: now + 30_000, value })
        return value
      }
    }))
  }

  async versions(provider: AutomaticModPlatform, projectId: string, query: Pick<ModSearchQuery, 'minecraftVersion' | 'loader'>): Promise<ModFile[]> {
    const selected = this.providers.find((candidate) => candidate.id === provider)
    if (!selected) throw new Error(`mod provider ${provider} is not configured`)
    const key = `${provider}:${projectId}:${JSON.stringify(query)}`
    const cached = this.versionsCache.get(key)
    if (cached && cached.expiresAt > Date.now()) return cached.value
    const value = await selected.versions(projectId, query)
    this.versionsCache.set(key, { expiresAt: Date.now() + 5 * 60_000, value })
    return value
  }

  async details(provider: AutomaticModPlatform, projectId: string): Promise<ModProjectDetails> {
    const selected = this.providers.find((candidate) => candidate.id === provider)
    if (!selected) throw new Error(`mod provider ${provider} is not configured`)
    return selected.details(projectId)
  }

  async identify(filePath: string, hashes: { sha1: string }, query: Pick<ModSearchQuery, 'minecraftVersion' | 'loader'>): Promise<IdentifiedModFile[]> {
    const bytes = await import('node:fs/promises').then(({ readFile }) => readFile(filePath))
    const results: IdentifiedModFile[] = []
    for (const provider of this.providers) {
      if (!provider.identify) continue
      const identified = await provider.identify({ sha1: hashes.sha1, bytes }, query).catch(() => null)
      if (identified) results.push(identified)
    }
    return results
  }

  async install(file: ModFile, destination: string, signal?: AbortSignal): Promise<{ path: string; sha256: string; size: number }> {
    if (!file.sources.length) throw new Error(`provider file ${file.filename} has no download source`)
    if (!file.sha512 && !file.sha1) throw new Error(`provider file ${file.filename} has no verifiable remote hash`)
    const expected = file.sha512 ? { algorithm: 'sha512' as const, value: file.sha512 } : file.sha1 ? { algorithm: 'sha1' as const, value: file.sha1 } : undefined
    const result = await verifiedDownload.download({ sources: file.sources, destination, expectedHash: expected, maxBytes: 256 * 1024 * 1024, signal })
    const bytes = await import('node:fs/promises').then(({ readFile }) => readFile(result.destination))
    return { path: result.destination, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length }
  }

  static forProject(project: ProjectInfo, options: ProviderRegistryOptions = {}): ModProviderRegistry {
    if (!project || !project.minecraftVersion || !project.loader) throw new Error('project metadata is required for mod provider resolution')
    return new ModProviderRegistry(options)
  }
}
