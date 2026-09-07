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

describe('colour: the layer catalogue decides, the template may override', () => {
  async function setup(styles: Record<string, { color?: number | null }> = {}) {
    const { AcDbDatabase, AcCmColor, AcCmColorMethod, AcDbLayerTableRecord } =
      await import('@mlightcad/data-model')
    const { createDrawContext } = await import('../src/AcTpDrawContext')
    const { SEED_ROLE_LAYERS } = await import('../src/AcTpSeed')
    const db = new AcDbDatabase()
    db.createDefaultData()
    const ctx = createDrawContext(db, 'cau_ban_btct', SEED_ROLE_LAYERS, undefined, styles)
    return { db, ctx, AcCmColor, AcCmColorMethod, AcDbLayerTableRecord }
  }
  const line = (ctx: import('../src/AcTpDrawContext').AcTpDrawContext, extra = {}) =>
    ctx.line({
      role: 'ban_mat_cau',
      partId: 'ban_mat_cau',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 100, y: 0, z: 0 },
      ...extra
    })

  test('a layer the context creates takes the colour the catalogue gives it', async () => {
    // The office's own drawings carry grey (ACI 8) structure layers; a
    // template drawing white on them was the one visible difference between
    // "the engineer's file" and "the template's output".
    const { db, ctx } = await setup({ 'KC-BAN': { color: 8 } })
    line(ctx)
    expect(db.tables.layerTable.getAt('KC-BAN')!.color.colorIndex).toBe(8)
    // The entity itself stays ByLayer: colour is the layer's business.
    expect(ctx.drawn[0].color.colorIndex).toBe(256)
  })

  test('catalogue names match the layer case-insensitively, as AutoCAD does', async () => {
    const { db, ctx } = await setup({ 'kc-ban': { color: 3 } })
    line(ctx)
    expect(db.tables.layerTable.getAt('KC-BAN')!.color.colorIndex).toBe(3)
  })

  test('a layer with no catalogue colour is white, as before', async () => {
    const { db, ctx } = await setup({ 'KC-BAN': { color: null } })
    line(ctx)
    expect(db.tables.layerTable.getAt('KC-BAN')!.color.colorIndex).toBe(7)
  })

  test('a layer the drawing already has keeps its own colour', async () => {
    // The engineer's file outranks the office default: recolouring a layer
    // they set up would change every entity already on it.
    const { db, ctx, AcCmColor, AcCmColorMethod, AcDbLayerTableRecord } = await setup({
      'KC-BAN': { color: 8 }
    })
    db.tables.layerTable.add(
      new AcDbLayerTableRecord({
        name: 'KC-BAN',
        isOff: false,
        color: new AcCmColor(AcCmColorMethod.ByACI, 5),
        isPlottable: true
      })
    )
    line(ctx)
    expect(db.tables.layerTable.getAt('KC-BAN')!.color.colorIndex).toBe(5)
  })

  test('a template may give one entity its own ACI colour', async () => {
    const { ctx } = await setup({ 'KC-BAN': { color: 8 } })
    line(ctx, { color: 1 })
    expect(ctx.drawn[0].color.colorIndex).toBe(1)
  })

  test.each([0, 256, 3.5, -1])('colour %p is refused, not clamped', async bad => {
    const { ctx } = await setup()
    expect(() => line(ctx, { color: bad })).toThrow(/ACI/)
  })

  test('a catalogue colour outside the ACI range is refused too', async () => {
    const { ctx } = await setup({ 'KC-BAN': { color: 999 } })
    expect(() => line(ctx)).toThrow(/KC-BAN/)
  })
})

