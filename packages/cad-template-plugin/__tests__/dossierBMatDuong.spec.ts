/**
 * P1/M2: road width (bMatDuong) inside the 0.3.0 stretch grid, with stem,
 * footing and pile spacing derived from it. Each "L" test is one live prompt
 * of 21/11/2026 (plan P0–P1, section 7); they were refused before M2.
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
import { AcDbDatabase, AcDbEntity, AcDbText } from '@mlightcad/data-model'

import {
  acapDeriveDossierValues,
  DOSSIER_ROAD_MARGIN
} from '../src/dossier/derive'
import { DOSSIER_DIM_SYMBOLS } from '../src/dossier/dimSymbols'
import {
  buildDossierModel,
  DOSSIER_A3_VERSION,
  dossierDefaults
} from '../src/dossier/model'
import { buildDossierScene, type DossierPrimitive } from '../src/dossier/scene'
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
    join(OUT, 'p1-m2-numbers.json'),
    JSON.stringify(numbers, null, 1)
  )
})

type Values = Record<string, number | string>
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
function snap(db: AcDbDatabase) {
  const list = all(db)
  const bySheet: Record<string, number> = {}
  for (const e of list) bySheet[sheetOf(e)] = (bySheet[sheetOf(e)] ?? 0) + 1
  const texts = list
    .filter((e): e is AcDbText => e instanceof AcDbText)
    .map(e => `${sheetOf(e)}: ${e.textString}`)
  return {
    count: list.length,
    bySheet,
    layers: [...new Set(list.map(e => e.layer))].sort(),
    keys: list.map(key),
    notBuilt: texts.filter(t => /CHƯA DỰNG ĐƯỢC|CHƯA TÍNH ĐƯỢC/.test(t))
  }
}
/** Entity keys of `a` missing from `b` (as a multiset), counted by sheet. */
function changedBySheet(a: string[], b: string[]) {
  const m = new Map<string, number>()
  b.forEach(k => m.set(k, (m.get(k) ?? 0) + 1))
  const out: Record<string, number> = {}
  for (const k of a) {
    const n = m.get(k) ?? 0
    if (n > 0) m.set(k, n - 1)
    else out[k.split('|')[0]] = (out[k.split('|')[0]] ?? 0) + 1
  }
  return out
}
const tool = (name: string, input: Record<string, unknown>, db: AcDbDatabase) =>
  runDossierTool(name, input, db)
const runId = (db: AcDbDatabase) => listRuns(db)[0].id
const values = (db: AcDbDatabase) => listRuns(db)[0].values as Values
const suyRa = (data: unknown) =>
  (data as { suyRa?: { thamSo: string; giaTri: number }[] } | undefined)
    ?.suyRa ?? []
const derivedMap = (data: unknown) =>
  Object.fromEntries(suyRa(data).map(d => [d.thamSo, d.giaTri]))

type Dim = Extract<DossierPrimitive, { kind: 'dimension' }>
const measured = (d: Dim) => {
  const dx = d.end[0] - d.start[0]
  const dy = d.end[1] - d.start[1]
  if (d.direction === 'ngang') return Math.abs(dx)
  if (d.direction === 'dung') return Math.abs(dy)
  return Math.hypot(dx, dy)
}
/** Dimension symbols whose measurement differs from their parameter. */
function dimMismatches(v: Values) {
  const full = { ...dossierDefaults(), ...v }
  const wrong: string[] = []
  const seen = new Set<string>()
  const scene = buildDossierScene(
    buildDossierModel({ ...v, nhanKichThuoc: 'ky_hieu' }),
    DOSSIER_A3_VERSION
  )
  for (const s of scene.sheets)
    if (['SUB-010', 'SUB-020'].includes(s.id))
      for (const p of s.primitives) {
        if (p.kind !== 'dimension' || p.text === undefined) continue
        const symbol = DOSSIER_DIM_SYMBOLS[p.text]
        if (!symbol) continue
        seen.add(p.text)
        const tol = symbol.xapXi ? 160 : 5
        if (Math.abs(measured(p) - symbol.giaTri(full)) > tol)
          wrong.push(
            `${p.text} ${Math.round(measured(p))}≠${symbol.giaTri(full)}`
          )
      }
  return { wrong, seen: seen.size }
}
/*
 * Before P2-M6, H2 measured 7042 for 7204 at the end of the control chain
 * (the head-wall top's low end rode the hDau band of the grid, plan P0–P1
 * section 7). Fixed in the grid (line 21700): no mismatch is left.
 */

