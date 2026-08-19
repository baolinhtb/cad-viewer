import {
  AcDbDatabase,
  AcDbFileType,
  AcDbHatch,
  HATCH_PATTERN_SOLID
} from '@mlightcad/data-model'

import { createDrawContext } from '../src/AcTpDrawContext'
import { readSemanticTag } from '../src/AcTpSemanticTag'

const ROLES = { vung_to: 'TEST-HATCH' }

const setup = () => {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return { db, ctx: createDrawContext(db, 'test', ROLES) }
}

const SQUARE = [
  { x: 0, y: 0, z: 0 },
  { x: 100, y: 0, z: 0 },
  { x: 100, y: 50, z: 0 },
  { x: 0, y: 50, z: 0 }
]

describe('ctx.hatch', () => {
  it('tô đặc theo mặc định', () => {
    const { ctx } = setup()
    const entity = ctx.hatch({
      role: 'vung_to',
      partId: 'p1',
      boundary: SQUARE
    }) as AcDbHatch
    expect(entity.patternName).toBe(HATCH_PATTERN_SOLID)
    expect(entity.isSolidFill).toBe(true)
  })

  it('nhận mẫu, tỉ lệ và góc', () => {
    const { ctx } = setup()
    const entity = ctx.hatch({
      role: 'vung_to',
      partId: 'p1',
      boundary: SQUARE,
      patternName: 'ANSI31',
      patternScale: 25,
      patternAngleDeg: 90
    }) as AcDbHatch
    expect(entity.patternName).toBe('ANSI31')
    expect(entity.patternScale).toBe(25)
    expect(entity.patternAngle).toBeCloseTo(Math.PI / 2)
    expect(entity.isSolidFill).toBe(false)
  })

  it('mang nhãn ngữ nghĩa như mọi nét khác', () => {
    const { ctx } = setup()
    const entity = ctx.hatch({
      role: 'vung_to',
      partId: 'tuong-tai/trai',
      boundary: SQUARE,
      params: { bTai: 150 }
    })
    const tag = readSemanticTag(entity)
    expect(tag?.role).toBe('vung_to')
    expect(tag?.partId).toBe('tuong-tai/trai')
    expect(tag?.params).toEqual({ bTai: 150 })
  })

  it('đặt lên layer của vai trò và tạo layer nếu chưa có', () => {
    const { db, ctx } = setup()
    const entity = ctx.hatch({ role: 'vung_to', partId: 'p1', boundary: SQUARE })
    expect(entity.layer).toBe('TEST-HATCH')
    expect(db.tables.layerTable.has('TEST-HATCH')).toBe(true)
  })

  it('biên khép kín: vùng tô có diện tích sau khi ghi ra DXF', async () => {
    const { db, ctx } = setup()
    ctx.hatch({ role: 'vung_to', partId: 'p1', boundary: SQUARE })

    const again = new AcDbDatabase()
    await again.read(
      new TextEncoder().encode(db.dxfOut() as string).buffer as ArrayBuffer,
      { readOnly: false },
      AcDbFileType.DXF
    )
    const hatches: AcDbHatch[] = []
    for (const e of again.tables.blockTable.modelSpace.newIterator()) {
      if (e.dxfTypeName === 'HATCH') hatches.push(e as AcDbHatch)
    }
    expect(hatches).toHaveLength(1)
    // Hộp bao phải là đúng ô 100×50. Một biên không khép kín vẫn ghi ra được
    // và vẫn đọc lại được — nó chỉ không tô gì cả.
    const box = hatches[0].geometricExtents
    expect(box.min.x).toBeCloseTo(0)
    expect(box.min.y).toBeCloseTo(0)
    expect(box.max.x).toBeCloseTo(100)
    expect(box.max.y).toBeCloseTo(50)
  })

  it('từ chối biên không đủ tạo thành vùng', () => {
    const { ctx } = setup()
    expect(() =>
      ctx.hatch({
        role: 'vung_to',
        partId: 'p1',
        boundary: [
          { x: 0, y: 0, z: 0 },
          { x: 10, y: 0, z: 0 }
        ]
      })
    ).toThrow(/ít nhất 3 điểm biên/)
  })
})