describe('text style: TrueType by default, so Vietnamese renders', () => {
  async function setup() {
    const { AcDbDatabase, AcDbTextStyleTableRecord } = await import('@mlightcad/data-model')
    const { createDrawContext, TEMPLATE_TEXT_STYLE } = await import('../src/AcTpDrawContext')
    const { SEED_ROLE_LAYERS } = await import('../src/AcTpSeed')
    const db = new AcDbDatabase()
    db.createDefaultData()
    const ctx = createDrawContext(db, 'cau_ban_btct', SEED_ROLE_LAYERS)
    return { db, ctx, AcDbTextStyleTableRecord, TEMPLATE_TEXT_STYLE }
  }
  const text = (ctx: import('../src/AcTpDrawContext').AcTpDrawContext, extra = {}) =>
    ctx.text({
      role: 'ghi_chu',
      partId: 'ghi_chu_01',
      position: { x: 0, y: 0, z: 0 },
      text: 'MẶT CHÍNH MỐ M1',
      height: 250,
      ...extra
    })

  test('a text gets the Arial style, created with the AutoCAD font file name', async () => {
    const { db, ctx, TEMPLATE_TEXT_STYLE } = await setup()
    const entity = text(ctx) as import('@mlightcad/data-model').AcDbText
    expect(TEMPLATE_TEXT_STYLE).toBe('Arial')
    expect(entity.styleName).toBe('Arial')
    const style = db.tables.textStyleTable.getAt('Arial')!
    expect(style.fileName).toBe('arial') // bản ghi bỏ đuôi tệp; DXF vẫn ghi arial.ttf
    // Created once; a second text reuses it.
    text(ctx, { partId: 'ghi_chu_02' })
    expect([...db.tables.textStyleTable.newIterator()].filter(s => s.name === 'Arial')).toHaveLength(1)
  })

  test('a style the drawing already has is kept, font and all', async () => {
    const { db, ctx, AcDbTextStyleTableRecord } = await setup()
    db.tables.textStyleTable.add(
      new AcDbTextStyleTableRecord({
        name: 'Arial',
        standardFlag: 0,
        fixedTextHeight: 0,
        widthFactor: 0.8,
        obliqueAngle: 0,
        textGenerationFlag: 0,
        lastHeight: 2.5,
        font: 'ARIALN.TTF',
        bigFont: ''
      })
    )
    text(ctx)
    expect(db.tables.textStyleTable.getAt('Arial')!.fileName).toBe('ARIALN')
  })

  test('a template may name a style the drawing defines', async () => {
    const { db, ctx, AcDbTextStyleTableRecord } = await setup()
    db.tables.textStyleTable.add(
      new AcDbTextStyleTableRecord({ name: 'KT', font: 'VNARIALH.TTF', bigFont: '' })
    )
    const entity = text(ctx, { style: 'KT' }) as import('@mlightcad/data-model').AcDbText
    expect(entity.styleName).toBe('KT')
  })

  test('an unknown style is refused, not silently replaced by Standard', async () => {
    const { ctx } = await setup()
    expect(() => text(ctx, { style: 'VnTime' })).toThrow(/VnTime/)
  })
})

