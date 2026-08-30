import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import extractZip from 'extract-zip'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProjectInfo } from '../shared/types'
import { addModpackFiles, addModpackModule, adoptExternalModpack, createModpackTemplate, createModrinthPackArchive, readModpackManifest, removeModpackFile, syncModpackOverrides, updateModpackModuleSide } from './modpackService'
import { createEmptyModpackLock, writeModpackLock } from './modpackLockService'

const roots: string[] = []

function project(root: string): ProjectInfo {
  return {
    kind: 'modpack',
    name: 'Pack Test',
    path: root,
    loader: 'fabric',
    minecraftVersion: '1.21.1',
    namespace: 'pack_test',
    createdAt: '2026-08-11T00:00:00.000Z'
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('modpack manifests', () => {
  it('locks imported JARs and tracks editable local modules', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-pack-'))
    roots.push(root)
    const source = path.join(root, 'example.jar')
    const bytes = Buffer.alloc(2_048, 7)
    await fs.writeFile(source, bytes)
    const info = project(path.join(root, 'pack'))
    await fs.mkdir(info.path)
    await createModpackTemplate(info)

    const imported = await addModpackFiles(info, [source])
    expect(imported.mods).toEqual([expect.objectContaining({
      fileName: 'example.jar', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')
    })])
    await expect(fs.readFile(path.join(info.path, 'mods', 'example.jar'))).resolves.toEqual(bytes)

    const withModule = await addModpackModule(info, {
      name: 'Core', namespace: 'core', path: 'modules/core', createdAt: '2026-08-11T00:00:00.000Z'
    })
    expect(withModule.modules).toEqual([expect.objectContaining({ namespace: 'core', side: 'both' })])

    const clientOnly = await updateModpackModuleSide(info, 'core', 'client')
    expect(clientOnly.modules).toEqual([expect.objectContaining({ namespace: 'core', side: 'client' })])
    await expect(readModpackManifest(info)).resolves.toMatchObject({ modules: [{ namespace: 'core', side: 'client' }] })

    const removed = await removeModpackFile(info, 'example.jar')
    expect(removed.mods).toEqual([])
    await expect(fs.stat(path.join(info.path, 'mods', 'example.jar'))).rejects.toThrow()
    await expect(readModpackManifest(info)).resolves.toMatchObject({ modules: [{ namespace: 'core' }] })
  })

  it('exports managed mods, built local modules, and overrides in a Modrinth archive', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-pack-export-'))
    roots.push(root)
    const source = path.join(root, 'example.jar')
    await fs.writeFile(source, Buffer.alloc(2_048, 5))
    const info = project(path.join(root, 'pack'))
    await fs.mkdir(info.path)
    await createModpackTemplate(info)
    await addModpackFiles(info, [source])
    await addModpackModule(info, { name: 'Core', namespace: 'core', path: 'modules/core', createdAt: '2026-08-11T00:00:00.000Z' })
    await fs.mkdir(path.join(info.path, 'modules', 'core', 'build', 'libs'), { recursive: true })
    await fs.writeFile(path.join(info.path, 'modules', 'core', 'build', 'libs', 'core-1.0.0.jar'), Buffer.alloc(2_048, 9))
    await fs.writeFile(path.join(info.path, 'overrides', 'config', 'example.json'), '{"enabled":true}\n', 'utf8')
    await fs.mkdir(path.join(info.path, 'overrides', 'modmind-images'), { recursive: true })
    await fs.writeFile(path.join(info.path, 'overrides', 'modmind-images', 'generated.png'), Buffer.alloc(16, 4))

    const archive = await createModrinthPackArchive(info)
    const content = archive.toString('utf8')
    expect(content).toContain('modrinth.index.json')
    expect(content).toContain('overrides/mods/example.jar')
    expect(content).toContain('overrides/mods/modmind-local-core.jar')
    expect(content).toContain('overrides/config/example.json')
    expect(content).toContain('overrides/modmind-images/generated.png')
  })

  it('emits locked Mod downloads as standard Modrinth file records', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-pack-remote-export-'))
    roots.push(root)
    const source = path.join(root, 'remote.jar')
    const bytes = Buffer.alloc(2_048, 8)
    await fs.writeFile(source, bytes)
    const info = project(path.join(root, 'pack'))
    await fs.mkdir(info.path)
    await createModpackTemplate(info)
    await addModpackFiles(info, [source])
    await writeModpackLock(info, {
      ...createEmptyModpackLock(info),
      mods: [{ provider: 'modrinth', projectId: 'remote', versionId: '1', versionName: '1.0.0', fileName: 'remote.jar', sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, side: 'both', sources: ['https://cdn.example.test/remote.jar'], installedAt: '2026-08-16T00:00:00.000Z' }]
    })

    const archive = await createModrinthPackArchive(info, { version: '1.2.3', summary: 'Remote delivery test' })
    const archivePath = path.join(root, 'pack.mrpack')
    const extracted = path.join(root, 'extracted')
    await fs.writeFile(archivePath, archive)
    await extractZip(archivePath, { dir: extracted })
    const index = JSON.parse(await fs.readFile(path.join(extracted, 'modrinth.index.json'), 'utf8')) as { versionId: string; summary: string; files: Array<{ path: string; downloads: string[]; hashes: Record<string, string> }> }

    expect(index.versionId).toBe('1.2.3')
    expect(index.summary).toBe('Remote delivery test')
    expect(index.files).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'mods/remote.jar', downloads: ['https://cdn.example.test/remote.jar'], hashes: expect.objectContaining({ sha1: expect.any(String), sha512: expect.any(String) }) })]))
    await expect(fs.access(path.join(extracted, 'overrides', 'mods', 'remote.jar'))).rejects.toThrow()
  })

  it('syncs adopted instance layout files without copying the source mods twice', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-pack-instance-'))
    roots.push(root)
    const info = project(path.join(root, 'pack'))
    await fs.mkdir(info.path, { recursive: true })
    await fs.mkdir(path.join(info.path, 'mods'), { recursive: true })
    await fs.writeFile(path.join(info.path, 'mods', 'existing.jar'), Buffer.alloc(2_048, 3))
    await fs.mkdir(path.join(info.path, 'kubejs', 'server_scripts'), { recursive: true })
    await fs.writeFile(path.join(info.path, 'kubejs', 'server_scripts', 'main.js'), 'ServerEvents.recipes(() => {})\n', 'utf8')
    const adopted = await adoptExternalModpack(info, { format: 'instance', layout: 'instance', importedAt: '2026-08-11T00:00:00.000Z' })
    expect(adopted.source).toMatchObject({ format: 'instance', layout: 'instance' })

    const runtime = path.join(root, 'runtime')
    const copied = await syncModpackOverrides(info, runtime)
    expect(copied).toContain('kubejs/server_scripts/main.js')
    await expect(fs.stat(path.join(runtime, 'kubejs', 'server_scripts', 'main.js'))).resolves.toBeTruthy()
    await expect(fs.stat(path.join(runtime, 'mods', 'existing.jar'))).rejects.toThrow()
  })

  it('keeps Modrinth archive mods, overrides, and exports in their archive roots', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-pack-archive-layout-'))
    roots.push(root)
    const info = project(path.join(root, 'pack'))
    const bytes = Buffer.alloc(2_048, 3)
    await fs.mkdir(path.join(info.path, 'overrides', 'mods'), { recursive: true })
    await fs.mkdir(path.join(info.path, 'overrides', 'config'), { recursive: true })
    await fs.writeFile(path.join(info.path, 'overrides', 'mods', 'archive.jar'), bytes)
    await fs.writeFile(path.join(info.path, 'overrides', 'config', 'author.toml'), 'enabled=true\n', 'utf8')

    const adopted = await adoptExternalModpack(info, { format: 'modrinth', layout: 'archive', importedAt: '2026-08-16T00:00:00.000Z' })
    expect(adopted.mods).toEqual([expect.objectContaining({ fileName: 'archive.jar', size: bytes.length })])

    const runtime = path.join(root, 'runtime')
    const copied = await syncModpackOverrides(info, runtime)
    expect(copied).toContain('config/author.toml')
    expect(copied).not.toContain('mods/archive.jar')
    await expect(fs.readFile(path.join(runtime, 'config', 'author.toml'), 'utf8')).resolves.toContain('enabled')

    const archive = await createModrinthPackArchive(info)
    const archivePath = path.join(root, 'archive.mrpack')
    const extracted = path.join(root, 'archive')
    await fs.writeFile(archivePath, archive)
    await extractZip(archivePath, { dir: extracted })
    await expect(fs.readFile(path.join(extracted, 'overrides', 'mods', 'archive.jar'))).resolves.toEqual(bytes)
    await expect(fs.readFile(path.join(extracted, 'overrides', 'config', 'author.toml'), 'utf8')).resolves.toContain('enabled')
  })

  it('does not replace a malformed manifest with an empty manifest', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-pack-corrupt-'))
    roots.push(root)
    const info = project(root)
    const corrupt = '{"version": 1, "mods": "not-an-array"}\n'
    await fs.writeFile(path.join(root, 'modmind.pack.json'), corrupt, 'utf8')

    await expect(readModpackManifest(info)).rejects.toThrow(/格式无效/)
    await expect(addModpackFiles(info, [path.join(root, 'missing.jar')])).rejects.toThrow(/格式无效/)
    await expect(fs.readFile(path.join(root, 'modmind.pack.json'), 'utf8')).resolves.toBe(corrupt)
  })

  it('refuses to export when a manifest-tracked Mod is missing', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-pack-missing-export-'))
    roots.push(root)
    const source = path.join(root, 'example.jar')
    await fs.writeFile(source, Buffer.alloc(2_048, 5))
    const info = project(path.join(root, 'pack'))
    await fs.mkdir(info.path)
    await createModpackTemplate(info)
    await addModpackFiles(info, [source])
    await fs.rm(path.join(info.path, 'mods', 'example.jar'))

    await expect(createModrinthPackArchive(info)).rejects.toThrow(/无法读取/)
  })
})
