/**
 * P2-M6 (plan P0–P1, section 10: «Rà lệch H2 và các cao độ xấp xỉ»), and the
 * three limits left for it:
 *
 * - H2 / approximate heights: the head-wall top and the seat strip of the
 *   front elevation fell across the bridge inside the hDau band of the
 *   stretch grid, so their low / high ends rode it partly (H2 7042 for 7204
 *   after the control chain; EL4.R +12 mm for hDau +300).
 * - (1) the cross fall on a road wider than the source's 7000: the source's
 *   140 mm was stretched, so L1 drew 1,75 % for 2 % and 20 mm at 0 %.
 * - (2) the front elevation of a flush 2 × 2 drew the source pile pair 5300
 *   apart under a 6700 dimension.
 * - (3) BTKL line 1.4 kept the wing end at 1500 whatever the drawing showed.
 *
 * Old dossiers (drawn before P2-M6) are recognised and edited without being
 * taken for hand edits (the P2-M5 fixtures are such dossiers).
 * Set QA_EVIDENCE_DIR to write the numbers there.
 */
jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { readSemanticTag } from '@mlightcad/cad-template-sdk'
import {
  AcDbBlockReference,
  AcDbDatabase,
  AcDbEntity,
  AcDbFileType,
  AcDbText
} from '@mlightcad/data-model'

import { acTpBtklMo, acTpBtklWingEnds } from '../src/btkl/mo'
import { acapDeriveDossierValues } from '../src/dossier/derive'
import { DOSSIER_DIM_SYMBOLS } from '../src/dossier/dimSymbols'
import { acTpWithLegacyDossierGeometry } from '../src/dossier/grid030'
import {
  buildDossierModel,
  DOSSIER_A3_VERSION,
  dossierDefaults
} from '../src/dossier/model'
import { buildDossierScene, type DossierPrimitive } from '../src/dossier/scene'
import { acapDossierElevations } from '../src/dossier/scene030'
import { runDossierTool } from '../src/dossier/tools'
import { entitiesOfRun, listRuns } from '../src/runIdentity'

const OUT = process.env.QA_EVIDENCE_DIR
const numbers: Record<string, unknown> = {}
afterAll(() => {
  if (!OUT) return
  mkdirSync(OUT, { recursive: true })
  writeFileSync(
    join(OUT, 'p2-m6-numbers.json'),
    JSON.stringify(numbers, null, 1)
  )
})

jest.setTimeout(900000)

type Values = Record<string, number | string>

/** The QA dossier QA-P2-M6 as the user gives it (8 m road, L1). */
const L1_INPUT: Values = {
  tenMo: 'QA-P2-M6',
  bMatDuong: 8000,
  tThan: 1200,
  lCanh: 4000,
  D: 1000,
  lCoc: 25000
}
/** …and with what the tools derive (bBe = bThan 8700, tim cọc 6700 × 4000). */
const L1: Values = acapDeriveDossierValues(dossierDefaults(), L1_INPUT)
  .values as Values
/** The control chain of plan section 7, at its end (road 7000). */
const CONTROL: Values = {
  tenMo: 'QA-TEST-MO-C2',
  tThan: 1500,
  lCanh: 5500,
  D: 1000,
  aCocNgang: 5700,
  aCocDoc: 4000,
  lCoc: 25000,
  hDau: 2187,
  hThan: 5017,
  caoDoDayBe: 229.137
}

const scene = (v: Values) =>
  buildDossierScene(
    buildDossierModel({ ...v, nhanKichThuoc: 'ky_hieu' }),
    DOSSIER_A3_VERSION
  )
const legacyScene = (v: Values) => acTpWithLegacyDossierGeometry(() => scene(v))
const sheet = (v: Values, id = 'SUB-010') =>
  scene(v).sheets.find(s => s.id === id)!.primitives
type Dim = Extract<DossierPrimitive, { kind: 'dimension' }>
type Path = Extract<DossierPrimitive, { kind: 'path' }>
type Insert = Extract<DossierPrimitive, { kind: 'insert' }>
const measured = (d: Dim) =>
  d.direction === 'ngang'
    ? Math.abs(d.end[0] - d.start[0])
    : d.direction === 'dung'
      ? Math.abs(d.end[1] - d.start[1])
      : Math.hypot(d.end[0] - d.start[0], d.end[1] - d.start[1])
