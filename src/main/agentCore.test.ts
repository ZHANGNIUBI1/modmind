import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { extractSingleJsonObject, listManagedFiles, redactSensitiveContent, restoreManagedTreeExact } from './agentCore'

const temporaryRoots: string[] = []

async function temporaryDirectory(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-agent-core-'))
  temporaryRoots.push(root)
  return root
}

async function copyTree(source: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true })
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name)
    const to = path.join(destination, entry.name)
    if (entry.isDirectory()) await copyTree(from, to)
    else await fs.copyFile(from, to)
  }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('extractSingleJsonObject', () => {
  it('accepts fenced nested JSON with braces inside strings', () => {
    const value = extractSingleJsonObject('```json\n{"action":"read_file","path":"a{b}.java"}\n```')
    expect(JSON.parse(value)).toEqual({ action: 'read_file', path: 'a{b}.java' })
  })

  it('rejects hidden extra actions instead of silently dropping them', () => {
    expect(() => extractSingleJsonObject('{"action":"read_file"}\n{"action":"build_project"}'))
      .toThrow(/more than one action/)
  })

  it('accepts harmless prose after the JSON object', () => {
    const value = extractSingleJsonObject('{"action":"read_file"}\nI inspected the file.')
    expect(JSON.parse(value)).toEqual({ action: 'read_file' })
  })
})

describe('redactSensitiveContent', () => {
  it('redacts property and JSON credentials while preserving ordinary settings', () => {
    expect(redactSensitiveContent('gradle.properties', 'minecraft_version=1.21.1\nrepoToken=secret-value'))
      .toBe('minecraft_version=1.21.1\nrepoToken=<redacted>')
    expect(redactSensitiveContent('config.json', '{"apiKey":"secret","model":"test"}'))
      .toBe('{"apiKey":"<redacted>","model":"test"}')
  })
})

describe('restoreManagedTreeExact', () => {
  it('restores changed files and removes files created after the snapshot', async () => {
    const root = await temporaryDirectory()
    const snapshot = path.join(root, 'snapshot')
    const project = path.join(root, 'project')
    await fs.mkdir(path.join(snapshot, 'src'), { recursive: true })
    await fs.writeFile(path.join(snapshot, 'src', 'Existing.java'), 'original')
    await fs.mkdir(path.join(project, 'src'), { recursive: true })
    await fs.writeFile(path.join(project, 'src', 'Existing.java'), 'modified')
    await fs.writeFile(path.join(project, 'src', 'CreatedByAi.java'), 'half finished')
    await fs.mkdir(path.join(project, '.modmind'), { recursive: true })
    await fs.writeFile(path.join(project, '.modmind', 'keep.json'), '{}')

    const expected = await listManagedFiles(snapshot, (name) => name === '.modmind')
    await restoreManagedTreeExact(snapshot, project, expected, (name) => name === '.modmind', copyTree)

    await expect(fs.readFile(path.join(project, 'src', 'Existing.java'), 'utf8')).resolves.toBe('original')
    await expect(fs.stat(path.join(project, 'src', 'CreatedByAi.java'))).rejects.toThrow()
    await expect(fs.readFile(path.join(project, '.modmind', 'keep.json'), 'utf8')).resolves.toBe('{}')
  })
})
