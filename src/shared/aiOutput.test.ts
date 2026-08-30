import { describe, expect, it } from 'vitest'
import { isAiOperationalStatusText, isUsableAiAnswer, selectFinalAiAnswer } from './aiOutput'

describe('AI output classification', () => {
  it.each([
    '模型服务暂时不可用（429，当前线路繁忙），8 秒后自动重试（第 2 次，最多 4 次）',
    '连接中断，正在自动重试并继续同一任务',
    'Rate limit reached; retry attempt 3 of 4',
    'Codex is reconnecting and will retry',
    '我会先读取项目说明，再检查现有实现并继续处理。',
    'We need to inspect the current files and retry the failed tool.'
  ])('keeps provider lifecycle text out of final answers: %s', (message) => {
    expect(isAiOperationalStatusText(message)).toBe(true)
    expect(isUsableAiAnswer(message)).toBe(false)
  })

  it('does not reject a substantive answer that explains retry behavior', () => {
    const answer = 'HTTP 429 表示请求过多。可以采用指数退避，并在重试前读取 Retry-After 响应头。\n\n示例配置如下。'
    expect(isAiOperationalStatusText(answer)).toBe(false)
    expect(isUsableAiAnswer(answer)).toBe(true)
  })

  it('does not recycle already delivered progress as the final answer', () => {
    expect(selectFinalAiAnswer(undefined, '我正在检查项目', new Set(['我正在检查项目']))).toBe('')
    expect(selectFinalAiAnswer('最终回答', 'short summary', new Set())).toBe('最终回答')
  })
})
