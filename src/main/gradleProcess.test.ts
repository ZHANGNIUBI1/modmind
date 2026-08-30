import { describe, expect, it } from 'vitest'
import { describeProcessTermination, MANAGED_GRADLE_BUILD_ARGUMENTS, normalizeProcessExitCode } from './gradleProcess'

describe('managed Gradle process policy', () => {
  it('always disables reusable daemons and keeps actionable output', () => {
    expect(MANAGED_GRADLE_BUILD_ARGUMENTS).toEqual(['build', '--console=plain', '--no-daemon', '--stacktrace'])
  })

  it('normalizes unsigned Windows termination codes', () => {
    expect(normalizeProcessExitCode(4_294_967_295)).toBe(-1)
    expect(describeProcessTermination(4_294_967_295, null)).toBe('进程被终止')
    expect(describeProcessTermination(null, 'SIGTERM')).toBe('进程收到 SIGTERM 后终止')
  })
})
