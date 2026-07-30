import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { downloadLoaderCatalog, javaVersionForMinecraft } from './loaderCatalog'
import { descriptorPath, projectTemplateFiles } from './projectTemplates'
import { supportsProjectCreation } from './loaderCompatibility'
import type { LoaderKind, ProjectInfo } from '../shared/types'

function project(loader: LoaderKind, minecraftVersion: string, loaderVersion = 'test-loader'): ProjectInfo {
  return {
    name: 'Template Test',
    path: 'C:/template-test',
    loader,
    minecraftVersion,
    loaderVersion,
    apiVersion: loader === 'fabric' ? `test-api+${minecraftVersion}` : loader === 'quilt' ? `test-qfapi-${minecraftVersion}` : undefined,
    qslVersion: loader === 'quilt' ? `test-qsl+${minecraftVersion}` : undefined,
    javaVersion: javaVersionForMinecraft(minecraftVersion),
    namespace: 'template_test',
    createdAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('Minecraft loader templates', () => {
  it('selects Java versions across Minecraft toolchain boundaries', () => {
    expect(javaVersionForMinecraft('1.16.5')).toBe(8)
    expect(javaVersionForMinecraft('1.17.1')).toBe(16)
    expect(javaVersionForMinecraft('1.20.1')).toBe(17)
    expect(javaVersionForMinecraft('1.20.6')).toBe(21)
    expect(javaVersionForMinecraft('26.2')).toBe(25)
  })

  it('creates a Fabric Loom project with a Fabric descriptor', () => {
    const files = projectTemplateFiles(project('fabric', '1.21.1', '0.16.10'))
    expect(files['build.gradle']).toContain("id 'net.fabricmc.fabric-loom-remap' version '1.17.17'")
    expect(files['build.gradle']).toContain('fabric-api')
    expect(JSON.parse(files['src/main/resources/fabric.mod.json'])).toMatchObject({ id: 'template_test' })
  })

  it('omits Fabric API cleanly when upstream has no matching release', () => {
    const files = projectTemplateFiles({ ...project('fabric', '1.21.11', '0.19.3'), apiVersion: undefined })
    expect(files['build.gradle']).not.toContain('fabric-api:')
    expect(files['gradle.properties']).not.toContain('fabric_api_version')
    expect(JSON.parse(files['src/main/resources/fabric.mod.json']).depends['fabric-api']).toBeUndefined()
  })

  it('creates a Quilt Loom project with a Quilt descriptor and runtime API', () => {
    const files = projectTemplateFiles(project('quilt', '1.20.1', '0.27.1'))
    expect(files['build.gradle']).toContain("id 'org.quiltmc.loom' version '1.7.4'")
    expect(files['build.gradle']).toContain('quilted-fabric-api')
    expect(files['build.gradle']).toContain('org.quiltmc:qsl')
    expect(JSON.parse(files['src/main/resources/quilt.mod.json']).quilt_loader).toMatchObject({ id: 'template_test' })
    expect(files['src/main/java/dev/modmind/template_test/ModMindEntry.java']).toContain('org.quiltmc.qsl.base.api.entrypoint.ModInitializer')
  })

  it('creates a modern Forge descriptor and rejects unsupported legacy creation', () => {
    const modern = projectTemplateFiles(project('forge', '1.20.1', '1.20.1-47.4.0'))
    expect(modern['build.gradle']).toContain("id 'net.minecraftforge.gradle'")
    expect(modern['build.gradle']).toContain('gameTestServer')
    expect(modern['build.gradle']).toContain("args '--nogui'")
    expect(modern['src/main/resources/META-INF/mods.toml']).toContain('modId="template_test"')

    expect(descriptorPath('forge', '1.12.2')).toBe('src/main/resources/mcmod.info')
    expect(() => projectTemplateFiles(project('forge', '1.12.2', '1.12.2-14.23.5.2860'))).toThrow(/not supported/)
  })

  it('creates a modern NeoForge ModDevGradle project', () => {
    const files = projectTemplateFiles(project('neoforge', '1.21.1', '21.1.244'))
    expect(files['build.gradle']).toContain("id 'net.neoforged.moddev'")
    expect(files['build.gradle']).toContain("type = 'gameTestServer'")
    expect(files['build.gradle']).toContain("programArgument '--nogui'")
    expect(files['src/main/resources/META-INF/neoforge.mods.toml']).toContain('modId="template_test"')
    expect(files['src/main/java/dev/modmind/template_test/ModMindEntry.java']).toContain('net.neoforged.fml.common.Mod')
  })

  it('pins a checksummed Wrapper and safely handles starter-free and quoted projects', () => {
    const quoted = { ...project('fabric', '1.21.11', '0.19.3'), name: `Builder's "Choice"` }
    const files = projectTemplateFiles(quoted)
    expect(files['gradle/wrapper/gradle-wrapper.properties']).toContain('gradle-9.5.1-bin.zip')
    expect(files['gradle/wrapper/gradle-wrapper.properties']).toMatch(/distributionSha256Sum=[a-f0-9]{64}/)
    expect(files['src/main/java/dev/modmind/template_test/ModMindEntry.java']).toContain(`Builder's \\"Choice\\"`)
    expect(JSON.parse(files['modmind.project.json'])).toMatchObject({ projectVersion: '1.1.3' })

    const withoutStarter = projectTemplateFiles(project('fabric', '1.21.11', '0.19.3'), false)
    expect(Object.keys(withoutStarter).some((relative) => relative.endsWith('ModMindEntry.java'))).toBe(false)
    expect(JSON.parse(withoutStarter['src/main/resources/fabric.mod.json']).entrypoints).toBeUndefined()
  })

  it.runIf(process.env.MODMIND_LIVE_CATALOG === '1')('loads all four loader catalogs from upstream metadata', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-loader-catalog-'))
    try {
      const options = await downloadLoaderCatalog()
      for (const loader of ['fabric', 'quilt', 'forge', 'neoforge'] as const) {
        const entries = options.filter((option) => option.loader === loader)
        expect(entries.length).toBeGreaterThan(0)
        expect(entries.every((option) => supportsProjectCreation(loader, option.minecraftVersion))).toBe(true)
      }
      expect(options.some((option) => option.loader === 'neoforge' && option.minecraftVersion === '1.0')).toBe(false)
      expect(options.some((option) => option.loader === 'forge' && option.minecraftVersion === '1.12.2')).toBe(false)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 120_000)
})
