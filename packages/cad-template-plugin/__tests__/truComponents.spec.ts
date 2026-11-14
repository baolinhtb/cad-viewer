/**
 * The pier templates (`tru_mat_chinh`, `tru_mat_ben`) and their assembly,
 * loaded exactly as the library loads them: the very files that get uploaded,
 * evaluated with the SDK on `globalThis`, drawn through roles onto the seed
 * `_33_` layers.
 *
 * They are a preliminary layout, not measured from an office drawing (there
 * is none in the repository); the tests pin what they promise — the contract,
 * the elevation chain shared by both views, the one standards constraint they
 * enforce, and their geometry — so a later re-measurement shows up as a diff.
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
  readSemanticTag,
  SEED_ROLE_LAYERS,
  validateParamValues
} from '@mlightcad/cad-template-sdk'
import { AcDbDatabase, AcDbEntity, AcDbText } from '@mlightcad/data-model'

import { assemblyCatalogue, findAssembly, runAssembly } from '../src/assembly'
import { listRuns } from '../src/runIdentity'
import { setRemoteTemplates } from '../src/templateRegistry'
import { loadLibraryTemplate, registerLibrary } from './helpers/libraryTemplate'

const DIR = join(__dirname, '..', 'library')
const FILES = ['tru_mat_chinh.js', 'tru_mat_ben.js'] as const

const newDatabase = () => {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}
const entities = (db: AcDbDatabase): AcDbEntity[] => [
  ...db.tables.blockTable.modelSpace.newIterator()
]
const r = (n: number) => Math.round(n * 100) / 100

function defaults(t: { params: { key: string; default?: unknown }[] }) {
  return Object.fromEntries(t.params.map(p => [p.key, p.default]))
}

function draw(file: string, overrides: Record<string, unknown> = {}) {
  const t = loadLibraryTemplate(file)
  const values = { ...defaults(t), ...overrides }
  const errors = [
    ...validateParamValues(t.params, values as never),
    ...t.validate(values)
  ]
  const db = newDatabase()
  if (errors.length) return { db, errors, drawn: [] as AcDbEntity[] }
  const ctx = createDrawContext(db, t.meta.id, SEED_ROLE_LAYERS)
  t.generate(ctx, values)
  return { db, errors, drawn: [...ctx.drawn] }
}

/** Bounding box of every entity with this role. */
function box(list: AcDbEntity[], role: string) {
  const found = list.filter(e => readSemanticTag(e)?.role === role)
  if (!found.length) return undefined
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const e of found) {
    const b = e.geometricExtents
    x0 = Math.min(x0, b.min.x)
    y0 = Math.min(y0, b.min.y)
    x1 = Math.max(x1, b.max.x)
    y1 = Math.max(y1, b.max.y)
  }
  return { x0: r(x0), y0: r(y0), x1: r(x1), y1: r(y1) }
}

describe('library contract', () => {
  test.each(FILES)(
    '%s: one default export, no import, 1.0.0, says it is preliminary',
    file => {
      const code = readFileSync(join(DIR, file), 'utf8')
      expect(code.match(/^\s*export default /gm)).toHaveLength(1)
      expect(code).not.toMatch(/^\s*import\s/m)
      const t = loadLibraryTemplate(file)
      expect(t.meta.id).toBe(file.replace('.js', ''))
      expect(t.meta.version).toBe('1.0.0')
      expect(t.meta.category).toBe('Mố trụ')
      expect(t.meta.description).toMatch(
        /bố cục sơ bộ, chưa đối chiếu bản vẽ văn phòng/i
      )
      expect(t.params.map((p: { key: string }) => p.key)).toEqual(
        expect.arrayContaining(['x', 'y'])
      )
    }
  )

  test.each(FILES)(
    '%s: every hint either cites a clause or disclaims one',
    file => {
      const t = loadLibraryTemplate(file)
      for (const p of t.params) {
        if (p.type === 'choice' && p.key === 'ghiKichThuoc') continue
        expect({
          key: p.key,
          ok: /TCVN 11823-\d+:2017 đ\.|do tính toán|chặn sai số|chưa biết/.test(
            p.hint ?? ''
          )
        }).toEqual({ key: p.key, ok: true })
      }
    }
  )

  test('the shared block is the same, character for character, in both files', () => {
    const cut = (file: string) => {
      const code = readFileSync(join(DIR, file), 'utf8')
      return code.slice(
        code.indexOf('// ---- DÙNG CHUNG'),
        code.indexOf('// ---- HẾT PHẦN DÙNG CHUNG ----')
      )
    }
    expect(cut('tru_mat_chinh.js').length).toBeGreaterThan(5000)
    expect(cut('tru_mat_ben.js')).toBe(cut('tru_mat_chinh.js'))
  })
})

