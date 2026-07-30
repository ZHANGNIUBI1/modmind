import { describe, expect, it } from 'vitest'
import { recordZipExpansion } from './archiveImportPolicy'

describe('ZIP import expansion policy', () => {
  it('does not impose a compressed archive size limit', () => {
    const state = { entryCount: 0, expandedBytes: 0 }
    for (let index = 0; index < 3; index += 1) {
      recordZipExpansion(state, { fileName: `large-${index}.bin`, uncompressedSize: 200 * 1024 * 1024 })
    }
    expect(state.entryCount).toBe(3)
    expect(state.expandedBytes).toBe(600 * 1024 * 1024)
  })

  it('keeps decompression bomb limits', () => {
    expect(() => recordZipExpansion({ entryCount: 0, expandedBytes: 0 }, {
      fileName: 'too-large.bin',
      uncompressedSize: 256 * 1024 * 1024 + 1
    })).toThrow('ZIP entry is too large')
    expect(() => recordZipExpansion({ entryCount: 20_000, expandedBytes: 0 }, {
      fileName: 'extra.bin',
      uncompressedSize: 1
    })).toThrow('more than 20,000 entries')
    expect(() => recordZipExpansion({ entryCount: 0, expandedBytes: 2 * 1024 * 1024 * 1024 }, {
      fileName: 'extra.bin',
      uncompressedSize: 1
    })).toThrow('2 GB import limit')
  })
})
