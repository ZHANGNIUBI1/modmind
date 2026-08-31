import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MODMIND_SOURCE_FINGERPRINT } from './sourceFingerprint'

const SOURCE_FINGERPRINT_SEED = 'ModMind|AGPL-3.0-only|1.4.4|bridge-contract-0.2|source-fingerprint-v1'

describe('source fingerprint', () => {
  it('matches the documented 1.4.4 provenance seed', () => {
    const digest = createHash('sha256').update(SOURCE_FINGERPRINT_SEED).digest('hex')
    expect(MODMIND_SOURCE_FINGERPRINT).toBe(`sha256:${digest}`)
  })

  it('matches the fingerprint shipped in package metadata', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {sourceFingerprint?: string}
    expect(packageJson.sourceFingerprint).toBe(MODMIND_SOURCE_FINGERPRINT)
  })
})
