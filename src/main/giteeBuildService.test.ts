import { describe, expect, it } from 'vitest'
import { defaultGiteeCi, parseRepository } from './giteeBuildService'

describe('Gitee build connector', () => {
  it('normalizes Gitee repository URLs and pipeline links', () => {
    const result = parseRepository('https://gitee.com/example/modmind.git')
    expect(result.owner).toBe('example')
    expect(result.repository).toBe('modmind')
    expect(result.gitUrl).toBe('https://example@gitee.com/example/modmind.git')
    expect(result.pipelineUrl).toBe('https://gitee.com/example/modmind/pipelines')
  })

  it('rejects repositories hosted outside Gitee', () => {
    expect(() => parseRepository('https://github.com/example/modmind.git')).toThrow('Gitee 仓库地址')
  })

  it('generates a Gradle artifact pipeline', () => {
    expect(defaultGiteeCi).toContain('./gradlew build --no-daemon --stacktrace')
    expect(defaultGiteeCi).toContain('build/libs/*.jar')
  })
})
