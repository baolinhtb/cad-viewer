/**
 * P2-M3: cross fall (docNgang) and wing top slope (docDoc) on the 0.3.1
 * dossier. The source is drawn sloped already (2 %, 2,8 %), so a slope is
 * not a grid line: the change from the source slope tilts each view —
 * about the centre line on the front, by half the road width on the
 * sections cut at the road edges (B–B high, C–C low), along the wing for
 * the wing top. At the source slopes nothing moves.
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
import { DOSSIER_STRETCH_KEYS, sheetStretch } from '../src/dossier/grid030'
import {
  buildDossierModel,
  DOSSIER_A3_VERSION,
  DOSSIER_VERSION
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
    join(OUT, 'p2-m3-numbers.json'),
    JSON.stringify(numbers, null, 1)
  )
})

type Values = Record<string, number | string>
type XY = [number, number]

/** L1 of P1/M2: the 8 m road, stem 1200, wing 4000, D1000. */
const L1: Values = {
  tenMo: 'QA-P2-M3',
  bMatDuong: 8000,
  tThan: 1200,
  lCanh: 4000,
  D: 1000,
  lCoc: 25000
}
const L1_DERIVED: Values = {
  ...L1,
  bBe: 8700,
  bThan: 8700,
  aCocNgang: 6700,
  aCocDoc: 4000
}
/** Road and stem half widths, wing length: M1 and L1. */
const SETS: [string, Values, { road: number; stem: number; wing: number }][] = [
  ['M1', {}, { road: 3500, stem: 3850, wing: 6500 }],
  ['L1', L1_DERIVED, { road: 4000, stem: 4350, wing: 4000 }]
]

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
const elevations = (v: Values) =>
  acapDossierElevations(buildDossierModel(v).values)!
const stretchOf = (sheet: string, v: Values) => {
  const s = sheetStretch(sheet, buildDossierModel(v).values)
  if ('error' in s) throw new Error(s.error)
  return s
}
/** How far a source point of `sheet` rises, mm (y only). */
const rise = (sheet: string, v: Values, p: XY) =>
  stretchOf(sheet, v).map(p, p)[1] - p[1]

type Dim = Extract<DossierPrimitive, { kind: 'dimension' }>
const measured = (d: Dim) => {
  const dx = d.end[0] - d.start[0]
  const dy = d.end[1] - d.start[1]
  if (d.direction === 'ngang') return Math.abs(dx)
  if (d.direction === 'dung') return Math.abs(dy)
  return Math.hypot(dx, dy)
}
const dimsByHandle = (v: Values) =>
  new Map(
    buildDossierScene(buildDossierModel(v), DOSSIER_A3_VERSION)
      .sheets.filter(s => ['SUB-010', 'SUB-020'].includes(s.id))
      .flatMap(s => s.primitives)
      .filter((p): p is Dim => p.kind === 'dimension' && !!p.sourceHandle)
      .map(p => [p.sourceHandle!, Math.round(measured(p) * 10) / 10])
  )

/**
 * The elevation tags off the centre line in the source (EL3 at 69 mm, FE at
 * −70 mm; about 89 mm once the 8 m road stretches the strip between the
 * centre and the piles) follow the fall at that distance: under 0,9 mm per
 * 1 % change.
 */
const offCentre = (dPercent: number) => Math.abs(dPercent) * 0.0009 + 0.0006

jest.setTimeout(900000)

describe('the slopes are in the grid, the generator stays 0.3.1', () => {
  test('both are stretch keys', () => {
    expect(DOSSIER_STRETCH_KEYS).toContain('docNgang')
    expect(DOSSIER_STRETCH_KEYS).toContain('docDoc')
    expect(DOSSIER_VERSION).toBe('0.3.1')
  })

  test('at the source slopes (2 %, 2,8 %) the drawing is the source', () => {
    const s = sheetStretch(
      'SUB-010',
      buildDossierModel({ docNgang: 2, docDoc: 2.8 }).values
    )
    expect((s as { identity: boolean }).identity).toBe(true)
    expect(dimsByHandle({ docNgang: 2, docDoc: 2.8 })).toEqual(dimsByHandle({}))
    // And with other parameters stretched, the slopes add nothing.
    expect(dimsByHandle({ ...L1_DERIVED, docNgang: 2 })).toEqual(
      dimsByHandle(L1_DERIVED)
    )
  })
})

