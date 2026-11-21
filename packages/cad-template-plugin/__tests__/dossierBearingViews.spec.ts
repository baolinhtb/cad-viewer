/**
 * P1/M3 follow-up (UI acceptance 22/11/2026 failed in part): every view that
 * draws the bearings follows soGoi/aGoi — the plan's `Goi I24` blocks and
 * labels G1…Gn, the front elevation's exploded bearings, the bearing stops
 * (one per pair, never on a bearing) in both, and the `@B(G)` dimension —
 * and every text reads upright, unmirrored. Checked on the drawn entities.
 * Set QA_EVIDENCE_DIR to write the measured numbers there.
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
import {
  AcDbAlignedDimension,
  AcDbBlockReference,
  AcDbDatabase,
  AcDbEntity,
  AcDbText
} from '@mlightcad/data-model'

import { acTpBtklMo } from '../src/btkl/mo'
import { buildDossierModel, DOSSIER_A3_VERSION } from '../src/dossier/model'
import { buildDossierScene } from '../src/dossier/scene'
import { abutmentDossierTemplate } from '../src/dossier/template'
import { runDossierTool } from '../src/dossier/tools'
import { listRuns } from '../src/runIdentity'
import { runTemplate } from '../src/runTemplate'

const OUT = process.env.QA_EVIDENCE_DIR
const numbers: Record<string, unknown> = {}
afterAll(() => {
  if (!OUT) return
  mkdirSync(OUT, { recursive: true })
  writeFileSync(
    join(OUT, 'p1-m3-views-numbers.json'),
    JSON.stringify(numbers, null, 1)
  )
})

type Values = Record<string, number | string>
type Box = { x0: number; x1: number; y0: number; y1: number }

/** Source handles of the bearing items on SUB-010 (02. BTC- mo_2.dwg). */
const PLAN_STOP = new Set(['20F0936', '20F0937'])
const LABEL = /^G\d+$/
const BEARING_DIM = '20F0993'
/** Front elevation: exploded stops (box and two bars each). */
const FRONT_STOP = new Set([
  '20E91CD',
  '20E91CE',
  '20E91CF',
  '20E91D0',
  '20E91D3',
  '20E91E0',
  '20E91E1',
  '20E91E2',
  '20E91E4',
  '20E91E5'
])
/** Front elevation: the polyline of each exploded bearing (rest: OUTLINE). */
const FRONT_BEARING_POLY = new Set(['20E92EA', '20E92FC', '20E930E', '20E9320'])

const tagOf = (e: AcDbEntity) => readSemanticTag(e)?.params ?? {}
const sheetOf = (e: AcDbEntity) => String(tagOf(e).sheet ?? '?')
const sourceOf = (e: AcDbEntity) =>
  String(tagOf(e).sourceHandle ?? '').split('#')[0]
const copyOf = (e: AcDbEntity) =>
  String(tagOf(e).sourceHandle ?? '').split('#')[1] ?? ''
const isFrontBearing = (e: AcDbEntity) =>
  tagOf(e).sourceLayer === 'OUTLINE' || FRONT_BEARING_POLY.has(sourceOf(e))
const isBearingItem = (e: AcDbEntity) =>
  isFrontBearing(e) ||
  FRONT_STOP.has(sourceOf(e)) ||
  PLAN_STOP.has(sourceOf(e)) ||
  sourceOf(e) === BEARING_DIM ||
  (e instanceof AcDbBlockReference && e.blockName === 'Goi I24') ||
  (e instanceof AcDbText && LABEL.test(e.textString))

const box = (e: AcDbEntity): Box => {
  const b = e.geometricExtents
  return { x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y }
}
const union = (bs: Box[]): Box => ({
  x0: Math.min(...bs.map(b => b.x0)),
  x1: Math.max(...bs.map(b => b.x1)),
  y0: Math.min(...bs.map(b => b.y0)),
  y1: Math.max(...bs.map(b => b.y1))
})
const mid = (b: Box) => (b.x0 + b.x1) / 2
const overlaps = (a: Box, b: Box) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
/** Boxes left to right, grouped where they are less than `gap` apart. */
function clusters(bs: Box[], gap: number): Box[] {
  const sorted = [...bs].sort((a, b) => a.x0 - b.x0)
  const out: Box[][] = []
  for (const b of sorted) {
    const last = out[out.length - 1]
    if (last && b.x0 - union(last).x1 < gap) last.push(b)
    else out.push([b])
  }
  return out.map(union)
}
const steps = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted.slice(1).map((x, i) => x - sorted[i])
}

