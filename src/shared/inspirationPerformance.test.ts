import { describe, expect, it } from 'vitest'
import { inspirationReasoningEffort, selectInspirationModel } from './inspirationPerformance'

describe('inspiration performance policy', () => {
  it('prefers luna, then terra, without requiring either family', () => {
    expect(selectInspirationModel([{ id: 'gpt-5.6-terra' }, { id: 'gpt-5.6-luna' }], 'gpt-5.6-sol')).toBe('gpt-5.6-luna')
    expect(selectInspirationModel([{ id: 'gpt-5.6-sol' }, { id: 'gpt-5.6-terra' }], 'gpt-5.6-sol')).toBe('gpt-5.6-terra')
    expect(selectInspirationModel([{ id: 'free-model' }, { id: 'other-model' }], 'other-model')).toBe('other-model')
    expect(selectInspirationModel([{ id: 'free-model' }], 'missing-model')).toBe('free-model')
    expect(selectInspirationModel([], 'configured-model')).toBe('configured-model')
  })

  it('uses medium only when the user explicitly requests deep analysis', () => {
    expect(inspirationReasoningEffort('给我三个 Boss 创意')).toBe('low')
    expect(inspirationReasoningEffort('深入分析当前架构并逐文件检查')).toBe('medium')
    expect(inspirationReasoningEffort('Run a full architecture audit')).toBe('medium')
  })
})
