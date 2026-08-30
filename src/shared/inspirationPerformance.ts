import type { AiModelInfo, ReasoningEffort } from './types'

const DEEP_INSPIRATION_PATTERN = /(?:深入分析|全面分析|完整审计|全面审计|逐文件|逐行|架构评审|安全审计|根因分析|系统性分析|deep\s+(?:analysis|review|audit)|full\s+(?:architecture\s+)?(?:review|audit)|file[-\s]by[-\s]file|line[-\s]by[-\s]line|root\s+cause)/i

function belongsToFamily(model: string, family: 'luna' | 'terra'): boolean {
  return new RegExp(`(?:^|[\\s/_.:-])${family}(?:$|[\\s/_.:-])`, 'i').test(model.trim())
}

/** Picks a fast inspiration model without making luna or terra mandatory. */
export function selectInspirationModel(models: readonly AiModelInfo[], configuredModel: string): string {
  const ids = models.map((model) => model.id.trim()).filter(Boolean)
  if (!ids.length) return configuredModel.trim()
  const luna = ids.find((id) => belongsToFamily(id, 'luna'))
  if (luna) return luna
  const terra = ids.find((id) => belongsToFamily(id, 'terra'))
  if (terra) return terra
  const configured = ids.find((id) => id.toLowerCase() === configuredModel.trim().toLowerCase())
  return configured ?? ids[0]
}

/** Inspiration defaults to real low effort and only escalates explicit deep-analysis requests. */
export function inspirationReasoningEffort(question: string): Extract<ReasoningEffort, 'low' | 'medium'> {
  return DEEP_INSPIRATION_PATTERN.test(question) ? 'medium' : 'low'
}
