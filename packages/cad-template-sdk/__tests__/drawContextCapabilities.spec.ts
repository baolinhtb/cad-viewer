import {
  AcDbAttribute,
  AcDbAttributeDefinition,
  AcDbBlockReference,
  AcDbDatabase,
  AcDbDimension,
  AcDbEntity,
  AcDbFileType,
  AcDbHatch,
  AcDbLeader,
  AcDbPoint,
  AcDbPolyline,
  AcDbText
} from '@mlightcad/data-model'

import { createDrawContext } from '../src/AcTpDrawContext'
import { acTpDxfOut } from '../src/AcTpDxfOut'
import { ACTP_DIM_STYLES_33, ACTP_TEXT_STYLES_33 } from '../src/AcTpStyles33'

const ROLES = { net: 'TEST-NET', ghi_chu: 'TEST-CHU', ky_hieu: 'TEST-KH' }

const setup = () => {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return { db, ctx: createDrawContext(db, 'test', ROLES) }
}

/** Writes the drawing to DXF and reads it back, as a saved file would be. */
const roundTrip = async (db: AcDbDatabase): Promise<AcDbDatabase> => {
  const again = new AcDbDatabase()
  await again.read(
    new TextEncoder().encode(acTpDxfOut(db) as string).buffer as ArrayBuffer,
    { readOnly: false },
    AcDbFileType.DXF
  )
  return again
}

const modelEntities = (db: AcDbDatabase): AcDbEntity[] => [
  ...db.tables.blockTable.modelSpace.newIterator()
]

const ofType = <T extends AcDbEntity>(db: AcDbDatabase, type: string): T[] =>
  modelEntities(db).filter(e => e.dxfTypeName === type) as T[]

describe('lineweight và tỉ lệ kiểu nét theo đối tượng', () => {
  it('đặt và giữ qua DXF', async () => {
    const { db, ctx } = setup()
    ctx.line({
      role: 'net',
      partId: 'tim',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 100, y: 0, z: 0 },
      lineType: 'CENTER2',
      lineWeight: 35,
      linetypeScale: 0.5
    })
    const [line] = ofType(await roundTrip(db), 'LINE')
    expect(line.lineWeight).toBe(35)
    expect(line.linetypeScale).toBeCloseTo(0.5)
    expect(line.lineType).toBe('CENTER2')
  })

  it('không đặt thì giữ như cũ (ByLayer, tỉ lệ 1)', () => {
    const { ctx } = setup()
    const line = ctx.line({
      role: 'net',
      partId: 'l',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1, y: 0, z: 0 }
    })
    expect(line.lineWeight).toBe(-1)
    expect(line.linetypeScale).toBe(1)
  })

  it('từ chối lineweight không phải giá trị AutoCAD và tỉ lệ không dương', () => {
    const { ctx } = setup()
    const base = {
      role: 'net',
      partId: 'l',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1, y: 0, z: 0 }
    }
    expect(() => ctx.line({ ...base, lineWeight: 33 })).toThrow(/lineweight 33/)
    expect(() => ctx.line({ ...base, linetypeScale: 0 })).toThrow(/phải dương/)
  })
})

describe('polyline có bulge', () => {
  it('giữ bulge từng đỉnh qua DXF', async () => {
    const { db, ctx } = setup()
    ctx.polyline({
      role: 'net',
      partId: 'cung',
      points: [
        { x: 0, y: 0, z: 0, bulge: 1 },
        { x: 100, y: 0, z: 0 },
        { x: 100, y: 50, z: 0, bulge: -0.5 },
        { x: 0, y: 50, z: 0 }
      ],
      closed: true
    })
    const [pl] = ofType<AcDbPolyline>(await roundTrip(db), 'LWPOLYLINE')
    expect(pl.numberOfVertices).toBe(4)
    // data-model không có getter bulge công khai; đọc đỉnh của hình học.
    const vertices = (
      pl as unknown as { _geo: { vertices: { bulge?: number }[] } }
    )._geo.vertices
    expect(vertices.map(v => v.bulge ?? 0)).toEqual([1, 0, -0.5, 0])
    expect(pl.closed).toBe(true)
  })
})

