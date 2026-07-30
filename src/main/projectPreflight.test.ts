import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ProjectInfo } from '../shared/types'
import { inspectProjectPreflight } from './projectPreflight'

describe('project preflight inspection', () => {
  it('accepts Quilt descriptors and Kotlin Gradle DSL without a Wrapper', async () => {
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
      expect(result.success).toBe(true)
      expect(result.logs).toContain('PASS  build.gradle or build.gradle.kts')
      expect(result.logs.some((line) => line.startsWith('INFO  Gradle Wrapper'))).toBe(true)
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
})
