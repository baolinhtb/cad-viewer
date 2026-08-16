import { AcDbDatabase } from '@mlightcad/data-model'

import { createDrawContext } from '../src/AcTpDrawContext'
import { SEED_ROLE_LAYERS } from '../src/AcTpSeed'
import {
  ensureSemanticTagRegApp,
  readSemanticTag
} from '../src/AcTpSemanticTag'

const TEMPLATE_ID = 'cau_ban_btct'

function createContext() {
  const db = new AcDbDatabase()
  ensureSemanticTagRegApp(db)
  return { db, ctx: createDrawContext(db, TEMPLATE_ID, SEED_ROLE_LAYERS) }
}

describe('createDrawContext', () => {
  test('everything it draws is tagged and lands on the role layer', () => {
    const { ctx } = createContext()

    const entity = ctx.line({
      role: 'ban_mat_cau',
      partId: 'bmc_01',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 12000, y: 0, z: 0 }
    })

    expect(readSemanticTag(entity)).toEqual({
      role: 'ban_mat_cau',
      partId: 'bmc_01',
      templateId: TEMPLATE_ID
    })
    expect(entity.layer).toBe(SEED_ROLE_LAYERS.ban_mat_cau)
  })

  test('the template id is stamped by the context, not by the template', () => {
    // A template cannot forget to record which template drew a part, because
    // it never gets to supply the value.
    const { ctx } = createContext()

    const entity = ctx.circle({
      role: 'ong_thoat_nuoc',
      partId: 'otn_01',
      center: { x: 0, y: 0, z: 0 },
      radius: 50
    })

    expect(readSemanticTag(entity)?.templateId).toBe(TEMPLATE_ID)
  })

  test('every primitive tags what it draws', () => {
    const { ctx } = createContext()

    const entities = [
      ctx.line({
        role: 'duong_tim',
        partId: 'tim_01',
        start: { x: 0, y: 0, z: 0 },
        end: { x: 1, y: 0, z: 0 }
      }),
      ctx.polyline({
        role: 'lan_can',
        partId: 'lc_01',
        points: [
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 1100, z: 0 },
          { x: 200, y: 1100, z: 0 }
        ]
      }),
      ctx.circle({
        role: 'ong_thoat_nuoc',
        partId: 'otn_02',
        center: { x: 5, y: 0, z: 0 },
        radius: 50
      }),
      ctx.arc({
        role: 'go_chan_banh',
        partId: 'gcb_01',
        center: { x: 1, y: 1, z: 0 },
        radius: 25,
        startAngle: 0,
        endAngle: Math.PI
      }),
      ctx.text({
        role: 'ghi_chu',
        partId: 'gc_01',
        position: { x: 0, y: 2000, z: 0 },
        text: 'MẶT CẮT NGANG'
      })
    ]

    for (const entity of entities) {
      expect(readSemanticTag(entity)).toBeDefined()
    }
  })

  test('a role with no layer mapping is refused, naming the role', () => {
    const { ctx } = createContext()

    expect(() =>
      ctx.line({
        role: 'chua_khai_bao',
        partId: 'x_01',
        start: { x: 0, y: 0, z: 0 },
        end: { x: 1, y: 0, z: 0 }
      })
    ).toThrow(/chua_khai_bao/)
  })

  test('an explicit layer overrides the role mapping', () => {
    const { ctx } = createContext()

    const entity = ctx.line({
      role: 'ban_mat_cau',
      partId: 'bmc_02',
      layer: 'LAYER-RIENG',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1, y: 0, z: 0 }
    })

    expect(entity.layer).toBe('LAYER-RIENG')
    expect(readSemanticTag(entity)?.role).toBe('ban_mat_cau')
  })

  test('drawn entities are recorded in drawing order', () => {
    const { ctx } = createContext()

    ctx.line({
      role: 'duong_tim',
      partId: 'a',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1, y: 0, z: 0 }
    })
    ctx.line({
      role: 'duong_tim',
      partId: 'b',
      start: { x: 0, y: 1, z: 0 },
      end: { x: 1, y: 1, z: 0 }
    })

    expect(ctx.drawn).toHaveLength(2)
    expect(ctx.drawn.map(e => readSemanticTag(e)?.partId)).toEqual(['a', 'b'])
  })

  test('entities reach model space, not just the local list', () => {
    const { db, ctx } = createContext()

    ctx.line({
      role: 'duong_tim',
      partId: 'tim_02',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1, y: 0, z: 0 }
    })

    const ids: (string | undefined)[] = []
    for (const entity of db.tables.blockTable.modelSpace.newIterator()) {
      ids.push(readSemanticTag(entity)?.partId)
    }
    expect(ids).toContain('tim_02')
  })
})

describe('layers the context draws on', () => {
  test('a layer an entity is placed on exists in the drawing', async () => {
    // Setting `entity.layer` records a name; it does not create the layer.
    // A drawing that references a missing layer still saves and still
    // round-trips, so only the renderer complains — with the entity dropped
    // and the drawing blank.
    const { AcDbDatabase } = await import('@mlightcad/data-model')
    const { createDrawContext } = await import('../src/AcTpDrawContext')
    const { SEED_ROLE_LAYERS } = await import('../src/AcTpSeed')

    const db = new AcDbDatabase()
    db.createDefaultData()
    const ctx = createDrawContext(db, 'cau_ban_btct', SEED_ROLE_LAYERS)

    ctx.line({
      role: 'ban_mat_cau',
      partId: 'ban_mat_cau',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 100, y: 0, z: 0 }
    })

    const missing = ctx.drawn
      .map(entity => entity.layer)
      .filter(name => !db.tables.layerTable.has(name))

    expect(missing).toEqual([])
  })
})