describe('kiểu chữ _33_', () => {
  it('tạo từ danh mục với font và hệ số rộng, giữ qua DXF', async () => {
    const { db, ctx } = setup()
    ctx.text({
      role: 'ghi_chu',
      partId: 't',
      position: { x: 0, y: 0, z: 0 },
      text: 'MỐ M1',
      height: 250,
      style: '_33_Arial08'
    })
    const again = await roundTrip(db)
    const style = again.tables.textStyleTable.getAt('_33_Arial08')
    expect(style?.xScale).toBeCloseTo(0.8)
    // AutoCAD cần đuôi .ttf ở nhóm 3, không thì tìm arial.shx.
    expect(acTpDxfOut(db)).toMatch(
      /\n2\n_33_Arial08\n(?:.*\n)*?3\narial\.ttf\n/
    )
    const [text] = ofType<AcDbText>(again, 'TEXT')
    expect(text.styleName).toBe('_33_Arial08')
    expect(text.textString).toBe('MỐ M1')
  })

  it('đủ 5 kiểu trong danh mục', () => {
    expect(Object.keys(ACTP_TEXT_STYLES_33).sort()).toEqual([
      '_33_Arial',
      '_33_Arial08',
      '_33_ArialHep',
      '_33_Avant',
      '_33_Txt'
    ])
  })

  it('defineTextStyle tạo một lần; kiểu của bản vẽ thắng', () => {
    const { db, ctx } = setup()
    expect(
      ctx.defineTextStyle({
        name: 'RIENG',
        font: 'arialn.ttf',
        widthFactor: 0.7
      })
    ).toBe('RIENG')
    ctx.defineTextStyle({ name: 'RIENG', font: 'arial.ttf', widthFactor: 1 })
    const style = db.tables.textStyleTable.getAt('RIENG')
    expect(style?.xScale).toBeCloseTo(0.7)
    expect(style?.getAttr('extendedFont')).toBe('arialn.ttf')
  })
})

describe('kiểu kích thước _33_', () => {
  it('_33_D100 đủ biến, giữ qua DXF', async () => {
    const { db, ctx } = setup()
    ctx.dimension({
      role: 'net',
      partId: 'd',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1000, y: 0, z: 0 },
      offset: 500,
      dimStyle: '_33_D100'
    })
    const again = await roundTrip(db)
    const style = again.tables.dimStyleTable.getAt('_33_D100')!
    const want = ACTP_DIM_STYLES_33._33_D100
    for (const key of [
      'dimtxt',
      'dimasz',
      'dimexo',
      'dimexe',
      'dimdli',
      'dimdle',
      'dimgap',
      'dimtad',
      'dimdec',
      'dimzin',
      'dimclrd',
      'dimclre',
      'dimclrt'
    ] as const) {
      expect([key, style[key]]).toEqual([key, want[key]])
    }
    // Bộ đọc giữ DIMTXSTY là handle của kiểu chữ.
    const textStyle = [...again.tables.textStyleTable.newIterator()].find(
      t => t.objectId === style.dimtxsty || t.name === style.dimtxsty
    )
    expect(textStyle?.name).toBe('_33_Arial')
    const [dim] = ofType<AcDbDimension>(again, 'DIMENSION')
    expect(dim.dimensionStyleName).toBe('_33_D100')
  })

  it('đủ 6 kiểu trong danh mục', () => {
    expect(Object.keys(ACTP_DIM_STYLES_33).sort()).toEqual([
      '_33_D1',
      '_33_D100',
      '_33_D125',
      '_33_D150',
      '_33_D1Sagi',
      '_33_Dim100'
    ])
  })

  it('defineDimStyle tạo kiểu riêng của template', () => {
    const { db, ctx } = setup()
    ctx.defineDimStyle({ name: 'KT_RIENG', dimtxt: 300, dimclrt: 2 })
    const style = db.tables.dimStyleTable.getAt('KT_RIENG')
    expect(style?.dimtxt).toBe(300)
    expect(style?.dimclrt).toBe(2)
  })
})

