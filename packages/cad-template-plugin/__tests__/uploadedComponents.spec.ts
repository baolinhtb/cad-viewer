/**
 * The uploadable components, exercised the way the library will run them.
 *
 * A library template is a string of JavaScript that the browser evaluates with
 * the SDK on `globalThis`. Type-checking never sees it, so the only thing
 * standing between a typo and a broken drawing is a spec that actually runs it.
 * These read the same files that get uploaded — not a copy — so the two cannot
 * drift.
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
import { AcDbDatabase } from '@mlightcad/data-model'

/** The very files that get uploaded, so the two cannot drift. */
const DIR = join(__dirname, '..', 'library')

/** Role → layer, as the deployment's standardisation layer supplies it. */
const ROLE_LAYERS: Record<string, string> = {
  lan_can: 'KC-LANCAN',
  go_chan_banh: 'KC-GOCHAN',
  ban_mat_cau: 'KC-BAN',
  be_coc: 'KC-BECOC',
  mo_be: 'KC-MO-BE',
  mo_be_tong_lot: 'KC-MO-BTLOT',
  mo_tuong_than: 'KC-MO-TUONGTHAN',
  mo_tuong_dau: 'KC-MO-TUONGDAU',
  mo_tuong_tai: 'KC-MO-TUONGTAI',
  kich_thuoc: 'GC-KICHTHUOC',
  lop_phu: 'KC-LOPPHU',
  coc_khoan_nhoi: 'KC-COC',
  ghi_chu: 'GC-GHICHU',
  duong_tim: 'TRUC-TIM'
}

/**
 * Loads a template the way the library does, as far as this runner allows.
 *
 * The browser hands the uploaded text to `import()` through a blob URL, which
 * jest has no loader for. The module shape is fixed by the upload contract —
 * one `export default`, no imports, SDK read off `globalThis` — so evaluating
 * the body directly reaches the same object. What matters is that this reads
 * the very file that gets uploaded, not a copy of it.
 */
function load(file: string) {
  ;(globalThis as unknown as Record<string, unknown>).__CAD_TEMPLATE_SDK__ = {
    formatPartId
  }
  const code = readFileSync(join(DIR, file), 'utf8')
  if (!/^\s*export default /m.test(code)) {
    throw new Error(`${file}: thiếu "export default" mà hợp đồng upload yêu cầu`)
  }
  const body = code.replace(/^\s*export default /m, 'return ')
  return new Function(`${body}`)()
}

function newDatabase() {
  const database = new AcDbDatabase()
  database.createDefaultData()
  return database
}

function run(template: any, values: Record<string, unknown>) {
  const database = newDatabase()
  const errors = validateParamValues(template.params, values as never)
  if (errors.length) return { database, errors, drawn: [] as unknown[] }
  const ctx = createDrawContext(database, template.meta.id, ROLE_LAYERS)
  template.generate(ctx, values)
  return { database, errors: [], drawn: [...ctx.drawn] }
}

const FILES = [
  ['lan_can_nguoi_di_bo.js', 'lan_can_nguoi_di_bo_tcvn'],
  ['le_bo_hanh.js', 'le_bo_hanh_tcvn'],
  ['tuong_phong_ho.js', 'tuong_phong_ho_btct'],
  ['be_coc_khoan_nhoi.js', 'be_coc_khoan_nhoi'],
  ['mo_cau_btct.js', 'mo_cau_btct']
] as const

