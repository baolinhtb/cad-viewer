/**
 * Mặt chính mố hoàn chỉnh, đối chiếu với bản vẽ của kỹ sư.
 *
 * Số kỳ vọng đo từ `assets/cad-sample/Phantachcaukienmo_va_dat_ten_layer.dwg`
 * bằng libredwg, quy về gốc template (x = 0 tại tim 314937,691; y = 0 tại đáy
 * bê tông lót 9495,05). Kiểm bằng **đỉnh hình**, không bằng hộp bao: hai hình
 * đối xứng có cùng hộp bao, và lan can quay ngược đã từng lọt qua một bộ test
 * chỉ so hộp bao.
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

const FILE = join(__dirname, '..', 'library', 'mo_mat_chinh.js')

/** Vai trò → layer đúng như nền chuẩn hoá của phòng đang dùng. */
const ROLE_LAYERS: Record<string, string> = {
  mo_be: '_33_CAU_MO_Be',
  mo_be_tong_lot: '_33_CAU_MO_Betonglot',
  mo_tuong_than: '_33_CAU_MO_Tuongthan',
  mo_tuong_dau: '_33_CAU_MO_Tuongdau',
  mo_tuong_tai: '_33_CAU_MO_Tuongtai',
  lop_phu: '_33_Matduong_BTN',
  coc_khoan_nhoi: '_33_CAU_MO_Coc',
  lan_can: '_33_CAU_MIS_Lancan',
  ong_thoat_nuoc: 'KT-THOATNUOC',
  duong_tim: '_33_Timtuyen',
  kich_thuoc: '_33_Duongghikichthuoc',
  ghi_chu: '_33_Ghichu',
  ghi_chu_cao_do: '_33_Ghichu_Caodo',
  tieu_de_ban_ve: '_33_Tieudebanve'
}

/** Màu layer như nền chuẩn hoá của phòng: bản vẽ để xám 8, lan can trắng 7. */
const LAYER_STYLES: Record<string, { color: number | null }> = {
  _33_CAU_MO_Be: { color: 8 },
  _33_CAU_MO_Tuongthan: { color: 8 },
  _33_Timtuyen: { color: 8 },
  _33_Ghichu: { color: 8 },
  _33_CAU_MIS_Lancan: { color: 7 }
}

function load() {
  ;(globalThis as unknown as Record<string, unknown>).__CAD_TEMPLATE_SDK__ = {
    formatPartId
  }
  const code = readFileSync(FILE, 'utf8')
  return new Function(code.replace(/^\s*export default /m, 'return '))()
}

function run(overrides: Record<string, unknown> = {}) {
  const template = load()
  const values: Record<string, unknown> = {}
  for (const param of template.params) values[param.key] = param.default
  Object.assign(values, overrides)
  const errors = validateParamValues(template.params, values as never)
  expect(errors).toEqual([])
  const database = new AcDbDatabase()
  database.createDefaultData()
  const ctx = createDrawContext(database, template.meta.id, ROLE_LAYERS, undefined, LAYER_STYLES)
  template.generate(ctx, values)
  return { drawn: [...ctx.drawn] as AcDbEntity[], database }
}

type Poly = AcDbEntity & {
  numberOfVertices: number
  getPoint2dAt: (i: number) => { x: number; y: number }
}

const role = (e: AcDbEntity) => readSemanticTag(e)?.role
const partId = (e: AcDbEntity) => readSemanticTag(e)?.partId
const isPoly = (e: AcDbEntity) => e.dxfTypeName === 'LWPOLYLINE'
const isLine = (e: AcDbEntity) => e.dxfTypeName === 'LINE'
const vertices = (e: AcDbEntity) => {
  const p = e as Poly
  return Array.from({ length: p.numberOfVertices }, (_, i) => {
    const v = p.getPoint2dAt(i)
    return [Math.round(v.x * 10) / 10, Math.round(v.y * 10) / 10]
  })
}
const polyOf = (drawn: AcDbEntity[], id: string) =>
  drawn.find(e => partId(e) === id && isPoly(e))!

