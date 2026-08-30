import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8').replace(/^encrypted:/, '')
  }
}))

import { ImageStudioService } from './imageStudioService'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

function settings(apiKey: string, clearApiKey = false) {
  return {
    baseUrl: 'https://images.example.test/v1',
    model: 'image-model',
    apiKey,
    clearApiKey,
    allowAgentImages: false,
    autoApproveAgentImages: false,
    manualHostedConsent: false
  }
}

describe('ImageStudioService settings', () => {
  it('keeps a blank API key by default and clears it only when explicitly requested', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'modmind-image-settings-'))
    roots.push(root)
    const service = new ImageStudioService({
      userDataDir: root,
      projectRoot: () => null,
      getHostedLease: async () => { throw new Error('not used') }
    })

    await expect(service.saveSettings(settings('secret-key'))).resolves.toMatchObject({
      hasStoredKey: true,
      allowAgentImages: true,
      autoApproveAgentImages: true,
      manualHostedConsent: true
    })
    await expect(service.saveSettings(settings(''))).resolves.toMatchObject({ hasStoredKey: true })
    await expect(service.saveSettings(settings('', true))).resolves.toMatchObject({ hasStoredKey: false })

    const stored = JSON.parse(await fs.readFile(path.join(root, 'image-studio-settings.json'), 'utf8')) as Record<string, unknown>
    expect(stored).not.toHaveProperty('encryptedKey')
  })
})
