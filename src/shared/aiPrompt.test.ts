import { describe, expect, it } from 'vitest'
import { AI_CONTINUATION_PROMPT, aiPromptFingerprint, isAiAbandonmentRequest, isAiContinuationRequest, isRepeatedAiPrompt, normalizeAiPrompt } from './aiPrompt'

describe('AI prompt continuation policy', () => {
  it('normalizes Unicode and whitespace before comparing prompts', () => {
    expect(normalizeAiPrompt('  Boss　设计  ')).toBe('boss 设计')
    expect(isRepeatedAiPrompt('Boss 设计', [' boss\n设计 '])).toBe(true)
    expect(isRepeatedAiPrompt('Boss 设计 v2', ['Boss 设计'])).toBe(false)
  })

  it('uses a continuation instruction for repeated turns', () => {
    expect(AI_CONTINUATION_PROMPT).toContain('继续上一次相同请求')
    expect(AI_CONTINUATION_PROMPT).toContain('不要重复已经完成的工作')
  })

  it('includes attachments in the repetition key', () => {
    const original = aiPromptFingerprint('Analyze this', ['C:/tmp/a.png:1024'])
    expect(isRepeatedAiPrompt(aiPromptFingerprint('Analyze this', ['C:/tmp/a.png:1024']), [original])).toBe(true)
    expect(isRepeatedAiPrompt(aiPromptFingerprint('Analyze this', ['C:/tmp/b.png:1024']), [original])).toBe(false)
  })

  it('recognizes natural-language recovery and abandonment instructions', () => {
    expect(isAiContinuationRequest('继续')).toBe(true)
    expect(isAiContinuationRequest('接着做')).toBe(true)
    expect(isAiContinuationRequest('继续修复新的界面')).toBe(false)
    expect(isAiAbandonmentRequest('取消当前任务')).toBe(true)
    expect(isAiAbandonmentRequest('先不要继续了')).toBe(true)
  })
})