/** Front-elevation dimensions labelled `text` (SUB-010, x below 17000). */
const frontDim = (prims: DossierPrimitive[], text: string) =>
  prims.find(
    (p): p is Dim =>
      p.kind === 'dimension' && p.text === text && p.start[0] < 17000
  )!
const path = (prims: DossierPrimitive[], handle: string) =>
  prims.find(
    (p): p is Path =>
      p.kind === 'path' &&
      (p.sourceHandle === handle ||
        (p as { handle?: string }).handle === handle)
  )!
const stubs = (prims: DossierPrimitive[]) =>
  prims.filter(
    (p): p is Insert =>
      p.kind === 'insert' && /^MO2_U35[01]$/.test(p.block ?? '')
  )
const r3 = (x: number) => Math.round(x * 1000) / 1000
const el = (v: Values) => acapDossierElevations(buildDossierModel(v).values)!
const canh = (v: Values) => {
  const r = acTpBtklMo(v)
  const line = (k: string) => r.items.find(i => i.key === k)!
  return {
    canh: r3(line('canh').khoiLuong as number),
    lanCan: r3(line('lan_can').khoiLuong as number),
    c30: r3(line('be_tong').khoiLuong as number),
    dienGiai: line('canh').dienGiai
  }
}

/** Every SUB-010/020 dimension symbol off its parameter by more than allowed. */
function dimMismatches(v: Values) {
  const full = { ...dossierDefaults(), ...v }
  const wrong: string[] = []
  for (const s of scene(v).sheets)
    if (['SUB-010', 'SUB-020'].includes(s.id))
      for (const p of s.primitives) {
        if (p.kind !== 'dimension' || p.text === undefined) continue
        const symbol = DOSSIER_DIM_SYMBOLS[p.text]
        if (!symbol) continue
        if (
          Math.abs(measured(p) - symbol.giaTri(full)) > (symbol.xapXi ? 160 : 5)
        )
          wrong.push(`${p.text} ${Math.round(measured(p))}`)
      }
  return wrong
}

