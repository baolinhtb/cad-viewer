/**
 * P2-M4: the piles as an array placed from the model (soCotCoc, soHangCoc,
 * aCocNgang, aCocDoc), like the bearings (P1/M3). The source's 2 × 2 flush
 * with the footing edges keeps the source drawing exactly (0.3.1); any other
 * layout the model accepts (edge clearance 300, no overlap) is drawn in the
 * pile plan, the front elevation and sections A–A, B–B, C–C. "L1" is the QA
 * dossier (8 m road, stem 1,2 m, wings 4 m, D1000 piles 25 m long). Set
 * QA_EVIDENCE_DIR to write the measured numbers there.
 */
jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { readSemanticTag } from '@mlightcad/cad-template-sdk'
import { AcDbDatabase, AcDbEntity, AcDbText } from '@mlightcad/data-model'

import { acTpBtklMo } from '../src/btkl/mo'
import { acapDeriveDossierValues } from '../src/dossier/derive'
import { sheetStretch } from '../src/dossier/grid030'
import {
  buildDossierModel,
  DOSSIER_A3_VERSION,
  dossierDefaults
} from '../src/dossier/model'
import { buildDossierScene, type DossierPrimitive } from '../src/dossier/scene'
import { runDossierTool } from '../src/dossier/tools'
import { listRuns } from '../src/runIdentity'

const OUT = process.env.QA_EVIDENCE_DIR
const numbers: Record<string, unknown> = {}
afterAll(() => {
  if (!OUT) return
  mkdirSync(OUT, { recursive: true })
  writeFileSync(
    join(OUT, 'p2-m4-numbers.json'),
    JSON.stringify(numbers, null, 1)
  )
})

jest.setTimeout(900000)

type Values = Record<string, number | string>
type Insert = Extract<DossierPrimitive, { kind: 'insert' }>
type Dim = Extract<DossierPrimitive, { kind: 'dimension' }>
type Leader = Extract<DossierPrimitive, { kind: 'leader' }>

/** The QA dossier, as the user gives it. */
const L1_GIVEN: Values = {
  tenMo: 'QA-P2-M4',
  bMatDuong: 8000,
  tThan: 1200,
  lCanh: 4000,
  D: 1000,
  lCoc: 25000
}
const derive = (given: Values, base: Values = dossierDefaults() as Values) =>
  acapDeriveDossierValues(base, given)
const L1 = derive(L1_GIVEN).values as Values
const withL1 = (given: Values) => derive(given, L1).values as Values

const scene = (v: Values) =>
  buildDossierScene(buildDossierModel(v), DOSSIER_A3_VERSION)
const sheet = (v: Values, id = 'SUB-010') =>
  scene(v).sheets.find(s => s.id === id)!
const inserts = (v: Values, block: string, id = 'SUB-010') =>
  sheet(v, id).primitives.filter(
    (p): p is Insert => p.kind === 'insert' && p.block === block
  )
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b)
const steps = (xs: number[]) => {
  const s = sorted(xs)
  return s.slice(1).map((x, i) => Math.round(x - s[i]))
}
const unique = (xs: number[]) =>
  sorted([...new Set(xs.map(x => Math.round(x * 10) / 10))])
/** Plan piles: centres across (x) and along (y) the bridge. */
const plan = (v: Values) => {
  const p = inserts(v, 'D1200-1')
  return {
    count: p.length,
    xs: unique(p.map(q => q.at[0])),
    ys: unique(p.map(q => q.at[1])),
    roles: [...new Set(p.map(q => q.role))]
  }
}
/** The front elevation's stub of one pile sits off MO2_U350's origin. */
const STUB = -53.117
const front = (v: Values) => {
  const pair = inserts(v, 'MO2_U351')
  if (pair.length)
    return pair.flatMap(p => [p.at[0] + STUB, p.at[0] + STUB + 5300])
  return sorted(inserts(v, 'MO2_U350').map(p => p.at[0] + STUB))
}
const dims = (v: Values, handle: string, id = 'SUB-010') =>
  sheet(v, id).primitives.filter(
    (p): p is Dim =>
      p.kind === 'dimension' &&
      (p.sourceHandle === handle || p.sourceHandle === `${handle}#P`)
  )