/** L1 exactly as the user said it: no footing width or pile spacing given. */
const L1: Values = {
  tenMo: 'QA-TEST-MO-A1',
  bMatDuong: 8000,
  tThan: 1200,
  lCanh: 4000,
  D: 1000,
  lCoc: 25000
}

jest.setTimeout(900000)

describe('acapDeriveDossierValues', () => {
  const defaults = dossierDefaults()
  test('road width alone: stem and footing keep the fixed 350 mm margin', () => {
    const { values: v, suyRa } = acapDeriveDossierValues(defaults, {
      bMatDuong: 8000,
      D: 1000
    })
    expect(DOSSIER_ROAD_MARGIN).toBe(350)
    expect(v).toMatchObject({
      bBe: 8700,
      bThan: 8700,
      aCocNgang: 6700,
      aCocDoc: 4000
    })
    expect(suyRa.map(d => d.thamSo)).toEqual([
      'bBe',
      'bThan',
      'aCocNgang',
      'aCocDoc'
    ])
    for (const d of suyRa) expect(d.lyDo).not.toBe('')
  })
  test('decision 1: the margin is 350 even when the dossier had another', () => {
    // A dossier with a 500 mm margin (bBe = bThan = 8000 on a 7000 road).
    const base = { ...defaults, bBe: 8000, bThan: 8000, aCocNgang: 5600 }
    const { values: v } = acapDeriveDossierValues(base, { bMatDuong: 7500 })
    expect(v.bBe).toBe(8200)
    expect(v.bThan).toBe(8200)
    expect(v.aCocNgang).toBe(8200 - 2 * 1200)
  })
  test('values the user gave are never overwritten', () => {
    const { values: v, suyRa } = acapDeriveDossierValues(defaults, {
      bMatDuong: 8000,
      bBe: 9000,
      bThan: 9000,
      aCocNgang: 6000
    })
    expect(v).toMatchObject({ bBe: 9000, bThan: 9000, aCocNgang: 6000 })
    expect(suyRa).toEqual([])
  })
  test('an unrelated edit derives nothing, bearings are left alone', () => {
    // Stored pile spacing off the rule must not be rewritten by a text edit.
    const base = { ...defaults, aCocNgang: 5000 }
    expect(acapDeriveDossierValues(base, { tenMo: 'M9' }).suyRa).toEqual([])
    expect(acapDeriveDossierValues(base, { tThan: 1500 }).suyRa).toEqual([])
    const { values: v } = acapDeriveDossierValues(defaults, {
      bMatDuong: 12000,
      soGoi: 6
    })
    expect(v.aGoi).toBe(defaults.aGoi)
    expect(v.soGoi).toBe(6)
  })
  test('the model check names the footing width that keeps the margin', () => {
    const narrow = buildDossierModel({ bMatDuong: 7400 })
    expect(narrow.issues).toContainEqual(
      expect.objectContaining({
        code: 'road_outside_wall',
        level: 'warning',
        message: expect.stringContaining(
          'bề rộng bệ = bề rộng thân = bề rộng mặt đường + 2 × 350 = 8100'
        )
      })
    )
    const outside = buildDossierModel({ bMatDuong: 8100 })
    expect(outside.issues).toContainEqual(
      expect.objectContaining({
        code: 'road_outside_wall',
        level: 'error',
        message: expect.stringContaining('= 8800')
      })
    )
    expect(
      buildDossierModel().issues.filter(i => i.code === 'road_outside_wall')
    ).toEqual([])
  })
})