describe('ctx.dimension: chữ ghi đè và ghi đè biến', () => {
  it('<> trong chữ là số đo', async () => {
    const { db, ctx } = setup()
    ctx.dimension({
      role: 'net',
      partId: 'd',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1500, y: 0, z: 0 },
      offset: 500,
      dimStyle: '_33_D100',
      text: '2x<>'
    })
    ctx.dimension({
      role: 'net',
      partId: 'd2',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1500, y: 0, z: 0 },
      offset: 900,
      dimStyle: '_33_D100',
      text: 'L'
    })
    const dims = ofType<AcDbDimension>(await roundTrip(db), 'DIMENSION')
    expect(dims.map(d => d.dimensionText)).toEqual(['2x1500', 'L'])
  })

  it('ghi đè biến sinh kiểu dẫn xuất dùng chung, giữ qua DXF', async () => {
    const { db, ctx } = setup()
    const draw = (partId: string, offset: number) =>
      ctx.dimension({
        role: 'net',
        partId,
        start: { x: 0, y: 0, z: 0 },
        end: { x: 1000, y: 0, z: 0 },
        offset,
        dimStyle: '_33_D150',
        overrides: { dimexe: 100, dimclrt: 1 }
      }) as AcDbDimension
    const a = draw('a', 300)
    const b = draw('b', 600)
    expect(a.dimensionStyleName).toBe(b.dimensionStyleName)
    expect(a.dimensionStyleName).toMatch(/^_33_D150\$[0-9A-F]+$/)

    const again = await roundTrip(db)
    const style = again.tables.dimStyleTable.getAt(a.dimensionStyleName!)!
    expect(style.dimexe).toBe(100)
    expect(style.dimclrt).toBe(1)
    // Biến không ghi đè lấy của kiểu gốc.
    expect(style.dimtxt).toBe(150)
    expect(style.dimdli).toBe(300)
    // Kiểu gốc không bị đổi.
    expect(again.tables.dimStyleTable.getAt('_33_D150')!.dimexe).toBe(200)
  })
})

describe('hatch có mẫu', () => {
  it('ANSI37 tỉ lệ và góc giữ qua DXF', async () => {
    const { db, ctx } = setup()
    ctx.hatch({
      role: 'net',
      partId: 'h',
      boundary: [
        { x: 0, y: 0, z: 0 },
        { x: 1000, y: 0, z: 0 },
        { x: 1000, y: 500, z: 0 },
        { x: 0, y: 500, z: 0 }
      ],
      patternName: 'ANSI37',
      patternScale: 1000,
      patternAngleDeg: 45
    })
    const [hatch] = ofType<AcDbHatch>(await roundTrip(db), 'HATCH')
    expect(hatch.patternName).toBe('ANSI37')
    expect(hatch.patternScale).toBe(1000)
    expect(hatch.patternAngle).toBeCloseTo(Math.PI / 4)
    expect(hatch.isSolidFill).toBe(false)
  })
})

