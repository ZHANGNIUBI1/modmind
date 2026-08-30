export const BMCLAPI_BASE_URL = 'https://bmclapi2.bangbang93.com'

export interface MinecraftVersionManifestSource {
  id: string
  label: string
  url: string
}

export const MINECRAFT_VERSION_MANIFEST_SOURCES = [
  {
    id: 'bmclapi',
    label: 'BMCLAPI',
    url: `${BMCLAPI_BASE_URL}/mc/game/version_manifest.json`
  },
  {
    id: 'mojang-piston',
    label: 'Mojang',
    url: 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
  },
  {
    id: 'mojang-legacy',
    label: 'Mojang legacy',
    url: 'https://launchermeta.mojang.com/mc/game/version_manifest.json'
  }
] as const satisfies readonly MinecraftVersionManifestSource[]

export interface MinecraftVersionManifestFailure {
  source: MinecraftVersionManifestSource
  message: string
}

interface MinecraftVersionLike {
  id: string
}

interface MinecraftVersionListLike<T extends MinecraftVersionLike> {
  versions?: readonly T[]
}

interface ResolveMinecraftVersionOptions {
  onFailure?: (failure: MinecraftVersionManifestFailure) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function resolveMinecraftVersionFromManifests<T extends MinecraftVersionLike>(
  versionId: string,
  load: (source: MinecraftVersionManifestSource) => Promise<MinecraftVersionListLike<T>>,
  options: ResolveMinecraftVersionOptions = {}
): Promise<{
  version: T
  source: MinecraftVersionManifestSource
  failures: MinecraftVersionManifestFailure[]
}> {
  const failures: MinecraftVersionManifestFailure[] = []

  for (const source of MINECRAFT_VERSION_MANIFEST_SOURCES) {
    try {
      const manifest = await load(source)
      const version = manifest.versions?.find((candidate) => candidate.id === versionId)
      if (!version) throw new Error(`version ${versionId} is missing from the manifest`)
      return { version, source, failures }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      const failure = { source, message: errorMessage(error) }
      failures.push(failure)
      options.onFailure?.(failure)
    }
  }

  const detail = failures.map(({ source, message }) => `${source.label}: ${message}`).join('; ')
  throw new Error(`无法获取 Minecraft ${versionId} 版本信息${detail ? `：${detail}` : ''}`)
}
