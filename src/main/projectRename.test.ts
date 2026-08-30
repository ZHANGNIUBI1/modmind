import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { renameProjectFiles } from './projectRename'
import type { ProjectInfo } from '../shared/types'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('project rename', () => {
  it('moves namespace directories and updates text references without touching tool state', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-project-rename-'))
    roots.push(root)
    await fs.mkdir(path.join(root, 'src', 'main', 'resources', 'assets', 'old_mod'), { recursive: true })
    await fs.mkdir(path.join(root, '.modmind'), { recursive: true })
    await fs.writeFile(path.join(root, 'src', 'main', 'resources', 'assets', 'old_mod', 'models.json'), '{"id":"old_mod:widget","name":"Old Mod"}\n', 'utf8')
    await fs.writeFile(path.join(root, 'README.md'), '# Old Mod\nold_mod\n', 'utf8')
    await fs.writeFile(path.join(root, '.modmind', 'active-ai-task.json'), '{"namespace":"old_mod"}\n', 'utf8')

    const project: ProjectInfo = { name: 'Old Mod', path: root, loader: 'fabric', minecraftVersion: '1.21.1', namespace: 'old_mod', createdAt: '' }
    const next: ProjectInfo = { ...project, name: 'New Mod', namespace: 'new_mod' }
    await expect(renameProjectFiles(project, next)).resolves.toMatchObject({ changedFiles: expect.arrayContaining(['README.md', 'src/main/resources/assets/new_mod/models.json']) })

    await expect(fs.readFile(path.join(root, 'src', 'main', 'resources', 'assets', 'new_mod', 'models.json'), 'utf8')).resolves.toContain('new_mod:widget')
    await expect(fs.readFile(path.join(root, 'README.md'), 'utf8')).resolves.toBe('# New Mod\nnew_mod\n')
    await expect(fs.readFile(path.join(root, '.modmind', 'active-ai-task.json'), 'utf8')).resolves.toContain('old_mod')
    await expect(fs.stat(path.join(root, 'src', 'main', 'resources', 'assets', 'old_mod'))).rejects.toThrow()
  })
})
