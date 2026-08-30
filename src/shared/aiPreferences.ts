import type { BeginnerReasoningLevel, ReasoningEffort } from './types'

const SOL_EFFORTS: Record<BeginnerReasoningLevel, ReasoningEffort> = {
  low: 'medium',
  medium: 'high',
  high: 'xhigh',
  extreme: 'max'
}

const BALANCED_EFFORTS: Record<BeginnerReasoningLevel, ReasoningEffort> = {
  low: 'high',
  medium: 'xhigh',
  high: 'max',
  extreme: 'ultra'
}

export function beginnerReasoningEffort(model: string, level: BeginnerReasoningLevel): ReasoningEffort {
  return /gpt-5\.6-sol/i.test(model) ? SOL_EFFORTS[level] : BALANCED_EFFORTS[level]
}

export function beginnerReasoningLevelFor(model: string, effort: unknown): BeginnerReasoningLevel {
  const values = /gpt-5\.6-sol/i.test(model) ? SOL_EFFORTS : BALANCED_EFFORTS
  const match = (Object.entries(values) as Array<[BeginnerReasoningLevel, ReasoningEffort]>).find(([, value]) => value === effort)
  return match?.[0] ?? 'medium'
}
