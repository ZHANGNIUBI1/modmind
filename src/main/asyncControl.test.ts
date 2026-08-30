import { describe, expect, it, vi } from 'vitest'
import { awaitWithAbort, waitForCondition } from './asyncControl'

describe('async control', () => {
  it('rejects an in-flight wait immediately when cancelled', async () => {
    const controller = new AbortController()
    const pending = awaitWithAbort(new Promise<void>(() => undefined), controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('waits until the tracked condition becomes true', async () => {
    vi.useFakeTimers()
    let ready = false
    const pending = waitForCondition(() => ready, 1_000, 25)
    ready = true
    await vi.advanceTimersByTimeAsync(25)
    await expect(pending).resolves.toBe(true)
    vi.useRealTimers()
  })

  it('returns false at the deadline instead of waiting forever', async () => {
    vi.useFakeTimers()
    const pending = waitForCondition(() => false, 100, 25)
    await vi.advanceTimersByTimeAsync(100)
    await expect(pending).resolves.toBe(false)
    vi.useRealTimers()
  })
})