describe('block có attribute', () => {
  const defineTag = (ctx: ReturnType<typeof setup>['ctx']) =>
    ctx.defineBlock({
      name: 'CD_TEST',
      entities: [
        {
          kind: 'polyline',
          points: [
            { x: 0, y: 0, z: 0 },
            { x: -1, y: 1, z: 0 },
            { x: 1, y: 1, z: 0 }
          ],
          closed: true
        },
        {
          kind: 'line',
          start: { x: 0, y: 1, z: 0 },
          end: { x: 5, y: 1, z: 0 }
        },
        {
          kind: 'attribute',
          tag: 'ELEV',
          prompt: 'Cao độ',
          defaultValue: '+0.00',
          position: { x: 1, y: 1.5, z: 0 },
          height: 1.5,
          style: '_33_Arial'
        }
      ]
    })

  it('định nghĩa một lần, thực thể ByBlock trên layer 0', () => {
    const { db, ctx } = setup()
    expect(defineTag(ctx)).toBe('CD_TEST')
    defineTag(ctx)
    const record = db.tables.blockTable.getAt('CD_TEST')!
    const entities = [...record.newIterator()]
    expect(entities).toHaveLength(3)
    expect(entities.every(e => e.layer === '0')).toBe(true)
    expect(entities[0].color.isByBlock).toBe(true)
    expect(entities[2]).toBeInstanceOf(AcDbAttributeDefinition)
    expect((entities[2] as AcDbAttributeDefinition).tag).toBe('ELEV')
  })

  it('chèn: giá trị, mặc định, vị trí thế giới, giữ qua DXF', async () => {
    const { db, ctx } = setup()
    defineTag(ctx)
    ctx.insert({
      role: 'ky_hieu',
      partId: 'cd/day-be',
      block: 'CD_TEST',
      position: { x: 1000, y: 2000, z: 0 },
      scale: 100,
      rotationDeg: 90,
      attributes: { ELEV: '+2.35' }
    })
    ctx.insert({
      role: 'ky_hieu',
      partId: 'cd/mat',
      block: 'CD_TEST',
      position: { x: 0, y: 0, z: 0 },
      scale: { x: -100, y: 100 }
    })
    const inserts = ofType<AcDbBlockReference>(await roundTrip(db), 'INSERT')
    expect(inserts).toHaveLength(2)
    expect(inserts[0].blockTableRecord?.name).toBe('CD_TEST')
    expect(inserts[0].layer).toBe('TEST-KH')
    expect(inserts[0].scaleFactors.x).toBe(100)
    expect(inserts[0].rotation).toBeCloseTo(Math.PI / 2)
    expect(inserts[1].scaleFactors.x).toBe(-100)

    const attrs = inserts.map(
      i => [...i.attributeIterator()] as AcDbAttribute[]
    )
    expect(attrs[0].map(a => [a.tag, a.textString])).toEqual([
      ['ELEV', '+2.35']
    ])
    expect(attrs[1][0].textString).toBe('+0.00')
    // (1, 1.5) ×100 quay 90° quanh (1000, 2000) → (850, 2100).
    expect(attrs[0][0].position.x).toBeCloseTo(850)
    expect(attrs[0][0].position.y).toBeCloseTo(2100)
    expect(attrs[0][0].height).toBeCloseTo(150)
    expect(attrs[0][0].layer).toBe('TEST-KH')
  })

  it('chèn block chưa định nghĩa thì báo lỗi', () => {
    const { ctx } = setup()
    expect(() =>
      ctx.insert({
        role: 'ky_hieu',
        partId: 'x',
        block: 'KHONG_CO',
        position: { x: 0, y: 0, z: 0 }
      })
    ).toThrow(/chưa được định nghĩa/)
  })
})

describe('leader', () => {
  it('native: thực thể LEADER có mũi tên và kiểu kích thước, giữ qua DXF', async () => {
    const { db, ctx } = setup()
    ctx.leader({
      role: 'ghi_chu',
      partId: 'ld',
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 300, y: 300, z: 0 },
        { x: 800, y: 300, z: 0 }
      ],
      native: true,
      dimStyle: '_33_Dim100'
    })
    const again = await roundTrip(db)
    const [leader] = ofType<AcDbLeader>(again, 'LEADER')
    expect(leader.numVertices).toBe(3)
    expect(leader.hasArrowHead).toBe(true)
    expect(leader.dimensionStyle).toBe('_33_Dim100')
    expect(leader.layer).toBe('TEST-CHU')
  })

  it('mặc định vẫn là polyline như trước', () => {
    const { db, ctx } = setup()
    ctx.leader({
      role: 'ghi_chu',
      partId: 'ld',
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 300, y: 300, z: 0 }
      ]
    })
    expect(ofType(db, 'LEADER')).toHaveLength(0)
  })
})