describe('dimension style: numbers an engineer can read', () => {
  async function setup() {
    const { AcDbDatabase, AcDbMText, AcDbBlockReference } = await import('@mlightcad/data-model')
    const { createDrawContext } = await import('../src/AcTpDrawContext')
    const { SEED_ROLE_LAYERS } = await import('../src/AcTpSeed')
    const db = new AcDbDatabase()
    db.createDefaultData()
    const ctx = createDrawContext(db, 'cau_ban_btct', SEED_ROLE_LAYERS)
    return { db, ctx, AcDbMText, AcDbBlockReference }
  }
  const dim = (
    ctx: import('../src/AcTpDrawContext').AcTpDrawContext,
    extra: Partial<import('../src/AcTpDrawContext').AcTpDimensionArgs> = {}
  ) =>
    ctx.dimension({
      role: 'kich_thuoc',
      partId: 'kich_thuoc_01',
      start: { x: -3850, y: 100, z: 0 },
      end: { x: 3850, y: 100, z: 0 },
      offset: -1994.835,
      huong: 'ngang',
      ...extra
    })
  const blockOf = (db: import('@mlightcad/data-model').AcDbDatabase, entity: unknown) => {
    const name = (entity as { dimBlockId: string }).dimBlockId
    return db.tables.blockTable.getAt(name)!
  }

  test('the engineer\'s D100 style is created and drives text, colour and arrows', async () => {
    const { db, ctx, AcDbMText, AcDbBlockReference } = await setup()
    const entity = dim(ctx) as import('@mlightcad/data-model').AcDbRotatedDimension
    expect(entity.dimensionStyleName).toBe('D100')
    const style = db.tables.dimStyleTable.getAt('D100')!
    expect(style.dimtxt).toBe(150)
    expect(style.dimtxsty).toBe('Arial')
    // Whole millimetres, as the sheet reads: 7700, not 7700.000.
    expect(entity.dimensionText).toBe('7700')
    const block = blockOf(db, entity)
    const texts = [...block.newIterator()].filter(e => e instanceof AcDbMText) as InstanceType<typeof AcDbMText>[]
    expect(texts).toHaveLength(1)
    expect(texts[0].height).toBe(150)
    expect(texts[0].color.colorIndex).toBe(3)
    // Above the line (DIMTAD 1): lifted half a text height plus the gap.
    expect(texts[0].location.y).toBeCloseTo(100 - 1994.835 + 75 + 60, 3)
    const arrows = [...block.newIterator()].filter(e => e instanceof AcDbBlockReference) as InstanceType<typeof AcDbBlockReference>[]
    expect(arrows).toHaveLength(2)
    expect(arrows.every(a => a.scaleFactors.x === 130)).toBe(true)
  })

  test('a vertical chain measures height even when its ends sit at different x', async () => {
    // H3B in the abutment drawing runs from the stem's top corner to the
    // shoulder's inner corner — 350 apart horizontally. The sheet reads 1811.
    const { ctx } = await setup()
    const entity = dim(ctx, {
      start: { x: 3850, y: 6893.385, z: 0 },
      end: { x: 3500, y: 8704.595, z: 0 },
      offset: 1383.844,
      huong: 'dung'
    }) as import('@mlightcad/data-model').AcDbRotatedDimension
    expect(entity.dimensionText).toBe('1811')
  })

  test('a vertical dimension lifts its text to the left, where AutoCAD reads it', async () => {
    const { db, ctx, AcDbMText } = await setup()
    const entity = dim(ctx, {
      start: { x: 0, y: 100, z: 0 },
      end: { x: 0, y: 2100, z: 0 },
      offset: -295.407,
      huong: 'dung'
    })
    const text = [...blockOf(db, entity).newIterator()].find(e => e instanceof AcDbMText) as InstanceType<typeof AcDbMText>
    expect(text.location.x).toBeCloseTo(-295.407 - 135, 3)
  })

  test('a fresh drawing rounds like the sheet; decimals only if the style asks', async () => {
    const { formatDimensionText } = await import('../src/AcTpDimensionBlock')
    expect(formatDimensionText(4793.385, { dimrnd: 1, dimdec: 2, dimzin: 8, dimlfac: 1 })).toBe('4793')
    expect(formatDimensionText(4793.385, { dimrnd: 0, dimdec: 2, dimzin: 8, dimlfac: 1 })).toBe('4793.39')
    expect(formatDimensionText(4793.5, { dimrnd: 0, dimdec: 2, dimzin: 0, dimlfac: 1 })).toBe('4793.50')
    expect(formatDimensionText(1000, { dimrnd: 0, dimdec: 3, dimzin: 8, dimlfac: 0.001 })).toBe('1')
  })

  test('an unknown dimension style is refused', async () => {
    const { ctx } = await setup()
    expect(() => dim(ctx, { dimStyle: 'Dim1-50' })).toThrow(/Dim1-50/)
  })
})

