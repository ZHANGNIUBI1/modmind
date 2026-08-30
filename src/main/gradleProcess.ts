export const MANAGED_GRADLE_BUILD_ARGUMENTS = ['build', '--console=plain', '--no-daemon', '--stacktrace'] as const

export function normalizeProcessExitCode(code: number | null): number | null {
  if (code === null) return null
  return code > 0x7fffffff ? code - 0x1_0000_0000 : code
}

export function describeProcessTermination(code: number | null, signal: NodeJS.Signals | null): string {
  if (signal) return `进程收到 ${signal} 后终止`
  const normalized = normalizeProcessExitCode(code)
  if (normalized === null || normalized < 0) return '进程被终止'
  return `退出代码 ${normalized}`
}
