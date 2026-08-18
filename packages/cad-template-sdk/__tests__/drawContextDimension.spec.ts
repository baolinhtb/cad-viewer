/**
 * Dimensions, because a bridge drawing without them is not a deliverable.
 *
 * The reference drawing an engineer sent — an abutment decomposed into named
 * layers — carries 19 dimensions against 94 entities. Nothing in the template
 * SDK or the agent's tool set could produce one, so everything generated so far
 * looked like a drawing and could not be issued as one.
 */
import { AcDbDatabase } from '@mlightcad/data-model'

import { createDrawContext } from '../src/AcTpDrawContext'
import { readSemanticTag } from '../src/AcTpSemanticTag'

const ROLE_LAYERS = { kich_thuoc: 'GC-KICHTHUOC', ban_mat_cau: 'KC-BAN' }

function ctxFor() {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return { db, ctx: createDrawContext(db, 'thu', ROLE_LAYERS) }
}

describe('ctx.dimension', () => {
  test('measures the horizontal span and tags it like any other part', () => {
    const { ctx } = ctxFor()
    const dim = ctx.dimension({
      role: 'kich_thuoc',
      partId: 'kich_thuoc_01',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 7700, y: 0, z: 0 },
      offset: 800
    })

    expect(dim.layer).toBe('GC-KICHTHUOC')
    // Untagged geometry cannot be edited by name afterwards — the whole point
    // of routing every stroke through the context.
    expect(readSemanticTag(dim)?.partId).toBe('kich_thuoc_01')
    expect((dim as unknown as { dimensionText: string }).dimensionText).toContain(
      '7700'
    )
  })

  test('a vertical chain measures height, not the diagonal', () => {
    // The distinction that matters on an elevation: two corners of a sloping
    // wall are 5000 apart along Y and 5099 apart in a straight line, and the
    // sheet wants the first.
    const { ctx } = ctxFor()
    const dim = ctx.dimension({
      role: 'kich_thuoc',
      partId: 'kich_thuoc_02',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1000, y: 5000, z: 0 },
      offset: 600,
      huong: 'dung'
    })
    expect((dim as unknown as { rotation: number }).rotation).toBeCloseTo(
      Math.PI / 2
    )
  })

  test('offset puts the dimension line clear of what it measures', () => {
    const { ctx } = ctxFor()
    const above = ctx.dimension({
      role: 'kich_thuoc',
      partId: 'a',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1000, y: 0, z: 0 },
      offset: 500
    }) as unknown as { dimLinePoint: { y: number } }
    const below = ctx.dimension({
      role: 'kich_thuoc',
      partId: 'b',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1000, y: 0, z: 0 },
      offset: -500
    }) as unknown as { dimLinePoint: { y: number } }

    expect(above.dimLinePoint.y).toBeCloseTo(500)
    expect(below.dimLinePoint.y).toBeCloseTo(-500)
  })

  test('a skew dimension offsets along the normal of what it measures', () => {
    const { ctx } = ctxFor()
    const dim = ctx.dimension({
      role: 'kich_thuoc',
      partId: 'c',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 0, y: 1000, z: 0 },
      offset: 300,
      huong: 'nghieng'
    }) as unknown as { dimLinePoint: { x: number; y: number } }

    // Measured line runs up Y, so its normal runs along −X.
    expect(dim.dimLinePoint.x).toBeCloseTo(-300)
    expect(dim.dimLinePoint.y).toBeCloseTo(500)
  })

  test('refuses a skew dimension between coincident points', () => {
    // No normal exists, and the alternative is a NaN that surfaces much later.
    const { ctx } = ctxFor()
    expect(() =>
      ctx.dimension({
        role: 'kich_thuoc',
        partId: 'd',
        start: { x: 10, y: 10, z: 0 },
        end: { x: 10, y: 10, z: 0 },
        offset: 100,
        huong: 'nghieng'
      })
    ).toThrow(/trùng nhau/)
  })

  test('an explicit text overrides the measured value', () => {
    const { ctx } = ctxFor()
    const dim = ctx.dimension({
      role: 'kich_thuoc',
      partId: 'e',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1000, y: 0, z: 0 },
      offset: 200,
      text: 'THAY ĐỔI'
    }) as unknown as { dimensionText: string }
    expect(dim.dimensionText).toBe('THAY ĐỔI')
  })

  test('the drawing it produces carries no non-finite number', () => {
    // Tool results travel into the chat history, where NaN is fatal a turn
    // later — the failure that has already cost two sessions.
    const { ctx } = ctxFor()
    const dim = ctx.dimension({
      role: 'kich_thuoc',
      partId: 'f',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 2500, y: 0, z: 0 },
      offset: 400
    })
    const box = dim.geometricExtents
    for (const v of [box.min.x, box.min.y, box.max.x, box.max.y]) {
      expect(Number.isFinite(v)).toBe(true)
    }
  })
})
