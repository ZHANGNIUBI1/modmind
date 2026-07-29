import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ReleaseService, type ReleaseSecrets } from './releaseService'
import type { ProjectInfo } from '../shared/types'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('release preflight and publishing guard', () => {
  it('finds a release artifact and never publishes without explicit confirmation', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-release-'))
    roots.push(root)
    const project: ProjectInfo = { name: 'Release Test', path: root, loader: 'fabric', minecraftVersion: '1.21.1', namespace: 'release_test', createdAt: '' }
    let secrets: ReleaseSecrets = { modrinthToken: '', curseForgeToken: '', githubToken: '' }
    const service = new ReleaseService(() => project, async () => secrets, async (next) => { secrets = next })
    await fs.mkdir(path.join(root, 'build', 'libs'), { recursive: true })
    await fs.mkdir(path.join(root, 'src', 'main', 'resources'), { recursive: true })
    await fs.writeFile(path.join(root, 'build', 'libs', 'release-test-1.0.0.jar'), Buffer.alloc(2_048, 1))
    await fs.writeFile(path.join(root, 'src', 'main', 'resources', 'fabric.mod.json'), '{}', 'utf8')
    await fs.writeFile(path.join(root, 'LICENSE'), 'MIT', 'utf8')
    await service.saveSettings({
      version: '1.0.0', displayName: 'Release Test 1.0.0', changelog: 'Initial release', channel: 'release',
      modrinthProjectId: '', curseForgeProjectId: '', githubRepository: ''
    })

    await expect(service.preflight()).resolves.toMatchObject({ ready: true, artifactSize: 2_048 })
    await expect(service.publish({ targets: ['github'], confirmed: false })).rejects.toThrow(/明确确认/)
  })

  it('keeps encrypted token values when the settings form submits an empty token', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-release-'))
    roots.push(root)
    const project: ProjectInfo = { name: 'Release Test', path: root, loader: 'fabric', minecraftVersion: '1.21.1', namespace: 'release_test', createdAt: '' }
    let secrets: ReleaseSecrets = { modrinthToken: 'stored-token', curseForgeToken: '', githubToken: '' }
    const service = new ReleaseService(() => project, async () => secrets, async (next) => { secrets = next })
    const saved = await service.saveSettings({
      version: '1.0.0', displayName: 'Release Test', changelog: '', channel: 'release',
      modrinthProjectId: 'project', curseForgeProjectId: '', githubRepository: '', modrinthToken: ''
    })
    expect(secrets.modrinthToken).toBe('stored-token')
    expect(saved).toMatchObject({ hasModrinthToken: true })
    expect(saved.modrinthToken).toBeUndefined()
  })
})
