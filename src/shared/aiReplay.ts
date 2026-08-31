import type { AiAttachment, AiTurnReplay } from './types'

const MAX_REPLAY_ATTACHMENTS = 8
const MAX_REPLAY_PROMPT_CHARS = 120_000

function normalizedAttachment(value: unknown): AiAttachment | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<AiAttachment>
  if (typeof candidate.id !== 'string' || !candidate.id.trim()
    || typeof candidate.name !== 'string' || !candidate.name.trim()
    || typeof candidate.path !== 'string' || !candidate.path.trim()
    || /[\0\r\n]/.test(candidate.path)
    || typeof candidate.size !== 'number' || !Number.isFinite(candidate.size) || candidate.size < 0
    || typeof candidate.isImage !== 'boolean') return null
  return {
    id: candidate.id.slice(0, 256),
    name: candidate.name.slice(0, 1_024),
    path: candidate.path.slice(0, 8_192),
    size: candidate.size,
    isImage: candidate.isImage,
    ...(candidate.isDirectory === true ? { isDirectory: true } : {})
  }
}

/** Treat persisted replay metadata as untrusted and keep legacy rows compatible. */
export function normalizeAiTurnReplay(value: unknown): AiTurnReplay | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<AiTurnReplay>
  if (typeof candidate.prompt !== 'string' || !candidate.prompt.trim()) return undefined
  const attachments = Array.isArray(candidate.attachments)
    ? candidate.attachments.map(normalizedAttachment).filter((item): item is AiAttachment => item !== null).slice(0, MAX_REPLAY_ATTACHMENTS)
    : []
  return {
    prompt: candidate.prompt.slice(0, MAX_REPLAY_PROMPT_CHARS),
    ...(attachments.length ? { attachments } : {})
  }
}

export function replayUserText(fallback: string, replay: AiTurnReplay | undefined): string {
  const prompt = replay?.prompt.trim() || fallback.trim()
  const attachments = replay?.attachments ?? []
  if (!attachments.length) return prompt
  return `${prompt}\n附件：\n${attachments.map((attachment) => `- ${attachment.path} (${attachment.isDirectory ? '目录' : attachment.isImage ? '图片' : '文件'})`).join('\n')}`
}
