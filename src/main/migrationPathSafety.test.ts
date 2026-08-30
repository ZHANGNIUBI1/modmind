import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertSeparateMigrationTrees, isSameOrNestedPath } from './migrationPathSafety'

describe('migration path safety', () => {
  it('detects equal and nested paths without relying on string prefixes', () => {
    const source = path.resolve('fixtures', 'pack')
    expect(isSameOrNestedPath(source, source)).toBe(true)
    expect(isSameOrNestedPath(source, path.join(source, 'target'))).toBe(true)
    expect(isSameOrNestedPath(source, path.resolve('fixtures', 'pack-copy'))).toBe(false)
  })

  it('rejects either direction of source and destination overlap', () => {
    const source = path.resolve('fixtures', 'pack')
    expect(() => assertSeparateMigrationTrees(source, path.join(source, 'target'))).toThrow(/不能相同或互相嵌套/)
    expect(() => assertSeparateMigrationTrees(path.join(source, 'child'), source)).toThrow(/不能相同或互相嵌套/)
    expect(() => assertSeparateMigrationTrees(source, path.resolve('fixtures', 'target'))).not.toThrow()
  })
})
