import { describe, expect, it } from 'vitest'
import { validatePluginManifest } from './plugins'

function baseManifest(): Record<string, unknown> {
  return {
    id: 'desktop-pet',
    name: 'Desktop Pet',
    version: '0.1.0',
    description: 'A cross-page overlay',
    permissions: []
  }
}

describe('plugin overlay manifest', () => {
  it('accepts an overlay as the only plugin entry', () => {
    const result = validatePluginManifest({
      ...baseManifest(),
      overlay: { entry: 'overlay/index.html', mode: 'pet', width: 220, height: 260, alwaysOnTop: true }
    })
    expect(result.errors).toEqual([])
    expect(result.manifest?.overlay).toEqual({ entry: 'overlay/index.html', mode: 'pet', width: 220, height: 260, alwaysOnTop: true })
  })

  it('rejects unsafe overlay dimensions and modes', () => {
    const result = validatePluginManifest({
      ...baseManifest(),
      overlay: { entry: 'overlay/index.html', mode: 'fullscreen', width: 5000, height: 20 }
    })
    expect(result.manifest).toBeUndefined()
    expect(result.errors.join('\n')).toContain('overlay.mode')
    expect(result.errors.join('\n')).toContain('overlay.width')
    expect(result.errors.join('\n')).toContain('overlay.height')
  })
})
