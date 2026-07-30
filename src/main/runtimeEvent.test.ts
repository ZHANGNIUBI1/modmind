import { describe, expect, it } from 'vitest'
import { appendMinecraftRuntimeEvent, type MinecraftRuntimeEvent } from '../shared/minecraft'

const event = (progress?: number): MinecraftRuntimeEvent => ({
  stage: 'building-mod',
  message: '华为云镜像 · Gradle 9.5.1',
  time: new Date().toISOString(),
  ...(progress === undefined ? {} : { progress, total: 100 })
})

describe('Minecraft runtime event history', () => {
  it('coalesces progress chunks for one active download', () => {
    const first = appendMinecraftRuntimeEvent([], event(10), 500)
    const second = appendMinecraftRuntimeEvent(first, event(20), 500)
    expect(second).toHaveLength(1)
    expect(second[0].progress).toBe(20)
  })

  it('keeps separate phases and non-progress messages', () => {
    const first = appendMinecraftRuntimeEvent([], event(100), 500)
    const next = appendMinecraftRuntimeEvent(first, { ...event(), message: '项目构建完成并已同步到测试实例' }, 500)
    expect(next).toHaveLength(2)
  })
})
