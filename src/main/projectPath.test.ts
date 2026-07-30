import { describe, expect, it } from 'vitest'
import { sameProjectPath } from './projectPath'

describe('project path comparison', () => {
  it('treats Windows paths as case-insensitive', () => {
    expect(sameProjectPath('C:/Projects/Mod', 'c:/projects/mod', 'win32')).toBe(true)
  })

  it('keeps POSIX path case significant', () => {
    expect(sameProjectPath('/Projects/Mod', '/projects/mod', 'linux')).toBe(false)
  })
})
