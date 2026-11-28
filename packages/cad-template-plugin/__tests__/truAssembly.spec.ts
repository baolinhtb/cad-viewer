/**
 * Checks `tru_cau_hoan_chinh` makes across its two views, before drawing:
 * the distance between the views (kcHinh). Numbers worked by hand in each
 * test, so a change of rule shows up as a changed number, not a silent pass.
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

import {
  acTpBuildDrawingFrame,
  readSemanticTag
} from '@mlightcad/cad-template-sdk'
import { AcDbDatabase, AcDbEntity } from '@mlightcad/data-model'

import { acTpTruKcHinhToiThieu, runAssembly } from '../src/assembly'
import { setRemoteTemplates } from '../src/templateRegistry'
import { runTemplateTool } from '../src/templateTools'
import { registerLibrary } from './helpers/libraryTemplate'

const FILES = ['tru_mat_chinh.js', 'tru_mat_ben.js'] as const

const newDatabase = () => {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}
const entities = (db: AcDbDatabase): AcDbEntity[] => [
  ...db.tables.blockTable.modelSpace.newIterator()
]
const of = (db: AcDbDatabase, templateId: string) =>
  entities(db).filter(e => readSemanticTag(e)?.templateId === templateId)

/** Pairs (front entity, side entity) whose boxes overlap. */
function overlaps(db: AcDbDatabase): string[] {
  const hits: string[] = []
  for (const a of of(db, 'tru_mat_chinh'))
    for (const b of of(db, 'tru_mat_ben')) {
      const p = a.geometricExtents
      const q = b.geometricExtents
      if (
        p.min.x < q.max.x &&
        q.min.x < p.max.x &&
        p.min.y < q.max.y &&
        q.min.y < p.max.y
      )
        hits.push(
          `${readSemanticTag(a)?.partId} / ${readSemanticTag(b)?.partId}`
        )
    }
  return hits
}

beforeAll(() => registerLibrary(...FILES))
afterAll(() => setRemoteTemplates([]))

