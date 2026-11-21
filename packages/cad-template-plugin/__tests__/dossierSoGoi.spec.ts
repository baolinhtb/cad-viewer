/**
 * P1/M3: the bearings as an array placed from the model (soGoi, aGoi), with
 * aGoi derived when the count changes and the bearings no longer fit. "L5"
 * is the live prompt of 21/11/2026 (plan P0–P1, sections 2.2 and 7), refused
 * before M3. Set QA_EVIDENCE_DIR to write the measured numbers there.
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
import {
  acapDeriveDossierValues,
  DOSSIER_BEARING_MARGIN
} from '../src/dossier/derive'
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
    join(OUT, 'p1-m3-numbers.json'),
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
const derivedMap = (data: unknown) =>
  Object.fromEntries(
    (
      (data as { suyRa?: { thamSo: string; giaTri: number }[] } | undefined)
        ?.suyRa ?? []
    ).map(d => [d.thamSo, d.giaTri])
  )

type Insert = Extract<DossierPrimitive, { kind: 'insert' }>
const scene = (v: Values) =>
  buildDossierScene(buildDossierModel(v), DOSSIER_A3_VERSION)
const bearingInserts = (v: Values) =>
  scene(v)
    .sheets.find(s => s.id === 'SUB-010')!
    .primitives.filter(
      (p): p is Insert => p.kind === 'insert' && p.block === 'Goi I24'
    )
/** Centre-to-centre spacings of the drawn bearings, left to right. */
const spacings = (v: Values) => {
  const xs = bearingInserts(v)
    .map(p => p.at[0])
    .sort((a, b) => a - b)
  return xs.slice(1).map((x, i) => Math.round(x - xs[i]))
}
const kl = (r: ReturnType<typeof acTpBtklMo>, k: string) =>
  r.items.find(i => i.key === k)!.khoiLuong

jest.setTimeout(900000)

describe('acapDeriveDossierValues — bearing spacing (decision 2)', () => {
  const defaults = dossierDefaults()
  test('6 bearings: spread evenly, 600 mm edge margin, rounded down to 50', () => {
    expect(DOSSIER_BEARING_MARGIN).toBe(600)
    const wide = acapDeriveDossierValues(
      { ...defaults, bBe: 8700, bThan: 8700, bMatDuong: 8000 },
      { soGoi: 6 }
    )
    expect(wide.values.aGoi).toBe(1400)
    expect(wide.suyRa).toEqual([
      expect.objectContaining({ thamSo: 'aGoi', giaTri: 1400 })
    ])
    expect(wide.suyRa[0].lyDo).toContain('lề mép 600')
    expect(acapDeriveDossierValues(defaults, { soGoi: 6 }).values.aGoi).toBe(
      1200
    )
    // (7700 − 1700) / 4 = 1500; 5 on 7900 → 1550, 7 on 7700 → 1000.
    expect(acapDeriveDossierValues(defaults, { soGoi: 5 }).values.aGoi).toBe(
      1500
    )
    expect(
      acapDeriveDossierValues(defaults, {
        soGoi: 5,
        bBe: 7900,
        bThan: 7900,
        aCocNgang: 5500
      }).values.aGoi
    ).toBe(1550)
    expect(acapDeriveDossierValues(defaults, { soGoi: 7 }).values.aGoi).toBe(
      1000
    )
  })
  test('a spacing that fits, or one the user gave, is kept', () => {
    expect(acapDeriveDossierValues(defaults, { soGoi: 2 }).suyRa).toEqual([])
    expect(acapDeriveDossierValues(defaults, { soGoi: 3 }).suyRa).toEqual([])
    const given = acapDeriveDossierValues(defaults, { soGoi: 6, aGoi: 1000 })
    expect(given.values.aGoi).toBe(1000)
    expect(given.suyRa).toEqual([])
  })
  test('too narrow for any spacing ≥ 500: left for the model to refuse', () => {
    const narrow = acapDeriveDossierValues(
      { ...defaults, bMatDuong: 3000, bBe: 3700, bThan: 3700 },
      { soGoi: 8 }
    )
    expect(narrow.suyRa).toEqual([])
    expect(buildDossierModel(narrow.values).issues.map(i => i.code)).toContain(
      'bearing_outside_wall'
    )
  })
})

