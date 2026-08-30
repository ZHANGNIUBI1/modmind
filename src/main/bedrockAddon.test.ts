import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import path from 'node:path'
import { bedrockTemplateFiles, neteaseTemplateFiles } from './addonTemplates'
import { buildBedrockAddon, buildNeteaseArchive, inspectBedrockAddon, inspectNeteaseProject } from './bedrockAddon'
import type { LoaderKind, ProjectInfo } from '../shared/types'

const execFileAsync = promisify(execFile)

function project(loader: LoaderKind, minecraftVersion: string): ProjectInfo {
  return {
    name: 'Addon Test', path: '', loader, minecraftVersion, loaderVersion: loader === 'bedrock' ? '2.9.0' : '3.8',
    apiVersion: loader === 'bedrock' ? '2.9.0' : undefined, namespace: `addon_test_${loader.replaceAll('-', '_')}`,
    createdAt: '2026-01-01T00:00:00.000Z'
  }
}

async function writeTemplate(root: string, files: Record<string, string>): Promise<void> {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, ...relative.split('/'))
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content, 'utf8')
  }
}

describe('Bedrock and NetEase addon templates', () => {
  it('creates and packages a complete international Bedrock dual-pack template', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-bedrock-'))
    try {
      const info = { ...project('bedrock', '1.26.30'), path: root }
      await writeTemplate(root, bedrockTemplateFiles(info, true))
      const inspection = await inspectBedrockAddon(info)
      expect(inspection.success).toBe(true)
      expect(inspection.logs.join('\n')).toContain('pack and module UUIDs are unique')
      const artifact = await buildBedrockAddon(info)
      expect((await fs.stat(artifact)).size).toBeGreaterThan(100)
      const standalone = await execFileAsync(process.execPath, ['tools/build-addon.mjs'], { cwd: root })
      expect(standalone.stdout).toContain('.mcaddon')
      expect((await fs.readFile(artifact)).readUInt32LE(0)).toBe(0x04034b50)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('creates separate NetEase PC and mobile SDK archives', async () => {
    for (const loader of ['netease-pc', 'netease-mobile'] as const) {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), `modmind-${loader}-`))
      try {
        const info = { ...project(loader, '3.8'), path: root }
        await writeTemplate(root, neteaseTemplateFiles(info, true))
        const inspection = await inspectNeteaseProject(info)
        expect(inspection.success).toBe(true)
        expect((await fs.readFile(path.join(root, 'netease.project.json'), 'utf8'))).toContain(`"target": "${loader === 'netease-mobile' ? 'mobile' : 'pc'}"`)
        expect((await fs.readFile(path.join(root, 'behavior_pack', 'modMain.py'), 'utf8'))).toContain('RegisterSystem')
        const artifact = await buildNeteaseArchive(info)
        expect((await fs.stat(artifact)).size).toBeGreaterThan(100)
        expect((await fs.readFile(artifact)).readUInt32LE(0)).toBe(0x04034b50)
      } finally {
        await fs.rm(root, { recursive: true, force: true })
      }
    }
  })
})
