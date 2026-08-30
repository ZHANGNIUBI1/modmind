import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ProjectInfo } from '../shared/types'
import { inspectProjectPreflight } from './projectPreflight'
import { createModpackTemplate } from './modpackService'

describe('project preflight inspection', () => {
  it('requires the pinned Wrapper even when Quilt descriptors are valid', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-preflight-'))
    const project: ProjectInfo = {
      name: 'Quilt', path: root, loader: 'quilt', minecraftVersion: '1.21', namespace: 'quilt_test', createdAt: ''
    }
    try {
      await fs.mkdir(path.join(root, 'src', 'main', 'resources'), { recursive: true })
      await fs.writeFile(path.join(root, 'modmind.project.json'), JSON.stringify(project), 'utf8')
      await fs.writeFile(path.join(root, 'build.gradle.kts'), "plugins { java }\n", 'utf8')
      await fs.writeFile(path.join(root, 'settings.gradle.kts'), "rootProject.name = \"quilt_test\"\n", 'utf8')
      await fs.writeFile(path.join(root, 'src', 'main', 'resources', 'quilt.mod.json'), JSON.stringify({
        schema_version: 1, quilt_loader: { id: 'quilt_test' }
      }), 'utf8')
      const result = await inspectProjectPreflight(project)
      expect(result.logs).toContain('PASS  build.gradle or build.gradle.kts')
      expect(result.success).toBe(false)
      expect(result.logs.some((line) => line.startsWith('FAIL  Gradle Wrapper'))).toBe(true)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('fails an invalid TOML mod id', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-preflight-invalid-'))
    const project: ProjectInfo = {
      name: 'Forge', path: root, loader: 'forge', minecraftVersion: '1.21.11', namespace: 'forge_test', createdAt: ''
    }
    try {
      await fs.mkdir(path.join(root, 'src', 'main', 'resources', 'META-INF'), { recursive: true })
      await fs.writeFile(path.join(root, 'modmind.project.json'), JSON.stringify(project), 'utf8')
      await fs.writeFile(path.join(root, 'build.gradle'), '', 'utf8')
      await fs.writeFile(path.join(root, 'settings.gradle'), '', 'utf8')
      await fs.writeFile(path.join(root, 'src', 'main', 'resources', 'META-INF', 'mods.toml'), 'modId="Invalid-ID"\n', 'utf8')
      expect((await inspectProjectPreflight(project)).success).toBe(false)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('uses modpack manifest checks instead of requiring a root Gradle Wrapper', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-preflight-pack-'))
    const project: ProjectInfo = {
      kind: 'modpack', name: 'Pack', path: root, loader: 'fabric', minecraftVersion: '1.21.1', namespace: 'pack_test', createdAt: ''
    }
    try {
      await fs.writeFile(path.join(root, 'modmind.project.json'), JSON.stringify(project), 'utf8')
      await createModpackTemplate(project)
      const result = await inspectProjectPreflight(project)
      expect(result.success).toBe(true)
      expect(result.logs).toContain('PASS  modmind.pack.json (0 个外部 Mod，0 个自制 Mod)')
      expect(result.logs.some((line) => line.includes('Gradle Wrapper'))).toBe(false)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
