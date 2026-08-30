import { describe, expect, it } from 'vitest'
import { extractMinecraftVersion, inferGradleLoader } from './existingProjectMetadata'

describe('existing project metadata inference', () => {
  it('treats ModDevGradle legacyForge as Forge', () => {
    const result = inferGradleLoader([
      { path: 'gradle.properties', content: 'minecraft_version=1.20.1\nforge_version=47.4.10\n' },
      { path: 'build.gradle', content: "id 'net.neoforged.moddev.legacyforge' version '2.0.91'\nlegacyForge { }" },
      { path: 'src/main/templates/META-INF/mods.toml', content: 'modLoader="javafml"' }
    ], 'src/main/templates/META-INF/mods.toml')
    expect(result).toEqual({ loader: 'forge', loaderVersion: '47.4.10' })
  })

  it('does not mistake a loader version for a Minecraft version', () => {
    expect(extractMinecraftVersion('forge 47.4.10, Minecraft 1.20.1')).toBe('1.20.1')
    expect(extractMinecraftVersion('NeoForge 5.0')).toBeNull()
  })

  it('keeps NeoForge transition projects on NeoForge when they still use mods.toml', () => {
    expect(inferGradleLoader([
      { path: 'build.gradle', content: "id 'net.neoforged.moddev' version '1.0.21'" },
      { path: 'src/main/resources/META-INF/mods.toml', content: 'modLoader="javafml"' }
    ], 'src/main/resources/META-INF/mods.toml').loader).toBe('neoforge')
  })
})
