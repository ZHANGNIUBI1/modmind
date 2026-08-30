import { describe, expect, it } from 'vitest'
import { workbenchElapsedSeconds } from './workbenchElapsed'

describe('workbench processing elapsed time', () => {
  it('continues from the persisted task start after remounting', () => {
    expect(workbenchElapsedSeconds('2026-08-28T10:00:00.000Z', Date.parse('2026-08-28T10:02:03.900Z'))).toBe(123)
  })

  it('rejects missing or invalid start times and clamps clock skew', () => {
    expect(workbenchElapsedSeconds(undefined, Date.now())).toBeNull()
    expect(workbenchElapsedSeconds('invalid', Date.now())).toBeNull()
    expect(workbenchElapsedSeconds('2026-08-28T10:00:10.000Z', Date.parse('2026-08-28T10:00:00.000Z'))).toBe(0)
  })
})
