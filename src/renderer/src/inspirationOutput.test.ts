import { describe, expect, it } from 'vitest'
import { buildInspirationRows, finalInspirationReply, inspirationConversationHandoff, settleInspirationCancellation, settleInspirationFailure, shouldResumeInspirationSession } from './inspirationOutput'

describe('inspiration output settlement', () => {
  it('renders retry/tool steps in order between the question and provisional answer', () => {
    const rows = buildInspirationRows([
      { role: 'user', content: 'question', status: 'completed' },
      { role: 'assistant', kind: 'tool', id: 'retry-1', content: 'retrying', status: 'completed' },
      { role: 'assistant', content: '', status: 'streaming', sessionId: 'run-1' }
    ])
    expect(rows.map((row) => row.kind)).toEqual(['message', 'tool-group', 'message'])
  })

  it('never promotes summary or retry status to the final answer', () => {
    expect(finalInspirationReply({ summary: '模型服务暂时不可用，8 秒后自动重试（第 2 次，最多 4 次）' })).toBe('')
    expect(finalInspirationReply({ summary: 'fallback summary', finalResponse: 'Codex is reconnecting and will retry' })).toBe('')
    expect(finalInspirationReply({ summary: 'short', finalResponse: '这是完整且可展示的灵感回答。' })).toBe('这是完整且可展示的灵感回答。')
  })

  it('demotes provisional narration when a run fails', () => {
    const result = settleInspirationFailure([
      { role: 'assistant', content: '我正在读取项目', status: 'streaming', isFinal: false, sessionId: 'run-1' }
    ], 'run-1', '线路仍不可用', () => 'step-1')
    expect(result).toEqual([
      { role: 'assistant', kind: 'tool', id: 'step-1', content: '我正在读取项目', status: 'completed', isFinal: false, sessionId: 'run-1' },
      expect.objectContaining({ role: 'assistant', content: '线路仍不可用', status: 'error', isFinal: true, sessionId: 'run-1' })
    ])
  })

  it('keeps provisional text as a step when cancellation is confirmed', () => {
    const result = settleInspirationCancellation([
      { role: 'assistant', content: '正在检查 API', status: 'streaming', isFinal: false, sessionId: 'run-1' }
    ], 'run-1', () => 'step-1')
    expect(result[0]).toMatchObject({ kind: 'tool', isFinal: false })
    expect(result[1]).toMatchObject({ content: '请求已暂停', status: 'cancelled', isFinal: true })
  })

  it('rotates long native sessions while carrying bounded recent context', () => {
    const messages = Array.from({ length: 8 }, (_value, index) => ([
      { role: 'user' as const, content: `question-${index}`, status: 'completed' as const },
      { role: 'assistant' as const, content: `answer-${index}`, status: 'completed' as const, isFinal: true }
    ])).flat()
    expect(shouldResumeInspirationSession(messages.slice(0, 2))).toBe(true)
    expect(shouldResumeInspirationSession(messages)).toBe(false)
    const handoff = inspirationConversationHandoff(messages, 120)
    expect(handoff.length).toBeLessThanOrEqual(120)
    expect(handoff).toContain('answer-7')
  })
})
