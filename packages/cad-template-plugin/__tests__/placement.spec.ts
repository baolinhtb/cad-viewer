/**
 * Vị trí gõ vào template đọc theo mốc đang dùng.
 *
 * Bản vẽ theo lý trình đặt kết cấu ở x = 311088. Không có mốc thì muốn đặt mố
 * đúng chỗ phải gõ nguyên con số ấy — vừa không đọc được vừa là chỗ dễ rơi mất
 * một chữ số nhất. Có mốc thì `x: 0` nghĩa là ngay mốc.
 */
const ucsState: {
  isWorld: boolean
  current: { name: string; origin: { x: number; y: number }; rotation: number }
} = {
  isWorld: true,
  current: { name: '', origin: { x: 0, y: 0 }, rotation: 0 }
}

jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: {
    instance: {
      regen: jest.fn(),
      curDocument: {
        ucsService: {
          get isWorld() {
            return ucsState.isWorld
          },
          get current() {
            return ucsState.current
          },
          toWcs(point: { x: number; y: number }) {
            const { origin, rotation } = ucsState.current
            const cos = Math.cos(rotation)
            const sin = Math.sin(rotation)
            return {
              x: origin.x + point.x * cos - point.y * sin,
              y: origin.y + point.x * sin + point.y * cos
            }
          }
        }
      }
    }
  },
  acapRunGroupedEdit: async (
    _db: unknown,
    _label: string,
    fn: () => void | Promise<void>
  ) => {
    await fn()
  }
}))

import { readSemanticTag } from '@mlightcad/cad-template-sdk'
import { AcDbDatabase } from '@mlightcad/data-model'

import { runAssembly } from '../src/assembly'
import { currentPlacementFrame, toDrawingPlacement } from '../src/placement'
import { setRemoteTemplates } from '../src/templateRegistry'
import { runTemplateTool } from '../src/templateTools'
import { registerLibrary } from './helpers/libraryTemplate'

const LIBRARY = [
  'mo_be_mong.js',
  'mo_coc_khoan_nhoi.js',
  'mo_tuong_than.js',
  'mo_tuong_dau.js',
  'tuong_phong_ho.js'
]

beforeAll(() => registerLibrary(...LIBRARY))
afterAll(() => setRemoteTemplates([]))
beforeEach(() => {
  ucsState.isWorld = true
  ucsState.current = { name: '', origin: { x: 0, y: 0 }, rotation: 0 }
})

function newDatabase() {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}

function datMoc(x: number, y: number, name = 'M1', rotation = 0) {
  ucsState.isWorld = false
  ucsState.current = { name, origin: { x, y }, rotation }
}

/** Hộp bao của một vai trò trong bản vẽ. */
function boxOf(db: AcDbDatabase, role: string) {
  const found = [...db.tables.blockTable.modelSpace.newIterator()].filter(
    e => readSemanticTag(e)?.role === role
  )
  if (!found.length) return null
  let [x1, y1, x2, y2] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const e of found) {
    const b = e.geometricExtents
    x1 = Math.min(x1, b.min.x)
    y1 = Math.min(y1, b.min.y)
    x2 = Math.max(x2, b.max.x)
    y2 = Math.max(y2, b.max.y)
  }
  return [x1, y1, x2, y2]
}

