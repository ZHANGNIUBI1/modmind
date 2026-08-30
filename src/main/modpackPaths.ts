import path from 'node:path'
import type { ModpackImportSource, ModpackManifest, ProjectInfo } from '../shared/types'

type SourceLayout = Pick<ModpackImportSource, 'layout'> | Pick<ModpackManifest, 'source'> | undefined

function layoutOf(source: SourceLayout): ModpackImportSource['layout'] | undefined {
  return source && 'layout' in source ? source.layout : source?.source?.layout
}

/** Returns the directory that owns managed third-party JARs for this pack. */
export function modpackModsRoot(project: ProjectInfo, source?: SourceLayout): string {
  return layoutOf(source) === 'archive'
    ? path.join(project.path, 'overrides', 'mods')
    : path.join(project.path, 'mods')
}

/** Returns the directory that contains files copied into a Minecraft instance. */
export function modpackOverridesRoot(project: ProjectInfo, source?: SourceLayout): string {
  return layoutOf(source) === 'instance'
    ? project.path
    : path.join(project.path, 'overrides')
}

/** Archive and instance layouts keep JARs in the override tree, but sync them separately. */
export function excludesModsFromOverrides(source?: SourceLayout): boolean {
  const layout = layoutOf(source)
  return layout === 'instance' || layout === 'archive'
}