describe.each(FILES)('%s', file => {
  test.each(['tuong', 'cot'])(
    'draws with defaults (loaiThan=%s), all tagged, all on _33_',
    loaiThan => {
      const { errors, drawn } = draw(file, { loaiThan })
      expect(errors).toEqual([])
      expect(drawn.length).toBeGreaterThan(20)
      for (const e of drawn) {
        const tag = readSemanticTag(e)
        expect(tag).toBeTruthy()
        expect(e.layer).toBe(SEED_ROLE_LAYERS[tag!.role])
        expect(e.layer.startsWith('_33_')).toBe(true)
      }
      const roles = new Set(drawn.map(e => readSemanticTag(e)!.role))
      for (const role of [
        'tru_be_tong_lot',
        'tru_be',
        'tru_coc_khoan_nhoi',
        'tru_than',
        'tru_xa_mu',
        'tru_da_ke_goi',
        'duong_tim',
        'kich_thuoc'
      ])
        expect(roles.has(role)).toBe(true)
    }
  )

  test.each(['tuong', 'cot'])('geometry snapshot (loaiThan=%s)', loaiThan => {
    const { drawn } = draw(file, { loaiThan })
    const rows = drawn.map(e => {
      const tag = readSemanticTag(e)!
      const b = e.geometricExtents
      return `${e.dxfTypeName}|${tag.role}|${tag.partId}|${[b.min.x, b.min.y, b.max.x, b.max.y].map(r).join(',')}`
    })
    expect(rows.sort()).toMatchSnapshot()
  })

  test('the elevation chain: lót, bệ, thân, xà mũ, đá kê stack without gaps', () => {
    const { drawn } = draw(file, { y: 1000 })
    expect(box(drawn, 'tru_be_tong_lot')).toMatchObject({ y0: 1000, y1: 1100 })
    expect(box(drawn, 'tru_be')).toMatchObject({ y0: 1100, y1: 3100 })
    expect(box(drawn, 'tru_than')).toMatchObject({ y0: 3100, y1: 9100 })
    expect(box(drawn, 'tru_xa_mu')).toMatchObject({ y0: 9100, y1: 10600 })
    expect(box(drawn, 'tru_da_ke_goi')).toMatchObject({ y0: 10600, y1: 10800 })
  })

  test('piles hang from the underside of the bệ and keep 300 mm to its edge', () => {
    const { drawn } = draw(file)
    const be = box(drawn, 'tru_be')!
    const coc = box(drawn, 'tru_coc_khoan_nhoi')!
    expect(coc.y1).toBe(be.y0)
    expect(coc.x0 - be.x0).toBeGreaterThanOrEqual(300)
    expect(be.x1 - coc.x1).toBeGreaterThanOrEqual(300)
  })
})

describe('mặt chính', () => {
  test('the xà mũ is the declared length, its cantilever ends shallower', () => {
    const { drawn } = draw('tru_mat_chinh.js')
    const xa = box(drawn, 'tru_xa_mu')!
    expect(xa.x1 - xa.x0).toBe(12000)
    const end = drawn.find(e => readSemanticTag(e)?.role === 'tru_xa_mu')!
    // 6 vertices: two at each end (depth 800) and two under the stem.
    expect(
      (end as unknown as { numberOfVertices: number }).numberOfVertices
    ).toBe(6)
  })

  test('a column stem draws one part per column', () => {
    const { drawn } = draw('tru_mat_chinh.js', {
      loaiThan: 'cot',
      soCot: 3,
      aCot: 3400
    })
    const ids = new Set(
      drawn
        .filter(e => readSemanticTag(e)?.role === 'tru_than')
        .map(e => readSemanticTag(e)!.partId)
    )
    expect([...ids].sort()).toEqual([
      'tru_than_01',
      'tru_than_02',
      'tru_than_03'
    ])
  })

  test('pile spacing under 4D and 6D is noted on the drawing, citing đ.8.1.2', () => {
    const notes = draw('tru_mat_chinh.js')
      .drawn.filter(
        (e): e is AcDbText =>
          e instanceof AcDbText && readSemanticTag(e)?.role === 'ghi_chu'
      )
      .map(e => e.textString)
    expect(notes.filter(n => n.includes('< 4D'))).toHaveLength(2)
    expect(notes.filter(n => n.includes('< 6D'))).toHaveLength(2)
    expect(notes.find(n => n.includes('< 4D'))).toMatch(
      /khoan không ống vách.*đ\.8\.1\.2/
    )
    expect(notes[0]).toMatch(/Bố cục sơ bộ/)
    // Wide enough spacing: no 4D/6D notes.
    const wide = draw('tru_mat_chinh.js', {
      aCocNgang: 7200,
      soCocNgang: 2,
      aCocDoc: 7200,
      lBe: 9000
    }).drawn.filter(
      e => e instanceof AcDbText && readSemanticTag(e)?.role === 'ghi_chu'
    )
    expect(
      wide.map(e => (e as AcDbText).textString).some(t => /[46]D/.test(t))
    ).toBe(false)
  })

  test('a known pile length is drawn full, without the "còn tiếp" mark', () => {
    const { drawn } = draw('tru_mat_chinh.js', { lCoc: 30000 })
    const coc = box(drawn, 'tru_coc_khoan_nhoi')!
    expect(coc.y1 - coc.y0).toBe(30000)
  })
})

