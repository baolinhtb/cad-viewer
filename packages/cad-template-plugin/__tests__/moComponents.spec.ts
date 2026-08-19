/**
 * The abutment components, checked against the engineer's own drawing.
 *
 * The expected numbers below are measured from
 * `Phantachcaukienmo_va_dat_ten_layer.dwg` — the standardised assembly, which
 * is the one drawing that keeps both the shapes and the 2,00% crossfall. Its
 * parts are exploded upward in 5000 mm steps (footing +0, stem +5000, backwall
 * and wing walls +15000, wearing course +20000); the offsets are confirmed by
 * two joints that come out exactly equal once removed — the stem's top-left
 * meets the backwall's bottom-left, and the backwall's shoulder meets the
 * wearing course's underside. Everything here is in template coordinates:
 * x = 0 at the centreline, y = 0 at the underside of the blinding.
 *
 * Checking against the drawing rather than against the template this was split
 * from matters: that template had the backwall 14 mm too tall and hung the
 * wing walls about 500 mm too high, and a test comparing the two would have
 * agreed with itself all the way to production. It did.
 */
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  acapRunGroupedEdit: async (
    _db: unknown,
    _label: string,
    fn: () => void | Promise<void>
  ) => {
    await fn()
  }
}))

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  createDrawContext,
  formatPartId,
  readSemanticTag,
  validateParamValues
} from '@mlightcad/cad-template-sdk'
import { AcDbDatabase, AcDbEntity } from '@mlightcad/data-model'

const DIR = join(__dirname, '..', 'library')
/** The retired whole-abutment template, kept as the geometric reference. */
const FIXTURES = join(__dirname, '..', 'reference')

const ROLE_LAYERS: Record<string, string> = {
  mo_be: 'KC-MO-BE',
  mo_be_tong_lot: 'KC-MO-BTLOT',
  mo_tuong_than: 'KC-MO-TUONGTHAN',
  mo_tuong_dau: 'KC-MO-TUONGDAU',
  mo_tuong_tai: 'KC-MO-TUONGTAI',
  lop_phu: 'KC-LOPPHU',
  kich_thuoc: 'GC-KICHTHUOC',
  duong_tim: 'TRUC-TIM'
}

function load(file: string, dir: string = DIR) {
  ;(globalThis as unknown as Record<string, unknown>).__CAD_TEMPLATE_SDK__ = {
    formatPartId
  }
  const code = readFileSync(join(dir, file), 'utf8')
  const body = code.replace(/^\s*export default /m, 'return ')
  return new Function(`${body}`)()
}

/** Runs a template with its declared defaults plus any overrides. */
function run(file: string, overrides: Record<string, unknown> = {}, dir?: string) {
  const template = load(file, dir)
  const values: Record<string, unknown> = {}
  for (const param of template.params) values[param.key] = param.default
  Object.assign(values, overrides)

  const errors = validateParamValues(template.params, values as never)
  expect(errors).toEqual([])

  const database = new AcDbDatabase()
  database.createDefaultData()
  const ctx = createDrawContext(database, template.meta.id, ROLE_LAYERS)
  template.generate(ctx, values)
  return [...ctx.drawn] as AcDbEntity[]
}

/** Rounded bounding box per role, so two drawings can be compared by part. */
function boxesByRole(entities: readonly AcDbEntity[]) {
  const out = new Map<string, number[][]>()
  for (const entity of entities) {
    const role = readSemanticTag(entity)?.role
    // Dimensions and the centre line are presentation, not the part itself:
    // a component drawn alone dimensions its own edges, the assembly runs one
    // chain over the whole mố. Comparing those would compare two drawing
    // conventions rather than two geometries.
    if (!role || role === 'kich_thuoc' || role === 'duong_tim') continue
    const box = entity.geometricExtents
    const rounded = [box.min.x, box.min.y, box.max.x, box.max.y].map(
      value => Math.round(value * 1000) / 1000
    )
    const list = out.get(role) ?? []
    list.push(rounded)
    out.set(role, list)
  }
  // Two wing walls come back in whatever order they were drawn.
  for (const list of out.values()) list.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return out
}


/** Đo từ bản vẽ chuẩn hoá, đã trừ độ dời phá khối và quy về gốc template. */
const BANVE = {
  lot: { x: [-3949.9, 3949.9], y: [0, 100] },
  be: { x: [-3850, 3850], y: [100, 2100] },
  // Chân tường thân chôn 50 mm vào bệ (đáy thật 2050); phần ấy khuất nên
  // template dựng từ đỉnh bệ. Chỉ đỉnh là kiểm được.
  thanDinhTrai: 6739.3,
  thanDinhPhai: 6893.3,
  dauDinhNgoaiTrai: 8557.5,
  dauDinhNgoaiPhai: 8697.5,
  vaiKeTrai: 8564.5,
  vaiKePhai: 8704.5,
  taiPhai: { x: [3700, 3850], y: [6902.3, 8102.5] },
  taiTrai: { x: [-3850, -3700], y: [6739.3, 7964.5] },
  phu: { x: [-3500, 3500], y: [8564.5, 8774.5] }
}

