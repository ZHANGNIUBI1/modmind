import { describe, expect, it, vi } from 'vitest'
import { InitialReadiness } from './initialReadiness'

describe('InitialReadiness', () => {
  it('makes early consumers wait for the first initialization instead of starting an empty fallback', async () => {
    let resolveInitial: ((value: string) => void) | undefined
    const readiness = new InitialReadiness<string>()
    const initialize = readiness.run(() => new Promise<string>((resolve) => { resolveInitial = resolve }))
    const fallback = vi.fn(async () => 'empty')

    const consumer = readiness.wait(fallback)
    expect(fallback).not.toHaveBeenCalled()
    expect(await Promise.race([consumer.then(() => 'settled'), Promise.resolve('pending')])).toBe('pending')

    resolveInitial?.('plugins-ready')
    await expect(initialize).resolves.toBe('plugins-ready')
    await expect(consumer).resolves.toBe('plugins-ready')
  })

  it('allows later refreshes and can reset for shutdown', async () => {
    const readiness = new InitialReadiness<number>()
    await expect(readiness.run(async () => 1)).resolves.toBe(1)
    await expect(readiness.run(async () => 2)).resolves.toBe(2)
    readiness.reset()
    await expect(readiness.wait(async () => 3)).resolves.toBe(3)
  })
})
