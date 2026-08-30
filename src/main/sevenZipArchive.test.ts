import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { extractSevenZipArchive } from './sevenZipArchive'
import { path7za } from '7zip-bin'

const execFileAsync = promisify(execFile)

describe('7-Zip archive import', () => {
  it('extracts a 7z project archive', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-7zip-test-'))
    const source = path.join(root, 'project.7z')
    const input = path.join(root, 'input')
    const destination = path.join(root, 'out')
    await fs.mkdir(input)
    await fs.writeFile(path.join(input, 'build.gradle'), 'plugins {}')
    await execFileAsync(path7za, ['a', '-y', '-bd', source, path.join(input, 'build.gradle')], { windowsHide: true })
    const entries: string[] = []
    await extractSevenZipArchive(source, destination, (entry) => entries.push(entry.fileName))
    await expect(fs.readFile(path.join(destination, 'build.gradle'), 'utf8')).resolves.toBe('plugins {}')
    expect(entries.some((entry) => entry.endsWith('build.gradle'))).toBe(true)
    await fs.rm(root, { recursive: true, force: true })
  })
})