const length = (d: Dim) =>
  Math.round(
    (d.direction === 'dung'
      ? Math.abs(d.end[1] - d.start[1])
      : Math.abs(d.end[0] - d.start[0])) * 10
  ) / 10
const leaders = (v: Values, handle: string, id = 'SUB-010') =>
  sheet(v, id).primitives.filter(
    (p): p is Leader =>
      p.kind === 'leader' &&
      (p.sourceHandle === handle || p.sourceHandle === `${handle}#P`)
  )
const arrayed = (v: Values) =>
  scene(v)
    .sheets.flatMap(s => s.primitives)
    .filter(p => /#P\d*$/.test(p.sourceHandle ?? '')).length
const near = (a: number, b: number, tol = 0.5) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol)
const kl = (v: Values, key: string) =>
  acTpBtklMo(v).items.find(i => i.key === key)!.khoiLuong!

describe('derived spacing: outer piles flush with the footing, evenly spread', () => {
  test('3 piles a row on L1: tim cọc ngang (8700 − 2000) / 2 = 3350', () => {
    const r = derive({ soCotCoc: 3 }, L1)
    expect(r.values.aCocNgang).toBe(3350)
    expect(r.suyRa).toEqual([
      expect.objectContaining({ thamSo: 'aCocNgang', giaTri: 3350 })
    ])
    expect(r.suyRa[0].lyDo).toContain('chia đều')
    expect(r.suyRa[0].lyDo).toContain('tim cọc ngang')
    // Rows: (6000 − 2000) / 2 = 2000; 4 rows → floor(4000 / 3) = 1333.
    expect(derive({ soHangCoc: 3 }, L1).values.aCocDoc).toBe(2000)
    expect(derive({ soHangCoc: 4 }, L1).values.aCocDoc).toBe(1333)
    // M1: 3 piles → 2650, 6 → 1060.
    expect(derive({ soCotCoc: 3 }).values.aCocNgang).toBe(2650)
    expect(derive({ soCotCoc: 6 }).values.aCocNgang).toBe(1060)
  })
  test('back to 2: bBe − 2D, the source arrangement again', () => {
    const three = derive({ soCotCoc: 3 }, L1).values as Values
    const two = derive({ soCotCoc: 2 }, three)
    expect(two.values.aCocNgang).toBe(6700)
    expect(two.suyRa[0].lyDo).toBe(
      'cọc sát mép bệ: tim cọc ngang = bề rộng bệ − 2 × đường kính cọc'
    )
  })
  test('a spacing the user gives is kept; one pile needs none', () => {
    const given = derive({ soCotCoc: 3, aCocNgang: 3000 }, L1)
    expect(given.values.aCocNgang).toBe(3000)
    expect(given.suyRa).toEqual([])
    expect(derive({ soCotCoc: 1 }, L1).suyRa).toEqual([])
    // An unrelated edit never rewrites a stored spacing.
    const free = { ...L1, aCocNgang: 6000 }
    expect(derive({ hThan: 5000 }, free).values.aCocNgang).toBe(6000)
  })
})

describe('the source arrangement stays the source drawing (0.3.1)', () => {
  test('default 2 × 2 at 5300 × 3600: source inserts, no re-placed item', () => {
    const v = {}
    expect(plan(v).count).toBe(4)
    expect(steps(plan(v).xs)).toEqual([5300])
    expect(steps(plan(v).ys)).toEqual([3600])
    expect(inserts(v, 'MO2_U351')).toHaveLength(1)
    expect(inserts(v, 'D1m')).toHaveLength(4)
    expect(inserts(v, 'D1m', 'SUB-020')).toHaveLength(2)
    expect(arrayed(v)).toBe(0)
    expect(
      JSON.stringify(
        scene({ soCotCoc: 2, soHangCoc: 2, aCocNgang: 5300, aCocDoc: 3600 })
          .sheets
      )
    ).toEqual(JSON.stringify(scene({}).sheets))
    expect(
      'identity' in
        (sheetStretch('SUB-010', {
          ...dossierDefaults(),
          soCotCoc: 2,
          aCocNgang: 5300
        }) as object) &&
        (sheetStretch('SUB-010', dossierDefaults()) as { identity: boolean })
          .identity
    ).toBe(true)
  })
  test('L1 (D1000, footing 8700, 6700 × 4000 flush): as built before M4, front stubs at 6700', () => {
    expect(L1).toMatchObject({ aCocNgang: 6700, aCocDoc: 4000, bBe: 8700 })
    // Only the front elevation's two stubs are re-placed (P2-M6): the
    // source pair block drew them 5300 apart under the 6700 dimension.
    expect(arrayed(L1)).toBe(2)
    expect(plan(L1).count).toBe(4)
    expect(steps(plan(L1).xs)).toEqual([6700])
    expect(steps(plan(L1).ys)).toEqual([4000])
    // The front: two stubs at the true centres, no pair block (P2-M6).
    expect(inserts(L1, 'MO2_U351')).toHaveLength(0)
    expect(inserts(L1, 'MO2_U350')).toHaveLength(2)
    numbers.L1 = {
      plan: plan(L1),
      front: front(L1),
      coc: kl(L1, 'coc'),
      be: kl(L1, 'be'),
      lot: kl(L1, 'lot')
    }
  })
})

