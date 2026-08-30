export function normalizeAiPrompt(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase()
}

export function isRepeatedAiPrompt(current: string, previous: string[]): boolean {
  const normalized = normalizeAiPrompt(current)
  return Boolean(normalized) && previous.some((item) => normalizeAiPrompt(item) === normalized)
}

export function aiPromptFingerprint(prompt: string, attachmentKeys: string[] = []): string {
  const attachments = attachmentKeys.map((key) => key.trim()).filter(Boolean).sort()
  return attachments.length ? `${prompt}\n\n[attachments]\n${attachments.join('\n')}` : prompt
}

export function isAiContinuationRequest(value: string): boolean {
  const normalized = normalizeAiPrompt(value).replace(/[，。！？,.!?\s]/gu, '')
  if (normalized.startsWith('继续上一次相同请求')) return true
  return [
    '继续', '继续做', '继续吧', '接着做', '接着', '按原计划继续',
    '继续上次任务', '继续上一个任务', 'resume', 'continue', 'goon', 'carryon'
  ].includes(normalized)
}

export function isAiAbandonmentRequest(value: string): boolean {
  const normalized = normalizeAiPrompt(value).replace(/[，。！？,.!?\s]/gu, '')
  return [
    '放弃当前任务', '取消当前任务', '不要继续了', '不用继续了', '终止当前任务',
    'abandoncurrenttask', 'cancelcurrenttask', 'dontcontinue', 'stopanddiscard'
  ].includes(normalized) || /^(?:先)?(?:不要|不用)继续(?:了)?$/u.test(normalized)
}

export const AI_CONTINUATION_PROMPT = '继续上一次相同请求。请读取当前任务状态，只完成尚未完成的部分，不要重复已经完成的工作。'