async function build(values: Values) {
  const db = new AcDbDatabase()
  db.createDefaultData()
  const model = buildDossierModel(values)
  const run = await runTemplate(abutmentDossierTemplate, model.values, db)
  expect(run.errors).toEqual([])
  const all = [...db.tables.blockTable.modelSpace.newIterator()]
  const sub010 = all.filter(e => sheetOf(e) === 'SUB-010')
  const refs = (name: string) =>
    sub010.filter(
      (e): e is AcDbBlockReference =>
        e instanceof AcDbBlockReference && e.blockName === name
    )
  const planBearings = refs('Goi I24').map(box)
  const planStops = refs('UCX dam I24').map(box)
  const frontBearings = clusters(sub010.filter(isFrontBearing).map(box), 200)
  const stopGroups = new Map<string, Box[]>()
  for (const e of sub010.filter(e => FRONT_STOP.has(sourceOf(e)))) {
    // A copy is `#j`; the source's two stops are told apart by x.
    const key = copyOf(e) || (mid(box(e)) < mid(frontBearings[1]) ? 'a' : 'b')
    stopGroups.set(key, [...(stopGroups.get(key) ?? []), box(e)])
  }
  const frontStops = [...stopGroups.values()].map(union)
  const labels = sub010
    .filter((e): e is AcDbText => e instanceof AcDbText)
    .filter(e => LABEL.test(e.textString))
  const dims = sub010.filter(
    (e): e is AcDbAlignedDimension =>
      e instanceof AcDbAlignedDimension && sourceOf(e) === BEARING_DIM
  )
  return {
    db,
    all,
    model,
    planBearings,
    planStops,
    frontBearings,
    frontStops,
    labels,
    dims
  }
}

/** The live dossier of M2 (8 m road), with what the tools derive. */
const ROAD_8M: Values = {
  tenMo: 'QA-TEST-MO-A1',
  bMatDuong: 8000,
  tThan: 1200,
  lCanh: 4000,
  D: 1000,
  lCoc: 25000,
  bBe: 8700,
  bThan: 8700,
  aCocNgang: 6700,
  aCocDoc: 4000
}

jest.setTimeout(900000)