describe('the pile array in the views', () => {
  const c3 = withL1({ soCotCoc: 3 })
  test('L1, 3 piles a row (2 rows): 6 on the pile plan, outer piles where the 2 were', () => {
    const p = plan(c3)
    expect(p.count).toBe(6)
    expect(steps(p.xs)).toEqual([3350, 3350])
    expect(steps(p.ys)).toEqual([4000])
    expect(p.roles).toEqual(['coc_khoan_nhoi'])
    // Flush with the edges: the outer piles are L1's own two.
    const l1 = plan(L1)
    near(p.xs[0], l1.xs[0])
    near(p.xs[2], l1.xs[1])
    p.ys.forEach((y, i) => near(y, l1.ys[i]))
    // Front elevation: 3 stubs at 3350, one per pile across.
    expect(inserts(c3, 'MO2_U351')).toHaveLength(0)
    const stubs = inserts(c3, 'MO2_U350')
    expect(stubs).toHaveLength(3)
    for (const s of stubs) expect(s.role).toBe('coc_khoan_nhoi')
    expect(steps(front(c3))).toEqual([3350, 3350])
    // Sections: rows unchanged (2 per section).
    expect(inserts(c3, 'D1m')).toHaveLength(4)
    expect(inserts(c3, 'D1m', 'SUB-020')).toHaveLength(2)
  })
  test('dimensions: edge → outer pile D, outer → outer 2 × 3350 = 6700', () => {
    for (const [edge, middle, view] of [
      [['211B943', '211B945'], '211B942', 'plan'],
      [['20EFB44', '211A15A'], '20EFB37', 'front']
    ] as const) {
      for (const h of edge) {
        const [d] = dims(c3, h)
        expect(length(d)).toBe(1000)
        // Still exactly D: the source symbol stays.
        expect(d.text).toBe('D Cọc')
      }
      const [m] = dims(c3, middle)
      expect(length(m)).toBe(6700)
      expect(m.text).toBe('2x3350=<>')
      if (view === 'front') {
        // The edge dimensions' pile-side points are the outer stubs.
        const xs = front(c3)
        const ends = edge.flatMap(h => {
          const [d] = dims(c3, h)
          return [d.start[0], d.end[0]]
        })
        for (const x of [xs[0], xs[2]])
          expect(ends.some(e => Math.abs(e - x) < 0.5)).toBe(true)
      }
    }
    // Along: untouched values, source symbols.
    expect(length(dims(c3, '211B99B')[0])).toBe(4000)
    expect(dims(c3, '211B99B')[0].text).toBe('B Bệ-2D')
    // The "CỌC KHOAN NHỒI" leaders start on the outer stubs, as the source.
    const xs = front(c3)
    near(leaders(c3, '20EFA0F')[0].points[0][0] - xs[0], 5211.22 - 4613.649)
    near(leaders(c3, '20EFA10')[0].points[0][0] - xs[2], 10513.649 - 9913.649)
    numbers.L1_cot3 = {
      aCocNgang: c3.aCocNgang,
      plan: p3(c3),
      front: xs,
      middleDim: dims(c3, '211B942')[0].text
    }
  })
  test('rows: 3 (and 1) rows along the bridge, sections follow', () => {
    const h3 = withL1({ soHangCoc: 3 })
    expect(h3.aCocDoc).toBe(2000)
    const p = plan(h3)
    expect(p.count).toBe(6)
    expect(steps(p.ys)).toEqual([2000, 2000])
    expect(steps(p.xs)).toEqual([6700])
    expect(inserts(h3, 'D1m')).toHaveLength(6)
    const cc = inserts(h3, 'D1m', 'SUB-020')
    expect(cc).toHaveLength(3)
    expect(steps(cc.map(s => s.at[0]))).toEqual([2000, 2000])
    // Across: two piles flush — the front now stands each stub at its pile.
    expect(steps(front(h3))).toEqual([6700])
    expect(length(dims(h3, '211B99B')[0])).toBe(4000)
    expect(dims(h3, '211B99B')[0].text).toBe('2x2000=<>')
    expect(dims(h3, '211B942')[0].text).toBe('B Mố - 2D')
    const h1 = withL1({ soHangCoc: 1 })
    expect(plan(h1).count).toBe(2)
    expect(inserts(h1, 'D1m')).toHaveLength(2)
    expect(inserts(h1, 'D1m', 'SUB-020')).toHaveLength(1)
    // One row: no outer-to-outer dimension; the edge ones measure half.
    expect(dims(h1, '211B99B')).toHaveLength(0)
    for (const h of ['211B99A', '211B99D'])
      expect(length(dims(h1, h)[0])).toBe(3000)
    numbers.L1_hang3 = { aCocDoc: h3.aCocDoc, plan: p3(h3) }
    numbers.L1_hang1 = { plan: p3(h1) }
  })
  test('free spacing: piles move in, dimensions measure, symbols dropped', () => {
    const free = withL1({ aCocNgang: 6000 })
    expect(
      buildDossierModel(free).issues.filter(i => i.level === 'error')
    ).toEqual([])
    const p = plan(free)
    expect(steps(p.xs)).toEqual([6000])
    // Centred on the footing: 350 in from L1's flush piles on each side.
    const l1 = plan(L1)
    near(p.xs[0] - l1.xs[0], 350)
    near(l1.xs[1] - p.xs[1], 350)
    expect(steps(front(free))).toEqual([6000])
    for (const h of ['211B943', '211B945', '20EFB44', '211A15A']) {
      const [d] = dims(free, h)
      expect(length(d)).toBe(1350)
      expect(d.text).toBeUndefined()
    }
    expect(length(dims(free, '211B942')[0])).toBe(6000)
    expect(dims(free, '211B942')[0].text).toBeUndefined()
    numbers.L1_tim6000 = { plan: p3(free), front: front(free) }
  })
})

