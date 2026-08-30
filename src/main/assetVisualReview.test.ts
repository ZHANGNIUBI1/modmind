import sharp from 'sharp'
import {describe, expect, it} from 'vitest'
import type {BlockbenchCaptureFrame} from '../shared/blockbench'
import {reviewAssetCaptures} from './assetVisualReview'

async function capture(view: BlockbenchCaptureFrame['view'], foreground: boolean): Promise<BlockbenchCaptureFrame> {
  let image = sharp({create: {width: 160, height: 160, channels: 4, background: '#ededed'}})
  if (foreground) image = image.composite([{input: Buffer.from('<svg width="70" height="100"><path d="M35 0 L70 30 L56 100 L14 100 L0 30 Z" fill="#333333" stroke="#d59b31" stroke-width="5"/></svg>'), left: 45, top: 28}])
  const png = await image.png().toBuffer()
  return {view, width: 160, height: 160, dataUrl: `data:image/png;base64,${png.toString('base64')}`}
}

describe('asset visual review', () => {
  it('scores multi-view framing, contrast, edges, symmetry, and consistency', async () => {
    const review = await reviewAssetCaptures(await Promise.all([capture('isometric_right', true), capture('north', true), capture('west', true)]))
    expect(review.score).toBeGreaterThan(55)
    expect(review.metrics.contrast).toBeGreaterThan(0.2)
    expect(review.metrics.symmetry).toBeGreaterThan(0.8)
    expect(review.metrics.viewConsistency).toBeGreaterThan(0.9)
  })

  it('flags a blank, low-detail capture', async () => {
    const review = await reviewAssetCaptures([await capture('north', false)])
    expect(review.score).toBeLessThan(50)
    expect(review.findings.map((finding) => finding.checkId)).toEqual(expect.arrayContaining(['low-occupancy', 'low-detail']))
  })
})
