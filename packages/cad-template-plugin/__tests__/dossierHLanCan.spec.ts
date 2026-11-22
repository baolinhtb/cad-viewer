/**
 * P2-M2: the rail height (hLanCan) inside the 0.3.1 stretch grid. Until now
 * any hLanCan other than 1140 was refused («đưa về giá trị mẫu»). Every rail
 * top of the source — 23031 at the head wall, 22891 on the front's low side,
 * 23213 at the wing end; 13044 / 13226 on C–C — now sits hLanCan above its
 * foot, and the rail's dimensions and the EL1/EL2 tags on it follow.
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

import { acTpBtklMo } from '../src/btkl/mo'
import { DOSSIER_DIM_SYMBOLS } from '../src/dossier/dimSymbols'
import { DOSSIER_STRETCH_KEYS, sheetStretch } from '../src/dossier/grid030'
import {
  buildDossierModel,
  DOSSIER_A3_VERSION,
  DOSSIER_VERSION,
  dossierDefaults
} from '../src/dossier/model'
import { buildDossierScene, type DossierPrimitive } from '../src/dossier/scene'
import { acapDossierElevations } from '../src/dossier/scene030'
import { runDossierTool } from '../src/dossier/tools'
import { listRuns } from '../src/runIdentity'

const OUT = process.env.QA_EVIDENCE_DIR
const numbers: Record<string, unknown> = {}
afterAll(() => {
  if (!OUT) return
  mkdirSync(OUT, { recursive: true })
  writeFileSync(
    join(OUT, 'p2-m2-numbers.json'),
    JSON.stringify(numbers, null, 1)
  )
})

type Values = Record<string, number | string>
type XY = [number, number]

/** L1 of P1/M2: the 8 m road, stem 1200, wing 4000, D1000. */
const L1: Values = {
  tenMo: 'QA-P2-M2',
  bMatDuong: 8000,
  tThan: 1200,
  lCanh: 4000,
  D: 1000,
  lCoc: 25000
}
/** L1 with the values the tool derives from it (P1/M2). */
const L1_DERIVED: Values = {
  ...L1,
  bBe: 8700,
  bThan: 8700,
  aCocNgang: 6700,
  aCocDoc: 4000
}

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
const notBuilt = (db: AcDbDatabase) =>
  all(db)
    .filter((e): e is AcDbText => e instanceof AcDbText)
    .map(e => e.textString)
    .filter(t => /CHƯA DỰNG ĐƯỢC|CHƯA TÍNH ĐƯỢC/.test(t))
function keys(db: AcDbDatabase) {
  return all(db).map(e => {
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
  })
}
const run = (db: AcDbDatabase) => listRuns(db)[0]

type Dim = Extract<DossierPrimitive, { kind: 'dimension' }>
const measured = (d: Dim) => {
  const dx = d.end[0] - d.start[0]
  const dy = d.end[1] - d.start[1]
  if (d.direction === 'ngang') return Math.abs(dx)
  if (d.direction === 'dung') return Math.abs(dy)
  return Math.hypot(dx, dy)
}
const sheetDims = (v: Values) =>
  buildDossierScene(buildDossierModel(v), DOSSIER_A3_VERSION)
    .sheets.filter(s => ['SUB-010', 'SUB-020'].includes(s.id))
    .flatMap(s =>
      s.primitives
        .filter((p): p is Dim => p.kind === 'dimension' && !!p.sourceHandle)
        .map(p => ({ sheet: s.id, dim: p }))
    )
/**
 * The rail dimensions: vertical, no symbol, 1140 at the defaults — on the
 * front (both sides), B–B (head wall, wing end) and C–C (same two).
 */
const RAIL = new Map(
  sheetDims({})
    .filter(
      ({ dim }) =>
        dim.text === undefined &&
        dim.direction === 'dung' &&
        Math.abs(measured(dim) - 1140) <= 2
    )
    .map(({ sheet, dim }) => [dim.sourceHandle!, sheet])
)
const railDims = (v: Values) =>
  sheetDims(v)
    .filter(({ dim }) => RAIL.has(dim.sourceHandle!))
    .map(({ sheet, dim }) => ({
      sheet,
      handle: dim.sourceHandle!,
      mm: Math.round(measured(dim) * 10) / 10
    }))