describe('toDrawingPlacement', () => {
  it('không có mốc thì trả nguyên xi', () => {
    expect(toDrawingPlacement({ x: 5, y: 7, B: 7700 })).toEqual({
      x: 5,
      y: 7,
      B: 7700
    })
    expect(currentPlacementFrame()).toBeUndefined()
  })

  it('có mốc thì dời x, y — và chỉ x, y', () => {
    datMoc(311087.7, 4495.1)
    const ra = toDrawingPlacement({ x: 3850, y: 2100, B: 7700, hBe: 2000 })
    expect(ra.x).toBeCloseTo(314937.7, 6)
    expect(ra.y).toBeCloseTo(6595.1, 6)
    // Bề rộng và chiều cao là kích thước, không phải vị trí. Dời gốc mà đụng
    // vào chúng là làm dày thêm một bức tường.
    expect(ra.B).toBe(7700)
    expect(ra.hBe).toBe(2000)
  })

  it('thiếu một trong hai thì bù 0 cho cái kia, không bịa', () => {
    datMoc(1000, 2000)
    expect(toDrawingPlacement({ x: 50 }).x).toBeCloseTo(1050, 6)
    expect(toDrawingPlacement({ x: 50 }).y).toBeUndefined()
  })

  it('không có x lẫn y thì không đụng gì', () => {
    datMoc(1000, 2000)
    expect(toDrawingPlacement({ B: 7700 })).toEqual({ B: 7700 })
  })

  it('nêu tên mốc để nói ra được là toạ độ vừa bị dời', () => {
    datMoc(1000, 2000, 'MOC_M1')
    expect(currentPlacementFrame()).toBe('MOC_M1')
    datMoc(1000, 2000, '')
    expect(currentPlacementFrame()).toBe('mốc chưa đặt tên')
  })
})

describe('chạy template theo mốc', () => {
  it('x = 0 nghĩa là ngay mốc, không phải gốc bản vẽ', async () => {
    datMoc(311087.7, 4495.1, 'MOC_M1')
    const db = newDatabase()
    const outcome = await runTemplateTool(
      'chay_template',
      { ma_template: 'mo_be_mong', thong_so: { x: 0, y: 0 } },
      db
    )
    expect(outcome.ok).toBe(true)
    const be = boxOf(db, 'mo_be')!
    // Bệ rộng 7700, tim ở mốc.
    expect((be[0] + be[2]) / 2).toBeCloseTo(311087.7, 3)
    expect(be[1]).toBeCloseTo(4495.1 + 100, 3)
  })

  it('nói rõ trong kết quả là đã đọc theo mốc nào', async () => {
    datMoc(311087.7, 4495.1, 'MOC_M1')
    const outcome = await runTemplateTool(
      'chay_template',
      { ma_template: 'mo_be_mong', thong_so: {} },
      newDatabase()
    )
    expect(outcome.message).toContain('MOC_M1')
  })

  it('về gốc thế giới thì vẽ đúng chỗ cũ, không còn nhắc mốc', async () => {
    const db = newDatabase()
    const outcome = await runTemplateTool(
      'chay_template',
      { ma_template: 'mo_be_mong', thong_so: { x: 0, y: 0 } },
      db
    )
    expect(outcome.message).not.toContain('mốc')
    const be = boxOf(db, 'mo_be')!
    expect((be[0] + be[2]) / 2).toBeCloseTo(0, 6)
  })
})

describe('ghép cả cụm theo mốc', () => {
  it('cả sáu bộ phận dời theo, quan hệ giữa chúng giữ nguyên', async () => {
    const tai0 = newDatabase()
    await runAssembly('mo_cau_hoan_chinh', {}, tai0)

    datMoc(311087.7, 4495.1, 'MOC_M1')
    const taiMoc = newDatabase()
    await runAssembly('mo_cau_hoan_chinh', {}, taiMoc)

    for (const role of [
      'mo_be_tong_lot',
      'mo_be',
      'coc_khoan_nhoi',
      'mo_tuong_than',
      'mo_tuong_dau',
      'lop_phu',
      'lan_can'
    ]) {
      const a = boxOf(tai0, role)!
      const b = boxOf(taiMoc, role)!
      // Dời đúng một lần, đúng bằng gốc mốc — không phải hai lần cho các bước
      // tính cao độ của nhau.
      expect(b[0] - a[0]).toBeCloseTo(311087.7, 3)
      expect(b[1] - a[1]).toBeCloseTo(4495.1, 3)
      expect(b[2] - a[2]).toBeCloseTo(311087.7, 3)
      expect(b[3] - a[3]).toBeCloseTo(4495.1, 3)
    }
  })
})
