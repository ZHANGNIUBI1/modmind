import { describe, expect, it, vi } from 'vitest'
import { isMissingFileError, lockedFileReadError, retryTransientFileLock } from './fileLockRetry'

describe('transient Windows file lock retry', () => {
  it('retries EBUSY reads and returns the eventual result', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }))
      .mockResolvedValue('ok')

    await expect(retryTransientFileLock(operation, [0])).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('does not retry missing files and names persistently locked files', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    const operation = vi.fn().mockRejectedValue(missing)
    await expect(retryTransientFileLock(operation, [0, 0])).rejects.toBe(missing)
    expect(operation).toHaveBeenCalledOnce()
    expect(isMissingFileError(missing)).toBe(true)
    expect(lockedFileReadError('C:\\pack\\example.jar', missing).message).toContain('example.jar')
  })
})
