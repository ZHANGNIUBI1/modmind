import type { CodingResult, InspirationChatMessage } from '../../shared/types'
import { isUsableAiAnswer } from '../../shared/aiOutput'

type IdFactory = () => string

export type InspirationTimelineRow =
  | { id: string; kind: 'tool-group'; items: InspirationChatMessage[] }
  | { id: string; kind: 'message'; message: InspirationChatMessage; index: number }

export function buildInspirationRows(messages: InspirationChatMessage[]): InspirationTimelineRow[] {
  const rows: InspirationTimelineRow[] = []
  let tools: InspirationChatMessage[] = []
  const flushTools = (): void => {
    if (!tools.length) return
    rows.push({ id: `steps-${tools[0].id ?? rows.length}`, kind: 'tool-group', items: tools })
    tools = []
  }
  messages.forEach((message, index) => {
    if (message.kind === 'tool') {
      tools.push(message)
      return
    }
    flushTools()
    if (message.role === 'user' || (message.role === 'assistant' && (message.isFinal || message.status === 'streaming'))) {
      rows.push({ id: `${message.sessionId ?? message.role}-${index}`, kind: 'message', message, index })
    }
  })
  flushTools()
  return rows
}

function defaultId(): string {
  return `inspiration-step-${Date.now()}-${crypto.randomUUID()}`
}

function progressStep(message: InspirationChatMessage, sessionId: string, createId: IdFactory): InspirationChatMessage | null {
  if (!message.content.trim()) return null
  return {
    role: 'assistant', kind: 'tool', id: createId(), content: message.content,
    status: 'completed', isFinal: false, sessionId
  }
}

export function finalInspirationReply(result: Pick<CodingResult, 'finalResponse' | 'summary'>): string {
  return isUsableAiAnswer(result.finalResponse) ? result.finalResponse.trim() : ''
}

const INSPIRATION_SESSION_TURN_LIMIT = 8

export function shouldResumeInspirationSession(messages: InspirationChatMessage[]): boolean {
  const completedTurns = messages.filter((message) => message.role === 'user').length
  return completedTurns > 0 && completedTurns % INSPIRATION_SESSION_TURN_LIMIT !== 0
}

export function inspirationConversationHandoff(messages: InspirationChatMessage[], maxChars = 8_000): string {
  const transcript = messages
    .filter((message) => message.kind !== 'tool' && (message.role === 'user' || message.isFinal))
    .slice(-12)
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content.trim()}`)
    .filter((line) => !line.endsWith(':'))
    .join('\n\n')
  if (!transcript) return ''
  return transcript.length <= maxChars ? transcript : transcript.slice(-maxChars)
}

export function settleInspirationReply(
  messages: InspirationChatMessage[],
  sessionId: string,
  reply: string,
  invalidMessage: string,
  createId: IdFactory = defaultId
): InspirationChatMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== 'assistant' || message.status !== 'streaming' || message.sessionId !== sessionId) return [message]
    const progress = message.content.trim() && message.content.trim() !== reply.trim() ? progressStep(message, sessionId, createId) : null
    const valid = isUsableAiAnswer(reply)
    return [
      ...(progress ? [progress] : []),
      {
        role: 'assistant' as const,
        content: valid ? reply.trim() : invalidMessage,
        status: valid ? 'completed' as const : 'error' as const,
        isFinal: true,
        sessionId,
        time: new Date().toISOString()
      }
    ]
  })
}

export function settleInspirationFailure(
  messages: InspirationChatMessage[],
  sessionId: string,
  failure: string,
  createId: IdFactory = defaultId
): InspirationChatMessage[] {
  return settleInspirationReply(messages, sessionId, '', failure, createId)
}

export function settleInspirationCancellation(
  messages: InspirationChatMessage[],
  sessionId: string,
  createId: IdFactory = defaultId
): InspirationChatMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== 'assistant' || message.status !== 'streaming' || message.sessionId !== sessionId) return [message]
    const progress = message.content.trim() && message.content !== '正在停止任务…' ? progressStep(message, sessionId, createId) : null
    return [
      ...(progress ? [progress] : []),
      { role: 'assistant' as const, content: '请求已暂停', status: 'cancelled' as const, isFinal: true, sessionId, time: new Date().toISOString() }
    ]
  })
}
