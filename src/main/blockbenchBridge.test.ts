import { describe, expect, it } from 'vitest'
import type { BlockbenchAction } from '../shared/blockbench'
import { validateAction } from './blockbenchBridge'

describe('Blockbench production actions', () => {
  it('accepts groups, animation keyframes, and model export', () => {
    expect(validateAction({ type: 'add-group', name: 'body', origin: [0, 12, 0] })).toMatchObject({ type: 'add-group', name: 'body' })
    expect(validateAction({ type: 'add-animation', name: 'idle', length: 2, loop: 'loop', snapping: 20 })).toMatchObject({ type: 'add-animation', loop: 'loop' })
    expect(validateAction({
      type: 'add-keyframe', animationName: 'idle', groupName: 'body', channel: 'rotation',
      time: 1, value: [0, 5, 0], interpolation: 'linear'
    })).toMatchObject({ type: 'add-keyframe', channel: 'rotation' })
    expect(validateAction({ type: 'export-model', relativePath: 'src/main/resources/assets/example/models/entity/model.geo.json' }))
      .toMatchObject({ type: 'export-model' })
  })

  it('blocks export and save paths inside protected project directories', () => {
    expect(() => validateAction({ type: 'export-model', relativePath: '.git/model.json' } as BlockbenchAction)).toThrow(/safe project-relative/)
    expect(() => validateAction({ type: 'save-project', relativePath: '.modmind/model.bbmodel' })).toThrow(/safe project-relative/)
    expect(() => validateAction({ type: 'save-texture', relativePath: 'build/output.png', textureName: 'atlas' })).toThrow(/safe project-relative/)
  })
})