describe('every view that draws the bearings follows soGoi/aGoi', () => {
  test.each([
    ['8 m road, 6 bearings @1400', { ...ROAD_8M, soGoi: 6, aGoi: 1400 }],
    ['7 m road, 6 bearings @1200', { soGoi: 6, aGoi: 1200 }],
    ['8 m road, 4 bearings @2000', ROAD_8M],
    ['source, 4 bearings @2000', {}],
    ['2 bearings @2000', { soGoi: 2 }],
    ['5 bearings @1500', { soGoi: 5, aGoi: 1500 }]
  ] as [string, Values][])('%s', async (name, values) => {
    const b = await build(values)
    const n = Number(b.model.values.soGoi)
    const a = Number(b.model.values.aGoi)
    const pairs = Math.floor(n / 2)
    numbers[name] = {
      plan: b.planBearings.map(mid).map(Math.round),
      front: b.frontBearings.map(mid).map(Math.round),
      planStops: b.planStops.map(mid).map(Math.round),
      frontStops: b.frontStops.map(x => [Math.round(x.x0), Math.round(x.x1)]),
      labels: b.labels.map(l => l.textString),
      stopWidth: b.model.stops.width
    }
    // Bearings: n in both views, aGoi apart, the source's 560 wide.
    for (const view of [b.planBearings, b.frontBearings]) {
      expect(view).toHaveLength(n)
      for (const step of steps(view.map(mid))) expect(step).toBeCloseTo(a, 0)
      for (const g of view) expect(g.x1 - g.x0).toBeCloseTo(560, -1)
    }
    // Labels G1…Gn under the plan bearings, G1 on the right.
    expect(b.labels.map(l => l.textString).sort()).toEqual(
      Array.from({ length: n }, (_, i) => `G${i + 1}`).sort()
    )
    const byX = [...b.labels].sort(
      (p, q) => q.geometricExtents.min.x - p.geometricExtents.min.x
    )
    expect(byX.map(l => l.textString)).toEqual(
      Array.from({ length: n }, (_, i) => `G${i + 1}`)
    )
    const planX = b.planBearings.map(mid).sort((p, q) => q - p)
    byX.forEach((l, i) =>
      expect(Math.abs(mid(box(l)) - planX[i])).toBeLessThan(300)
    )
    // Stops: ⌊n/2⌋ in both views, each at the middle of a pair of
    // neighbouring bearings, never over a bearing.
    for (const [stops, bearings] of [
      [b.planStops, b.planBearings],
      [b.frontStops, b.frontBearings]
    ] as [Box[], Box[]][]) {
      expect(stops).toHaveLength(pairs)
      const xs = bearings.map(mid).sort((p, q) => p - q)
      for (const s of stops) {
        const middles = xs.slice(1).map((x, i) => (x + xs[i]) / 2)
        expect(
          Math.min(...middles.map(m => Math.abs(m - mid(s))))
        ).toBeLessThan(15)
        for (const g of bearings) expect(overlaps(s, g)).toBe(false)
      }
    }
    // The bearing dimension spans the outer bearings.
    expect(b.dims).toHaveLength(1)
    const [d] = b.dims
    const fx = b.frontBearings.map(mid)
    expect(Math.min(d.xLine1Point.x, d.xLine2Point.x)).toBeCloseTo(
      Math.min(...fx),
      -1
    )
    expect(Math.abs(d.xLine1Point.x - d.xLine2Point.x)).toBeCloseTo(
      (n - 1) * a,
      0
    )
    // The take-off counts the stops drawn.
    const stopLine = acTpBtklMo(b.model.values).items.find(
      i => i.key === 'u_chong_xo'
    )!
    expect(stopLine.khoiLuong).toBeCloseTo(0.152 * pairs, 9)
  })

  test('stops narrowed to fit keep 100 mm to each bearing, warned', async () => {
    const b = await build({ ...ROAD_8M, soGoi: 6, aGoi: 1400 })
    expect(b.model.stops.width).toBe(640)
    for (const s of b.frontStops) expect(s.x1 - s.x0).toBeCloseTo(640, -1)
    for (const s of b.planStops) expect(s.x1 - s.x0).toBeCloseTo(640, -1)
    const gaps = (stops: Box[], bearings: Box[]) =>
      stops.flatMap(s => bearings.map(g => Math.max(g.x0 - s.x1, s.x0 - g.x1)))
    for (const [s, g] of [
      [b.planStops, b.planBearings],
      [b.frontStops, b.frontBearings]
    ] as [Box[], Box[]][])
      expect(Math.min(...gaps(s, g))).toBeGreaterThanOrEqual(99)
    expect(b.model.issues.map(i => i.code)).toContain('u_chong_xo_thu_hep')
    expect(
      acTpBtklMo(b.model.values)
        .items.find(i => i.key === 'u_chong_xo')!
        .flags?.map(f => f.code)
    ).toContain('u_chong_xo_thu_hep')
    // The source spacing keeps the source stop.
    const source = await build({})
    expect(source.model.stops.width).toBe(1000)
    for (const s of source.frontStops) expect(s.x1 - s.x0).toBeCloseTo(1000, -1)
  })
})

describe('6 bearings against the same abutment with 4: only the bearing items change', () => {
  test('8 m road, 4 → 6 bearings', async () => {
    const four = await build(ROAD_8M)
    const six = await build({ ...ROAD_8M, soGoi: 6, aGoi: 1400 })
    const key = (e: AcDbEntity) => {
      const b = box(e)
      return [
        sheetOf(e),
        e.dxfTypeName,
        e.layer,
        [b.x0, b.y0, b.x1, b.y1].map(Math.round).join(','),
        e instanceof AcDbText ? e.textString : ''
      ].join('|')
    }
    const missing = (a: AcDbEntity[], b: AcDbEntity[]) => {
      const left = new Map<string, number>()
      for (const e of b) left.set(key(e), (left.get(key(e)) ?? 0) + 1)
      return a.filter(e => {
        const k = key(e)
        const c = left.get(k) ?? 0
        if (c) left.set(k, c - 1)
        return !c
      })
    }
    const gone = missing(four.all, six.all)
    const added = missing(six.all, four.all)
    const bySheet = (es: AcDbEntity[]) =>
      es.reduce<Record<string, number>>((m, e) => {
        m[sheetOf(e)] = (m[sheetOf(e)] ?? 0) + 1
        return m
      }, {})
    numbers.diff4to6 = { gone: bySheet(gone), added: bySheet(added) }
    for (const id of ['SUB-020', 'SUB-070', 'SUB-080', 'SUB-090']) {
      expect(bySheet(gone)[id] ?? 0).toBe(0)
      expect(bySheet(added)[id] ?? 0).toBe(0)
    }
    // On the general sheet only bearings, labels, stops and their dimension.
    expect(
      [...gone, ...added]
        .filter(e => sheetOf(e) === 'SUB-010' && !isBearingItem(e))
        .map(key)
    ).toEqual([])
    // SUB-100: the take-off cells that follow the bearings (stops, mortar,
    // C30 total, steel total).
    expect(bySheet(gone)['SUB-100'] ?? 0).toBeLessThanOrEqual(5)
    const layers = (es: AcDbEntity[]) => new Set(es.map(e => e.layer))
    for (const l of layers(four.all)) expect(layers(six.all).has(l)).toBe(true)
    expect(six.all.length - four.all.length).toBe(36)
  })

  test('the source parameters draw the source items untouched', () => {
    const sheet = buildDossierScene(
      buildDossierModel({}),
      DOSSIER_A3_VERSION
    ).sheets.find(s => s.id === 'SUB-010')!
    expect(sheet.primitives.filter(p => p.sourceHandle?.includes('#'))).toEqual(
      []
    )
  })
})