/** Dimension symbols whose measurement is off their parameter. */
function wrongSymbols(v: Values) {
  const full = { ...dossierDefaults(), ...v }
  const wrong: string[] = []
  for (const { dim } of sheetDims(v)) {
    const symbol =
      dim.text !== undefined ? DOSSIER_DIM_SYMBOLS[dim.text] : undefined
    if (!symbol) continue
    const tol = symbol.xapXi ? 160 : 5
    if (Math.abs(measured(dim) - symbol.giaTri(full)) > tol)
      wrong.push(
        `${dim.text} ${Math.round(measured(dim))}≠${symbol.giaTri(full)}`
      )
  }
  return wrong
}
const elevations = (v: Values) =>
  acapDossierElevations(buildDossierModel(v).values)!

jest.setTimeout(900000)

describe('the grid follows the rail height', () => {
  test('hLanCan is a stretch key; the generator stays 0.3.1', () => {
    expect(DOSSIER_STRETCH_KEYS).toContain('hLanCan')
    expect(DOSSIER_VERSION).toBe('0.3.1')
  })

  test('the rail dimensions: two on the front, two on B–B, two on C–C', () => {
    const bySheet = [...RAIL.values()].reduce<Record<string, number>>(
      (n, s) => ({ ...n, [s]: (n[s] ?? 0) + 1 }),
      {}
    )
    expect(bySheet).toEqual({ 'SUB-010': 4, 'SUB-020': 2 })
  })

  test('at the default every line stands still: the source drawing', () => {
    const s = sheetStretch(
      'SUB-010',
      buildDossierModel({ hLanCan: 1140 }).values
    )
    expect('error' in s).toBe(false)
    expect((s as { identity: boolean }).identity).toBe(true)
    expect(sheetDims({ hLanCan: 1140 })).toEqual(sheetDims({}))
  })

  test.each([
    [1300, {}],
    [900, {}],
    [600, {}],
    [1800, {}],
    [1300, L1_DERIVED],
    [1000, { ...L1_DERIVED, tCanh: 600 }]
  ] as [number, Values][])(
    'hLanCan %d on %j: every rail dimension measures it',
    (hLanCan, base) => {
      const rails = railDims({ ...base, hLanCan })
      numbers[`rail dims ${hLanCan} ${JSON.stringify(base)}`] = rails
      expect(rails).toHaveLength(6)
      // To the source's drawing accuracy (its rail dims are 1140 ± 0.05).
      for (const r of rails) expect(r.mm).toBeCloseTo(hLanCan, 0)
      expect(wrongSymbols({ ...base, hLanCan })).toEqual([])
    }
  )

  test('only the rail moves: footing, stem, head wall, wing and FG/FE stay', () => {
    const at = (v: Values) =>
      sheetStretch('SUB-010', buildDossierModel(v).values) as {
        map(p: XY, at?: XY): XY
      }
    const s = at({ hLanCan: 1300 })
    // Front (x 7000), B–B (x 32000): every line up to the pin stands still.
    for (const x of [7000, 32000])
      for (const y of [13186, 15286, 20015, 21751, 21891, 21941, 22073, 22100])
        expect(s.map([x, y])[1]).toBeCloseTo(y, 6)
    // Every rail top rises by 160.
    for (const [x, y] of [
      [1867, 22891],
      [11632, 23031],
      [29367, 23031],
      [35867, 23213]
    ])
      expect(s.map([x, y])[1]).toBeCloseTo(y + 160, 6)
    const e0 = elevations({})
    const e1 = elevations({ hLanCan: 1300 })
    numbers['elevations 1140 → 1300'] = { e0, e1 }
    for (const k of Object.keys(e0))
      if (/^EL[12]/.test(k)) expect(e1[k]).toBeCloseTo(e0[k] + 0.16, 6)
      else expect(e1[k]).toBe(e0[k])
    expect(e1.FG).toBe(e0.FG)
    expect(e1.FE).toBe(e0.FE)
  })

  test('the wing thickness and the road width are left alone', () => {
    const w = (v: Values) =>
      sheetDims(v)
        .filter(({ dim }) => dim.text === 'W(t)' || dim.text === 'B Mặt đường')
        .map(({ dim }) => Math.round(measured(dim)))
    expect(w({ ...L1_DERIVED, tCanh: 600, hLanCan: 1300 })).toEqual(
      w({ ...L1_DERIVED, tCanh: 600 })
    )
  })
})