/**
 * Sai số cho phép.
 *
 * Hai mặt của tường đầu trong bản vẽ không song song: mép trái cao 1818,2 còn
 * mép phải 1792,0. Template dựng cả hai mặt cùng một độ dốc 2,00% nên không
 * thể khớp đồng thời hai bên — nó lấy trung bình 1805,1. Phần dư là chính chỗ
 * lệch ấy của bản vẽ, không phải sai số của template.
 */
const DUNG_SAI = 15

function boxOfLayer(entities: readonly AcDbEntity[], role: string) {
  const found = entities.filter(e => readSemanticTag(e)?.role === role)
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

describe('cấu kiện mố so với bản vẽ của kỹ sư', () => {
  const be = run('mo_be_mong.js')
  const than = run('mo_tuong_than.js')
  const dau = run('mo_tuong_dau.js')

  it('bê tông lót: rộng 7899,8 dày 100', () => {
    const box = boxOfLayer(be, 'mo_be_tong_lot')!
    expect(box[0]).toBeCloseTo(BANVE.lot.x[0], 0)
    expect(box[2]).toBeCloseTo(BANVE.lot.x[1], 0)
    expect(box[1]).toBeCloseTo(BANVE.lot.y[0], 0)
    expect(box[3]).toBeCloseTo(BANVE.lot.y[1], 0)
  })

  it('bệ móng: rộng 7700 cao 2000, đáy phẳng trên bê tông lót', () => {
    const box = boxOfLayer(be, 'mo_be')!
    expect(box[0]).toBeCloseTo(BANVE.be.x[0], 0)
    expect(box[2]).toBeCloseTo(BANVE.be.x[1], 0)
    expect(box[1]).toBeCloseTo(BANVE.be.y[0], 0)
    expect(box[3]).toBeCloseTo(BANVE.be.y[1], 0)
  })

  it('đỉnh tường thân nghiêng đúng cao độ hai mép của bản vẽ', () => {
    const box = boxOfLayer(than, 'mo_tuong_than')!
    // Hộp bao của một tấm có đỉnh nghiêng: đáy phẳng, đỉnh lấy mép cao nhất.
    expect(box[1]).toBeCloseTo(BANVE.be.y[1], 0)
    expect(box[3]).toBeCloseTo(BANVE.thanDinhPhai, 0)
    // Mép thấp phải kiểm bằng đỉnh hình, vì hộp bao chỉ biết mép cao. Không
    // có bước này thì cả bài chỉ nói được "đỉnh cao nhất đúng", mà một tấm
    // đỉnh phẳng ở cao độ mép phải cũng qua được.
    const wall = than.find(
      e => readSemanticTag(e)?.role === 'mo_tuong_than'
    ) as unknown as {
      numberOfVertices: number
      getPoint2dAt(i: number): { x: number; y: number }
    }
    const dinh = Array.from({ length: wall.numberOfVertices }, (_, i) =>
      wall.getPoint2dAt(i)
    )
    const trai = dinh.filter(p => p.x < 0).map(p => p.y)
    const phai = dinh.filter(p => p.x > 0).map(p => p.y)
    expect(Math.max(...trai)).toBeCloseTo(BANVE.thanDinhTrai, 0)
    expect(Math.max(...phai)).toBeCloseTo(BANVE.thanDinhPhai, 0)
  })

  it('tường đầu: đỉnh ngoài hai mép khớp bản vẽ trong sai số của chính bản vẽ', () => {
    const box = boxOfLayer(dau, 'mo_tuong_dau')!
    expect(box[1]).toBeCloseTo(BANVE.thanDinhTrai, -1)
    expect(Math.abs(box[3] - BANVE.dauDinhNgoaiPhai)).toBeLessThan(DUNG_SAI)
  })

  it('lớp phủ gối đúng lên vai kê, rộng 7000 dày 70', () => {
    const box = boxOfLayer(dau, 'lop_phu')!
    expect(box[0]).toBeCloseTo(BANVE.phu.x[0], 0)
    expect(box[2]).toBeCloseTo(BANVE.phu.x[1], 0)
    expect(Math.abs(box[1] - BANVE.phu.y[0])).toBeLessThan(DUNG_SAI)
    expect(Math.abs(box[3] - BANVE.phu.y[1])).toBeLessThan(DUNG_SAI)
  })

  it('tường tai kéo từ đáy tường đầu lên, không treo lơ lửng', () => {
    const tai = dau.filter(e => readSemanticTag(e)?.role === 'mo_tuong_tai')
    const boxes = tai
      .map(e => e.geometricExtents)
      .map(b => [b.min.x, b.min.y, b.max.x, b.max.y])
      .sort((a, b) => a[0] - b[0])
    // Hai tường tai, mỗi bên một cái; mỗi cái có cả nét bao lẫn vùng tô.
    const trai = boxes[0]
    const phai = boxes[boxes.length - 1]

    expect(trai[0]).toBeCloseTo(BANVE.taiTrai.x[0], 0)
    expect(trai[2]).toBeCloseTo(BANVE.taiTrai.x[1], 0)
    expect(phai[0]).toBeCloseTo(BANVE.taiPhai.x[0], 0)
    expect(phai[2]).toBeCloseTo(BANVE.taiPhai.x[1], 0)

    // Đây là khẳng định bắt lỗi cũ: đỉnh phải thấp hơn đỉnh tường đầu gần 600
    // mm chứ không phải 100, và đáy phải chạm đáy tường đầu.
    expect(Math.abs(phai[3] - BANVE.taiPhai.y[1])).toBeLessThan(DUNG_SAI)
    expect(Math.abs(phai[1] - BANVE.taiPhai.y[0])).toBeLessThan(DUNG_SAI)
    expect(Math.abs(trai[3] - BANVE.taiTrai.y[1])).toBeLessThan(DUNG_SAI)
    expect(Math.abs(trai[1] - BANVE.taiTrai.y[0])).toBeLessThan(DUNG_SAI)
  })

  it('ba mẫu xếp chồng: đỉnh bệ là đáy tường thân, đỉnh tường thân là đáy tường đầu', () => {
    const d = (file: string, key: string) => {
      const t = load(file)
      return t.params.find((p: any) => p.key === key).default
    }
    expect(d('mo_tuong_than.js', 'y')).toBe(
      d('mo_be_mong.js', 'y') + d('mo_be_mong.js', 'hLot') + d('mo_be_mong.js', 'hBe')
    )
    expect(d('mo_tuong_dau.js', 'y')).toBeCloseTo(
      d('mo_tuong_than.js', 'y') + d('mo_tuong_than.js', 'hThan'),
      3
    )
  })

  it('tường tai vẫn được tô đặc', () => {
    const hatches = dau.filter(e => e.dxfTypeName === 'HATCH')
    expect(hatches).toHaveLength(2)
    for (const hatch of hatches) {
      expect((hatch as unknown as { isSolidFill: boolean }).isSolidFill).toBe(true)
      expect(readSemanticTag(hatch)?.role).toBe('mo_tuong_tai')
    }
  })

  it('từ chối tường tai rộng quá bề rộng tường đầu', () => {
    expect(() => run('mo_tuong_dau.js', { B: 2000, bTai: 1500 })).toThrow(
      /không nằm lọt trong bề rộng/
    )
  })
})

/**
 * The railing component, against the block it was copied from.
 *
 * `lancan-left.dwg` holds one block of 124 entities. The first two versions of
 * this template used one of them — the concrete profile — and dropped the 81
 * that make up the steel railing standing on it, so the generated drawing
 * stopped at the top of the concrete. These check the whole assembly is there.
 */
describe('lan can cầu so với bản vẽ', () => {
  const veAll = (overrides: Record<string, unknown> = {}) =>
    run('tuong_phong_ho.js', overrides)

  /** Hộp bao của tất cả những gì template vẽ. */
  const boxOfAll = (drawn: AcDbEntity[]) => {
    let [x1, y1, x2, y2] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const e of drawn) {
      const b = e.geometricExtents
      x1 = Math.min(x1, b.min.x)
      y1 = Math.min(y1, b.min.y)
      x2 = Math.max(x2, b.max.x)
      y2 = Math.max(y2, b.max.y)
    }
    return [x1, y1, x2, y2]
  }

  it('cao tới 1678 chứ không dừng ở 1090 như hai bản trước', () => {
    const box = boxOfAll(veAll())
    expect(box[1]).toBeCloseTo(0, 0)
    // Bản vẽ: điểm cao nhất của phần thép ở 1677,5 — tức +587,5 trên đỉnh
    // tường 1090. Nó nằm trên một cung, nên sai số làm tròn khi chép toạ độ
    // vào bảng là dưới 1 mm.
    expect(Math.abs(box[3] - 1677.5)).toBeLessThan(1)
  })

  it('tắt phần thép thì dừng đúng ở đỉnh tường bê tông', () => {
    const box = boxOfAll(veAll({ veLanCanThep: 'khong' }))
    expect(box[3]).toBeCloseTo(1090, 0)
  })

  it('vẽ đủ 77 nét thép của bản vẽ, cộng tường và ống', () => {
    const co = veAll().length
    const khong = veAll({ veLanCanThep: 'khong' }).length
    // 49 đoạn + 26 cung + 2 tròn = 77.
    expect(co - khong).toBe(77)
    // Tường bê tông và ống thoát nước.
    expect(khong).toBe(2)
  })

  it('phần thép bám theo đỉnh tường khi đổi chiều cao', () => {
    const cao = boxOfAll(veAll({ h: 1300 }))
    expect(Math.abs(cao[3] - (1677.5 + 210))).toBeLessThan(1)
  })

  it('lật sang mép phải là ảnh gương, không phải bản sao', () => {
    const trai = boxOfAll(veAll({ ben: 'trai' }))
    const phai = boxOfAll(veAll({ ben: 'phai' }))
    expect(phai[0]).toBeCloseTo(-trai[2], 1)
    expect(phai[2]).toBeCloseTo(-trai[0], 1)
    expect(phai[1]).toBeCloseTo(trai[1], 1)
    expect(phai[3]).toBeCloseTo(trai[3], 1)
  })
})
