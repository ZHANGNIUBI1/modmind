import { describe, expect, it } from 'vitest'
import { BEGINNER_AGENT_WORKFLOW_GUIDANCE } from './beginnerAgentPolicy'

describe('beginner agent workflow guidance', () => {
  it('encourages autonomous work without adding permission restrictions', () => {
    expect(BEGINNER_AGENT_WORKFLOW_GUIDANCE).toContain('Take ownership')
    expect(BEGINNER_AGENT_WORKFLOW_GUIDANCE).toContain('bundled Minecraft skills')
    expect(BEGINNER_AGENT_WORKFLOW_GUIDANCE).not.toMatch(/refuse|approval|outside the project|Never offer/i)
  })
})