describe('mặt bên', () => {
  test('two rows of bearings at ±eGoi, or one at the centre', () => {
    const two = draw('tru_mat_ben.js').drawn
    expect(box(two, 'tru_da_ke_goi')).toMatchObject({ x0: -800, x1: 800 })
    const one = draw('tru_mat_ben.js', { soHangGoi: 1 }).drawn
    expect(box(one, 'tru_da_ke_goi')).toMatchObject({ x0: -300, x1: 300 })
  })

  test('shows the stem thickness: tThan for a wall, dCot for columns', () => {
    expect(box(draw('tru_mat_ben.js').drawn, 'tru_than')).toMatchObject({
      x0: -700,
      x1: 700
    })
    expect(
      box(draw('tru_mat_ben.js', { loaiThan: 'cot' }).drawn, 'tru_than')
    ).toMatchObject({ x0: -600, x1: 600 })
  })
})

describe('validation: refused before anything is drawn', () => {
  test.each(FILES)('%s: same checks in both views', file => {
    const t = loadLibraryTemplate(file)
    const errs = (o: Record<string, unknown>) =>
      t.validate({ ...defaults(t), ...o }) as string[]
    expect(errs({ bBe: 8000 }).join()).toMatch(
      /dưới 300 mm — TCVN 11823-10:2017 đ\.8\.1\.2/
    )
    expect(errs({ hXaMuDau: 1600 }).join()).toMatch(/Đầu hẫng/)
    expect(errs({ lHang: 3500 }).join()).toMatch(/vát đầu hẫng/)
    expect(errs({ soGoi: 6 }).join()).toMatch(/vượt chiều dài xà mũ/)
    expect(errs({ loaiThan: 'cot', aCot: 1000 }).join()).toMatch(/cột chồng/)
    expect(errs({ aCocNgang: 1100 }).join()).toMatch(/cọc chồng/)
    expect(errs({ eGoi: 200 }).join()).toMatch(/chồng lên nhau/)
    expect(errs({})).toEqual([])
  })
})

describe('tru_cau_hoan_chinh', () => {
  beforeAll(() => registerLibrary(...FILES))
  afterAll(() => setRemoteTemplates([]))

  test('is listed, says it is preliminary', () => {
    expect(findAssembly('tru_cau_hoan_chinh')?.moTa).toMatch(
      /Bố cục sơ bộ, chưa đối chiếu bản vẽ văn phòng/
    )
    expect(assemblyCatalogue()).toContain('tru_cau_hoan_chinh')
  })

  test('both views from one call, two runs, same elevations', async () => {
    const db = newDatabase()
    const result = await runAssembly('tru_cau_hoan_chinh', { y: 500 }, db)
    expect(result.errors).toEqual([])
    expect(result.buoc.map(s => s.templateId)).toEqual([
      'tru_mat_chinh',
      'tru_mat_ben'
    ])
    expect(listRuns(db).map(run => run.templateId)).toEqual([
      'tru_mat_chinh',
      'tru_mat_ben'
    ])
    const of = (templateId: string) =>
      entities(db).filter(e => readSemanticTag(e)?.templateId === templateId)
    for (const role of ['tru_be', 'tru_than', 'tru_xa_mu', 'tru_da_ke_goi']) {
      const front = box(of('tru_mat_chinh'), role)!
      const side = box(of('tru_mat_ben'), role)!
      expect([side.y0, side.y1]).toEqual([front.y0, front.y1])
    }
    // Side view centred kcHinh to the right.
    const sideBe = box(of('tru_mat_ben'), 'tru_be')!
    expect((sideBe.x0 + sideBe.x1) / 2).toBe(16000)
    // The views do not overlap.
    expect(box(of('tru_mat_chinh'), 'kich_thuoc')!.x1).toBeLessThan(
      Math.min(...of('tru_mat_ben').map(e => e.geometricExtents.min.x))
    )
  })

  test('soCot > 0 builds a column stem in both views', async () => {
    const db = newDatabase()
    const result = await runAssembly('tru_cau_hoan_chinh', { soCot: 2 }, db)
    expect(result.errors).toEqual([])
    expect(listRuns(db).map(run => run.values.loaiThan)).toEqual(['cot', 'cot'])
  })

  test('a value refused by the templates stops before drawing', async () => {
    const db = newDatabase()
    const result = await runAssembly('tru_cau_hoan_chinh', { bBe: 8000 }, db)
    expect(result.errors.join()).toMatch(/đ\.8\.1\.2/)
    expect(entities(db)).toHaveLength(0)
  })
})

