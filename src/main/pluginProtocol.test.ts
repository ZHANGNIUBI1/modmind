import { describe, expect, it } from 'vitest'
import { resolvePluginRequestPath } from './pluginProtocol'
import type { PluginRecord } from '../shared/plugins'

function record(): PluginRecord {
  return {
    manifest: {
      id: 'demo',
      name: 'Demo',
      version: '0.1.0',
      description: '',
      permissions: [],
      panel: { entry: 'panel/index.html' }
    },
    scope: 'global',
    directory: 'C:\\plugins\\demo',
    enabled: true
  }
}

describe('plugin protocol path resolution', () => {
  it('resolves normal relative paths inside the plugin directory', () => {
    const resolved = resolvePluginRequestPath(record(), 'panel/index.html')
    expect(resolved).not.toBeNull()
    expect(resolved).toContain('demo')
  })

  it('rejects traversal attempts', () => {
    expect(resolvePluginRequestPath(record(), '../secret.txt')).toBeNull()
    expect(resolvePluginRequestPath(record(), 'panel/../../../etc/passwd')).toBeNull()
    expect(resolvePluginRequestPath(record(), '..\\..\\windows\\system32')).toBeNull()
  })

  it('rejects empty and encoded traversal', () => {
    expect(resolvePluginRequestPath(record(), '')).toBeNull()
    expect(resolvePluginRequestPath(record(), '%2e%2e/escape')).toBeNull()
  })
})