describe('every uploadable component', () => {
  test.each(FILES)('%s declares what the upload endpoint requires', (file, id) => {
    const t = load(file)
    expect(t.meta.id).toBe(id)
    expect(t.meta.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(t.meta.name.length).toBeGreaterThan(0)
    // Placement, or it cannot be assembled with the others.
    expect(t.params.map((p: { key: string }) => p.key)).toEqual(
      expect.arrayContaining(['x', 'y'])
    )
  })

  test.each(FILES)('%s draws with its declared defaults, and tags it', file => {
    const t = load(file)
    const values: Record<string, unknown> = {}
    for (const spec of t.params) {
      if (spec.default !== undefined) values[spec.key] = spec.default
    }
    const { drawn, errors } = run(t, values)
    expect(errors).toEqual([])
    expect(drawn.length).toBeGreaterThan(0)
    // Untagged geometry cannot be edited by name afterwards.
    expect(drawn.every(entity => readSemanticTag(entity as never))).toBe(true)
  })

  test.each(FILES)('%s says where its bounds come from', file => {
    // Two honest answers, and no third one.
    //
    // Either a bound is regulated, and the clause travels with it — a bound
    // with no provenance sends the assistant off to look the standard up, the
    // exact cost this whole design removes. Or it is not regulated, and the
    // template says so: TCVN 11823-11:2017 governs abutments but its numbers
    // are all about reinforced-earth walls, so a conventional concrete
    // abutment's wall thicknesses come from calculation and nothing else.
    // Printing "theo TCVN" over a number the standard never gave is worse than
    // printing nothing, because the reader trusts an authority that is not
    // there.
    const t = load(file)
    const hints = t.params
      .map((p: { hint?: string }) => p.hint ?? '')
      .concat(t.meta.description ?? '')
    const cited = hints.filter((hint: string) => /TCVN|AASHTO|QCVN/.test(hint))
    const disclaimed = hints.filter((hint: string) =>
      /do tính toán|không quy định|chặn sai số/i.test(hint)
    )

    expect(cited.length + disclaimed.length).toBeGreaterThan(0)
  })
})

describe('lan can đường người đi bộ', () => {
  // TCVN 11823-13:2017 điều 8.1.
  test('refuses a height under 1070 mm', () => {
    const t = load('lan_can_nguoi_di_bo.js')
    const { errors, drawn } = run(t, { h: 1000, khoangHo: 130 })
    expect(errors.join(' ')).toContain('1070')
    expect(drawn).toHaveLength(0)
  })

  test('refuses a clear gap a 150 mm sphere would pass through', () => {
    const t = load('lan_can_nguoi_di_bo.js')
    const { errors } = run(t, { h: 1100, khoangHo: 150 })
    expect(errors.join(' ')).toContain('149')
  })

  test('adds rails until no gap reaches 150 mm', async () => {
    // The number of rails is a consequence of the rule, not an input: a
    // railing one rail short looks identical to a correct one.
    const t = load('lan_can_nguoi_di_bo.js')
    for (const h of [1070, 1200, 1400, 1600]) {
      const { drawn } = run(t, { h, khoangHo: 149, dThanh: 50, bTru: 150 })
      const rails = drawn.length - 1 // minus the post
      const gap = (h - rails * 50) / rails
      expect(gap).toBeLessThan(150)
    }
  })
})

describe('lề bộ hành', () => {
  // TCVN 11823-13:2017 điều 11.2 gives both ends of the kerb band.
  test.each([[149], [201]])('refuses a kerb of %i mm', height => {
    const t = load('le_bo_hanh.js')
    const { errors, drawn } = run(t, { hBoVia: height })
    expect(errors.length).toBeGreaterThan(0)
    expect(drawn).toHaveLength(0)
  })

  test('records the transition length when the kerb steps', async () => {
    // Not drawable on a cross-section, but the longitudinal draughtsman needs
    // the number — so it rides in the tag rather than being lost.
    const t = load('le_bo_hanh.js')
    const { drawn } = run(t, {
      hBoVia: 200,
      hBoViaNgoaiCau: 150,
      bLe: 1.5,
      dLe: 150
    })
    const tags = drawn.map(e => readSemanticTag(e as never))
    const kerb = tags.find(tag => tag?.role === 'go_chan_banh')
    expect(kerb?.params?.chuyenTiepToiThieu).toBe(1000) // 50 mm × 20
  })

  test('no step means no transition and no note', () => {
    const t = load('le_bo_hanh.js')
    const { drawn } = run(t, { hBoVia: 200, hBoViaNgoaiCau: 200 })
    expect(drawn.map(e => readSemanticTag(e as never)?.role)).not.toContain(
      'ghi_chu'
    )
  })
})

describe('tường phòng hộ bê tông', () => {
  // Profile lấy từ `lancan-left.dwg` / `lancan-right.dwg`. Bản trước tự đặt
  // điểm gãy ở "khoảng 55% chiều cao, theo hình dạng thông dụng" — nghĩa là
  // đoán, và bản vẽ thật khác hẳn: chân rộng 100, phình 500 ở giữa, thu về 300
  // ở đỉnh, và có khấc ở chân để ôm mép bản mặt cầu.
  const load3 = () => load('tuong_phong_ho.js')

  test.each([
    ['TL-3', 685],
    ['TL-4', 810],
    ['TL-5', 1070]
  ])('%s accepts exactly its minimum, %i mm', (level, min) => {
    const { drawn, errors } = run(load3(), { capThuNghiem: level, h: min })
    expect(errors).toEqual([])
    expect(drawn.length).toBeGreaterThan(0)
  })

  test('a millimetre under the test level is refused, citing the clause', () => {
    expect(() => run(load3(), { capThuNghiem: 'TL-5', h: 1069 })).toThrow(/1070/)
  })

  test('reproduces the drawn profile, not a guessed one', () => {
    // Seven vertices with a notch at the foot — a shape no formula would
    // produce, and the reason this template now carries coordinates.
    const wall = run(load3(), { ben: 'phai', x: 0, y: 0, h: 1090 }).drawn.find(
      e => readSemanticTag(e as never)?.role === 'lan_can'
    ) as never as {
      numberOfVertices: number
      getPoint2dAt: (i: number) => { x: number; y: number }
    }
    expect(wall.numberOfVertices).toBe(7)

    const pts: [number, number][] = []
    for (let i = 0; i < wall.numberOfVertices; i++) {
      const p = wall.getPoint2dAt(i)
      pts.push([Math.round(p.x), Math.round(p.y)])
    }
    // The notch: the foot is 150 wide and the body only reaches 500 above 543.
    expect(pts).toContainEqual([150, 0])
    expect(pts).toContainEqual([150, 543])
    expect(pts).toContainEqual([500, 550])
    // Top at the requested height, 300 wide.
    expect(pts).toContainEqual([0, 1090])
    expect(pts).toContainEqual([300, 1090])
  })

  test('only the top follows the height; the drawn foot does not stretch', () => {
    // A drawing cannot say how the notch varies with height, so it does not.
    const tall = run(load3(), { h: 1400 }).drawn.find(
      e => readSemanticTag(e as never)?.role === 'lan_can'
    ) as never as {
      numberOfVertices: number
      getPoint2dAt: (i: number) => { x: number; y: number }
    }
    const ys: number[] = []
    for (let i = 0; i < tall.numberOfVertices; i++) {
      ys.push(Math.round(tall.getPoint2dAt(i).y))
    }
    expect(ys).toContain(1400)
    expect(ys).toContain(543) // khấc giữ nguyên
    expect(ys).toContain(690)
  })

  test('the chamfer faces the carriageway on both sides', () => {
    const span = (side: string) => {
      const box = (
        run(load3(), { ben: side, x: 0 }).drawn[0] as unknown as {
          geometricExtents: { min: { x: number }; max: { x: number } }
        }
      ).geometricExtents
      return { min: box.min.x, max: box.max.x }
    }
    expect(span('phai').max).toBeGreaterThan(0)
    expect(span('trai').min).toBeLessThan(0)
  })

  test('carries the duct the drawing shows', () => {
    const roles = run(load3(), {}).drawn.map(
      e => readSemanticTag(e as never)?.role
    )
    expect(roles).toContain('ong_thoat_nuoc')
  })
})

describe('bệ cọc khoan nhồi', () => {
  // TCVN 11823-10:2017 điều 8.1.2 gives three numbers at two different levels
  // of force, and the whole point of this template is not to flatten them.
  const load4 = () => load('be_coc_khoan_nhoi.js')

  test('refuses an edge distance under 300 mm — that one is a prohibition', () => {
    const t = load4()
    const { errors, drawn } = run(t, { cuLyMepBe: 299 })
    expect(errors.length).toBeGreaterThan(0)
    expect(drawn).toHaveLength(0)
  })

  test('draws at spacing under 4D, and records what that obliges', () => {
    // "phải đánh giá ảnh hưởng tương tác" is extra work, not a ban. Turning it
    // into an error would block a legitimate layout on a cramped site.
    const t = load4()
    const { drawn, errors } = run(t, { D: 1000, khoangCach: 3000, soCoc: 3 })
    expect(errors).toEqual([])
    expect(drawn.length).toBeGreaterThan(0)

    const cap = drawn
      .map(e => readSemanticTag(e as never))
      .find(tag => tag?.role === 'be_coc')
    // The tag carries the ratio — a defining value, short enough for XData.
    expect(cap?.params?.tyLeTimD).toBe(3)
    expect(String(cap?.params?.dieuKhoan)).toContain('8.1.2')
    // The obligation itself is on the drawing, where an engineer reads it.
    const notes = drawn
      .map(e => readSemanticTag(e as never))
      .filter(tag => tag?.role === 'ghi_chu')
    expect(notes.length).toBe(2)
  })

  test('spacing at or over 6D obliges nothing, and says so', () => {
    const t = load4()
    const { drawn } = run(t, { D: 1000, khoangCach: 6000, soCoc: 3 })
    const cap = drawn
      .map(e => readSemanticTag(e as never))
      .find(tag => tag?.role === 'be_coc')
    expect(cap?.params?.tyLeTimD).toBe(6)
    // No obligation means no note cluttering the drawing.
    expect(drawn.map(e => readSemanticTag(e as never)?.role)).not.toContain(
      'ghi_chu'
    )
  })

  test('between 4D and 6D only the drilling-sequence note applies', () => {
    const t = load4()
    const { drawn } = run(t, { D: 1000, khoangCach: 5000, soCoc: 3 })
    const cap = drawn
      .map(e => readSemanticTag(e as never))
      .find(tag => tag?.role === 'be_coc')
    expect(cap?.params?.tyLeTimD).toBe(5)
    const notes = drawn
      .map(e => readSemanticTag(e as never))
      .filter(tag => tag?.role === 'ghi_chu')
    expect(notes.length).toBe(1)
  })

  test('refuses piles that would overlap', () => {
    // Not a clause — just geometry that cannot be built.
    const t = load4()
    expect(() => run(t, { D: 1500, khoangCach: 1400 })).toThrow(/chồng lên nhau/)
  })

  test('every pile is separately addressable', () => {
    // "cọc số 2 sâu thêm 3 m" has to find one pile, not the group.
    const t = load4()
    const { drawn } = run(t, { soCoc: 4, D: 1000, khoangCach: 6000 })
    const ids = drawn
      .map(e => readSemanticTag(e as never))
      .filter(tag => tag?.role === 'coc_khoan_nhoi')
      .map(tag => tag!.partId)
    expect(new Set(ids).size).toBe(4)
  })
})

describe('mố cầu BTCT', () => {
  // Built from two sources because each holds what the other lacks: the
  // assembly drawing `banve_mo.dwg` for how the parts relate, the component
  // drawings for the shape of each. They disagree, and the assembly wins —
  // measured: splitting the components into separate files levelled them, so
  // the backwall reads 0.37% there and 2.00% in the assembly.
  const load6 = () => load('mo_cau_btct.js')

  /** Bounding box of everything drawn for a role. */
  const boxOf = (drawn: unknown[], role: string) => {
    const found = drawn.filter(e => readSemanticTag(e as never)?.role === role)
    const boxes = found.map(
      e =>
        (e as never as {
          geometricExtents: {
            min: { x: number; y: number }
            max: { x: number; y: number }
          }
        }).geometricExtents
    )
    return {
      minY: Math.min(...boxes.map(b => b.min.y)),
      maxY: Math.max(...boxes.map(b => b.max.y)),
      minX: Math.min(...boxes.map(b => b.min.x)),
      maxX: Math.max(...boxes.map(b => b.max.x))
    }
  }

  test('reproduces the levels of the assembly drawing', () => {
    // The engineer's own drawing, measured: blinding 876→976, footing
    // 976→2976, stem top 7615–7769, backwall top 9441–9581.
    const t = load6()
    const { drawn, errors } = run(t, { y: 876 })
    expect(errors).toEqual([])

    const lot = boxOf(drawn, 'mo_be_tong_lot')
    const be = boxOf(drawn, 'mo_be')
    const than = boxOf(drawn, 'mo_tuong_than')
    const dau = boxOf(drawn, 'mo_tuong_dau')

    expect(lot.minY).toBeCloseTo(876)
    expect(lot.maxY).toBeCloseTo(976)
    expect(be.maxY).toBeCloseTo(2976)
    // The stem sits on the footing and its top is sloped, so the box runs from
    // the footing level up to the higher edge — the levels the assembly has.
    expect(than.minY).toBeCloseTo(2976)
    expect(than.maxY).toBeCloseTo(7769, -1)
    // The assembly's top-right corner is 9581; the shoulder sits 7 above the
    // outer edge, so the box closes a few millimetres higher. Asserted as a
    // band rather than a point — claiming millimetre agreement with a drawing
    // measured off screen coordinates would be claiming more than was measured.
    expect(dau.maxY).toBeGreaterThan(9570)
    expect(dau.maxY).toBeLessThan(9600)
  })

  test('the crossfall runs through every surface above the footing', () => {
    // The design rule, and the reason it belongs in the template rather than
    // in a set of levels: change the fall once and the whole abutment follows.
    const t = load6()
    const { drawn } = run(t, { doDocNgang: 2 })

    const than = boxOf(drawn, 'mo_tuong_than')
    const dau = boxOf(drawn, 'mo_tuong_dau')
    const phu = boxOf(drawn, 'lop_phu')

    // 2% across 7700 is 154, so each edge sits 77 off the centre value: the
    // stem measures 4716 at the centreline and 4793 to its higher corner.
    expect(than.maxY - than.minY).toBeCloseTo(4716 + 77, -1)
    for (const band of [dau, phu]) {
      expect(band.maxY - band.minY).toBeGreaterThan(100)
    }
  })

  test('a flat deck produces flat surfaces', () => {
    // The same code path with the fall at zero: the stem top becomes level.
    const t = load6()
    const { drawn } = run(t, { doDocNgang: 0 })
    const than = drawn.find(
      e => readSemanticTag(e as never)?.role === 'mo_tuong_than'
    ) as never as { getPoint2dAt: (i: number) => { x: number; y: number } }
    expect(than.getPoint2dAt(2).y).toBeCloseTo(than.getPoint2dAt(3).y)
  })

  test('the footing stays level whatever the crossfall', () => {
    // The fall starts at the top of the footing; below it nothing tilts.
    const t = load6()
    const { drawn } = run(t, { doDocNgang: 4 })
    const be = drawn.find(
      e => readSemanticTag(e as never)?.role === 'mo_be'
    ) as never as { getPoint2dAt: (i: number) => { x: number; y: number } }
    expect(be.getPoint2dAt(0).y).toBeCloseTo(be.getPoint2dAt(1).y)
    expect(be.getPoint2dAt(2).y).toBeCloseTo(be.getPoint2dAt(3).y)
  })

  test('widths narrow with height, as the assembly does', () => {
    const t = load6()
    const { drawn } = run(t, {})
    expect(boxOf(drawn, 'mo_be_tong_lot').maxX - boxOf(drawn, 'mo_be_tong_lot').minX).toBeCloseTo(7900)
    expect(boxOf(drawn, 'mo_be').maxX - boxOf(drawn, 'mo_be').minX).toBeCloseTo(7700)
    // The wearing course sits between the shoulders: 7700 less 350 each side.
    expect(boxOf(drawn, 'lop_phu').maxX - boxOf(drawn, 'lop_phu').minX).toBeCloseTo(7000)
  })

  test('each wing wall is separately addressable', () => {
    const t = load6()
    const { drawn } = run(t, { bTai: 150, hTai: 1200 })
    const sides = drawn
      .map(e => readSemanticTag(e as never))
      .filter(tag => tag?.role === 'mo_tuong_tai')
      .map(tag => tag!.partId)
    expect(new Set(sides).size).toBe(2)
    expect(sides.some(id => id.includes('trai'))).toBe(true)
    expect(sides.some(id => id.includes('phai'))).toBe(true)
  })

  test('draws neither piles nor railings — each has its own template', () => {
    const t = load6()
    const roles = run(t, {}).drawn.map(e => readSemanticTag(e as never)?.role)
    for (const foreign of ['coc_khoan_nhoi', 'be_coc', 'lan_can']) {
      expect(roles).not.toContain(foreign)
    }
  })

  test('dimensions the stack', () => {
    const t = load6()
    const texts = run(t, {})
      .drawn.filter(e => readSemanticTag(e as never)?.role === 'kich_thuoc')
      .map(e => (e as never as { dimensionText: string }).dimensionText)
    expect(texts.length).toBe(6)
    expect(texts.some(text => text.includes('7700'))).toBe(true)
    expect(texts.some(text => text.includes('2000'))).toBe(true)
  })

  test('refuses geometry that cannot be built', () => {
    const t = load6()
    expect(() => run(t, { B: 2000, bTai: 1500 })).toThrow(/không nằm lọt/)
    expect(() => run(t, { B: 2000, bVaiKe: 1500 })).toThrow(/không nằm lọt/)
  })
})
