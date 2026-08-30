import { describe, expect, it } from 'vitest'
import { beginnerReasoningEffort, beginnerReasoningLevelFor } from './aiPreferences'

describe('beginner AI preferences', () => {
  it('maps reasoning labels to model-specific effort values', () => {
    expect(beginnerReasoningEffort('gpt-5.6-sol', 'low')).toBe('medium')
    expect(beginnerReasoningEffort('gpt-5.6-sol', 'extreme')).toBe('max')
    expect(beginnerReasoningEffort('gpt-5.6-terra', 'low')).toBe('high')
    expect(beginnerReasoningEffort('gpt-5.6-luna', 'extreme')).toBe('ultra')
  })

  it('migrates legacy effort values into the closest visible label', () => {
    expect(beginnerReasoningLevelFor('gpt-5.6-sol', 'xhigh')).toBe('high')
    expect(beginnerReasoningLevelFor('gpt-5.6-terra', 'high')).toBe('low')
    expect(beginnerReasoningLevelFor('gpt-5.6-terra', 'unknown')).toBe('medium')
  })
})