describe('the tools build and edit it', () => {
  test('create with hLanCan 1300 on the 8 m road; edit to 900; nothing else moves', async () => {
    const db = database()
    const made = await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { ...L1, hLanCan: 1300 } },
      db
    )
    numbers['create hLanCan 1300'] = made.message
    expect(made.ok).toBe(true)
    expect(made.message).not.toContain('đưa về giá trị mẫu')
    expect(made.message).not.toMatch(/\bhLanCan\b/)
    expect(notBuilt(db)).toEqual([])
    expect(run(db).values).toMatchObject({
      hLanCan: 1300,
      bBe: 8700,
      bMatDuong: 8000
    })
    const control = database()
    await runDossierTool('tao_ho_so_mo', { thong_so: L1 }, control)
    expect(all(db).length).toBe(all(control).length)
    const e0 = elevations(run(control).values as Values)
    const e1 = elevations(run(db).values as Values)
    numbers['L1 elevations 1140 / 1300'] = { e0, e1 }
    expect(e1.FG).toBe(e0.FG)
    expect(e1.FE).toBe(e0.FE)
    expect(e1.EL6).toBe(e0.EL6)
    expect(e1['EL1.L']).toBeCloseTo(e0['EL1.L'] + 0.16, 6)

    const edited = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: run(db).id, thong_so: { hLanCan: 900 } },
      db
    )
    numbers['edit hLanCan 900'] = edited.message
    expect(edited.ok).toBe(true)
    expect(run(db).values.hLanCan).toBe(900)
    expect(notBuilt(db)).toEqual([])
    expect(all(db).length).toBe(all(control).length)
  })

  test('hLanCan 1140 given explicitly draws the control dossier', async () => {
    const a = database()
    const b = database()
    await runDossierTool('tao_ho_so_mo', { thong_so: L1 }, a)
    await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { ...L1, hLanCan: 1140 } },
      b
    )
    expect(keys(b)).toEqual(keys(a))
  })

  test.each([500, 2000])(
    'hLanCan %d is out of range: refused, nothing changes',
    async hLanCan => {
      const db = database()
      await runDossierTool('tao_ho_so_mo', { thong_so: L1 }, db)
      const before = keys(db)
      const v0 = { ...run(db).values }
      const res = await runDossierTool(
        'sua_ho_so_mo',
        { ma_lan_chay: run(db).id, thong_so: { hLanCan } },
        db
      )
      numbers[`refused edit ${hLanCan}`] = res.message
      expect(res.ok).toBe(false)
      expect(res.message).toMatch(/lan can/i)
      expect(res.message).not.toMatch(/\bhLanCan\b/)
      expect(keys(db)).toEqual(before)
      expect(run(db).values).toEqual(v0)
      const empty = database()
      const created = await runDossierTool(
        'tao_ho_so_mo',
        { thong_so: { ...L1, hLanCan } },
        empty
      )
      expect(created.ok).toBe(false)
      expect(all(empty)).toHaveLength(0)
    }
  )
})

describe('the take-off follows the rail height (assumption 2)', () => {
  const row = (v: Values, stt: string) =>
    acTpBtklMo(v).items.find(i => i.stt === stt)!.khoiLuong!
  test.each([
    ['L1', L1_DERIVED, 3.21415, 19.7043],
    ['L1, wing 400', { ...L1_DERIVED, tCanh: 400 }, 3.21415, 15.76344],
    ['M1', {}, 5.223, 27.661]
  ] as [string, Values, number, number][])(
    '%s: 1.7 rail × 1300/1140, 1.4 wing unchanged',
    (_set, base, rail, wing) => {
      const v = { ...base, hLanCan: 1300 }
      expect(row(base, '1.7')).toBeCloseTo(rail, 4)
      expect(row(v, '1.7')).toBeCloseTo((rail * 1300) / 1140, 4)
      expect(row(v, '1.4')).toBeCloseTo(wing, 3)
      expect(row(v, '1.4')).toBe(row(base, '1.4'))
      numbers[`btkl ${_set} 1300`] = {
        '1.4': row(v, '1.4'),
        '1.7': row(v, '1.7'),
        '1': row(v, '1')
      }
    }
  )
})