describe('text reads upright, unmirrored', () => {
  const readable = (r: number) => {
    const a = Math.atan2(Math.sin(r), Math.cos(r))
    return a > -Math.PI / 2 + 1e-6 && a <= Math.PI / 2 + 1e-6
  }
  test.each([
    ['source', {}],
    [
      '8 m road, 6 bearings, numbers and symbols',
      { ...ROAD_8M, soGoi: 6, aGoi: 1400, nhanKichThuoc: 'ca_hai' }
    ]
  ] as [string, Values][])('%s', async (_name, values) => {
    const { all } = await build(values)
    const wrong: string[] = []
    let texts = 0
    let dims = 0
    const check = (t: AcDbText, where: string) => {
      texts += 1
      if (
        !readable(t.rotation) ||
        t.height <= 0 ||
        (t.generationFlag & 6) !== 0 ||
        t.normal.z <= 0
      )
        wrong.push(`${where} ${t.textString} ${t.rotation}`)
    }
    for (const e of all) {
      if (e instanceof AcDbText) check(e, sheetOf(e))
      if (e instanceof AcDbBlockReference)
        for (const a of e.attributeIterator()) check(a, `${sheetOf(e)} ATTRIB`)
      if (e instanceof AcDbAlignedDimension) {
        dims += 1
        if (!readable(e.rotation))
          wrong.push(`${sheetOf(e)} DIM ${e.dimensionText} ${e.rotation}`)
      }
    }
    expect(wrong).toEqual([])
    expect(texts).toBeGreaterThan(1000)
    expect(dims).toBeGreaterThan(150)
    // The ones seen upside down on 22/11/2026 (all drawn right to left).
    const shown = all
      .filter(
        (e): e is AcDbAlignedDimension => e instanceof AcDbAlignedDimension
      )
      .map(e => e.dimensionText ?? '')
    for (const t of ['@B(G)', '@500', 'W(t)', 'B Mặt đường', 'B Cầu'])
      expect(shown.some(s => s.startsWith(t))).toBe(true)
  })
})

describe('agent messages', () => {
  test('the bearing count and spacing are said; a missing pile length is asked', async () => {
    const db = new AcDbDatabase()
    db.createDefaultData()
    const made = await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { tenMo: 'QA-V-1' } },
      db
    )
    expect(made.ok).toBe(true)
    expect(made.message).toContain('4 vị trí gối cách nhau 2000 mm')
    expect(made.message).toContain('hỏi người dùng chiều dài cọc thực')
    const six = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: listRuns(db)[0].id, thong_so: { soGoi: 6 } },
      db
    )
    expect(six.ok).toBe(true)
    expect(six.message).toContain(
      '6 vị trí gối cách nhau 1200 mm (3 ụ chống xô)'
    )
    expect(six.message).toContain(
      'Đã tự suy (phải báo lại người dùng): aGoi = 1200'
    )
    const piles = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: listRuns(db)[0].id, thong_so: { lCoc: 25000 } },
      db
    )
    expect(piles.ok).toBe(true)
    expect(piles.message).not.toContain('chiều dài cọc thực')
    // Regression: a value still outside the grid refuses; the 8 m road
    // builds with 6 bearings at 1400.
    const refused = await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { tenMo: 'QA-V-X', tCanh: 600 } },
      db
    )
    expect(refused.ok).toBe(false)
    expect(refused.message).toContain('tCanh = 500')
    const road = await runDossierTool(
      'tao_ho_so_mo',
      {
        thong_so: {
          tenMo: 'QA-V-8',
          bMatDuong: 8000,
          D: 1000,
          soGoi: 6,
          x: 400000
        }
      },
      db
    )
    expect(road.ok).toBe(true)
    expect(road.message).toContain('6 vị trí gối cách nhau 1400 mm')
  })
})