/** So từng đỉnh theo thứ tự, sai số nửa milimét. */
function expectVertices(entity: AcDbEntity, expected: number[][]) {
  const got = vertices(entity)
  expect(got.length).toBe(expected.length)
  got.forEach((v, i) => {
    expect(v[0]).toBeCloseTo(expected[i][0], 0)
    expect(v[1]).toBeCloseTo(expected[i][1], 0)
  })
}

describe('mo_mat_chinh với mặc định dựng lại đúng bản vẽ', () => {
  const { drawn, database } = run()

  test('mọi đối tượng đều mang nhãn và nằm trên layer của phòng', () => {
    expect(drawn.length).toBeGreaterThan(200)
    expect(drawn.every(e => readSemanticTag(e))).toBe(true)
    const layers = new Set(drawn.map(e => e.layer))
    expect([...layers].sort()).toEqual(
      [...Object.values(ROLE_LAYERS), '_33_Kyhieumatcat'].sort()
    )
    for (const e of drawn) {
      if (role(e) === 'ky_hieu_mat_cat') expect(e.layer).toBe('_33_Kyhieumatcat')
    }
  })

  test('màu như bản vẽ: layer xám theo nền chuẩn hoá, nét khác màu đúng chỗ', () => {
    const colorOf = (e: AcDbEntity) => e.color.colorIndex
    // Layer do template tạo lấy màu của nền chuẩn hoá; chưa quy định thì trắng.
    expect(database.tables.layerTable.getAt('_33_CAU_MO_Be')!.color.colorIndex).toBe(8)
    expect(database.tables.layerTable.getAt('_33_CAU_MIS_Lancan')!.color.colorIndex).toBe(7)
    expect(database.tables.layerTable.getAt('_33_CAU_MO_Tuongdau')!.color.colorIndex).toBe(7)
    // Kết cấu theo layer; tim tuyến đỏ; ghi chú xanh đúng năm dòng; mốc vàng.
    expect(colorOf(polyOf(drawn, 'mo_be'))).toBe(256)
    expect(colorOf(drawn.find(e => partId(e) === 'duong_tim_01')!)).toBe(1)
    const texts = drawn.filter(e => e.dxfTypeName === 'TEXT') as (AcDbEntity & { textString: string })[]
    const green = texts.filter(t => colorOf(t) === 3).map(t => t.textString).sort()
    expect(green).toEqual(['BÊ TÔNG ĐỆM C8', 'CỌC KHOAN NHỒI', 'D1200 (M)', 'i=0%', 'i=0%'])
    expect(colorOf(texts.find(t => t.textString === 'Tim cầu')!)).toBe(256)
    const moc = drawn.filter(e => role(e) === 'ghi_chu_cao_do' && isPoly(e))
    expect(moc.every(e => colorOf(e) === 2)).toBe(true)
    const nhanMoc = drawn.filter(e => role(e) === 'ghi_chu_cao_do' && e.dxfTypeName === 'TEXT')
    expect(nhanMoc.every(e => colorOf(e) === 7)).toBe(true)
    // Lan can: biên dạng lam, ống thoát nước xám nhạt, thanh thép vàng là số đông.
    expect(colorOf(polyOf(drawn, 'lan_can_trai'))).toBe(4)
    expect(colorOf(drawn.find(e => role(e) === 'ong_thoat_nuoc')!)).toBe(9)
    const thep = drawn.filter(e => role(e) === 'lan_can' && !isPoly(e))
    expect(thep.filter(e => colorOf(e) === 2).length).toBe(2 * 82)
  })

  test('bê tông lót, bệ: đúng bốn góc', () => {
    expectVertices(polyOf(drawn, 'mo_be_tong_lot'), [
      [-3950, 0],
      [3950, 0],
      [3950, 100],
      [-3950, 100]
    ])
    expectVertices(polyOf(drawn, 'mo_be'), [
      [-3850, 100],
      [-3850, 2100],
      [3850, 2100],
      [3850, 100]
    ])
  })

  test('tường thân: đáy phẳng trên bệ, đỉnh 6893,4 (H1A = 4793,4)', () => {
    expectVertices(polyOf(drawn, 'mo_tuong_than'), [
      [-3850, 2100],
      [-3850, 6893.4],
      [0, 6893.4],
      [3850, 6893.4],
      [3850, 2100]
    ])
  })

  test('tường đầu: vai kê 350 rộng, hạ 7,08 ở góc ngoài', () => {
    expectVertices(polyOf(drawn, 'mo_tuong_dau'), [
      [3850, 6893.4],
      [3850, 8697.5],
      [3500, 8704.6],
      [0, 8704.6],
      [-3500, 8704.6],
      [-3850, 8697.5],
      [-3850, 6893.4]
    ])
  })

  test('lớp phủ 7000 × 70 giữa hai vai kê', () => {
    expectVertices(polyOf(drawn, 'lop_phu'), [
      [-3500, 8704.6],
      [0, 8704.6],
      [3500, 8704.6],
      [3500, 8774.6],
      [0, 8774.6],
      [-3500, 8774.6]
    ])
  })

  test('tường tai 150 × 1200 tô đặc ở hai mép, trên đỉnh tường thân', () => {
    const hatches = drawn.filter(e => e.dxfTypeName === 'HATCH' && role(e) === 'mo_tuong_tai')
    expect(hatches).toHaveLength(2)
    const boxes = hatches
      .map(h => {
        const b = h.geometricExtents
        return [b.min.x, b.min.y, b.max.x, b.max.y].map(v => Math.round(v * 10) / 10)
      })
      .sort((a, b) => a[0] - b[0])
    expect(boxes[0]).toEqual([-3850, 6893.4, -3700, 8093.4])
    expect(boxes[1]).toEqual([3700, 6893.4, 3850, 8093.4])
  })

  test('lan can ngồi trên vai kê, mặt vát quay vào tim, chân 542,9 dưới góc ngoài', () => {
    // Đo từ block A$C6EA20CD3 chèn tại (−4030,803; 8154,577) và ảnh gương.
    const trai = [
      [-3500, 8844.6],
      [-3700, 9244.6],
      [-4000, 9244.6],
      [-3950, 8154.6],
      [-3850, 8154.6],
      [-3850, 8697.5],
      [-3500, 8704.6]
    ]
    expectVertices(polyOf(drawn, 'lan_can_trai'), trai)
    expectVertices(
      polyOf(drawn, 'lan_can_phai'),
      trai.map(([x, y]) => [-x, y])
    )
    // Lan can thép: chép nguyên block, có ở cả hai bên.
    const thep = drawn.filter(e => role(e) === 'lan_can' && !isPoly(e))
    // Chép nguyên block: 77 đoạn, 33 cung, 7 vòng tròn, và 1 trụ cong vẽ bằng
    // polyline mỗi bên.
    expect(thep.length).toBe(2 * (77 + 33 + 7))
    expect(drawn.filter(e => role(e) === 'lan_can' && isPoly(e)).length).toBe(2 + 2)
    const ong = drawn.filter(e => role(e) === 'ong_thoat_nuoc')
    expect(ong.map(e => e.layer)).toEqual(['KT-THOATNUOC', 'KT-THOATNUOC'])
  })

  test('hai cọc ⌀1200 tim ở ±2650 (B − 2D), đầu ngàm 150 vào bệ', () => {
    const coc = drawn.filter(e => role(e) === 'coc_khoan_nhoi')
    const than = coc.filter(isLine).map(e => {
      const l = e as AcDbEntity & { startPoint: { x: number; y: number }; endPoint: { y: number } }
      return [Math.round(l.startPoint.x), Math.round(l.startPoint.y), Math.round(l.endPoint.y)]
    })
    // Nét bao ngoài: ±600 quanh mỗi tim, từ đáy bệ (100) xuống 1000.
    for (const x of [-3250, -2050, 2050, 3250]) {
      expect(than).toContainEqual([x, 100, -900])
    }
    const ngam = coc.filter(e => isPoly(e) && vertices(e).length === 4)
    expect(ngam.length).toBe(2)
    expectVertices(ngam[0], [
      [-3250, 100],
      [-3250, 250],
      [-2050, 250],
      [-2050, 100]
    ])
  })

  test('19 kích thước kiểu D100, in trị số nguyên như tờ bản vẽ', () => {
    const dims = drawn.filter(e => role(e) === 'kich_thuoc') as (AcDbEntity & {
      dimensionText: string | null
      dimensionStyleName: string | null
    })[]
    expect(dims.length).toBe(19)
    expect(dims.every(e => e.dxfTypeName === 'DIMENSION')).toBe(true)
    expect(dims.every(e => readSemanticTag(e)?.params === undefined)).toBe(true)
    expect(dims.every(e => e.dimensionStyleName === 'D100')).toBe(true)
    const texts = dims.map(e => e.dimensionText).sort()
    // Đúng các số kỹ sư ghi: 100, 500, 1140, 1200, 1811, 2000, 4793, 5300, 7000, 7700, 8000.
    for (const so of ['100', '500', '1140', '1200', '1811', '2000', '4793', '5300', '7000', '7700', '8000']) {
      expect(texts).toContain(so)
    }
    expect(texts.every(t => /^\d+$/.test(t ?? ''))).toBe(true)
    // Kiểu D100 dựng trong bản vẽ: chữ 150 xanh lá, kiểu chữ Arial.
    const d100 = database.tables.dimStyleTable.getAt('D100')!
    expect(d100.dimtxt).toBe(150)
    expect(d100.dimclrt).toBe(3)
  })

  test('kiểu nét như block: tim tuyến CENTER, ngàm cọc DASHED, tim cọc DASHDOT', () => {
    const tim = drawn.find(e => partId(e) === 'duong_tim_01')!
    expect(tim.lineType).toBe('CENTER')
    expect(drawn.find(e => partId(e) === 'duong_tim_02')!.lineType).toBe('DASHDOT')
    const ngam = drawn.filter(e => role(e) === 'coc_khoan_nhoi' && isPoly(e) && vertices(e).length === 4)
    expect(ngam.every(e => e.lineType === 'DASHED')).toBe(true)
    for (const name of ['CENTER', 'DASHED', 'DASHDOT']) {
      expect(database.tables.linetypeTable.has(name)).toBe(true)
    }
  })

  test('đường dẫn ghi chú có mũi tên ở điểm được chỉ', () => {
    const leaders = drawn.filter(e => role(e) === 'ghi_chu' && isPoly(e))
    const arrows = drawn.filter(e => role(e) === 'ghi_chu' && e.dxfTypeName === 'HATCH')
    expect(leaders.length).toBe(9)
    expect(arrows.length).toBe(9)
    // Đường dẫn "BÊ TÔNG ĐỆM C8" gồm ba điểm: mũi tên trong bê tông lót, gấp lên, gạch dưới chữ.
    const lot = leaders.find(e => vertices(e).length === 3)!
    expect(vertices(lot)[0]).toEqual([450.6, 40])
  })

  test('9 mốc cao độ, đỉnh tam giác chạm đúng mặt như bản vẽ', () => {
    const moc = drawn.filter(e => role(e) === 'ghi_chu_cao_do' && isPoly(e))
    const dinh = moc.map(e => vertices(e)[0]).sort((a, b) => a[1] - b[1] || a[0] - b[0])
    const expected = [
      [4291.7, 100], // EL6 đáy bệ
      [4344.7, 2100], // EL5 đỉnh bệ
      [-4122.8, 6893.4], // EL4.R
      [0, 6893.4], // EL3
      [4272.4, 6893.4], // EL4.L
      [0, 8774.6], // FE mặt đường tại tim
      [2500, 8774.6], // FG tại tim giai đoạn hoàn thiện
      [-5466.7, 9844.6], // EL1.R đỉnh lan can thép
      [4437.6, 9844.6] // EL1.L
    ]
    expect(dinh.length).toBe(expected.length)
    dinh.forEach((v, i) => {
      expect(v[0]).toBeCloseTo(expected[i][0], 0)
      expect(v[1]).toBeCloseTo(expected[i][1], 0)
    })
    const nhan = drawn
      .filter(e => role(e) === 'ghi_chu_cao_do' && e.dxfTypeName === 'TEXT')
      .map(e => (e as AcDbEntity & { textString: string }).textString)
      .sort()
    expect(nhan).toEqual(['EL1.L', 'EL1.R', 'EL3', 'EL4.L', 'EL4.R', 'EL5', 'EL6', 'FE', 'FG'])
  })

  test('ghi chú, tiêu đề và ký hiệu mặt cắt của bản vẽ', () => {
    const texts = drawn
      .filter(e => e.dxfTypeName === 'TEXT')
      .map(e => (e as AcDbEntity & { textString: string }).textString)
    expect(texts).toContain('%%UMẶT CHÍNH MỐ M1')
    expect(texts).toContain('(TL: 1/100)')
    expect(texts).toContain('Tim cầu')
    expect(texts).toContain('Tim giai đoạn hoàn thiện')
    expect(texts).toContain('BÊ TÔNG ĐỆM C8')
    expect(texts).toContain('CỌC KHOAN NHỒI')
    expect(texts.filter(t => t === 'i=0%').length).toBe(2)
    expect(texts.filter(t => ['A', 'B', 'C'].includes(t)).length).toBe(6)
    // Tim tuyến đi từ đáy bê tông lót lên gần đỉnh lan can, như bản vẽ.
    const tim = drawn.find(e => partId(e) === 'duong_tim_01') as AcDbEntity & {
      startPoint: { x: number; y: number }
      endPoint: { x: number; y: number }
    }
    expect(tim.startPoint.x).toBeCloseTo(0, 0)
    expect(tim.startPoint.y).toBeCloseTo(0, 0)
    expect(tim.endPoint.y).toBeCloseTo(9648, 0)
  })
})