describe('the bearing array in the scene', () => {
  test('default 4 at 2000: the source inserts, on the bearing layer role', () => {
    const source = bearingInserts({})
    expect(source.map(p => p.sourceHandle).sort()).toEqual([
      '20F0932',
      '20F0933',
      '20F0934',
      '20F0935'
    ])
    for (const p of source) expect(p.role).toBe('goi_cau')
    // Explicit defaults draw the same primitives as no values at all.
    expect(JSON.stringify(scene({ soGoi: 4, aGoi: 2000 }).sheets)).toEqual(
      JSON.stringify(scene({}).sheets)
    )
    expect(spacings({})).toEqual([2000, 2000, 2000])
  })
  test('the other A$C6EA20CD3 block is not a bearing', () => {
    const other = scene({})
      .sheets.find(s => s.id === 'SUB-010')!
      .primitives.filter(
        (p): p is Insert => p.kind === 'insert' && p.block === 'A$C6EA20CD3'
      )
    expect(other.length).toBeGreaterThan(0)
    for (const p of other) expect(p.role).not.toBe('goi_cau')
  })
  test('n bearings drawn at aGoi about the source centre line', () => {
    const centre = (v: Values) => {
      const xs = bearingInserts(v).map(p => p.at[0])
      return Math.round((Math.min(...xs) + Math.max(...xs)) / 2)
    }
    for (const v of [
      { soGoi: 6, aGoi: 1200 },
      { soGoi: 2, aGoi: 2000 },
      { soGoi: 3, aGoi: 2500 },
      {
        soGoi: 6,
        aGoi: 1400,
        bMatDuong: 8000,
        bBe: 8700,
        bThan: 8700,
        aCocNgang: 6300
      }
    ] as Values[]) {
      expect(bearingInserts(v)).toHaveLength(Number(v.soGoi))
      expect(spacings(v)).toEqual(
        Array(Number(v.soGoi) - 1).fill(Number(v.aGoi))
      )
      // Same centre as the source bearings at the same width (a wider
      // footing moves the whole view to keep the source's gaps).
      expect(centre(v)).toBe(centre({ ...v, soGoi: 4, aGoi: 2000 }))
      for (const p of bearingInserts(v)) expect(p.role).toBe('goi_cau')
    }
  })
})

/** The live dossier of L1–L3 (M2): an 8 m road, as the user said it. */
const L1: Values = {
  tenMo: 'QA-TEST-MO-A1',
  bMatDuong: 8000,
  tThan: 1200,
  lCanh: 4000,
  D: 1000,
  lCoc: 25000
}