describe('acTpDxfOut: vòng tránh bộ ghi DXF của data-model', () => {
  const draw = () => {
    const { db, ctx } = setup()
    ctx.line({
      role: 'net',
      partId: 'l',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1, y: 0, z: 0 },
      lineWeight: 50
    })
    ctx.dimension({
      role: 'net',
      partId: 'd',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1000, y: 0, z: 0 },
      offset: 500,
      dimStyle: '_33_D100'
    })
    return db
  }
  const read = async (dxf: string) => {
    const again = new AcDbDatabase()
    await again.read(
      new TextEncoder().encode(dxf).buffer as ArrayBuffer,
      { readOnly: false },
      AcDbFileType.DXF
    )
    return again
  }

  it('dxfOut thuần làm mất lineweight và màu kiểu kích thước (ghi nhận giới hạn)', async () => {
    const again = await read(draw().dxfOut() as string)
    expect(ofType(again, 'LINE')[0].lineWeight).not.toBe(50)
    expect(again.tables.dimStyleTable.getAt('_33_D100')!.dimclrt).not.toBe(3)
  })

  it('acTpDxfOut giữ cả hai và không thêm trùng nhóm', async () => {
    const dxf = acTpDxfOut(draw()) as string
    expect(acTpDxfOut(draw())).toBe(dxf)
    const again = await read(dxf)
    expect(ofType(again, 'LINE')[0].lineWeight).toBe(50)
    const style = again.tables.dimStyleTable.getAt('_33_D100')!
    expect([style.dimclrd, style.dimclre, style.dimclrt]).toEqual([8, 8, 3])
    expect([style.dimtad, style.dimdec, style.dimzin, style.dimdle]).toEqual([
      1, 2, 8, 100
    ])
    // _33_D100 là bản ghi cuối của bảng DIMSTYLE.
    const record = dxf.slice(
      dxf.indexOf('\n2\n_33_D100\n'),
      dxf.indexOf('\nENDTAB', dxf.indexOf('\n2\n_33_D100\n'))
    )
    expect(record.match(/\n178\n/g)).toHaveLength(1)
  })
})

describe('block lồng block và leader không mũi tên', () => {
  it('block chứa block: định nghĩa, chèn, giữ qua DXF', async () => {
    const { db, ctx } = setup()
    ctx.defineBlock({
      name: 'COC',
      entities: [{ kind: 'circle', center: { x: 0, y: 0, z: 0 }, radius: 600 }]
    })
    ctx.defineBlock({
      name: 'HANG_COC',
      entities: [0, 5300].map(x => ({
        kind: 'insert' as const,
        block: 'COC',
        position: { x, y: 0, z: 0 },
        scale: { x: -1, y: 1 },
        rotationDeg: 90
      }))
    })
    ctx.insert({
      role: 'ky_hieu',
      partId: 'hang',
      block: 'HANG_COC',
      position: { x: 100, y: 200, z: 0 }
    })
    const again = await roundTrip(db)
    const inner = [
      ...again.tables.blockTable.getAt('HANG_COC')!.newIterator()
    ] as AcDbBlockReference[]
    expect(inner.map(e => e.blockTableRecord?.name)).toEqual(['COC', 'COC'])
    expect(inner[1].position.x).toBeCloseTo(5300)
    expect(inner[1].scaleFactors.x).toBe(-1)
    expect(inner[1].rotation).toBeCloseTo(Math.PI / 2)
    expect(inner[0].color.isByBlock).toBe(true)
  })

  it('từ chối block bên trong chưa định nghĩa', () => {
    const { ctx } = setup()
    expect(() =>
      ctx.defineBlock({
        name: 'X',
        entities: [
          { kind: 'insert', block: 'CHUA_CO', position: { x: 0, y: 0, z: 0 } }
        ]
      })
    ).toThrow(/chưa được định nghĩa/)
  })

  it('leader native không mũi tên khi arrowHead false, giữ qua DXF', async () => {
    const { db, ctx } = setup()
    ctx.leader({
      role: 'ghi_chu',
      partId: 'ld',
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 300, y: 0, z: 0 }
      ],
      native: true,
      dimStyle: '_33_D100',
      arrowHead: false
    })
    const [leader] = ofType<AcDbLeader>(await roundTrip(db), 'LEADER')
    expect(leader.hasArrowHead).toBe(false)
  })
})