describe('tham số đổi thì cả mố đổi theo', () => {
  test('dốc hai mái 2 % — mọi mặt từ đỉnh tường thân trở lên nghiêng từ tim ra', () => {
    const { drawn } = run({ iTrai: 2, iPhai: 2 })
    expectVertices(polyOf(drawn, 'mo_tuong_than'), [
      [-3850, 2100],
      [-3850, 6816.4],
      [0, 6893.4],
      [3850, 6816.4],
      [3850, 2100]
    ])
    // Vai kê đi theo, lan can vẫn ôm đúng hai góc vai kê.
    const dau = vertices(polyOf(drawn, 'mo_tuong_dau'))
    expect(dau[1]).toEqual([3850, 8620.5])
    expect(dau[2]).toEqual([3500, 8634.6])
    const lc = vertices(polyOf(drawn, 'lan_can_phai'))
    expect(lc[5]).toEqual([3850, 8620.5])
    expect(lc[6]).toEqual([3500, 8634.6])
    expect(lc[3][1]).toBeCloseTo(8620.5 - 542.9, 0)
    // Bệ vẫn phẳng.
    expectVertices(polyOf(drawn, 'mo_be'), [
      [-3850, 100],
      [-3850, 2100],
      [3850, 2100],
      [3850, 100]
    ])
    const texts = drawn
      .filter(e => e.dxfTypeName === 'TEXT')
      .map(e => (e as AcDbEntity & { textString: string }).textString)
    expect(texts.filter(t => t === 'i=2%').length).toBe(2)
  })

  test('siêu cao một mái: trái dấu thì mặt nghiêng thẳng qua tim', () => {
    const { drawn } = run({ iTrai: -2, iPhai: 2 })
    const than = vertices(polyOf(drawn, 'mo_tuong_than'))
    expect(than[1]).toEqual([-3850, 6970.4])
    expect(than[3]).toEqual([3850, 6816.4])
  })

  test('đổi B và D: cọc giữ đúng quy tắc tim–tim = B − 2D', () => {
    const { drawn } = run({ B: 9000, D: 1000 })
    const ngam = drawn.filter(
      e => role(e) === 'coc_khoan_nhoi' && isPoly(e) && vertices(e).length === 4
    )
    expect(vertices(ngam[0])[0][0]).toBeCloseTo(-4000, 0)
    expect(vertices(ngam[1])[0][0]).toBeCloseTo(3000, 0)
    expect(readSemanticTag(drawn.find(e => partId(e) === 'coc_khoan_nhoi_01')!)?.params).toEqual(
      expect.objectContaining({ khoangCach: 7000, tyLeTimD: 7 })
    )
  })

  test('nhãn tên tham số như bản vẽ gốc khi được chọn', () => {
    const { drawn } = run({ ghi: 'ten' })
    const ten = drawn
      .filter(e => role(e) === 'kich_thuoc')
      .map(e => readSemanticTag(e)?.params?.ten)
      .filter(Boolean)
      .sort()
    expect(ten).toEqual(
      ['B cầu', 'B mố', 'B mố - 2D', 'D cọc', 'D cọc', 'H1A', 'H1B', 'H3A', 'H3B', 'HB', 'HB', 'HB', 'b mặt đường'].sort()
    )
  })

  test('cho cao độ đáy bê tông lót thì mốc in trị số thật', () => {
    const { drawn } = run({ caoDo: '12.345' })
    const nhan = drawn
      .filter(e => role(e) === 'ghi_chu_cao_do' && e.dxfTypeName === 'TEXT')
      .map(e => (e as AcDbEntity & { textString: string }).textString)
    expect(nhan).toContain('+12.445') // đáy bệ = 12,345 + 0,100
    expect(nhan).toContain('+14.445') // đỉnh bệ
    expect(nhan).toContain('+21.120') // mặt đường tại tim: 12,345 + 8,7746
    expect(nhan).toContain('+22.190') // đỉnh lan can thép
  })

  test('tắt ghi chú và kích thước thì chỉ còn hình', () => {
    const { drawn } = run({ ghi: 'khong' })
    const roles = new Set(drawn.map(role))
    expect(roles.has('kich_thuoc')).toBe(false)
    expect(roles.has('ghi_chu')).toBe(false)
    expect(roles.has('ghi_chu_cao_do')).toBe(false)
    expect(roles.has('tieu_de_ban_ve')).toBe(false)
    expect(roles.has('ky_hieu_mat_cat')).toBe(false)
    expect(roles.has('mo_tuong_dau')).toBe(true)
  })

  test('tên mố lên tiêu đề', () => {
    const { drawn } = run({ tenMo: 'M2' })
    const texts = drawn
      .filter(e => e.dxfTypeName === 'TEXT')
      .map(e => (e as AcDbEntity & { textString: string }).textString)
    expect(texts).toContain('%%UMẶT CHÍNH MỐ M2')
  })

  test('dời gốc: mọi thứ tịnh tiến theo', () => {
    const { drawn } = run({ x: 314937.691, y: 9495.05 })
    expectVertices(polyOf(drawn, 'mo_be'), [
      [311087.7, 9595.1],
      [311087.7, 11595.1],
      [318787.7, 11595.1],
      [318787.7, 9595.1]
    ])
  })
})

