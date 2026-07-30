import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildScriptFingerprint } from './buildTrust'

describe('Gradle build trust fingerprint', () => {
  it('changes for Wrapper and buildSrc inputs', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-trust-'))
    try {
      await fs.mkdir(path.join(root, 'gradle', 'wrapper'), { recursive: true })
      await fs.writeFile(path.join(root, 'settings.gradle'), "rootProject.name = 'test'\n", 'utf8')
      await fs.writeFile(path.join(root, 'build.gradle'), "plugins { id 'java' }\n", 'utf8')
      await fs.writeFile(path.join(root, 'gradle', 'wrapper', 'gradle-wrapper.properties'), 'distributionUrl=one\n', 'utf8')
      const initial = await buildScriptFingerprint(root)
      await fs.writeFile(path.join(root, 'gradle', 'wrapper', 'gradle-wrapper.properties'), 'distributionUrl=two\n', 'utf8')
      const wrapperChanged = await buildScriptFingerprint(root)
      expect(wrapperChanged).not.toBe(initial)
      await fs.mkdir(path.join(root, 'buildSrc', 'src', 'main', 'java'), { recursive: true })
      await fs.writeFile(path.join(root, 'buildSrc', 'src', 'main', 'java', 'Plugin.java'), 'class Plugin {}\n', 'utf8')
      expect(await buildScriptFingerprint(root)).not.toBe(wrapperChanged)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('rejects included builds outside the project root', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-included-'))
    const root = path.join(parent, 'project')
    try {
      await fs.mkdir(root)
      await fs.writeFile(path.join(root, 'settings.gradle'), "includeBuild('../outside')\n", 'utf8')
      await expect(buildScriptFingerprint(root)).rejects.toThrow(/outside the project/)
    } finally {
      await fs.rm(parent, { recursive: true, force: true })
    }
  })
})