describe('P1/M2 acceptance — live prompts L1–L3', () => {
  const db = database()

  test('L1: an 8 m road creates the full dossier, derived values reported, dims match', async () => {
    const created = await tool('tao_ho_so_mo', { thong_so: L1 }, db)
    const s = snap(db)
    numbers.L1 = {
      ok: created.ok,
      message: created.message,
      suyRa: suyRa(created.data),
      count: s.count,
      bySheet: s.bySheet,
      notBuilt: s.notBuilt,
      values: listRuns(db)[0]?.values
    }
    expect(created.ok).toBe(true)
    expect(derivedMap(created.data)).toEqual({
      bBe: 8700,
      bThan: 8700,
      aCocNgang: 6700,
      aCocDoc: 4000
    })
    const data = created.data as { macDinhTuMau: string[] }
    expect(data.macDinhTuMau).not.toContain('bBe')
    expect(s.notBuilt).toEqual([])
    // Every view of the U abutment, as the source (329 entities on SUB-010).
    // + G1…G4 on the front elevation since P1/M5 (source: 329, 2967);
    // + 1 since P2-M6: the front pile pair block drawn as its two stubs,
    // 6700 apart.
    expect(s.bySheet['SUB-010']).toBe(334)
    // FIX-NOTE: the M1-steel and SUB-100 warnings are GHI CHÚ blocks
    // (heading + wrapped lines): +18 over the 7 loose texts.
    // FIX-NOTE QA: SUB-100's take-off footer on two lines (+1) and its GHI
    // CHÚ block in the narrower free slot beside the table (+4 lines).
    // That was 2995 while a changed geometry left the steel sheets as the M1
    // source. Since P3-M1 the steel sheets lay the M1 bars out on the new
    // geometry: the bar dots of the sections are one block per bar, spread
    // over the 8700 footing/stem instead of M1's 7700, so SUB-070 has 320
    // inserts (M1: 13), SUB-080/090 141 each (M1: 5), and SUB-100's bar
    // table and take-off 1624 entities (M1 1595). SUB-010 (334) and SUB-020
    // (191) are as before: 2890 + 5 + 307 + 2 × 136 + 29 = 3503.
    expect(s.bySheet).toEqual({
      'SUB-010': 334,
      'SUB-020': 191,
      'SUB-070': 606,
      'SUB-080': 374,
      'SUB-090': 374,
      'SUB-100': 1624
    })
    expect(s.count).toBe(3503)
    expect(values(db)).toMatchObject({
      bMatDuong: 8000,
      bBe: 8700,
      bThan: 8700,
      aCocNgang: 6700
    })
    const dims = dimMismatches(values(db))
    numbers.L1dims = dims
    expect(dims.wrong).toEqual([])
    expect(dims.seen).toBeGreaterThanOrEqual(20)
  })

  test('L1 geometry diff: road 7 → 8 m on the same abutment changes only the road edges', async () => {
    const base = { ...values(db) }
    const a = database()
    const b = database()
    const ra = await runTemplate(
      abutmentDossierTemplate,
      buildDossierModel({ ...base, bMatDuong: 7000 }).values,
      a
    )
    const rb = await runTemplate(
      abutmentDossierTemplate,
      buildDossierModel(base).values,
      b
    )
    expect([...ra.errors, ...rb.errors]).toEqual([])
    const sa = snap(a)
    const sb = snap(b)
    const changed = changedBySheet(sa.keys, sb.keys)
    const layersLost = sa.layers.filter(l => !sb.layers.includes(l))
    numbers.L1diff = {
      count7m: sa.count,
      count8m: sb.count,
      changedBySheet: changed,
      layersLost
    }
    expect(sb.notBuilt).toEqual([])
    expect(sb.count).toBe(sa.count)
    expect(layersLost).toEqual([])
    // Since P3-M2 the wall-top steel of the half sections 1-1/2-2 on
    // SUB-070 follows the road edges on the 2 % cross fall (bars, outline,
    // their dims, leaders, labels and the two view titles that sit on the
    // wall top): 33 entities, the same count either side. The stem and
    // footing sheets SUB-080/090 do not depend on the road width.
    expect(changed['SUB-070'] ?? 0).toBe(33)
    for (const id of ['SUB-080', 'SUB-090']) expect(changed[id] ?? 0).toBe(0)
    expect(changed['SUB-010'] ?? 0).toBeGreaterThan(0)
    expect(changed['SUB-010'] ?? 0).toBeLessThan(120)
    // Since P2-M6 the cross fall is the stated 2 % over the wider road:
    // section C–C (the low road edge) sits 10 mm lower and the SUB-020
    // elevation table follows (EL1, EL2, EL4, FG). Pinned, not a tolerance.
    expect(changed['SUB-020'] ?? 0).toBe(39)
  })

  test('L2: tThan → 1500 is no longer blocked by the road width', async () => {
    const before = snap(db)
    const res = await tool(
      'sua_ho_so_mo',
      { ma_lan_chay: runId(db), thong_so: { tThan: 1500 } },
      db
    )
    const after = snap(db)
    numbers.L2 = {
      ok: res.ok,
      message: res.message,
      count: after.count,
      changed: changedBySheet(before.keys, after.keys)
    }
    expect(res.ok).toBe(true)
    expect(suyRa(res.data)).toEqual([])
    expect(values(db).tThan).toBe(1500)
    expect(after.notBuilt).toEqual([])
    // Since P3-M1 the stem steel follows the stem: on SUB-080/090 the
    // section through a 1500 stem has one bar dot fewer each side than at
    // 1200 (139 inserts instead of 141), so 2 fewer per sheet. The other
    // sheets keep their counts.
    expect(after.bySheet).toEqual({
      ...before.bySheet,
      'SUB-080': before.bySheet['SUB-080'] - 2,
      'SUB-090': before.bySheet['SUB-090'] - 2
    })
    expect(after.count).toBe(before.count - 4)
  })

  test('L3: lCanh → 5500 edits, dims still match', async () => {
    const before = snap(db)
    const res = await tool(
      'sua_ho_so_mo',
      { ma_lan_chay: runId(db), thong_so: { lCanh: 5500 } },
      db
    )
    const after = snap(db)
    numbers.L3 = {
      ok: res.ok,
      message: res.message,
      changed: changedBySheet(before.keys, after.keys)
    }
    expect(res.ok).toBe(true)
    expect(after.notBuilt).toEqual([])
    expect(dimMismatches(values(db)).wrong).toEqual([])
  })
})