describe('từ chối hình không dựng được, nêu điều khoản', () => {
  test('lan can thấp hơn sàn tuyệt đối của điều 7.3.2.1 bị dải giá trị chặn', () => {
    const template = load()
    const values: Record<string, unknown> = {}
    for (const param of template.params) values[param.key] = param.default
    values.hLC = 600
    const errors = validateParamValues(template.params, values as never)
    expect(errors.join(' ')).toMatch(/685/)
  })

  test('bản ghi lời gọi của một lượt dựng nằm gọn trong một chuỗi XData 255 ký tự', () => {
    // Trình duyệt ghi { i, v, a: values } vào XData của mọi đối tượng để sửa
    // tại chỗ được; quá 255 là template không dựng nổi ngoài đời dù suite
    // này xanh. Đo với trị số dài nhất kỹ sư có thể gõ.
    const template = load()
    const values: Record<string, unknown> = {}
    for (const param of template.params) values[param.key] = param.default
    Object.assign(values, { x: -314937.691, y: -9495.05, caoDo: '-12.345', tenMo: 'M12' })
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(values).sort()) sorted[key] = values[key]
    const record = JSON.stringify({ i: template.meta.id, v: template.meta.version, a: sorted })
    expect(record.length).toBeLessThanOrEqual(255)
  })

  test('cọc chồng nhau khi B − 2D < D', () => {
    expect(() => run({ B: 3500 })).toThrow(/chồng/)
  })

  test('vai kê nuốt hết mặt đường', () => {
    expect(() => run({ B: 3000, bVaiKe: 1500 })).toThrow(/mặt đường/)
  })
})
