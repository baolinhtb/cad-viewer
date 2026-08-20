/**
 * Điểm gốc làm việc: nơi kỹ sư bảo rằng "chỗ này là số không".
 *
 * Bản vẽ theo lý trình đặt kết cấu ở x = 311088, còn mọi kích thước người ta
 * nghĩ trong đầu đều so với một mốc công trình. Không có chỗ nào nói "gốc ở
 * đây" thì mọi vị trí gõ vào template phải là số tuyệt đối — vừa khó đọc vừa
 * là chỗ dễ rơi mất một chữ số nhất.
 */
import { AcDbDatabase, AcDbFileType } from '@mlightcad/data-model'

import { AcApUcsService } from '../src/service/AcApUcsService'

function newDatabase() {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}

describe('AcApUcsService', () => {
  it('mặc định là hệ toạ độ thế giới', () => {
    const ucs = new AcApUcsService(newDatabase())
    expect(ucs.isWorld).toBe(true)
    expect(ucs.toWcs({ x: 5, y: 7 })).toEqual({ x: 5, y: 7 })
  })

  it('dời gốc: toạ độ gõ vào là số so với mốc', () => {
    const ucs = new AcApUcsService(newDatabase())
    ucs.setCurrent({ origin: { x: 311087.7, y: 4495.1 }, rotation: 0 })

    expect(ucs.isWorld).toBe(false)
    expect(ucs.toWcs({ x: 0, y: 0 })).toEqual({ x: 311087.7, y: 4495.1 })
    // "Mố nằm cách mốc 3850 sang phải" thay vì phải gõ 314937,7.
    const world = ucs.toWcs({ x: 3850, y: 0 })
    expect(world.x).toBeCloseTo(314937.7, 6)
    expect(world.y).toBeCloseTo(4495.1, 6)
  })

  it('đọc ngược: một điểm trong bản vẽ hiện ra theo mốc', () => {
    const ucs = new AcApUcsService(newDatabase())
    ucs.setCurrent({ origin: { x: 311087.7, y: 4495.1 }, rotation: 0 })
    const doc = ucs.toUcs({ x: 314937.7, y: 6595.1 })
    expect(doc.x).toBeCloseTo(3850, 6)
    expect(doc.y).toBeCloseTo(2100, 6)
  })

  it('xoay trục: đi theo hướng tuyến chứ không theo trục bản vẽ', () => {
    const ucs = new AcApUcsService(newDatabase())
    ucs.setCurrent({ origin: { x: 100, y: 200 }, rotation: Math.PI / 2 })
    const world = ucs.toWcs({ x: 10, y: 0 })
    expect(world.x).toBeCloseTo(100, 6)
    expect(world.y).toBeCloseTo(210, 6)
  })

  it('đổi qua đổi lại không trôi', () => {
    const ucs = new AcApUcsService(newDatabase())
    ucs.setCurrent({ origin: { x: -1234.5, y: 987.6 }, rotation: 0.42 })
    const goc = { x: 311087.7, y: 4495.1 }
    const lai = ucs.toWcs(ucs.toUcs(goc))
    expect(lai.x).toBeCloseTo(goc.x, 6)
    expect(lai.y).toBeCloseTo(goc.y, 6)
  })

  it('đặt tên và lưu vào bản vẽ, gọi lại được', () => {
    const db = newDatabase()
    const ucs = new AcApUcsService(db)
    ucs.setCurrent({ origin: { x: 311087.7, y: 4495.1 }, rotation: 0 })
    expect(ucs.save('MOC_M1')).toBe(true)

    ucs.setWorld()
    expect(ucs.isWorld).toBe(true)

    expect(ucs.restore('MOC_M1')).toBe(true)
    expect(ucs.current.name).toBe('MOC_M1')
    expect(ucs.current.origin.x).toBeCloseTo(311087.7, 3)
  })

  it('lưu trùng tên thì ghi đè, không đẻ ra hai mốc cùng tên', () => {
    const db = newDatabase()
    const ucs = new AcApUcsService(db)
    ucs.setCurrent({ origin: { x: 10, y: 20 }, rotation: 0 })
    ucs.save('M1')
    ucs.setCurrent({ origin: { x: 30, y: 40 }, rotation: 0 })
    ucs.save('M1')

    expect(ucs.list().filter(u => u.name === 'M1')).toHaveLength(1)
    expect(ucs.find('M1')!.origin.x).toBe(30)
  })

  it('gọi mốc không có thì báo không được, và không đổi gốc đang dùng', () => {
    const ucs = new AcApUcsService(newDatabase())
    ucs.setCurrent({ origin: { x: 5, y: 5 }, rotation: 0 })
    expect(ucs.restore('KHONG_CO')).toBe(false)
    expect(ucs.current.origin).toEqual({ x: 5, y: 5 })
  })

  it('tên rỗng thì từ chối lưu — một mốc không tên là mốc không gọi lại được', () => {
    const ucs = new AcApUcsService(newDatabase())
    expect(ucs.save('   ')).toBe(false)
    expect(ucs.list()).toHaveLength(0)
  })

  it('mốc đã lưu sống sót qua một vòng ghi ra DXF rồi nạp lại', async () => {
    const db = newDatabase()
    const ucs = new AcApUcsService(db)
    ucs.setCurrent({ origin: { x: 311087.7, y: 4495.1 }, rotation: Math.PI / 6 })
    ucs.save('MOC_M1')

    const lai = new AcDbDatabase()
    await lai.read(
      new TextEncoder().encode(db.dxfOut() as string).buffer as ArrayBuffer,
      { readOnly: false } as never,
      AcDbFileType.DXF
    )
    const sau = new AcApUcsService(lai)
    const found = sau.find('MOC_M1')
    expect(found).toBeDefined()
    expect(found!.origin.x).toBeCloseTo(311087.7, 3)
    expect(found!.origin.y).toBeCloseTo(4495.1, 3)
    // Góc xoay đọc ngược ra từ hai véc-tơ trục mà DXF lưu.
    expect(found!.rotation).toBeCloseTo(Math.PI / 6, 6)
  })

  it('xoá mốc thì nó biến khỏi danh sách', () => {
    const ucs = new AcApUcsService(newDatabase())
    ucs.setCurrent({ origin: { x: 1, y: 1 }, rotation: 0 })
    ucs.save('TAM')
    expect(ucs.remove('TAM')).toBe(true)
    expect(ucs.list()).toHaveLength(0)
    expect(ucs.remove('TAM')).toBe(false)
  })
})
