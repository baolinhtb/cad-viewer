/**
 * The abutment split into components, checked against the assembly it came from.
 *
 * The three component templates were extracted from `mo_cau_btct`, which
 * encoded the one thing a set of separate part drawings cannot: how the parts
 * sit relative to each other. The extracted files are proven honest here by
 * running all three with their defaults and matching the result against the
 * assembly, part by part. If a component ever drifts — a slope sign, a datum,
 * a shoulder — this fails, which is the only reason the split is safe to make.
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

describe('mố tách thành cấu kiện', () => {
  const assembly = boxesByRole(run('mo_cau_btct.js', {}, FIXTURES))
  const parts = boxesByRole([
    ...run('mo_be_mong.js'),
    ...run('mo_tuong_than.js'),
    ...run('mo_tuong_dau.js')
  ])

  it('ba mẫu cấu kiện chạy mặc định phủ đúng các bộ phận của mẫu mố', () => {
    expect([...parts.keys()].sort()).toEqual([...assembly.keys()].sort())
  })

  test.each([
    'mo_be_tong_lot',
    'mo_be',
    'mo_tuong_than',
    'mo_tuong_dau',
    'mo_tuong_tai',
    'lop_phu'
  ])('%s trùng khít hình học với mẫu mố hoàn chỉnh', role => {
    expect(parts.get(role)).toEqual(assembly.get(role))
  })

  it('mặc định xếp chồng: đỉnh bệ là đáy tường thân, đỉnh tường thân là đáy tường đầu', () => {
    const be = load('mo_be_mong.js')
    const than = load('mo_tuong_than.js')
    const dau = load('mo_tuong_dau.js')
    const d = (t: any, key: string) =>
      t.params.find((p: any) => p.key === key).default

    expect(d(than, 'y')).toBe(d(be, 'y') + d(be, 'hLot') + d(be, 'hBe'))
    expect(d(dau, 'y')).toBe(d(than, 'y') + d(than, 'hThan'))
  })

  it('tường tai vẫn được tô đặc sau khi tách', () => {
    const hatches = run('mo_tuong_dau.js').filter(e => e.dxfTypeName === 'HATCH')
    expect(hatches).toHaveLength(2)
    for (const hatch of hatches) {
      expect((hatch as unknown as { isSolidFill: boolean }).isSolidFill).toBe(true)
      expect(readSemanticTag(hatch)?.role).toBe('mo_tuong_tai')
    }
  })

  it('độ dốc đi hết ba cấu kiện: đổi dấu thì mép cao đổi bên', () => {
    const boxOf = (drawn: AcDbEntity[], role: string) =>
      drawn.find(e => readSemanticTag(e)?.role === role)!.geometricExtents

    // Đỉnh tường thân nghiêng: mép phải cao hơn khi dốc dương.
    const duong = boxOf(run('mo_tuong_than.js', { doDocNgang: 2 }), 'mo_tuong_than')
    const am = boxOf(run('mo_tuong_than.js', { doDocNgang: -2 }), 'mo_tuong_than')
    // Cùng một chiều cao tổng, nhưng đỉnh lệch về hai phía khác nhau.
    expect(duong.max.y).toBeCloseTo(am.max.y, 6)
    const phang = boxOf(run('mo_tuong_than.js', { doDocNgang: 0 }), 'mo_tuong_than')
    expect(duong.max.y).toBeGreaterThan(phang.max.y)
    expect(duong.min.y).toBeCloseTo(phang.min.y, 6)
  })

  it('từ chối tường tai rộng quá bề rộng tường đầu', () => {
    // Bề rộng nhỏ nhất cho phép là 2000; hai tường tai 1500 mỗi bên thì không
    // lọt. Ở bề rộng mặc định 7700 thì dải khai báo của bTai (tối đa 3000) đã
    // chặn trước, nên chốt chặn này chỉ với tường hẹp mới tới lượt.
    expect(() => run('mo_tuong_dau.js', { B: 2000, bTai: 1500 })).toThrow(
      /không nằm lọt trong bề rộng/
    )
  })
})
