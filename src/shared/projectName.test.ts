import { describe, expect, it } from 'vitest'
import { normalizeProjectName, projectLangValue, projectPropertiesValue, validateProjectNameInput } from './projectName'

describe('project name safety', () => {
  it('accepts shell-like punctuation while removing format-breaking controls', () => {
    expect(normalizeProjectName('  demo; $(whoami) && "测试"\r\nnext  ')).toBe('demo; $(whoami) && "测试"  next')
  })

  it('keeps Unicode characters intact and limits by code points', () => {
    expect(normalizeProjectName('😀'.repeat(101))).toBe('😀'.repeat(100))
    expect(normalizeProjectName('\u0000\u0001')).toBe('未命名项目')
  })

  it('rejects empty or invisible-only user input', () => {
    expect(() => validateProjectNameInput(' \r\n\t\u0000')).toThrow('项目名称不能为空')
    expect(validateProjectNameInput('x\u0000')).toBe('x')
  })

  it('escapes line-oriented output values', () => {
    expect(projectPropertiesValue('a=b:c\\d')).toBe('a\\=b\\:c\\\\d')
    expect(projectLangValue('a\\b')).toBe('a\\\\b')
  })
})
