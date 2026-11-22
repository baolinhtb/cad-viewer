/**
 * P2/M1: the wing thickness (tCanh) inside the 0.3.1 stretch grid. Until now
 * any tCanh other than 500 was refused («đưa về giá trị mẫu: dày tường cánh
 * = 500 mm»). The inner faces of the two wings now sit tCanh inside the
 * footing edges on the plan and on the front elevation.
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
import { runDossierTool } from '../src/dossier/tools'
import { listRuns } from '../src/runIdentity'

const OUT = process.env.QA_EVIDENCE_DIR
const numbers: Record<string, unknown> = {}
afterAll(() => {
  if (!OUT) return
  mkdirSync(OUT, { recursive: true })
  writeFileSync(
    join(OUT, 'p2-m1-numbers.json'),
    JSON.stringify(numbers, null, 1)
  )
})

type Values = Record<string, number | string>
type XY = [number, number]

/** L1 of P1/M2: the 8 m road, stem 1200, wing 4000, D1000. */
const L1: Values = {
  tenMo: 'QA-P2-M1',
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
const dims = (v: Values) =>
  buildDossierScene(buildDossierModel(v), DOSSIER_A3_VERSION)
    .sheets.filter(s => ['SUB-010', 'SUB-020'].includes(s.id))
    .flatMap(s => s.primitives)
    .filter((p): p is Dim => p.kind === 'dimension' && !!p.sourceHandle)
/** What each dimension symbol measures, and those off their parameter. */
function measure(v: Values) {
  const full = { ...dossierDefaults(), ...v }
  const by: Record<string, number[]> = {}
  const wrong: string[] = []
  for (const d of dims(v)) {
    const symbol = d.text !== undefined ? DOSSIER_DIM_SYMBOLS[d.text] : null
    if (!symbol) continue
    ;(by[d.text!] ??= []).push(Math.round(measured(d)))
    const tol = symbol.xapXi ? 160 : 5
    if (Math.abs(measured(d) - symbol.giaTri(full)) > tol)
      wrong.push(`${d.text} ${Math.round(measured(d))}≠${symbol.giaTri(full)}`)
  }
  return { by, wrong }
}

/**
 * Where the source draws the wing on SUB-010, local coordinates: the left
 * footing edge (3414), the inner face of the left wing (3914, W(t) 500) and
 * the left road edge (3764, front only); the right ones mirrored (11114,
 * 10614, 10764). A point in the plan (y 5000) and one in the front (y 20000).
 */
const PLAN_Y = 5000
const FRONT_Y = 20000
function wing(v: Values, y: number) {
  const s = sheetStretch('SUB-010', buildDossierModel(v).values)
  if ('error' in s) throw new Error(s.error)
  const x = (source: number) => s.map([source, y] as XY)[0]
  return {
    left: x(3914) - x(3414),
    right: x(11114) - x(10614),
    roadLeft: x(3764) - x(3414),
    roadRight: x(11114) - x(10764)
  }
}

jest.setTimeout(900000)

describe('the grid follows the wing thickness', () => {
  test('tCanh is a stretch key; the generator stays 0.3.1', () => {
    expect(DOSSIER_STRETCH_KEYS).toContain('tCanh')
    expect(DOSSIER_VERSION).toBe('0.3.1')
  })

  test('at the default every grid line stands still: the source drawing', () => {
    const s = sheetStretch('SUB-010', buildDossierModel({ tCanh: 500 }).values)
    expect('error' in s).toBe(false)
    expect((s as { identity: boolean }).identity).toBe(true)
    expect(dims({ tCanh: 500 })).toEqual(dims({}))
    expect(measure({}).by['W(t)'].every(m => Math.abs(m - 500) <= 5)).toBe(true)
  })

  test.each([
    [600, {}],
    [400, {}],
    [600, L1_DERIVED],
    [800, { D: 1500, aCocNgang: 4700, aCocDoc: 3000 }]
  ] as [number, Values][])(
    'tCanh %d on %j: the inner face sits tCanh inside the footing edge, plan and front',
    (tCanh, base) => {
      const v = { ...base, tCanh }
      const plan = wing(v, PLAN_Y)
      const front = wing(v, FRONT_Y)
      numbers[`grid tCanh ${tCanh} ${JSON.stringify(base)}`] = { plan, front }
      for (const w of [plan, front]) {
        expect(w.left).toBeCloseTo(tCanh, 6)
        expect(w.right).toBeCloseTo(tCanh, 6)
      }
      // The road edges keep following the road width alone.
      const full = buildDossierModel(v).values
      const margin = (Number(full.bBe) - Number(full.bMatDuong)) / 2
      expect(front.roadLeft).toBeCloseTo(margin, 6)
      expect(front.roadRight).toBeCloseTo(margin, 6)
    }
  )

  test.each([
    { tCanh: 600 },
    { tCanh: 400 },
    { ...L1_DERIVED, tCanh: 600 },
    { D: 1500, aCocNgang: 4700, aCocDoc: 3000, tCanh: 800 }
  ] as Values[])('every dimension symbol measures its parameter: %j', v => {
    const { by, wrong } = measure(v)
    numbers[`dims ${JSON.stringify(v)}`] = {
      'W(t)': by['W(t)'],
      'B Mố - 2 W(t)': by['B Mố - 2 W(t)'],
      'B Mặt đường': by['B Mặt đường']
    }
    expect(wrong).toEqual([])
    expect(by['W(t)'].length).toBeGreaterThan(0)
    expect(by['W(t)'].every(m => Math.abs(m - Number(v.tCanh)) <= 5)).toBe(true)
  })

  test('the pile diameter alone no longer drags the wing face on the front', () => {
    // Before P2/M1 the front had no wing line, so its face moved by a share
    // of the pile diameter; the plan already kept it (assumption 9(b)).
    const v = { D: 1500, aCocNgang: 4700, aCocDoc: 3000 }
    expect(wing(v, FRONT_Y).left).toBeCloseTo(500, 6)
    expect(wing(v, PLAN_Y).left).toBeCloseTo(500, 6)
  })

  test('a dossier whose road margin is past the default wing still builds', () => {
    // A margin of 600 puts the road edge inside the default wing face: the
    // front leaves the wing lines out, as before, instead of refusing.
    const s = sheetStretch(
      'SUB-010',
      buildDossierModel({ bBe: 8200, bThan: 8200, aCocNgang: 5800 }).values
    )
    expect('error' in s).toBe(false)
  })

  test.each([
    // Outside the road edge: thinner than the margin (350 on M1).
    [{ tCanh: 300 }, '350 mm', 'dày tường cánh 300 mm'],
    [{ tCanh: 350 }, '350 mm', 'dày tường cánh 350 mm'],
    // Reaching the outer pile centre (D from the footing edge).
    [{ ...L1_DERIVED, tCanh: 1000 }, '1000 mm', 'dày tường cánh 1000 mm']
  ] as [Values, string, string][])(
    'a wing the source cannot draw is refused, in words: %j',
    (v, limit, value) => {
      const s = sheetStretch('SUB-010', buildDossierModel(v).values)
      expect('error' in s).toBe(true)
      const message = (s as { error: string }).error
      numbers[`refused grid ${JSON.stringify(v)}`] = message
      expect(message).toContain('mặt trong tường cánh')
      expect(message).toContain(limit)
      expect(message).toContain(value)
      expect(message).not.toMatch(/tCanh|bBe|bMatDuong|\bD\b/)
    }
  )
})

describe('the model still refuses wings that meet', () => {
  test('2 × tCanh ≥ bThan: no gap between the wings', () => {
    const issue = (v: Values) =>
      buildDossierModel(v).issues.find(i => i.code === 'wing_overlap')
    expect(issue({ bThan: 2000, tCanh: 1000 })).toMatchObject({
      level: 'error',
      message: 'Hai tường cánh không còn khoảng lọt lòng.'
    })
    expect(issue({ bThan: 2100, tCanh: 1000 })).toBeUndefined()
    expect(issue({ tCanh: 600 })).toBeUndefined()
  })
})

describe('the tools build and edit it', () => {
  test('create with tCanh 600 on the 8 m road; edit to 400; nothing else moves', async () => {
    const db = database()
    const made = await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { ...L1, tCanh: 600 } },
      db
    )
    numbers['create tCanh 600'] = made.message
    expect(made.ok).toBe(true)
    expect(made.message).not.toContain('đưa về giá trị mẫu')
    expect(made.message).not.toMatch(/\btCanh\b/)
    expect(notBuilt(db)).toEqual([])
    expect(run(db).values).toMatchObject({
      tCanh: 600,
      bBe: 8700,
      bThan: 8700,
      bMatDuong: 8000
    })
    const count600 = all(db).length

    // The same dossier at the default wing: same entities, same elevations.
    const control = database()
    await runDossierTool('tao_ho_so_mo', { thong_so: L1 }, control)
    expect(count600).toBe(all(control).length)
    const elevations = (d: AcDbDatabase) =>
      all(d)
        .filter(
          (e): e is AcDbText =>
            e instanceof AcDbText && sheetOf(e) === 'SUB-020'
        )
        .map(e => e.textString)
        .filter(t => /^\d{3}\.\d{3}$/.test(t))
        .sort()
    expect(elevations(db)).toEqual(elevations(control))

    const edited = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: run(db).id, thong_so: { tCanh: 400 } },
      db
    )
    numbers['edit tCanh 400'] = edited.message
    expect(edited.ok).toBe(true)
    expect(run(db).values.tCanh).toBe(400)
    expect(notBuilt(db)).toEqual([])
    expect(all(db).length).toBe(count600)
  })

  test('tCanh 500 given explicitly draws the control dossier', async () => {
    const a = database()
    const b = database()
    await runDossierTool('tao_ho_so_mo', { thong_so: L1 }, a)
    await runDossierTool('tao_ho_so_mo', { thong_so: { ...L1, tCanh: 500 } }, b)
    expect(keys(b)).toEqual(keys(a))
    expect(notBuilt(b)).toEqual([])
  })

  test.each([
    [{ tCanh: 100 }, 'below the minimum'],
    [{ tCanh: 1500 }, 'above the maximum'],
    [{ tCanh: 300 }, 'outside the road edge'],
    [{ tCanh: 1000 }, 'on the outer pile centre (D1000)']
  ] as [Values, string][])(
    'a value that does not fit is refused, nothing changes: %j (%s)',
    async change => {
      const db = database()
      await runDossierTool('tao_ho_so_mo', { thong_so: L1 }, db)
      const before = keys(db)
      const v0 = { ...run(db).values }
      const res = await runDossierTool(
        'sua_ho_so_mo',
        { ma_lan_chay: run(db).id, thong_so: change },
        db
      )
      numbers[`refused edit ${JSON.stringify(change)}`] = res.message
      expect(res.ok).toBe(false)
      expect(res.message).toMatch(/dày tường cánh/i)
      expect(res.message).not.toMatch(/\btCanh\b/)
      expect(keys(db)).toEqual(before)
      expect(run(db).values).toEqual(v0)

      // Nor does a create draw anything.
      const empty = database()
      const created = await runDossierTool(
        'tao_ho_so_mo',
        { thong_so: { ...L1, ...change } },
        empty
      )
      expect(created.ok).toBe(false)
      expect(all(empty)).toHaveLength(0)
    }
  )
})

describe('the take-off follows the wing thickness', () => {
  const kl = (v: Values, key: string) =>
    acTpBtklMo(v).items.find(i => i.key === key)!.khoiLuong!
  test('wing concrete scales with tCanh; the rail does not (assumption 2)', () => {
    expect(kl({ tCanh: 600 }, 'canh') / kl({}, 'canh')).toBeCloseTo(1.2, 9)
    expect(kl({ tCanh: 400 }, 'canh') / kl({}, 'canh')).toBeCloseTo(0.8, 9)
    expect(kl({ tCanh: 600 }, 'lan_can')).toBe(kl({}, 'lan_can'))
  })
})
