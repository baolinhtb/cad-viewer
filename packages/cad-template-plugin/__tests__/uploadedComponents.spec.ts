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
  test.each([
    ['TL-3', 685],
    ['TL-4', 810],
    ['TL-5', 1070]
  ])('%s accepts exactly its minimum, %i mm', (level, min) => {
    const t = load('tuong_phong_ho.js')
    const { drawn, errors } = run(t, { capThuNghiem: level, h: min })
    expect(errors).toEqual([])
    expect(drawn.length).toBeGreaterThan(0)
  })

  test('a millimetre under the test level is refused, citing the clause', () => {
    const t = load('tuong_phong_ho.js')
    expect(() => run(t, { capThuNghiem: 'TL-5', h: 1069 })).toThrow(/1070/)
  })

  test('the chamfer faces the carriageway on both sides', () => {
    const t = load('tuong_phong_ho.js')
    const left = run(t, { ben: 'trai', x: 0 })
    const right = run(t, { ben: 'phai', x: 0 })
    const span = (r: { drawn: unknown[] }) => {
      const box = (r.drawn[0] as { geometricExtents: { min: { x: number }; max: { x: number } } })
        .geometricExtents
      return { min: box.min.x, max: box.max.x }
    }
    expect(span(right).max).toBeGreaterThan(0)
    expect(span(left).min).toBeLessThan(0)
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
  // Shape and every default come from three component drawings an engineer
  // sent — `33_MO_BE`, `33_MO_TUONGTHAN`, `33_MO_TUONGDAU` — not from guesswork.
  // The first version of this template stacked four rectangles and was wrong
  // where only a real drawing could say so.
  const load6 = () => load('mo_cau_btct.js')

  test('stacks the components in order, sharing one centreline', () => {
    const t = load6()
    const { drawn, errors } = run(t, {})
    expect(errors).toEqual([])

    const box = (role: string) => {
      const found = drawn.filter(e => readSemanticTag(e as never)?.role === role)
      const boxes = found.map(e => (e as never as { geometricExtents: { min: { x: number; y: number }; max: { x: number; y: number } } }).geometricExtents)
      return {
        minY: Math.min(...boxes.map(b => b.min.y)),
        maxY: Math.max(...boxes.map(b => b.max.y)),
        minX: Math.min(...boxes.map(b => b.min.x)),
        maxX: Math.max(...boxes.map(b => b.max.x))
      }
    }

    const lot = box('mo_be_tong_lot')
    const be = box('mo_be')
    const than = box('mo_tuong_than')

    expect(be.minY).toBeCloseTo(lot.maxY)
    expect(than.minY).toBeCloseTo(be.maxY)

    // The engineer's numbers, not invented ones.
    expect(lot.maxY - lot.minY).toBeCloseTo(100)
    expect(be.maxY - be.minY).toBeCloseTo(2000)
    expect(than.maxY - than.minY).toBeCloseTo(4843)

    expect(be.maxX - be.minX).toBeCloseTo(7700)
    expect(lot.maxX - lot.minX).toBeCloseTo(7900)
    for (const b of [lot, be, than]) {
      expect((b.minX + b.maxX) / 2).toBeCloseTo(0)
    }
  })

  test('the top of the backwall is not flat', () => {
    // The correction that only the real drawing could supply: the backwall top
    // carries the crossfall and steps down at both edges where the wearing
    // course beds in. A rectangle there is simply the wrong shape.
    const t = load6()
    const { drawn } = run(t, { B: 7700, bVaiKe: 350, hVaiKe: 7, doDocNgang: 0.37 })
    const wall = drawn.find(
      e => readSemanticTag(e as never)?.role === 'mo_tuong_dau'
    ) as never as { numberOfVertices: number; getPoint2dAt: (i: number) => { x: number; y: number } }

    expect(wall.numberOfVertices).toBe(6)

    const ys = new Set<number>()
    for (let i = 0; i < wall.numberOfVertices; i++) {
      ys.add(Math.round(wall.getPoint2dAt(i).y * 100) / 100)
    }
    // Four distinct heights along the top and bottom, not two.
    expect(ys.size).toBeGreaterThan(2)
  })

  test('the wearing course follows the crossfall', () => {
    const t = load6()
    const { drawn } = run(t, { tLopPhu: 70, doDocNgang: 2 })
    const course = drawn.find(
      e => readSemanticTag(e as never)?.role === 'lop_phu'
    ) as never as { getPoint2dAt: (i: number) => { x: number; y: number } }

    // Left edge sits higher than the right when the deck falls to the right.
    expect(course.getPoint2dAt(0).y).toBeGreaterThan(course.getPoint2dAt(1).y)
  })

  test('can be asked for without a wearing course', () => {
    const t = load6()
    const { drawn } = run(t, { tLopPhu: 0 })
    expect(
      drawn.filter(e => readSemanticTag(e as never)?.role === 'lop_phu')
    ).toHaveLength(0)
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

  test('draws no piles — those belong to their own template', () => {
    // `be_coc_khoan_nhoi` draws them with the TCVN 11823-10:2017 §8.1.2 checks.
    // A second copy here is exactly the duplication where two templates end up
    // saying different things about one clause.
    const t = load6()
    const { drawn } = run(t, {})
    const roles = drawn.map(e => readSemanticTag(e as never)?.role)
    expect(roles).not.toContain('coc_khoan_nhoi')
    expect(roles).not.toContain('be_coc')
  })

  test('dimensions the stack with the real numbers', () => {
    const t = load6()
    const { drawn } = run(t, {})
    const texts = drawn
      .filter(e => readSemanticTag(e as never)?.role === 'kich_thuoc')
      .map(e => (e as never as { dimensionText: string }).dimensionText)

    expect(texts.length).toBe(6)
    for (const wanted of ['7700', '2000', '4843']) {
      expect(texts.some(text => text.includes(wanted))).toBe(true)
    }
  })

  test('refuses geometry that cannot be built', () => {
    const t = load6()
    expect(() => run(t, { B: 2000, bTai: 1500 })).toThrow(/không nằm lọt/)
    expect(() => run(t, { B: 2000, bVaiKe: 1500 })).toThrow(/không nằm lọt/)
  })
})