describe('cross fall (dốc ngang)', () => {
  test.each(
    SETS.flatMap(([set, base, w]) =>
      [3, 0, -2].map(i => [set, base, w, i] as const)
    )
  )('%s, %#: the elevation tags', (set, base, w, i) => {
    const e0 = elevations(base)
    const e1 = elevations({ ...base, docNgang: i })
    const d = (i - 2) / 100
    numbers[`${set} docNgang ${i}`] = { e0, e1 }
    const near = (k: string, want: number, tol = 0.0006) =>
      expect(Math.abs(e1[k] - want)).toBeLessThanOrEqual(tol)
    // Rail tops at the road edges, seat at the stem edges, left up.
    near('EL1.L', e0['EL1.L'] + (d * w.road) / 1000)
    near('EL1.R', e0['EL1.R'] - (d * w.road) / 1000)
    near('EL2.L', e0['EL2.L'] + (d * w.road) / 1000)
    near('EL2.R', e0['EL2.R'] - (d * w.road) / 1000)
    near('EL4.L', e0['EL4.L'] + (d * w.stem) / 1000, 0.0011)
    near('EL4.R', e0['EL4.R'] - (d * w.stem) / 1000, 0.0011)
    // The rail tops differ by the full fall across the road.
    near(
      'EL1.L',
      e1['EL1.R'] + (e0['EL1.L'] - e0['EL1.R']) + (2 * d * w.road) / 1000,
      0.0011
    )
    // The footing is flat: bottom and top unchanged.
    expect(e1.EL5).toBe(e0.EL5)
    expect(e1.EL6).toBe(e0.EL6)
    // Tags on the centre line (in the source, 69 / 70 mm off it).
    near('EL3', e0.EL3, offCentre(i - 2))
    near('FE', e0.FE, offCentre(i - 2))
  })

  test('M1 at 3 %: the rail tops 210 mm apart across the road, seat 231', () => {
    const e = elevations({ docNgang: 3 })
    expect(e['EL1.L'] - e['EL1.R']).toBeCloseTo(0.21, 3)
    expect(e['EL4.L'] - e['EL4.R']).toBeCloseTo(0.231, 2)
  })

  test('sections: A–A on the centre line stays, B–B rises, C–C falls; the footing stays', () => {
    const v = { docNgang: 3 }
    // A–A: head wall top, stem top, footing.
    for (const p of [
      [18732, 21891],
      [18732, 20003],
      [17000, 15286]
    ] as XY[])
      expect(rise('SUB-010', v, p)).toBeCloseTo(0, 6)
    // B–B (high road edge): +1 % × 3500 from the seat up, footing still.
    expect(rise('SUB-010', v, [29367, 21891])).toBeCloseTo(35, 6)
    expect(rise('SUB-010', v, [29367, 20073])).toBeCloseTo(35, 6)
    expect(rise('SUB-010', v, [29367, 23031])).toBeCloseTo(35, 6)
    expect(rise('SUB-010', v, [28367, 15286])).toBeCloseTo(0, 6)
    // The wing: top +35, chamfer end and footing still.
    expect(rise('SUB-010', v, [35867, 22073])).toBeCloseTo(35, 6)
    expect(rise('SUB-010', v, [35867, 20573])).toBeCloseTo(0, 6)
    expect(rise('SUB-010', v, [32367, 17073])).toBeCloseTo(0, 6)
    expect(rise('SUB-020', v, [2222, 12086])).toBeCloseTo(-35, 6)
    expect(rise('SUB-020', v, [2222, 10586])).toBeCloseTo(0, 6)
    // C–C (low road edge): −35.
    expect(rise('SUB-020', v, [8722, 11904])).toBeCloseTo(-35, 6)
    expect(rise('SUB-020', v, [8722, 13044])).toBeCloseTo(-35, 6)
    expect(rise('SUB-020', v, [9722, 5439])).toBeCloseTo(0, 6)
    // Front: footing still, the seat edges ±38,5, the rail tops ±35.
    expect(rise('SUB-010', v, [11114, 15286])).toBeCloseTo(0, 6)
    expect(rise('SUB-010', v, [11114, 20092])).toBeCloseTo(38.5, 6)
    expect(rise('SUB-010', v, [3414, 19938])).toBeCloseTo(-38.5, 6)
    expect(rise('SUB-010', v, [10764, 23031])).toBeCloseTo(35, 6)
    expect(rise('SUB-010', v, [3764, 22891])).toBeCloseTo(-35, 6)
    expect(rise('SUB-010', v, [7264, 21821])).toBeCloseTo(0, 6)
  })

  test('the rail and footing dimensions keep their length; the stem heights follow', () => {
    const d0 = dimsByHandle({})
    const d1 = dimsByHandle({ docNgang: 3 })
    // Rail dimensions (P2-M2): front both sides, B–B, C–C; the wing's 1:1
    // chamfer on B–B and C–C keeps its place on the footing.
    for (const h of [
      '20EF8D5',
      '20EFA01',
      '20F01E3',
      '20F02C4',
      '2111630',
      '20F02C5',
      '20F02C6',
      '2111633',
      '2111634'
    ])
      expect(d1.get(h)).toBe(d0.get(h))
    const changed = [...d0].filter(([h, mm]) => d1.get(h) !== mm)
    numbers['M1 docNgang 3 changed dims'] = changed.map(([h, mm]) => [
      h,
      mm,
      d1.get(h)
    ])
    expect(changed.length).toBeGreaterThan(0)
  })
})

