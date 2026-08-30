import type { JavaLoaderKind } from '../shared/types'

export interface ExistingProjectTextFile {
  path: string
  content: string
}

export function extractMinecraftVersion(value: string): string | null {
  // Loader/plugin versions contain many `x.y` values. Minecraft versions are
  // explicitly prefixed with `1.` in Java mod Gradle metadata.
  return value.match(/\b1\.\d{1,2}(?:\.\d{1,2})?\b/)?.[0] ?? null
}

export function parseGradleProperties(content: string): Record<string, string> {
  return Object.fromEntries(content.split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Za-z_][\w.-]*)\s*=\s*(.*?)\s*(?:#.*)?$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => [match[1], match[2]]))
}

function cleanVersion(value: string | undefined): string | undefined {
  return value && value.length <= 120 && /^[0-9A-Za-z][0-9A-Za-z.+_:-]*$/.test(value) ? value : undefined
}

export function inferGradleLoader(contents: ExistingProjectTextFile[], descriptor?: string): { loader: JavaLoaderKind; loaderVersion?: string } {
  const properties = contents.find((entry) => /(?:^|\/)gradle\.properties$/i.test(entry.path))
  const values = properties ? parseGradleProperties(properties.content) : {}
  if (descriptor && /neoforge\.mods\.toml$/i.test(descriptor)) return { loader: 'neoforge', loaderVersion: cleanVersion(values.neoforge_version ?? values.neo_version) }
  const joined = contents.map((entry) => entry.content).join('\n')
  // AutoForge's 1.20.1 template uses ModDevGradle's legacyForge bridge. The
  // plugin lives under net.neoforged, but the produced project is Forge.
  if (/net\.neoforged\.moddev\.legacyforge|\blegacyForge\s*\{/i.test(joined) || /(?:^|\n)\s*forge_version\s*=/i.test(joined)) {
    return { loader: 'forge', loaderVersion: cleanVersion(values.forge_version) }
  }
  if (/net\.neoforged\.moddev|(?:^|\n)\s*(?:neo(?:forge)?_version)\s*=/i.test(joined)) {
    return { loader: 'neoforge', loaderVersion: cleanVersion(values.neoforge_version ?? values.neo_version) }
  }
  if (descriptor && /(?:^|\/)mods\.toml$/i.test(descriptor)) return { loader: 'forge', loaderVersion: cleanVersion(values.forge_version) }
  if (/net\.minecraftforge|forgegradle|\bforge_version\b/i.test(joined)) return { loader: 'forge' }
  if (/quilt\.mod\.json|org\.quiltmc/i.test(joined)) return { loader: 'quilt' }
  if (/fabric\.mod\.json|fabric-loom|net\.fabricmc/i.test(joined)) return { loader: 'fabric' }
  return { loader: 'fabric' }
}
