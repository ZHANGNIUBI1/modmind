export function isExpectedCancellation(value: unknown): boolean {
  const name = value instanceof Error
    ? value.name
    : value && typeof value === 'object' && 'name' in value ? String((value as { name?: unknown }).name ?? '') : ''
  const message = value instanceof Error
    ? value.message
    : value && typeof value === 'object' && 'message' in value ? String((value as { message?: unknown }).message ?? '') : String(value ?? '')
  return name === 'AbortError'
    || /(?:^|\b)(?:aborted|cancelled|canceled)(?:\b|$)/i.test(message)
    || /(?:已停止|已取消|取消请求已处理|构建取消)/.test(message)
}