describe('sua_ho_so_mo with a new road width', () => {
  test('derives stem, footing and pile spacing with the fixed margin and reports them', async () => {
    const db = database()
    expect((await tool('tao_ho_so_mo', {}, db)).ok).toBe(true)
    const before = snap(db)
    const res = await tool(
      'sua_ho_so_mo',
      { ma_lan_chay: runId(db), thong_so: { bMatDuong: 8000 } },
      db
    )
    const after = snap(db)
    numbers.editRoad = {
      ok: res.ok,
      message: res.message,
      suyRa: suyRa(res.data),
      count: after.count
    }
    expect(res.ok).toBe(true)
    expect(derivedMap(res.data)).toEqual({
      bBe: 8700,
      bThan: 8700,
      aCocNgang: 8700 - 2 * 1200
    })
    expect(values(db)).toMatchObject({ bMatDuong: 8000, bBe: 8700 })
    expect(after.notBuilt).toEqual([])
    // 2890 source entities + the M1 steel warnings and the take-off table
    // every geometry change adds. P2-M6: L1 is 2972 (front pair exploded
    // to two stubs at the true 6700 centres; was 2971 / 2967 before).
    expect(before.count).toBe(2890)
    // FIX-NOTE: 2990, the warnings as GHI CHÚ blocks (+18 lines); FIX-NOTE
    // QA: 2995, the SUB-100 take-off footer (+1) and narrower block (+4).
    // P3-M1: 3561, the steel laid out on the 8700 footing with M1's 1000
    // stem (L1 has a 1200 stem): SUB-070 604, SUB-080/090 404 each (bar
    // dots across the wider footing and the thinner stem), SUB-100 1624.
    expect(after.bySheet).toEqual({
      'SUB-010': 334,
      'SUB-020': 191,
      'SUB-070': 604,
      'SUB-080': 404,
      'SUB-090': 404,
      'SUB-100': 1624
    })
    expect(after.count).toBe(3561)
  })

  test('outside the remaining grid it still refuses honestly and says how to unlock', async () => {
    const db = database()
    await tool('tao_ho_so_mo', {}, db)
    const before = snap(db)
    const res = await tool(
      'sua_ho_so_mo',
      { ma_lan_chay: runId(db), thong_so: { bMatDuong: 8000, phuLot: 200 } },
      db
    )
    expect(res.ok).toBe(false)
    // tCanh is in the grid since P2/M1 (dossierTCanh.spec.ts).
    expect(res.message).toContain('phần lót nhô mỗi mép = 100 mm')
    expect(snap(db).keys).toEqual(before.keys)
    expect(values(db).bMatDuong).toBe(7000)
  })
})

