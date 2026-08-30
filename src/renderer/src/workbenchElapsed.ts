export function workbenchElapsedSeconds(startedAt: string | undefined, now: number): number | null {
  if (!startedAt) return null
  const started = Date.parse(startedAt)
  if (!Number.isFinite(started)) return null
  return Math.max(0, Math.floor((now - started) / 1_000))
}