/** Plan summary for the evidence. */
function p3(v: Values) {
  const p = plan(v)
  return { count: p.count, stepX: steps(p.xs), stepY: steps(p.ys) }
}

describe('wing thickness follows the real outer pile', () => {
  const wing = (v: Values) => sheetStretch('SUB-010', v)
  test('piles moved in (outer centre 1350 from the edge): tCanh 1000 (its max) now fits, 1400 not', () => {
    const free = withL1({ aCocNgang: 6000 })
    expect('error' in wing({ ...free, tCanh: 1000 })).toBe(false)
    const refused = wing({ ...free, tCanh: 1400 }) as { error: string }
    expect(refused.error).toContain('tim cọc ngoài cùng (1350 mm)')
    // Flush piles: still tCanh < D.
    expect((wing({ ...L1, tCanh: 1000 }) as { error: string }).error).toContain(
      '(1000 mm)'
    )
  })
  test('piles moved out (outer centre 850): tCanh 900 refused though < D', () => {
    const out = withL1({ aCocNgang: 7000 })
    expect(
      buildDossierModel(out).issues.filter(i => i.level === 'error')
    ).toEqual([])
    const refused = wing({ ...out, tCanh: 900 }) as { error: string }
    expect(refused.error).toContain('(850 mm)')
    expect('error' in wing({ ...out, tCanh: 800 })).toBe(false)
  })
})

