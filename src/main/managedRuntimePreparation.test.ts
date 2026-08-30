import { describe, expect, it, vi } from 'vitest'
import { requireManagedRuntimePreparation } from './managedRuntimePreparation'

describe('managed runtime preparation', () => {
  it('propagates download failures instead of allowing a fallback downloader', async () => {
    const failure = new AggregateError([new Error('mirror HTTP 502'), new Error('official connection closed')], 'download failed')
    const onError = vi.fn()

    await expect(requireManagedRuntimePreparation(async () => { throw failure }, onError)).rejects.toThrow(
      /Minecraft 游戏文件准备失败.*mirror HTTP 502.*official connection closed/
    )
    expect(onError).toHaveBeenCalledOnce()
  })

  it('returns normally after successful preparation', async () => {
    const prepare = vi.fn(async () => undefined)
    await expect(requireManagedRuntimePreparation(prepare)).resolves.toBeUndefined()
    expect(prepare).toHaveBeenCalledOnce()
  })
})
