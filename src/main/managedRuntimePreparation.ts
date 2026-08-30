function errorMessage(error: unknown): string {
  if (error instanceof AggregateError) {
    const details = error.errors.map(errorMessage).filter(Boolean).join('; ')
    return [error.message, details].filter(Boolean).join(': ')
  }
  if (error instanceof Error) {
    const cause = 'cause' in error ? (error as Error & { cause?: unknown }).cause : undefined
    const detail = cause ? errorMessage(cause) : ''
    return detail && detail !== error.message ? `${error.message}: ${detail}` : error.message
  }
  return String(error)
}

/** Headless tests must not hide a failed managed download and start another downloader. */
export async function requireManagedRuntimePreparation(
  prepare: () => Promise<unknown>,
  onError?: (error: unknown) => void
): Promise<void> {
  try {
    await prepare()
  } catch (error) {
    onError?.(error)
    throw new Error(`Minecraft 游戏文件准备失败：${errorMessage(error)}`, { cause: error })
  }
}