describe('take-off (formulas unchanged): piles × count', () => {
  test('L1: 4 → 6 piles D1000 × 25 m, footing and lean less the extra heads', () => {
    const pile = Math.PI * 0.5 ** 2 * 25
    expect(kl(L1, 'coc')).toBeCloseTo(4 * pile, 6)
    near(kl(L1, 'coc'), 78.54, 0.005)
    const c3 = withL1({ soCotCoc: 3 })
    const h3 = withL1({ soHangCoc: 3 })
    for (const v of [c3, h3]) {
      expect(kl(v, 'coc')).toBeCloseTo(6 * pile, 6)
      near(kl(v, 'coc'), 117.81, 0.005)
      // Two more heads embedded 150 in the footing; two more sections
      // through the lean.
      expect(kl(L1, 'be') - kl(v, 'be')).toBeCloseTo(
        2 * Math.PI * 0.5 ** 2 * 0.15,
        6
      )
      expect(kl(v, 'lot')).toBeLessThan(kl(L1, 'lot'))
    }
    // Spacing alone changes no quantity.
    const free = withL1({ aCocNgang: 6000 })
    for (const k of ['coc', 'be', 'lot']) expect(kl(free, k)).toBe(kl(L1, k))
    numbers.btkl = {
      L1: { coc: kl(L1, 'coc'), be: kl(L1, 'be'), lot: kl(L1, 'lot') },
      L1_cot3: { coc: kl(c3, 'coc'), be: kl(c3, 'be'), lot: kl(c3, 'lot') },
      L1_hang3: { coc: kl(h3, 'coc'), be: kl(h3, 'be'), lot: kl(h3, 'lot') },
      L1_hang1: {
        coc: kl(withL1({ soHangCoc: 1 }), 'coc'),
        be: kl(withL1({ soHangCoc: 1 }), 'be')
      }
    }
  })
})

const database = () => {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}
const all = (db: AcDbDatabase): AcDbEntity[] => [
  ...db.tables.blockTable.modelSpace.newIterator()
]
const sheetOf = (e: AcDbEntity) =>
  String(readSemanticTag(e)?.params?.sheet ?? '?')
function key(e: AcDbEntity) {
  let box = ''
  try {
    const b = e.geometricExtents
    if (Number.isFinite(b.min.x))
      box = [b.min.x, b.min.y, b.max.x, b.max.y].map(Math.round).join(',')
  } catch {
    box = '?'
  }
  return [
    sheetOf(e),
    e.dxfTypeName,
    e.layer,
    box,
    e instanceof AcDbText ? e.textString : ''
  ].join('|')
}
const snap = (db: AcDbDatabase) => {
  const list = all(db)
  return {
    keys: list.map(key).sort(),
    notBuilt: list.filter(
      e =>
        e instanceof AcDbText &&
        /CHƯA DỰNG ĐƯỢC|CHƯA TÍNH ĐƯỢC/.test(e.textString)
    ).length
  }
}
/** Sheets whose entities differ (as multisets of keys). */
function changedSheets(a: string[], b: string[]) {
  const count = (l: string[]) => {
    const m = new Map<string, number>()
    l.forEach(k => m.set(k, (m.get(k) ?? 0) + 1))
    return m
  }
  const ma = count(a),
    mb = count(b)
  const out = new Set<string>()
  for (const k of new Set([...a, ...b]))
    if (ma.get(k) !== mb.get(k)) out.add(k.split('|')[0])
  return [...out].sort()
}
const tool = (name: string, input: Record<string, unknown>, db: AcDbDatabase) =>
  runDossierTool(name, input, db)
const runId = (db: AcDbDatabase) => listRuns(db)[0].id
const values = (db: AcDbDatabase) => listRuns(db)[0].values as Values
const sua = (db: AcDbDatabase, thong_so: Values) =>
  tool('sua_ho_so_mo', { ma_lan_chay: runId(db), thong_so }, db)
const derived = (data: unknown) =>
  Object.fromEntries(
    (
      (data as { suyRa?: { thamSo: string; giaTri: number }[] } | undefined)
        ?.suyRa ?? []
    ).map(d => [d.thamSo, d.giaTri])
  )

