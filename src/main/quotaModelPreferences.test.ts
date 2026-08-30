import { describe, expect, it } from 'vitest'
import type { BeginnerAiPreferences } from '../shared/types'
import {
  activeQuotaModelPreferences,
  parseStoredQuotaModelPreferences,
  quotaPreferenceKey,
  resolveQuotaModelPreferences,
  updateQuotaModelPreferences
} from './quotaModelPreferences'

const defaults: BeginnerAiPreferences = { model: 'terra', reasoningLevel: 'medium', fastMode: false }

describe('quota model preferences', () => {
  it('migrates the legacy global preference format', () => {
    const store = parseStoredQuotaModelPreferences({ model: 'legacy', reasoningLevel: 'high', fastMode: true }, defaults)
    expect(store).toEqual({
      version: 2,
      current: { model: 'legacy', reasoningLevel: 'high', fastMode: true },
      profiles: {}
    })
  })

  it('restores an existing preference when a known key becomes active again', () => {
    const key = quotaPreferenceKey('https://relay.example/v1', 'key-a')
    const stored = parseStoredQuotaModelPreferences({
      version: 2,
      current: defaults,
      profiles: { [key]: { model: 'glm-4.7', reasoningLevel: 'high', fastMode: true } }
    }, defaults)
    const resolved = resolveQuotaModelPreferences(stored, key, [{ id: 'glm-4.7' }, { id: 'terra' }])
    expect(resolved.restored).toBe(true)
    expect(resolved.preferences).toEqual({ model: 'glm-4.7', reasoningLevel: 'high', fastMode: true })
  })

  it('selects and saves the last scanned model when the preferred model is unavailable', () => {
    const key = quotaPreferenceKey('https://relay.example/v1', 'key-b')
    const stored = parseStoredQuotaModelPreferences(defaults, defaults)
    const resolved = resolveQuotaModelPreferences(stored, key, [{ id: 'deepseek' }, { id: 'glm' }])
    expect(resolved.modelChanged).toBe(true)
    expect(resolved.preferences.model).toBe('glm')
    expect(activeQuotaModelPreferences(resolved.store, key).model).toBe('glm')
  })

  it('updates the active key profile after a manual preference change', () => {
    const key = quotaPreferenceKey('https://relay.example/v1', 'key-c')
    const stored = parseStoredQuotaModelPreferences(defaults, defaults)
    const next = { model: 'manual', reasoningLevel: 'extreme', fastMode: true } as const
    const updated = updateQuotaModelPreferences(stored, next, key)
    expect(updated.current).toEqual(next)
    expect(updated.profiles[key]).toEqual(next)
  })
})
