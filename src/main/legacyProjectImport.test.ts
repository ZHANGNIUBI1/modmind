import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { convertLegacyModtoolProject, readLegacyModtoolProject } from './legacyProjectImport'

describe('legacy .modtool import compatibility', () => {
  it('converts the old manifest and data directory into .modmind', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-legacy-import-'))
    try {
      await fs.mkdir(path.join(root, '.modtool'), {recursive: true})
      await fs.writeFile(path.join(root, '.modtool', 'active-ai-task.json'), '{}', 'utf8')
      await fs.writeFile(path.join(root, 'modtool.project.json'), JSON.stringify({
        name: 'Legacy', path: root, loader: 'fabric', minecraftVersion: '1.21.1', namespace: 'legacy', createdAt: new Date().toISOString()
      }), 'utf8')
      const result = await convertLegacyModtoolProject(root)
      expect(result.converted).toBe(true)
      expect(result.project?.toolDataDirectory).toBe('.modmind')
      await expect(fs.stat(path.join(root, '.modtool'))).rejects.toThrow()
      await expect(fs.stat(path.join(root, '.modmind', 'active-ai-task.json'))).resolves.toBeTruthy()
      await expect(fs.stat(path.join(root, 'modtool.project.json'))).rejects.toThrow()
      await expect(fs.readFile(path.join(root, 'modmind.project.json'), 'utf8')).resolves.toContain('"toolDataDirectory": ".modmind"')
      await expect(fs.stat(result.reportPath!)).resolves.toBeTruthy()
    } finally {
      await fs.rm(root, {recursive: true, force: true})
    }
  })

  it('previews legacy metadata without converting it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-legacy-preview-'))
    try {
      await fs.writeFile(path.join(root, 'modtool.project.json'), JSON.stringify({
        name: 'Preview', path: 'stale-path', loader: 'fabric', minecraftVersion: '1.21.1', namespace: 'preview', createdAt: '2025-01-01T00:00:00.000Z'
      }), 'utf8')
      const project = await readLegacyModtoolProject(root)
      expect(project).toMatchObject({name: 'Preview', path: root, toolDataDirectory: '.modmind'})
      await expect(fs.stat(path.join(root, 'modmind.project.json'))).rejects.toThrow()
    } finally {
      await fs.rm(root, {recursive: true, force: true})
    }
  })

  it('finishes an interrupted conversion when both matching manifests remain', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-legacy-resume-'))
    try {
      const project = {
        name: 'Resume', path: root, loader: 'fabric', minecraftVersion: '1.21.1', namespace: 'resume', createdAt: '2025-01-01T00:00:00.000Z'
      }
      await fs.mkdir(path.join(root, '.modmind'), {recursive: true})
      await fs.writeFile(path.join(root, 'modtool.project.json'), JSON.stringify(project), 'utf8')
      await fs.writeFile(path.join(root, 'modmind.project.json'), JSON.stringify({...project, toolDataDirectory: '.modmind'}), 'utf8')
      const result = await convertLegacyModtoolProject(root)
      expect(result.converted).toBe(true)
      await expect(fs.stat(path.join(root, 'modtool.project.json'))).rejects.toThrow()
      await expect(fs.stat(path.join(root, 'modmind.project.json'))).resolves.toBeTruthy()
    } finally {
      await fs.rm(root, {recursive: true, force: true})
    }
  })

  it('does not move legacy data when the manifests conflict', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-legacy-conflict-'))
    try {
      const legacy = {name: 'Legacy', path: root, loader: 'fabric', minecraftVersion: '1.21.1', namespace: 'legacy', createdAt: '2025-01-01T00:00:00.000Z'}
      await fs.mkdir(path.join(root, '.modtool'), {recursive: true})
      await fs.writeFile(path.join(root, '.modtool', 'checkpoint.json'), '{}', 'utf8')
      await fs.writeFile(path.join(root, 'modtool.project.json'), JSON.stringify(legacy), 'utf8')
      await fs.writeFile(path.join(root, 'modmind.project.json'), JSON.stringify({...legacy, namespace: 'different'}), 'utf8')
      await expect(convertLegacyModtoolProject(root)).rejects.toThrow(/different projects/)
      await expect(fs.stat(path.join(root, '.modtool', 'checkpoint.json'))).resolves.toBeTruthy()
      await expect(fs.stat(path.join(root, '.modmind'))).rejects.toThrow()
    } finally {
      await fs.rm(root, {recursive: true, force: true})
    }
  })
})