describe('H2 and the approximate heights (plan section 10)', () => {
  test('control chain: H2 is hThan + hDau less the drawn fall, as at the defaults', () => {
    const d0 = sheet({})
    const d1 = sheet(CONTROL)
    const h2 = [measured(frontDim(d0, 'H2')), measured(frontDim(d1, 'H2'))]
    const h2b = [measured(frontDim(d0, 'H2B')), measured(frontDim(d1, 'H2B'))]
    numbers.H2 = { mặcĐịnh: h2[0], đốiChứng: h2[1], H2B: h2b }
    // 6604 − 139,4 at the defaults (H2 is dimensioned at the low road edge,
    // 140 under the high one); the same 139,4 after the chain — was 7042,
    // 161,8 short, 2 mm past the 160 tolerance, before P2-M6.
    expect(h2[0]).toBeCloseTo(6464.6, 1)
    expect(h2[1]).toBeCloseTo(7064.6, 1)
    expect(h2[1] - h2[0]).toBeCloseTo(7204 - 6604, 1)
    expect(h2b[1] - h2b[0]).toBeCloseTo(300, 1)
    // The right side: H3A no longer grows with hDau (88,6 over hThan).
    expect(measured(frontDim(d1, 'H3A')) - 5017).toBeCloseTo(
      measured(frontDim(d0, 'H3A')) - 4717,
      1
    )
    expect(dimMismatches(CONTROL)).toEqual([])
    expect(dimMismatches({})).toEqual([])
    expect(dimMismatches(L1)).toEqual([])
  })

  test('before P2-M6 the same chain drew H2 7042 (the old defect, pinned)', () => {
    const old = legacyScene(CONTROL).sheets.find(s => s.id === 'SUB-010')!
    expect(Math.round(measured(frontDim(old.primitives, 'H2')))).toBe(7042)
  })

  test('hDau +300: the seat strip, EL4 and the stops do not ride the head wall', () => {
    const e0 = el({})
    const e1 = el({ hDau: 2187 })
    const d = Object.fromEntries(
      Object.keys(e0).map(k => [k, r3(e1[k] - e0[k])])
    )
    numbers.hDau300 = d
    expect(d).toEqual({
      FG: 0.3,
      FE: 0.3,
      EL6: 0,
      EL5: 0,
      'EL4.L': 0,
      'EL4.R': 0,
      EL3: 0,
      'EL2.L': 0.3,
      'EL2.R': 0.3,
      'EL1.L': 0.3,
      'EL1.R': 0.3
    })
    // A stop's bar (20E91CF, 600 tall on the seat) keeps its height.
    const bar = (v: Values) => {
      // (re-placed with the bearings off the defaults: 20E91CF#1)
      const bars = sheet(v).filter(
        (p): p is Path =>
          p.kind === 'path' && /^20E91CF(#1)?$/.test(p.sourceHandle ?? '')
      )
      const ys = bars[0].points.map(q => q[1])
      return Math.max(...ys) - Math.min(...ys)
    }
    expect(bar({ hDau: 2187 })).toBeCloseTo(bar({}), 6)
    expect(bar({ hDau: 2187 })).toBeCloseTo(600, 0)
    // Before P2-M6 it stretched with the head wall (+32 mm for hDau +300).
    const old = acTpWithLegacyDossierGeometry(() => bar({ hDau: 2187 }))
    numbers.barHDau300 = { now: bar({ hDau: 2187 }), before: old }
    expect(old - 600).toBeGreaterThan(30)
  })

  test('L4 (b) hThan +300 on L1: every elevation above the footing +0,300', () => {
    const e0 = el(L1)
    const e1 = el({ ...L1, hThan: Number(L1.hThan) + 300 })
    const d = Object.fromEntries(
      Object.keys(e0).map(k => [k, r3(e1[k] - e0[k])])
    )
    numbers.L4 = d
    for (const [k, v] of Object.entries(d))
      expect([k, v]).toEqual([k, ['EL5', 'EL6'].includes(k) ? 0 : 0.3])
  })

  test('the source drawing (road 7000, any slope) is drawn as before P2-M6', () => {
    for (const v of [
      {},
      { docNgang: 3 },
      { docNgang: 0, docDoc: 4 },
      { hLanCan: 1300 },
      { tThan: 1200, lCanh: 4000, D: 1000, aCocNgang: 5300 }
    ] as Values[])
      expect(JSON.stringify(scene(v))).toBe(JSON.stringify(legacyScene(v)))
  })
})

describe('(1) the cross fall on a wider road (L1, 8 m)', () => {
  const ends = (prims: DossierPrimitive[], handle: string) => {
    const ps = path(prims, handle).points
    return [ps[0][1], ps[ps.length - 1][1]]
  }
  test('0 %: head wall top, rail, seat and both sides level', () => {
    const p = sheet({ ...L1, docNgang: 0 })
    const fall: Record<string, number> = {}
    // Head wall top / road (20E91C8), the line above it (20E91C9), the seat
    // (20E91D1): one end to the other.
    for (const h of ['20E91C8', '20E91C9', '20E91D1']) {
      const [a, b] = ends(p, h)
      fall[h] = r3(a - b)
      expect(Math.abs(a - b)).toBeLessThan(1)
    }
    const e = el({ ...L1, docNgang: 0 })
    numbers.L1_0 = { fall, elevations: e }
    expect(e['EL1.L']).toBe(e['EL1.R'])
    expect(e['EL2.L']).toBe(e['EL2.R'])
    expect(e['EL4.L']).toBe(e['EL4.R'])
    expect(e['EL1.L']).toBe(238.511)
    // Before P2-M6: 20 mm the wrong way.
    const old = acTpWithLegacyDossierGeometry(() => el({ ...L1, docNgang: 0 }))
    expect(r3(old['EL1.L'] - old['EL1.R'])).toBe(-0.02)
  })

  test.each([
    [2, 0.16, 0.174, 238.591, 238.431],
    [3, 0.24, 0.261, 238.631, 238.391],
    [4, 0.32, 0.348, 238.671, 238.351]
  ])(
    '%s %%: the drawn fall is the stated one over the road and the stem',
    (i, road, stem, l, r) => {
      const v = { ...L1, docNgang: i }
      const e = el(v)
      numbers[`L1_${i}`] = e
      // Tags are written to the mm: a difference of two is ±0,001.
      expect(Math.abs(e['EL1.L'] - e['EL1.R'] - road)).toBeLessThan(0.0015)
      expect(Math.abs(e['EL4.L'] - e['EL4.R'] - stem)).toBeLessThan(0.0015)
      expect([e['EL1.L'], e['EL1.R']]).toEqual([l, r])
      const p = sheet(v)
      const [hi, lo] = ends(p, '20E91C8')
      expect(hi - lo).toBeCloseTo((i / 100) * 8000, 1)
    }
  )

  test('H3 (high road edge) is hThan + hDau plus the fall over the added half road', () => {
    const at = (v: Values) => measured(frontDim(sheet(v), 'H3'))
    expect(at({})).toBeCloseTo(6604.6, 1)
    // 2 % × (8000 − 7000) / 2 = 10 above the source's edge.
    expect(at(L1) - at({})).toBeCloseTo(10, 1)
    expect(acTpWithLegacyDossierGeometry(() => at(L1)) - at({})).toBeCloseTo(
      0,
      6
    )
  })

  test('3 %: EL1.L was 238,621 before P2-M6 — 2,75 % over 8 m, not 3 %', () => {
    const old = acTpWithLegacyDossierGeometry(() => el({ ...L1, docNgang: 3 }))
    expect(old['EL1.L']).toBe(238.621)
    expect(r3(old['EL1.L'] - old['EL1.R'])).toBe(0.22)
  })
})

describe('(2) the front elevation pile stubs at the true centres', () => {
  const centres = (v: Values) =>
    stubs(sheet(v)).map(s => ({ block: s.block, x: s.at[0] }))
  test('L1 2 × 2 flush: two stubs 6700 apart, as the dimension above them', () => {
    const p = sheet(L1)
    const s = stubs(p)
    expect(s.map(x => x.block)).toEqual(['MO2_U350', 'MO2_U350'])
    const gap = Math.abs(s[1].at[0] - s[0].at[0])
    expect(gap).toBeCloseTo(6700, 6)
    // The pile-centre dimension of the front elevation (B Mố − 2D) measures
    // the same 6700 and sits over them.
    const dim = frontDim(p, 'B Mố - 2D')
    // (the source dimension points are 0,2 mm off its round numbers)
    expect(measured(dim)).toBeCloseTo(6700, 0)
    const dimXs = [dim.start[0], dim.end[0]].sort((a, b) => a - b)
    const stubXs = s.map(x => x.at[0]).sort((a, b) => a - b)
    expect(dimXs[0] - stubXs[0]).toBeCloseTo(dimXs[1] - stubXs[1], 0)
    numbers.stubs = {
      L1: centres(L1),
      legacy: stubs(legacyScene(L1).sheets[0].primitives).map(x => x.block)
    }
    // Before P2-M6: the source pair, 5300 apart.
    expect(
      stubs(
        legacyScene(L1).sheets.find(x => x.id === 'SUB-010')!.primitives
      ).map(x => x.block)
    ).toEqual(['MO2_U351'])
  })

  test('the source spacing keeps the source pair; 3 per row stays as P2-M4', () => {
    expect(centres({}).map(c => c.block)).toEqual(['MO2_U351'])
    const three = centres({ ...L1, soCotCoc: 3, aCocNgang: 3350 })
    expect(three.map(c => c.block)).toEqual([
      'MO2_U350',
      'MO2_U350',
      'MO2_U350'
    ])
    expect(three[1].x - three[0].x).toBeCloseTo(3350, 6)
    expect(three[2].x - three[1].x).toBeCloseTo(3350, 6)
    // Road 7000, D 1000 flush (5700): two stubs 5700 apart, not the pair.
    const c1 = centres({ D: 1000, aCocNgang: 5700, aCocDoc: 3600 })
    expect(c1.map(c => c.block)).toEqual(['MO2_U350', 'MO2_U350'])
    expect(c1[1].x - c1[0].x).toBeCloseTo(5700, 6)
  })
})

describe('(3) BTKL 1.4 takes the wing end from the drawing', () => {
  test('defaults keep their numbers (end 1500 / 1500 in the drawing)', () => {
    expect(acTpBtklWingEnds(dossierDefaults())).toEqual({
      left: 1500,
      right: 1500
    })
    const t = [500, 400, 600].map(tCanh => canh({ ...L1, tCanh }))
    numbers.btklDefaults = t
    expect(t.map(x => x.canh)).toEqual([19.704, 15.763, 23.645])
    expect(t.map(x => x.c30)).toEqual([184.857, 180.916, 188.798])
    expect(t.map(x => x.lanCan)).toEqual([3.214, 3.214, 3.214])
    expect(canh({}).canh).toBe(27.661)
  })

  test.each([
    ['dốc ngang 3 %', { docNgang: 3 }, 1550, 1450, 19.592, 3.214],
    ['dốc ngang 0 %', { docNgang: 0 }, 1430, 1570, 19.928, 3.214],
    ['dốc ngang −2 %', { docNgang: -2 }, 1350, 1650, 19.704, 3.214],
    ['dốc đỉnh cánh 4 %', { docDoc: 4 }, 1558, 1538, 19.799, 3.214],
    ['lan can 1300', { hLanCan: 1300 }, 1510, 1490, 19.704, 3.665]
  ] as [string, Values, number, number, number, number][])(
    'L1 %s: wing ends as drawn',
    (_name, change, left, right, want, lanCan) => {
      const v = { ...L1, ...change }
      const ends = acTpBtklWingEnds(buildDossierModel(v).values)
      const c = canh(v)
      numbers[`btkl ${_name}`] = { ends, ...c }
      expect(Math.round(ends.left)).toBe(left)
      expect(Math.round(ends.right)).toBe(right)
      expect(c.canh).toBe(want)
      // 1.7 (rail on the wings) follows the rail height only (P2-M2).
      expect(c.lanCan).toBe(lanCan)
      // The drawing's own wing end dimensions (B–B 20F02C3, C–C 2111631).
      const end = (id: string, h: string) => {
        const d = scene(v)
          .sheets.find(s => s.id === id)!
          .primitives.find(
            (p): p is Dim => p.kind === 'dimension' && p.sourceHandle === h
          )!
        return measured(d)
      }
      expect(end('SUB-010', '20F02C3')).toBeCloseTo(ends.left, 6)
      expect(end('SUB-020', '2111631')).toBeCloseTo(ends.right, 6)
    }
  )
})

/** Reads a DXF file the way the viewer opens one. */
async function readDxf(file: string): Promise<AcDbDatabase> {
  const db = new AcDbDatabase()
  await db.read(
    new TextEncoder().encode(readFileSync(file, 'utf8')).buffer as ArrayBuffer,
    { readOnly: false },
    AcDbFileType.DXF
  )
  return db
}
const runOf = (db: AcDbDatabase) =>
  listRuns(db).find(r => r.templateId === 'ho_so_mo_m1')!
const sheetOf = (e: AcDbEntity) =>
  String(readSemanticTag(e)?.params?.sheet ?? '?')
const frontStubs = (db: AcDbDatabase) =>
  entitiesOfRun(db, runOf(db).id)
    .filter(
      (e): e is AcDbBlockReference =>
        e instanceof AcDbBlockReference &&
        /^MO2_U35[01]$/.test(e.blockName) &&
        sheetOf(e) === 'SUB-010'
    )
    .map(e => ({ block: e.blockName, x: Math.round(e.position.x * 10) / 10 }))
    .sort((a, b) => a.x - b.x)
const sua = (db: AcDbDatabase, thong_so: Values) =>
  runDossierTool('sua_ho_so_mo', { ma_lan_chay: runOf(db).id, thong_so }, db)

describe('an L1 dossier drawn before P2-M6 (P2-M5 fixture) is not refused', () => {
  const FIXTURE = join(
    __dirname,
    'fixtures',
    'p2m5',
    'qa-p2m5-them-ghi-chu.dxf'
  )
  test('a label change keeps its drawing (pair 5300); a dimension change brings the corrections', async () => {
    const db = await readDxf(FIXTURE)
    expect(frontStubs(db).map(s => s.block)).toEqual(['MO2_U351'])
    const named = await sua(db, { tenMo: 'QA-P2-M6-CU' })
    expect(named.ok).toBe(true)
    expect(frontStubs(db).map(s => s.block)).toEqual(['MO2_U351'])
    const flat = await sua(db, { docNgang: 0 })
    numbers.fixture = { docNgang0: flat.message }
    expect(flat.ok).toBe(true)
    const now = frontStubs(db)
    expect(now.map(s => s.block)).toEqual(['MO2_U350', 'MO2_U350'])
    expect(now[1].x - now[0].x).toBeCloseTo(6700, 1)
    // The user's note stays; the rest is the dossier drawn anew.
    expect(
      [...db.tables.blockTable.modelSpace.newIterator()].some(
        e =>
          e instanceof AcDbText &&
          e.textString === 'Ghi chú QA P2-M5: nét người dùng thêm'
      )
    ).toBe(true)
    const e = (
      (
        await runDossierTool(
          'kiem_tra_ho_so',
          { ma_lan_chay: runOf(db).id },
          db
        )
      ).data as { caoDo: { bang: Record<string, number> } }
    ).caoDo.bang
    expect(e['EL1.L']).toBe(e['EL1.R'])
    // Back to 2 %: the stated fall, not the stretched source.
    expect((await sua(db, { docNgang: 2 })).ok).toBe(true)
  })
})
