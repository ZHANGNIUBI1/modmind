import { describe, expect, it, vi } from 'vitest'
import {
  MINECRAFT_VERSION_MANIFEST_SOURCES,
  resolveMinecraftVersionFromManifests
} from './minecraftVersionManifest'

describe('Minecraft version manifest fallback', () => {
  it('uses BMCLAPI first when it contains the requested version', async () => {
    const load = vi.fn(async () => ({ versions: [{ id: '1.21.1' }] }))

    const result = await resolveMinecraftVersionFromManifests('1.21.1', load)

    expect(result.source.id).toBe('bmclapi')
    expect(result.failures).toEqual([])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('falls back to Mojang when BMCLAPI closes the connection', async () => {
    const onFailure = vi.fn()
    const load = vi.fn(async (source: { id: string }) => {
      if (source.id === 'bmclapi') throw new Error('net::ERR_CONNECTION_CLOSED')
      return { versions: [{ id: '1.21.1', source: source.id }] }
    })

    const result = await resolveMinecraftVersionFromManifests('1.21.1', load, { onFailure })

    expect(result.source.id).toBe('mojang-piston')
    expect(result.version.source).toBe('mojang-piston')
    expect(result.failures).toHaveLength(1)
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({
      source: expect.objectContaining({ id: 'bmclapi' }),
      message: 'net::ERR_CONNECTION_CLOSED'
    }))
  })

  it('falls back when a source does not contain the requested version', async () => {
    const load = vi.fn(async (source: { id: string }) => ({
      versions: source.id === 'bmclapi' ? [{ id: '1.20.1' }] : [{ id: '1.21.1' }]
    }))

    const result = await resolveMinecraftVersionFromManifests('1.21.1', load)

    expect(result.source.id).toBe('mojang-piston')
    expect(result.failures[0]?.message).toContain('missing from the manifest')
  })

  it('reports every source when none can provide the version', async () => {
    const load = vi.fn(async (source: { label: string }) => {
      throw new Error(`${source.label} unavailable`)
    })

    await expect(resolveMinecraftVersionFromManifests('1.21.1', load)).rejects.toThrow(
      /BMCLAPI: BMCLAPI unavailable.*Mojang: Mojang unavailable.*Mojang legacy: Mojang legacy unavailable/
    )
    expect(load).toHaveBeenCalledTimes(MINECRAFT_VERSION_MANIFEST_SOURCES.length)
  })

  it('does not try another source after cancellation', async () => {
    const cancelled = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    const load = vi.fn(async () => { throw cancelled })

    await expect(resolveMinecraftVersionFromManifests('1.21.1', load)).rejects.toBe(cancelled)
    expect(load).toHaveBeenCalledTimes(1)
  })
})