describe('attribute đặt theo bản gốc', () => {
  it('vị trí, kiểu chữ, căn lề của từng ATTRIB được giữ, kể cả insert lật', async () => {
    const { db, ctx } = setup()
    ctx.defineBlock({
      name: 'CD',
      entities: [
        {
          kind: 'attribute',
          tag: 'ELEV',
          defaultValue: '0',
          position: { x: 10, y: 5, z: 0 },
          height: 1500,
          align: 2,
          style: '_33_ArialHep'
        }
      ]
    })
    ctx.insert({
      role: 'ky_hieu',
      partId: 'cd',
      block: 'CD',
      position: { x: 1000, y: 0, z: 0 },
      scale: { x: -0.118, y: 0.118 },
      attributes: {
        ELEV: {
          value: 'EL5',
          position: { x: 1200, y: 150, z: 0 },
          height: 177,
          align: 2,
          style: '_33_Txt'
        }
      }
    })
    const [insert] = ofType<AcDbBlockReference>(await roundTrip(db), 'INSERT')
    const [a] = [...insert.attributeIterator()] as AcDbAttribute[]
    expect(a.textString).toBe('EL5')
    expect(a.alignmentPoint.x).toBeCloseTo(1200)
    expect(a.alignmentPoint.y).toBeCloseTo(150)
    expect(a.height).toBeCloseTo(177)
    expect(a.styleName).toBe('_33_Txt')
    expect(a.horizontalMode).toBe(2)
  })
})

describe('vị trí chữ kích thước theo bản gốc', () => {
  it('textPosition đặt chữ trong block dim và giữ qua DXF', async () => {
    const { db, ctx } = setup()
    const dim = ctx.dimension({
      role: 'net',
      partId: 'd',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 0, y: 2000, z: 0 },
      offset: 500,
      huong: 'dung',
      dimStyle: '_33_D100',
      text: 'HB',
      textPosition: { x: 700, y: 1000, z: 0 }
    }) as AcDbDimension
    expect(dim.textPosition.x).toBeCloseTo(700)
    const [again] = ofType<AcDbDimension>(await roundTrip(db), 'DIMENSION')
    expect(again.textPosition.x).toBeCloseTo(700)
    expect(again.textPosition.y).toBeCloseTo(1000)
  })
})

describe('kích thước góc', () => {
  it('góc 90° giữa hai cạnh, giữ qua DXF', async () => {
    const { db, ctx } = setup()
    ctx.angularDimension({
      role: 'net',
      partId: 'goc',
      center: { x: 0, y: 0, z: 0 },
      start: { x: 7700, y: 0, z: 0 },
      end: { x: 0, y: 6000, z: 0 },
      arcPoint: { x: 480, y: 280, z: 0 },
      dimStyle: '_33_D100',
      textPosition: { x: 490, y: 500, z: 0 }
    })
    const [dim] = ofType<AcDbDimension>(await roundTrip(db), 'DIMENSION')
    expect(dim.dimensionStyleName).toBe('_33_D100')
    expect(dim.textPosition.x).toBeCloseTo(490)
    const p = dim as unknown as {
      centerPoint: { x: number }
      xLine1Point: { x: number }
    }
    expect(p.centerPoint.x).toBeCloseTo(0)
    expect(p.xLine1Point.x).toBeCloseTo(7700)
  })
})

describe('POINT', () => {
  it('đặt điểm, giữ qua DXF', async () => {
    const { db, ctx } = setup()
    ctx.point({
      role: 'net',
      partId: 'p',
      position: { x: 12, y: 34, z: 0 },
      color: 5
    })
    const [p] = ofType<AcDbPoint>(await roundTrip(db), 'POINT')
    expect(p.position.x).toBeCloseTo(12)
    expect(p.position.y).toBeCloseTo(34)
    expect(p.color.colorIndex).toBe(5)
  })
})
