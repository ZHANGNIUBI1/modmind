export function abortError(signal: AbortSignal, fallbackMessage = 'Operation cancelled'): Error {
  const reason = signal.reason
  if (reason instanceof Error) return reason
  const error = new Error(typeof reason === 'string' && reason.trim() ? reason : fallbackMessage)
  error.name = 'AbortError'
  return error
}

export function throwIfAborted(signal: AbortSignal, fallbackMessage?: string): void {
  if (signal.aborted) throw abortError(signal, fallbackMessage)
}

export function awaitWithAbort<T>(operation: PromiseLike<T>, signal: AbortSignal, fallbackMessage?: string): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(signal, fallbackMessage))
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortError(signal, fallbackMessage))
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(operation).then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

export async function waitForCondition(
  condition: () => boolean,
  timeoutMs: number,
  pollIntervalMs = 25
): Promise<boolean> {
  const deadline = Date.now() + Math.max(0, timeoutMs)
  while (!condition()) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return false
    await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(1, pollIntervalMs), remaining)))
  }
  return true
}