describe('P2-M4 acceptance through the tools (L1)', () => {
  test('3 piles a row, then back to 2 × 2: the L1 drawing again', async () => {
    const db = database()
    expect((await tool('tao_ho_so_mo', { thong_so: L1_GIVEN }, db)).ok).toBe(
      true
    )
    const before = snap(db)
    const res = await sua(db, { soCotCoc: 3 })
    expect(res.ok).toBe(true)
    expect(derived(res.data)).toEqual({ aCocNgang: 3350 })
    expect(String(res.message)).toContain(
      '6 cọc (2 hàng × 3 cọc, tim ngang 3350 mm, tim dọc 4000 mm)'
    )
    expect(values(db)).toMatchObject({ soCotCoc: 3, aCocNgang: 3350 })
    const after = snap(db)
    expect(after.notBuilt).toBe(0)
    // SUB-010 (plan, front), SUB-020 (C–C re-placed at the same places is
    // not a change) and the take-off sheet.
    const changed = changedSheets(before.keys, after.keys)
    expect(changed).toEqual(expect.arrayContaining(['SUB-010', 'SUB-100']))
    for (const s of ['SUB-070', 'SUB-080', 'SUB-090'])
      expect(changed).not.toContain(s)
    const back = await sua(db, { soCotCoc: 2 })
    expect(back.ok).toBe(true)
    expect(derived(back.data)).toEqual({ aCocNgang: 6700 })
    expect(snap(db).keys).toEqual(before.keys)
    numbers.tool = {
      cot3: { message: res.message, changed },
      back: back.message
    }
  })
  test('rows 3 and 1, free spacing, combined with tCanh 400 / hLanCan 1300 and 6 bearings', async () => {
    const db = database()
    await tool('tao_ho_so_mo', { thong_so: L1_GIVEN }, db)
    const h3 = await sua(db, { soHangCoc: 3 })
    expect(h3.ok).toBe(true)
    expect(derived(h3.data)).toEqual({ aCocDoc: 2000 })
    const h1 = await sua(db, { soHangCoc: 1 })
    expect(h1.ok).toBe(true)
    expect(listRuns(db)[0].values.soHangCoc).toBe(1)
    expect(snap(db).notBuilt).toBe(0)
    await sua(db, { soHangCoc: 2 })
    for (const change of [
      { tCanh: 400 },
      { hLanCan: 1300 },
      { soCotCoc: 3 },
      { soGoi: 6 },
      { aCocNgang: 3000 },
      // Outer piles now 1350 from the edges: the wing may be 1000 thick,
      // which tCanh < D refused before M4.
      { tCanh: 1000 }
    ] as Values[]) {
      const r = await sua(db, change)
      expect(r.ok).toBe(true)
    }
    expect(values(db)).toMatchObject({
      tCanh: 1000,
      hLanCan: 1300,
      soCotCoc: 3,
      aCocNgang: 3000,
      soGoi: 6,
      aGoi: 1400
    })
    expect(snap(db).notBuilt).toBe(0)
    const v = values(db)
    expect(plan(v).count).toBe(6)
    expect(steps(plan(v).xs)).toEqual([3000, 3000])
    expect(inserts(v, 'Goi I24')).toHaveLength(6)
  })
  test('refused, drawing kept: 7 a row, 5 rows, clearance, overlap, wing', async () => {
    const db = database()
    await tool('tao_ho_so_mo', { thong_so: L1_GIVEN }, db)
    const before = snap(db)
    const stored = { ...values(db) }
    const messages: Record<string, string> = {}
    for (const [name, change] of Object.entries({
      cot7: { soCotCoc: 7 },
      hang5: { soHangCoc: 5 },
      tim500: { aCocNgang: 500 },
      le300: { aCocNgang: 7600 },
      chong: { soCotCoc: 3, aCocNgang: 1000 },
      canh: { aCocNgang: 7000, tCanh: 900 }
    } as Record<string, Values>)) {
      const r = await sua(db, change)
      expect(r.ok).toBe(false)
      messages[name] = String(r.message)
      expect(values(db)).toEqual(stored)
      expect(snap(db).keys).toEqual(before.keys)
    }
    expect(messages.cot7).toMatch(/Số cọc mỗi hàng ngang/)
    expect(messages.hang5).toMatch(/Số hàng cọc dọc cầu/)
    expect(messages.le300).toMatch(/300 mm/)
    expect(messages.chong).toMatch(/giao nhau/)
    expect(messages.canh).toMatch(/tim cọc ngoài cùng \(850 mm\)/)
    numbers.refusals = messages
  })
})