describe('kcHinh: the two views never overlap', () => {
  const DEFAULTS: Record<string, number> = {
    bBe: 9500,
    bXaMu: 12000,
    lBe: 6000,
    lXaMu: 2000,
    phuLot: 100
  }
  const min = (o: Record<string, number> = {}) =>
    acTpTruKcHinhToiThieu(k => o[k] ?? DEFAULTS[k])

  test('the minimum, by hand', () => {
    // max(4750 + 100, 6000) + max(3000 + 100, 1000) + 11000
    expect(min()).toBe(6000 + 3100 + 11000)
    expect(min()).toBe(20100)
    // A wide footing: max(8000 + 500, 6000) + max(4500 + 500, 1000) + 11000
    expect(min({ bBe: 16000, lBe: 9000, phuLot: 500 })).toBe(24500)
  })

  test('the defaults pass (kcHinh 21000 ≥ 20100)', async () => {
    const db = newDatabase()
    const result = await runAssembly('tru_cau_hoan_chinh', {}, db)
    expect(result.errors).toEqual([])
    expect(overlaps(db)).toEqual([])
  })

  test('kcHinh 12000 is refused with the rule and its numbers; nothing drawn', async () => {
    const db = newDatabase()
    const result = await runAssembly(
      'tru_cau_hoan_chinh',
      { kcHinh: 12000 },
      db
    )
    expect(result.errors).toEqual([
      'Chưa vẽ gì: kcHinh = 12000 mm nhỏ hơn mức tối thiểu 20100 mm = ' +
        'max(bBe/2 + phuLot, bXaMu/2) + max(lBe/2 + phuLot, lXaMu/2) + 11000 = ' +
        'max(9500/2 + 100, 12000/2) + max(6000/2 + 100, 2000/2) + 11000 — ' +
        'mặt chính (cả khối GHI CHÚ rộng 8000 bên phải nó) và mặt bên sẽ ' +
        'chồng nhau. Lấy kcHinh ≥ 20100 mm.'
    ])
    expect(result.buoc).toEqual([])
    expect(entities(db)).toHaveLength(0)
  })

  test('the old default 16000 is refused: its GHI CHÚ ran into the side view', async () => {
    // What the check is for. Drawn without it (16000 > the old 13000), the
    // front view's third note crossed the side view's xà mũ.
    const result = await runAssembly(
      'tru_cau_hoan_chinh',
      { kcHinh: 16000 },
      newDatabase()
    )
    expect(result.errors.join()).toMatch(/Lấy kcHinh ≥ 20100 mm/)
  })

  test('keys outside the shared values count: phuLot passed, lXaMu from the template', async () => {
    // max(4750 + 500, 6000) + max(3000 + 500, 2000/2) + 11000 = 20500
    const result = await runAssembly(
      'tru_cau_hoan_chinh',
      { phuLot: 500, kcHinh: 20400 },
      newDatabase()
    )
    expect(result.errors.join()).toMatch(/tối thiểu 20500 mm/)
    expect(result.errors.join()).toMatch(/max\(6000\/2 \+ 500, 2000\/2\)/)
  })

  test.each([
    ['defaults', {}],
    ['phuLot 500', { phuLot: 500 }],
    ['wide footing', { bBe: 16000, lBe: 9000, soCocNgang: 4, aCocDoc: 5000 }],
    [
      'wide cap',
      { bXaMu: 20000, lXaMu: 4000, soGoi: 7, eGoi: 1200, lDaKe: 1000 }
    ],
    ['D 700: a GHI CHÚ on the side view too', { D: 700, phuLot: 500 }],
    ['tall stem', { hThan: 30000 }],
    ['columns', { soCot: 2 }]
  ] as [string, Record<string, number>][])(
    'at exactly the minimum nothing overlaps — %s',
    async (_name, values) => {
      const kcHinh = min(values)
      const db = newDatabase()
      const result = await runAssembly(
        'tru_cau_hoan_chinh',
        { ...values, kcHinh },
        db
      )
      expect(result.errors).toEqual([])
      expect(of(db, 'tru_mat_ben').length).toBeGreaterThan(0)
      expect(overlaps(db)).toEqual([])
    }
  )

  test('a negative kcHinh (side view on the left) is checked the same way', async () => {
    expect(
      (
        await runAssembly(
          'tru_cau_hoan_chinh',
          { kcHinh: -12000 },
          newDatabase()
        )
      ).errors
    ).toHaveLength(1)
    const db = newDatabase()
    const result = await runAssembly(
      'tru_cau_hoan_chinh',
      { kcHinh: -20100, D: 700 },
      db
    )
    expect(result.errors).toEqual([])
    expect(overlaps(db)).toEqual([])
  })

  test('the tool says «Chưa vẽ gì:» first', async () => {
    const outcome = await runTemplateTool(
      'ghep_bo_phan',
      { ma_ghep: 'tru_cau_hoan_chinh', thong_so: { kcHinh: 12000 } },
      newDatabase()
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toMatch(/^Chưa vẽ gì: kcHinh = 12000 mm/)
  })
})

describe('seat width N and D < 750 through the assembly', () => {
  test('the optional values are listed, and not defaulted into the runs', async () => {
    const { assemblyCatalogue } = await import('../src/assembly')
    expect(assemblyCatalogue()).toMatch(
      /Thông số tuỳ chọn \(không truyền thì không dùng\):\n {4}khungTen \(0\/1\)[^\n]*\n {4}lNhip \(mm\)/
    )
    const { listRuns } = await import('../src/runIdentity')
    const db = newDatabase()
    await runAssembly('tru_cau_hoan_chinh', {}, db)
    for (const run of listRuns(db))
      expect(Object.keys(run.values)).not.toEqual(
        expect.arrayContaining(['lNhip'])
      )
  })

  test('defaults: drawn, with «Chưa kiểm chiều rộng đỡ dầm N»', async () => {
    const outcome = await runTemplateTool(
      'ghep_bo_phan',
      { ma_ghep: 'tru_cau_hoan_chinh', thong_so: {} },
      newDatabase()
    )
    expect(outcome.ok).toBe(true)
    expect(outcome.message).toContain(
      'Ghi chú: Chưa kiểm chiều rộng đỡ dầm N (TCVN 11823-4 đ.7.4.4)'
    )
    expect(outcome.message).not.toMatch(/750/)
  })

  test('L 33 000, 100 %: drawn, N đạt (cận trên)', async () => {
    const result = await runAssembly(
      'tru_cau_hoan_chinh',
      { lNhip: 33000, phanTramN: 100 },
      newDatabase()
    )
    expect(result.errors).toEqual([])
    expect(result.ghiChu?.[0]).toMatch(/^Chiều rộng đỡ dầm N .* đạt/)
  })

  test('L 300 000, 150 %: refused before drawing, «Chưa vẽ gì:» and the numbers', async () => {
    const db = newDatabase()
    const outcome = await runTemplateTool(
      'ghep_bo_phan',
      {
        ma_ghep: 'tru_cau_hoan_chinh',
        thong_so: { lNhip: 300000, phanTramN: 150 }
      },
      db
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toMatch(
      /^Chưa vẽ gì: Mặt chính trụ: Xà mũ không đủ chiều rộng đỡ dầm tối thiểu — TCVN 11823-4:2017 đ\.7\.4\.4/
    )
    expect(outcome.message).toContain('= 1140,4 mm')
    expect(outcome.message).toContain('Cần lXaMu ≥ 2282 mm.')
    expect(entities(db)).toHaveLength(0)
  })

  test('D 700: drawn, noted in the message and on both sheets', async () => {
    const db = newDatabase()
    const outcome = await runTemplateTool(
      'ghep_bo_phan',
      { ma_ghep: 'tru_cau_hoan_chinh', thong_so: { D: 700 } },
      db
    )
    expect(outcome.ok).toBe(true)
    expect(outcome.message).toContain(
      'D = 700 mm < 750 mm: hố khoan không được kiểm tra thủ công ' +
        '(TCVN 11823-10:2017 đ.8.1.3) — nếu kiểm tra thủ công cần D ≥ 750 mm.'
    )
    for (const id of ['tru_mat_chinh', 'tru_mat_ben'])
      expect(
        of(db, id).some(
          e =>
            readSemanticTag(e)?.role === 'ghi_chu' &&
            /< 750 mm/.test((e as unknown as { textString: string }).textString)
        )
      ).toBe(true)
  })
})

describe('khungTen 1: each view on its own A3 sheet with the title block', () => {
  const runsOf = async (values: Record<string, number>) => {
    const { listRuns } = await import('../src/runIdentity')
    const db = newDatabase()
    const result = await runAssembly('tru_cau_hoan_chinh', values, db)
    return { db, result, runs: listRuns(db) }
  }
  type Box = { x0: number; y0: number; x1: number; y1: number }
  const boxOf = (list: AcDbEntity[]): Box => {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const e of list) {
      const b = e.geometricExtents
      x0 = Math.min(x0, b.min.x)
      y0 = Math.min(y0, b.min.y)
      x1 = Math.max(x1, b.max.x)
      y1 = Math.max(y1, b.max.y)
    }
    return { x0, y0, x1, y1 }
  }
  const inside = (a: Box, b: Box) =>
    a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1
  const byRun = (db: AcDbDatabase, runId: string) =>
    entities(db).filter(e => readSemanticTag(e)?.run?.id === runId)

  test('without khungTen nothing changes: two runs, no frame', async () => {
    const { runs } = await runsOf({})
    expect(runs.map(r => r.templateId)).toEqual([
      'tru_mat_chinh',
      'tru_mat_ben'
    ])
  })

  test('defaults at 1:100: two sheets side by side, titles, no overlap', async () => {
    const { db, result, runs } = await runsOf({ khungTen: 1 })
    expect(result.errors).toEqual([])
    expect(runs.map(r => r.templateId)).toEqual([
      'tru_mat_chinh',
      'tru_mat_ben',
      'khung_ban_ve',
      'khung_ban_ve'
    ])
    // The views get no layout keys and no khungTen.
    for (const run of runs.slice(0, 2))
      expect(
        Object.keys(run.values).filter(
          k => k.startsWith('_') || k === 'khungTen'
        )
      ).toEqual([])
    const texts = (runId: string) =>
      byRun(db, runId).flatMap(e =>
        'textString' in e
          ? [(e as unknown as { textString: string }).textString]
          : []
      )
    const [chinh, ben, k1, k2] = runs
    expect(k1.values.tiLe).toBe(100)
    expect(k2.values.tiLe).toBe(100)
    expect(texts(k1.id)).toEqual(
      expect.arrayContaining([
        'MẶT CHÍNH TRỤ',
        '(TL: 1/100)',
        'TRỤ CẦU — MẶT CHÍNH (BỐ CỤC SƠ BỘ)',
        '1:100'
      ])
    )
    expect(texts(k2.id)).toEqual(
      expect.arrayContaining(['MẶT BÊN TRỤ', '(TL: 1/100)', '1:100'])
    )
    // No sheet number invented.
    expect(k1.values.soHieuTo ?? '').toBe('')

    // Each view (with its dimensions and GHI CHÚ) inside its own sheet's
    // border, clear of the other sheet; the sheets themselves apart.
    const sheet1 = boxOf(byRun(db, k1.id))
    const sheet2 = boxOf(byRun(db, k2.id))
    expect(sheet1.x1).toBeLessThan(sheet2.x0)
    expect(sheet2.x0 - sheet1.x1).toBeCloseTo(2000, 6) // 20 mm × 100
    expect(sheet1.x1 - sheet1.x0).toBeCloseTo(42000, 6)
    expect(sheet1.y0).toBeCloseTo(sheet2.y0, 6)
    // Inside the drawing area: above the title strip, inside the border.
    const da = acTpBuildDrawingFrame({ khoGiay: 'A3', truong: {} }).drawArea
    const area = (sheet: Box): Box => ({
      x0: sheet.x0 + da.x * 100,
      y0: sheet.y0 + da.y * 100,
      x1: sheet.x0 + (da.x + da.w) * 100,
      y1: sheet.y0 + (da.y + da.h) * 100
    })
    expect(inside(boxOf(byRun(db, chinh.id)), area(sheet1))).toBe(true)
    expect(inside(boxOf(byRun(db, ben.id)), area(sheet2))).toBe(true)

    // Nothing of a view touches its frame, title block or title text.
    const hits: string[] = []
    for (const [view, frame] of [
      [chinh, k1],
      [ben, k2]
    ])
      for (const a of byRun(db, view.id))
        for (const b of byRun(db, frame.id)) {
          const p = a.geometricExtents
          const q = b.geometricExtents
          // The outer border box contains everything; only its lines count.
          const isBorder =
            readSemanticTag(b)?.role !== 'tieu_de_ban_ve' &&
            q.max.x - q.min.x > 30000
          if (isBorder) continue
          if (
            p.min.x < q.max.x &&
            q.min.x < p.max.x &&
            p.min.y < q.max.y &&
            q.min.y < p.max.y
          )
            hits.push(
              `${readSemanticTag(a)?.partId} / ${readSemanticTag(b)?.partId}`
            )
        }
    expect(hits).toEqual([])
  })

  test('the view stays where x, y say; the frame moves around it', async () => {
    const { runs } = await runsOf({ khungTen: 1, x: 5000, y: 120000 })
    expect(runs[0].values.x).toBe(5000)
    expect(runs[0].values.y).toBe(120000)
    expect(runs[1].values.y).toBe(120000)
  })

  test('a bigger pier takes a smaller scale from the series', async () => {
    const { runs, result } = await runsOf({
      khungTen: 1,
      bXaMu: 30000,
      bBe: 26000,
      soCocNgang: 7,
      bThan: 20000,
      soGoi: 12,
      hThan: 20000
    })
    expect(result.errors).toEqual([])
    const n = runs[2].values.tiLe as number
    expect([125, 150, 200, 250, 500]).toContain(n)
    expect(runs[3].values.tiLe).toBe(n)
  })

  test('too tall for A3 at 1:500: «Chưa vẽ gì:», nothing drawn', async () => {
    const { db, result } = await runsOf({
      khungTen: 1,
      hThan: 50000,
      lCoc: 80000
    })
    expect(result.errors.join()).toMatch(
      /^Chưa vẽ gì: trụ rộng \d+ mm, cao \d+ mm .*không vừa khung A3 ở tỉ lệ 1:500\.$/
    )
    expect(entities(db)).toHaveLength(0)
  })

  test('with sheets, kcHinh is not checked (the sheets keep the views apart)', async () => {
    const { result } = await runsOf({ khungTen: 1, kcHinh: 5000 })
    expect(result.errors).toEqual([])
  })
})