describe('linetypes: the office definitions, sized for the drawing', () => {
  async function setup(ltscale?: number) {
    const { AcDbDatabase } = await import('@mlightcad/data-model')
    const { createDrawContext } = await import('../src/AcTpDrawContext')
    const { SEED_ROLE_LAYERS } = await import('../src/AcTpSeed')
    const db = new AcDbDatabase()
    db.createDefaultData()
    if (ltscale !== undefined) (db as unknown as { ltscale: number }).ltscale = ltscale
    const ctx = createDrawContext(db, 'cau_ban_btct', SEED_ROLE_LAYERS)
    return { db, ctx }
  }
  const line = (ctx: import('../src/AcTpDrawContext').AcTpDrawContext, extra = {}) =>
    ctx.line({
      role: 'duong_tim',
      partId: 'duong_tim_01',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 0, y: 9000, z: 0 },
      ...extra
    })

  test('CENTER is created at LTSCALE 1 with dashes that read at 1:100', async () => {
    const { db, ctx } = await setup()
    const entity = line(ctx, { lineType: 'CENTER' })
    expect(entity.lineType).toBe('CENTER')
    const record = db.tables.linetypeTable.getAt('CENTER')!
    // 1.25 × 300: the same 375 mm dash the engineer's file shows at LTSCALE 300.
    expect(record.patternLength).toBeCloseTo(2 * 300, 6)
    expect(record.linetype.pattern![0].elementLength).toBeCloseTo(375, 6)
  })

  test('in the office\'s own drawing (LTSCALE 300) the definition stays AutoCAD\'s', async () => {
    const { db, ctx } = await setup(300)
    line(ctx, { lineType: 'DASHED' })
    expect(db.tables.linetypeTable.getAt('DASHED')!.patternLength).toBeCloseTo(0.75, 6)
  })

  test('a linetype the drawing already defines is used as is', async () => {
    const { AcDbLinetypeTableRecord } = await import('@mlightcad/data-model')
    const { db, ctx } = await setup()
    db.tables.linetypeTable.add(
      new AcDbLinetypeTableRecord({
        name: 'CENTER',
        standardFlag: 0,
        description: 'của bản vẽ',
        totalPatternLength: 2,
        pattern: [{ elementLength: 1.25, elementTypeFlag: 0 }, { elementLength: -0.75, elementTypeFlag: 0 }]
      })
    )
    line(ctx, { lineType: 'CENTER' })
    expect(db.tables.linetypeTable.getAt('CENTER')!.comments).toBe('của bản vẽ')
  })

  test('an unknown linetype is refused', async () => {
    const { ctx } = await setup()
    expect(() => line(ctx, { lineType: 'PHANTOM' })).toThrow(/PHANTOM/)
  })
})

describe('leaders: a line with an arrowhead at the thing it points to', () => {
  test('draws the line and a solid arrow of the dimension style size', async () => {
    const { AcDbDatabase } = await import('@mlightcad/data-model')
    const { createDrawContext } = await import('../src/AcTpDrawContext')
    const { SEED_ROLE_LAYERS } = await import('../src/AcTpSeed')
    const db = new AcDbDatabase()
    db.createDefaultData()
    const ctx = createDrawContext(db, 'cau_ban_btct', SEED_ROLE_LAYERS)
    const line = ctx.leader({
      role: 'ghi_chu',
      partId: 'ghi_chu_01',
      color: 3,
      points: [
        { x: 450, y: 40, z: 0 },
        { x: 913, y: 781, z: 0 },
        { x: 2865, y: 781, z: 0 }
      ]
    })
    expect(line.dxfTypeName).toBe('LWPOLYLINE')
    expect(ctx.drawn).toHaveLength(2)
    const arrow = ctx.drawn[1]
    expect(arrow.dxfTypeName).toBe('HATCH')
    expect(arrow.color.colorIndex).toBe(3)
    const box = arrow.geometricExtents
    // Tip at the first point, pointing up-right along the first segment: the
    // tip is the triangle's lowest-leftmost corner and nothing reaches beyond
    // an arrow length from it.
    expect(box.min.x).toBeCloseTo(450, 0)
    expect(box.min.y).toBeCloseTo(40, 0)
    // 130 long along a 58° segment: about 69 wide and 110 tall, plus the
    // half-width of the base; never more than the arrow length either way.
    expect(box.max.x - box.min.x).toBeGreaterThan(60)
    expect(box.max.x - box.min.x).toBeLessThanOrEqual(130)
    expect(box.max.y - box.min.y).toBeGreaterThan(100)
    expect(box.max.y - box.min.y).toBeLessThanOrEqual(130)
  })

  test('a leader needs a direction', async () => {
    const { AcDbDatabase } = await import('@mlightcad/data-model')
    const { createDrawContext } = await import('../src/AcTpDrawContext')
    const { SEED_ROLE_LAYERS } = await import('../src/AcTpSeed')
    const db = new AcDbDatabase()
    db.createDefaultData()
    const ctx = createDrawContext(db, 'cau_ban_btct', SEED_ROLE_LAYERS)
    expect(() =>
      ctx.leader({ role: 'ghi_chu', partId: 'x', points: [{ x: 0, y: 0, z: 0 }] })
    ).toThrow(/2 điểm/)
  })
})