describe('Control inside the old grid (bMatDuong = 7000) is unchanged', () => {
  test('tThan/lCanh/hDau/hThan/elevation/tenMo chain keeps count, layers, steel sheets, SUB-100', async () => {
    const db = database()
    const made = await tool(
      'tao_ho_so_mo',
      {
        thong_so: {
          tenMo: 'QA-TEST-MO-C1',
          tThan: 1200,
          lCanh: 4000,
          D: 1000,
          aCocNgang: 5700,
          aCocDoc: 4000,
          lCoc: 25000
        }
      },
      db
    )
    expect(made.ok).toBe(true)
    expect(suyRa(made.data)).toEqual([])
    const first = snap(db)
    // 2971 before P2-M6: flush 2 × 2 at 5700, the front pair block is now
    // its two stubs at 5700 (+1).
    // FIX-NOTE: the warnings as GHI CHÚ blocks, +18; FIX-NOTE QA: SUB-100
    // take-off footer +1, its block narrower +4: 2995 then. P3-M1: 3489,
    // the steel laid out on this geometry (M1's 7700 footing, 1200 stem):
    // SUB-070 592 (306 bar inserts), SUB-080/090 374 each, SUB-100 1624.
    expect(first.bySheet).toEqual({
      'SUB-010': 334,
      'SUB-020': 191,
      'SUB-070': 592,
      'SUB-080': 374,
      'SUB-090': 374,
      'SUB-100': 1624
    })
    expect(first.count).toBe(3489)
    const log: unknown[] = []
    let prev = first
    // Since P3-M1 the steel sheets follow each dimension, so their entity
    // counts move with the bars a stem, wing or wall now holds; pinned per
    // step (SUB-070, SUB-080 = SUB-090). Drawing, elevations and the take-off
    // sheet keep their counts. Labels (elevation, name) leave steel alone.
    const steel: [number, number][] = [
      [592, 372], // tThan 1500: one bar dot fewer each side of the stem
      [592, 392], // lCanh 5500: +20 bar dots along the longer wing
      [596, 394], // hDau 2187: taller head wall, +4 / +2 dots
      [600, 396], // hThan 5017: taller stem, +4 / +2 dots
      [600, 396], // caoDoDayBe: labels only
      [600, 396] // tenMo: labels only
    ]
    for (const [step, change] of (
      [
        { tThan: 1500 },
        { lCanh: 5500 },
        { hDau: 2187 },
        { hThan: 5017 },
        { caoDoDayBe: 229.137 },
        { tenMo: 'QA-TEST-MO-C2' }
      ] as Values[]
    ).entries()) {
      const res = await tool(
        'sua_ho_so_mo',
        { ma_lan_chay: runId(db), thong_so: change },
        db
      )
      const next = snap(db)
      const changed = changedBySheet(prev.keys, next.keys)
      log.push({ change, ok: res.ok, count: next.count, changed })
      expect(res.ok).toBe(true)
      expect(suyRa(res.data)).toEqual([])
      expect(next.bySheet).toEqual({
        'SUB-010': 334,
        'SUB-020': 191,
        'SUB-070': steel[step][0],
        'SUB-080': steel[step][1],
        'SUB-090': steel[step][1],
        'SUB-100': 1624
      })
      expect(first.layers.filter(l => !next.layers.includes(l))).toEqual([])
      // A dimension change now redraws the steel sheets and SUB-100's bar
      // table and take-off with it (P3-M1/M2: ~50 changed on SUB-100, same
      // count), so the old «steel sheets untouched, SUB-100 < 10» holds only
      // for a label change: the footing elevation touches SUB-020 alone.
      if ('caoDoDayBe' in change)
        for (const id of ['SUB-070', 'SUB-080', 'SUB-090', 'SUB-100'])
          expect(changed[id] ?? 0).toBe(0)
      expect(next.notBuilt).toEqual([])
      prev = next
    }
    const dims = dimMismatches(values(db))
    numbers.control = { first: first.bySheet, log, dims }
    expect(dims.wrong).toEqual([])
  })
})