describe('the road the agent takes: library → loader → chay_template / ghep_bo_phan', () => {
  // The browser fetches `/api/templates`, then each module, then evaluates it
  // (blob import, here the same evaluation the helper does). This is the path
  // the abutment templates take after an author uploads them.
  async function loadFromLibrary() {
    const { loadRemoteTemplates } = await import('../src/remoteTemplates')
    const summaries = FILES.map(file => {
      const t = loadLibraryTemplate(file)
      return {
        templateId: t.meta.id,
        version: t.meta.version,
        name: t.meta.name,
        category: t.meta.category,
        description: t.meta.description,
        status: 'published' as const,
        uploadedBy: 1,
        verifiedAt: null
      }
    })
    const codeOf = Object.fromEntries(
      FILES.map(file => [
        file.replace('.js', ''),
        readFileSync(join(DIR, file), 'utf8')
      ])
    )
    const fetchImpl = async (url: string) => {
      const match = /\/api\/templates\/([^/]+)\/([^/]+)$/.exec(url)
      return {
        ok: true,
        status: 200,
        json: async () =>
          match
            ? { template: { code: codeOf[decodeURIComponent(match[1])] } }
            : { templates: summaries }
      }
    }
    const evaluate = async (code: string) => {
      const id = Object.keys(codeOf).find(k => codeOf[k] === code)!
      return loadLibraryTemplate(`${id}.js`)
    }
    const result = await loadRemoteTemplates(
      fetchImpl,
      '/api/templates',
      evaluate
    )
    expect(result.failed).toEqual([])
    setRemoteTemplates(result.loaded)
  }

  afterEach(() => setRemoteTemplates([]))

  test.each(['tru_mat_chinh', 'tru_mat_ben'])('chay_template %s', async id => {
    await loadFromLibrary()
    const { runTemplateTool } = await import('../src/templateTools')
    const db = newDatabase()
    const outcome = await runTemplateTool(
      'chay_template',
      { ma_template: id, thong_so: { loaiThan: 'cot' } },
      db
    )
    expect(outcome.ok).toBe(true)
    expect(outcome.message).toContain(`${id} v1.0.0`)
    expect(listRuns(db).map(run => run.templateId)).toEqual([id])
  })

  test('ghep_bo_phan tru_cau_hoan_chinh', async () => {
    await loadFromLibrary()
    const { runTemplateTool } = await import('../src/templateTools')
    const db = newDatabase()
    const outcome = await runTemplateTool(
      'ghep_bo_phan',
      { ma_ghep: 'tru_cau_hoan_chinh', thong_so: { soCot: 2 } },
      db
    )
    expect(outcome.ok).toBe(true)
    expect(listRuns(db).map(run => run.templateId)).toEqual([
      'tru_mat_chinh',
      'tru_mat_ben'
    ])
  })

  test('without the library loaded, the assembly says which templates are missing', async () => {
    setRemoteTemplates([])
    const { runTemplateTool } = await import('../src/templateTools')
    const outcome = await runTemplateTool(
      'ghep_bo_phan',
      { ma_ghep: 'tru_cau_hoan_chinh' },
      newDatabase()
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toMatch(/tru_mat_chinh, tru_mat_ben/)
  })
})
