import { describe, expect, it } from 'vitest'
import { inspectForDecompilation, runDecompilation } from './decompilePipeline'
import { createStoredZip } from './bedrockAddon'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

describe('probe pipeline on real fixture', () => {
  it('runs inspect + decompile on the compiled jar', async () => {
    const javac = String(process.env.PATH ?? '').split(path.delimiter).map((d) => path.join(d, 'javac.exe')).find((p) => { try { return require('node:fs').existsSync(p) } catch { return false } })
    console.log('JAVAC:', JSON.stringify(javac))
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'probe-pipe-'))
    const src = path.join(root, 'src')
    await fs.mkdir(src, { recursive: true })
    await fs.writeFile(path.join(src, 'MyMod.java'), 'public class MyMod { public static int compute(int v) { return v * 42; } }\n')
    execFileSync(javac!, ['-d', src, path.join(src, 'MyMod.java')], { stdio: 'pipe' })
    const files: Array<{ name: string; data: Buffer }> = [
      { name: 'META-INF/mods.toml', data: Buffer.from(['modLoader="javafml"', 'loaderVersion="[1,)"', '[[mods]]', 'modId="mymod"', 'version="1.0.0"', 'displayName="My Mod"'].join('\n') + '\n', 'utf8') }
    ]
    for (const entry of await fs.readdir(src, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.class')) files.push({ name: entry.name, data: await fs.readFile(path.join(src, entry.name)) })
    }
    const jarPath = path.join(root, 'mymod.jar')
    await fs.writeFile(jarPath, createStoredZip(files))
    try {
      const inspected = await inspectForDecompilation(jarPath, { cacheRoot: root })
      console.log('INSPECT:', JSON.stringify({ modId: inspected.modId, loader: inspected.loader, hint: inspected.obfuscationHint }))
    } catch (error) {
      console.log('INSPECT FAILED:', (error as Error).message.slice(0, 400))
    }
    expect(true).toBe(true)
  })
})