describe('wing top slope (dốc đỉnh cánh)', () => {
  test.each(
    SETS.flatMap(([set, base, w]) =>
      [4, 1, -1].map(k => [set, base, w, k] as const)
    )
  )(
    '%s, %#: the wing end rises by the change × the wing length',
    (set, base, w, k) => {
      const e0 = elevations(base)
      const e1 = elevations({ ...base, docDoc: k })
      numbers[`${set} docDoc ${k}`] = { e0, e1 }
      const up = (((k - 2.8) / 100) * w.wing) / 1000
      for (const tag of ['EL2.L', 'EL2.R'])
        expect(Math.abs(e1[tag] - (e0[tag] + up))).toBeLessThanOrEqual(0.0006)
      // Nothing else: head wall, rail at the head wall, seat, footing, road.
      for (const tag of Object.keys(e0).filter(t => !t.startsWith('EL2')))
        expect(e1[tag]).toBe(e0[tag])
    }
  )

  test('B–B and C–C: the wing top tilts from the head wall face; the chamfer stays', () => {
    const v = { docDoc: 4 }
    // B–B: wing end top and rail top +1,2 % × 6500, head wall top still.
    expect(rise('SUB-010', v, [35867, 22073])).toBeCloseTo(78, 6)
    expect(rise('SUB-010', v, [35867, 23213])).toBeCloseTo(78, 6)
    expect(rise('SUB-010', v, [32617, 21982])).toBeCloseTo(39, 6)
    expect(rise('SUB-010', v, [29367, 21891])).toBeCloseTo(0, 6)
    expect(rise('SUB-010', v, [35867, 20573])).toBeCloseTo(0, 6)
    expect(rise('SUB-010', v, [32367, 15286])).toBeCloseTo(0, 6)
    // C–C, the wing running left.
    expect(rise('SUB-020', v, [2222, 12086])).toBeCloseTo(78, 6)
    expect(rise('SUB-020', v, [8722, 11904])).toBeCloseTo(0, 6)
    expect(rise('SUB-020', v, [2222, 10586])).toBeCloseTo(0, 6)
    // Front and A–A: untouched.
    expect(rise('SUB-010', v, [10764, 23031])).toBeCloseTo(0, 6)
    expect(rise('SUB-010', v, [18732, 21891])).toBeCloseTo(0, 6)
  })

  test('the wing end dimension grows by the rise; the rail on it keeps 1140', () => {
    const d0 = dimsByHandle({})
    const d1 = dimsByHandle({ docDoc: 4 })
    const wingEnd = [...d0].find(
      ([h, mm]) => Math.abs(mm - 1500) < 1 && Math.abs(d1.get(h)! - 1578) < 1
    )
    expect(wingEnd).toBeDefined()
    expect(d1.get('20F02C4')).toBe(d0.get('20F02C4'))
  })
})

describe('both slopes with the other stretched parameters', () => {
  test('L1 with tCanh 400, hLanCan 1300, docNgang 3, docDoc 4: everything adds up', () => {
    const base = { ...L1_DERIVED, tCanh: 400, hLanCan: 1300 }
    const e0 = elevations(base)
    const e1 = elevations({ ...base, docNgang: 3, docDoc: 4 })
    numbers['L1 tCanh 400 hLanCan 1300, docNgang 3 docDoc 4'] = { e0, e1 }
    const near = (got: number, want: number) =>
      expect(Math.abs(got - want)).toBeLessThanOrEqual(0.0011)
    near(e1['EL1.L'], e0['EL1.L'] + 0.04)
    near(e1['EL1.R'], e0['EL1.R'] - 0.04)
    near(e1['EL2.L'], e0['EL2.L'] + 0.04 + 0.048)
    near(e1['EL2.R'], e0['EL2.R'] - 0.04 + 0.048)
    expect(e1.EL5).toBe(e0.EL5)
    expect(e1.EL6).toBe(e0.EL6)
  })
})