describe('P1/M3 acceptance', () => {
  test('L5: 6 bearings on the 8 m road abutment — aGoi 1400 derived, 6 drawn', async () => {
    const db = database()
    expect((await tool('tao_ho_so_mo', { thong_so: L1 }, db)).ok).toBe(true)
    const before = snap(db)
    const res = await tool(
      'sua_ho_so_mo',
      { ma_lan_chay: runId(db), thong_so: { soGoi: 6 } },
      db
    )
    const after = snap(db)
    const v = values(db)
    const changed = changedBySheet(before.keys, after.keys)
    numbers.L5 = {
      ok: res.ok,
      message: res.message,
      suyRa: (res.data as Record<string, unknown> | undefined)?.suyRa,
      countBefore: before.count,
      countAfter: after.count,
      changed,
      spacings: spacings(v)
    }
    expect(res.ok).toBe(true)
    expect(derivedMap(res.data)).toEqual({ aGoi: 1400 })
    expect(v).toMatchObject({ soGoi: 6, aGoi: 1400, bThan: 8700 })
    expect(5 * 1400 + 500).toBeLessThanOrEqual(8700)
    expect(bearingInserts(v)).toHaveLength(6)
    expect(spacings(v)).toEqual([1400, 1400, 1400, 1400, 1400])
    expect(res.message).toContain('6 vị trí gối')
    // + G1…G4 / G1…G6 on the front elevation since P1/M5.
    expect(before.count).toBe(2971)
    // Every view follows (P1/M3 views): plan +2 bearings, +2 labels, +1 stop;
    // front +2 exploded bearings (13 entities each), +1 exploded stop (5).
    expect(after.count).toBe(2971 + 2 + 2 + 1 + 2 * 13 + 5 + 2)
    expect(after.notBuilt).toEqual([])
    expect(before.layers.filter(l => !after.layers.includes(l))).toEqual([])
    // Only the bearings and the take-off lines that follow them.
    for (const id of ['SUB-020', 'SUB-070', 'SUB-080', 'SUB-090'])
      expect(changed[id] ?? 0).toBe(0)
    // Which SUB-010 entities change: dossierBearingViews.spec (bearing items
    // only).
    expect(changed['SUB-010']).toBeGreaterThan(0)
    // Bearing stops 0,304 → 0,456, mortar 0,04 → 0,06, the C30 total and the
    // steel total (prototype: 3 — before P0 the stops did not follow soGoi
    // and the C30 total left them out).
    expect(changed['SUB-100']).toBe(5)
  })

  test('6 bearings on the 7 m road abutment — aGoi 1200 derived, 6 drawn', async () => {
    const db = database()
    expect(
      (await tool('tao_ho_so_mo', { thong_so: { tenMo: 'QA-M3-B1' } }, db)).ok
    ).toBe(true)
    // A geometry edit first, so the before/after differ only in the bearings
    // (any geometry change adds the M1 steel warnings and take-off table).
    expect(
      (
        await tool(
          'sua_ho_so_mo',
          { ma_lan_chay: runId(db), thong_so: { tThan: 1800 } },
          db
        )
      ).ok
    ).toBe(true)
    const before = snap(db)
    const res = await tool(
      'sua_ho_so_mo',
      { ma_lan_chay: runId(db), thong_so: { soGoi: 6 } },
      db
    )
    const after = snap(db)
    const v = values(db)
    const changed = changedBySheet(before.keys, after.keys)
    numbers.road7m = {
      ok: res.ok,
      suyRa: (res.data as Record<string, unknown> | undefined)?.suyRa,
      countBefore: before.count,
      countAfter: after.count,
      changed
    }
    expect(res.ok).toBe(true)
    expect(derivedMap(res.data)).toEqual({ aGoi: 1200 })
    expect(v).toMatchObject({ soGoi: 6, aGoi: 1200, bThan: 7700 })
    expect(spacings(v)).toEqual([1200, 1200, 1200, 1200, 1200])
    expect(after.count).toBe(before.count + 38)
    expect(after.notBuilt).toEqual([])
    expect(before.layers.filter(l => !after.layers.includes(l))).toEqual([])
    for (const id of ['SUB-020', 'SUB-070', 'SUB-080', 'SUB-090'])
      expect(changed[id] ?? 0).toBe(0)
    expect(changed['SUB-010']).toBeGreaterThan(0)
    expect(changed['SUB-100'] ?? 0).toBeLessThanOrEqual(5)
  })

  test('back to 4 at 2000 restores the source bearings', async () => {
    const db = database()
    await tool('tao_ho_so_mo', {}, db)
    const source = snap(db)
    expect(
      (
        await tool(
          'sua_ho_so_mo',
          { ma_lan_chay: runId(db), thong_so: { soGoi: 6 } },
          db
        )
      ).ok
    ).toBe(true)
    const back = await tool(
      'sua_ho_so_mo',
      { ma_lan_chay: runId(db), thong_so: { soGoi: 4, aGoi: 2000 } },
      db
    )
    expect(back.ok).toBe(true)
    expect(snap(db).keys.sort()).toEqual(source.keys.sort())
  })

  test('BTKL: bearing stops follow soGoi, C30 total still there', () => {
    expect(kl(acTpBtklMo({ soGoi: 2 }), 'u_chong_xo')).toBeCloseTo(0.152, 9)
    const six = acTpBtklMo({
      ...L1,
      bBe: 8700,
      bThan: 8700,
      aCocNgang: 6700,
      aCocDoc: 4000,
      soGoi: 6,
      aGoi: 1400
    })
    expect(six.errors).toEqual([])
    expect(kl(six, 'u_chong_xo')).toBeCloseTo(0.456, 9)
    const total = six.items.find(i => i.nhom === 'be_tong' && i.stt === '1')!
    expect(total.khoiLuong).not.toBeNull()
    expect(total.khoiLuong!).toBeGreaterThan(100)
  })

  test('regression: tCanh outside the grid still refuses, the 8 m road still builds', async () => {
    const db = database()
    const refused = await tool(
      'tao_ho_so_mo',
      { thong_so: { tenMo: 'QA-M3-X1', soGoi: 6, tCanh: 600 } },
      db
    )
    expect(refused.ok).toBe(false)
    expect(refused.message).toContain('tCanh = 500')
    expect(refused.message).not.toContain('soGoi')
    expect(all(db)).toHaveLength(0)
    const road = await tool(
      'tao_ho_so_mo',
      { thong_so: { ...L1, soGoi: 6 } },
      db
    )
    expect(road.ok).toBe(true)
    expect(derivedMap(road.data)).toMatchObject({
      bBe: 8700,
      bThan: 8700,
      aCocNgang: 6700,
      aGoi: 1400
    })
    expect(snap(db).notBuilt).toEqual([])
  })
})
