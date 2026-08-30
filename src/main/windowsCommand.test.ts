import { describe, expect, it } from 'vitest'
import { windowsCmdInvocation } from './windowsCommand'

describe('windowsCmdInvocation', () => {
  it('quotes an executable path containing spaces for cmd.exe', () => {
    const invocation = windowsCmdInvocation('C:\\Program Files\\Gradle\\bin\\gradlew.bat', ['build'])

    expect(invocation.command.toLowerCase()).toMatch(/(?:^|[\\/])cmd(?:\.exe)?$/)
    expect(invocation.args).toEqual(['/d', '/s', '/c', '""C:\\Program Files\\Gradle\\bin\\gradlew.bat" build"'])
    expect(invocation.windowsVerbatimArguments).toBe(true)
  })
})