describe('the tools build and edit them', () => {
  test('create on the 8 m road with 3 %; edit to 0 %, then the wing top to 4 % and 1 %', async () => {
    const db = database()
    const made = await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { ...L1, docNgang: 3 } },
      db
    )
    numbers['create docNgang 3'] = made.message
    expect(made.ok).toBe(true)
    expect(made.message).not.toContain('đưa về giá trị mẫu')
    expect(made.message).not.toMatch(/\bdocNgang\b|\bdocDoc\b/)
    expect(notBuilt(db)).toEqual([])
    const control = database()
    await runDossierTool('tao_ho_so_mo', { thong_so: L1 }, control)
    expect(all(db).length).toBe(all(control).length)
    for (const thong_so of [{ docNgang: 0 }, { docDoc: 4 }, { docDoc: 1 }]) {
      const res = await runDossierTool(
        'sua_ho_so_mo',
        { ma_lan_chay: run(db).id, thong_so },
        db
      )
      numbers[`edit ${JSON.stringify(thong_so)}`] = res.message
      expect(res.ok).toBe(true)
      expect(run(db).values).toMatchObject(thong_so)
      expect(notBuilt(db)).toEqual([])
      expect(all(db).length).toBe(all(control).length)
    }
  })

  test('the source slopes given explicitly draw the control dossier', async () => {
    const a = database()
    const b = database()
    await runDossierTool('tao_ho_so_mo', { thong_so: L1 }, a)
    await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { ...L1, docNgang: 2, docDoc: 2.8 } },
      b
    )
    expect(keys(b)).toEqual(keys(a))
  })

  test.each([
    [{ docNgang: 9 }, /dốc ngang/i],
    [{ docNgang: -9 }, /dốc ngang/i],
    [{ docDoc: 9 }, /dốc đỉnh cánh/i]
  ] as [Values, RegExp][])(
    'out of range %j: refused, nothing changes',
    async (change, words) => {
      const db = database()
      await runDossierTool('tao_ho_so_mo', { thong_so: L1 }, db)
      const before = keys(db)
      const v0 = { ...run(db).values }
      const res = await runDossierTool(
        'sua_ho_so_mo',
        { ma_lan_chay: run(db).id, thong_so: change },
        db
      )
      numbers[`refused ${JSON.stringify(change)}`] = res.message
      expect(res.ok).toBe(false)
      expect(res.message).toMatch(words)
      expect(res.message).not.toMatch(/\bdocNgang\b|\bdocDoc\b/)
      expect(keys(db)).toEqual(before)
      expect(run(db).values).toEqual(v0)
    }
  )

  test('the existing gates still stop an inverted wing and a stem with no height', () => {
    const codes = (v: Values) => buildDossierModel(v).issues.map(i => i.code)
    expect(codes({ hThan: 3500, docDoc: -8 })).toContain(
      'wing_profile_inverted'
    )
    expect(codes({ docDoc: -8 })).not.toContain('wing_profile_inverted')
    // A stem with no height at its low edge needs hThan ≤ 8 % × bThan / 2:
    // at the largest stem (16 m) that is 640, under the smallest hThan
    // (1000), so within the ranges the gate cannot trip.
    expect(
      codes({ hThan: 1000, bBe: 16000, bThan: 16000, docNgang: 8 })
    ).not.toContain('negative_stem_height')
  })
})

describe('the take-off with the slopes (1.4 / 5.4: wing end as drawn, P2-M6)', () => {
  const row = (v: Values, stt: string) =>
    acTpBtklMo(v).items.find(i => i.stt === stt)!.khoiLuong!
  test.each([
    ['M1', {}],
    ['L1', L1_DERIVED]
  ] as [string, Values][])(
    '%s: numbers pinned for 0 / 3 % and 1 / 4 %',
    (set, base) => {
      const at = (v: Values) => ({
        '1.2 than': row({ ...base, ...v }, '1.2'),
        '1.4 canh': row({ ...base, ...v }, '1.4'),
        '1.7 lan can': row({ ...base, ...v }, '1.7'),
        '1 C30': row({ ...base, ...v }, '1'),
        '5 van khuon': row({ ...base, ...v }, '5')
      })
      const out = {
        goc: at({}),
        'docNgang 3': at({ docNgang: 3 }),
        'docNgang 0': at({ docNgang: 0 }),
        'docDoc 4': at({ docDoc: 4 }),
        'docDoc 1': at({ docDoc: 1 })
      }
      numbers[`btkl ${set}`] = out
      expect(out).toMatchSnapshot()
      // The rail does not follow either slope (assumption 2).
      for (const v of Object.values(out))
        expect(v['1.7 lan can']).toBe(out.goc['1.7 lan can'])
    }
  )
})
