import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { downloadLoaderCatalog, javaVersionForMinecraft } from './loaderCatalog'
import { descriptorPath, projectTemplateFiles } from './projectTemplates'
import type { LoaderKind, ProjectInfo } from '../shared/types'

function project(loader: LoaderKind, minecraftVersion: string, loaderVersion = 'test-loader'): ProjectInfo {
  return {
    name: 'Template Test',
    path: 'C:/template-test',
    loader,
    minecraftVersion,
    loaderVersion,
    apiVersion: loader === 'fabric' ? `test-api+${minecraftVersion}` : loader === 'quilt' ? `test-qfapi-${minecraftVersion}` : undefined,
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
    expect(javaVersionForMinecraft('26.2')).toBe(21)
  })

  it('creates a Fabric Loom project with a Fabric descriptor', () => {
    const files = projectTemplateFiles(project('fabric', '1.21.1', '0.16.10'))
    expect(files['build.gradle']).toContain("id 'fabric-loom'")
    expect(files['build.gradle']).toContain('fabric-api')
    expect(JSON.parse(files['src/main/resources/fabric.mod.json'])).toMatchObject({ id: 'template_test' })
  })

  it('creates a Quilt Loom project with a Quilt descriptor and runtime API', () => {
    const files = projectTemplateFiles(project('quilt', '1.20.1', '0.27.1'))
    expect(files['build.gradle']).toContain("id 'org.quiltmc.loom' version '1.4.1'")
    expect(files['build.gradle']).toContain('quilted-fabric-api')
    expect(JSON.parse(files['src/main/resources/quilt.mod.json']).quilt_loader).toMatchObject({ id: 'template_test' })
    expect(files['src/main/java/dev/modmind/template_test/ModMindEntry.java']).toContain('org.quiltmc.qsl.base.api.entrypoint.ModInitializer')
  })

  it('creates modern and legacy Forge descriptors', () => {
    const modern = projectTemplateFiles(project('forge', '1.20.1', '1.20.1-47.4.0'))
    expect(modern['build.gradle']).toContain("id 'net.minecraftforge.gradle'")
    expect(modern['build.gradle']).toContain('gameTestServer')
    expect(modern['build.gradle']).toContain("args '--nogui'")
    expect(modern['src/main/resources/META-INF/mods.toml']).toContain('modId="template_test"')

    const legacy = projectTemplateFiles(project('forge', '1.12.2', '1.12.2-14.23.5.2860'))
    expect(descriptorPath('forge', '1.12.2')).toBe('src/main/resources/mcmod.info')
    expect(JSON.parse(legacy['src/main/resources/mcmod.info'])[0]).toMatchObject({ modid: 'template_test' })
  })

  it('creates a modern NeoForge ModDevGradle project', () => {
    const files = projectTemplateFiles(project('neoforge', '1.21.1', '21.1.244'))
    expect(files['build.gradle']).toContain("id 'net.neoforged.moddev'")
    expect(files['build.gradle']).toContain("type = 'gameTestServer'")
    expect(files['build.gradle']).toContain("programArgument '--nogui'")
    expect(files['src/main/resources/META-INF/neoforge.mods.toml']).toContain('modId="template_test"')
    expect(files['src/main/java/dev/modmind/template_test/ModMindEntry.java']).toContain('net.neoforged.fml.common.Mod')
  })

  it.runIf(process.env.MODMIND_LIVE_CATALOG === '1')('loads all four loader catalogs from upstream metadata', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-loader-catalog-'))
    try {
      const options = await downloadLoaderCatalog()
      expect(options.filter((option) => option.loader === 'fabric').length).toBeGreaterThan(20)
      expect(options.filter((option) => option.loader === 'quilt').length).toBeGreaterThan(0)
      expect(options.filter((option) => option.loader === 'forge').length).toBeGreaterThan(40)
      expect(options.filter((option) => option.loader === 'neoforge').length).toBeGreaterThan(10)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 120_000)
})
