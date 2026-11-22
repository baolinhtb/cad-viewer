/**
 * P1/M4 (plan P0–P1 section 2.3, decision 5): raising the abutment's seat —
 * «xà mũ mố», «bệ kê gối», «đỉnh thân» — is asked, never guessed:
 * (a) raise the whole abutment, caoDoDayBe += Δ, or (b) keep the footing and
 * lengthen the stem, hThan += Δ. Both are applied the same way everywhere:
 * the views, the SUB-020 elevation table, the elevation tags and the take-off.
 * Live prompt L4 of 21/11/2026. Set QA_EVIDENCE_DIR to write the numbers.
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
  AcDbText
} from '@mlightcad/data-model'

import { acTpBtklMo } from '../src/btkl/mo'
import { DOSSIER_DIM_SYMBOLS } from '../src/dossier/dimSymbols'
import { DOSSIER_TOOLS, runDossierTool } from '../src/dossier/tools'
import { listRuns } from '../src/runIdentity'

const OUT = process.env.QA_EVIDENCE_DIR
const numbers: Record<string, unknown> = {}
afterAll(() => {
  if (!OUT) return
  mkdirSync(OUT, { recursive: true })
  writeFileSync(
    join(OUT, 'p1-m4-numbers.json'),
    JSON.stringify(numbers, null, 1)
  )
})

type Values = Record<string, number | string>
const sheetOf = (e: AcDbEntity) =>
  String(readSemanticTag(e)?.params?.sheet ?? '?')
const all = (db: AcDbDatabase) => [
  ...db.tables.blockTable.modelSpace.newIterator()
]
/** The elevations of the SUB-020 table, in drawing order (m). */
const table = (db: AcDbDatabase) =>
  all(db)
    .filter(
      (e): e is AcDbText => e instanceof AcDbText && sheetOf(e) === 'SUB-020'
    )
    .map(e => Number(e.textString.replace(',', '.')))
    .filter(n => Number.isFinite(n) && n > 200 && n < 300)
/** Elevation tags (cd11, "EL3 = 235.554") on the drawn sheets. */
const tags = (db: AcDbDatabase) =>
  all(db)
    .filter(
      (e): e is AcDbBlockReference =>
        e instanceof AcDbBlockReference && e.blockName === 'cd11'
    )
    .flatMap(e => [...e.attributeIterator()].map(a => a.textString))
    .filter(t => t.includes('='))
    .sort()
/** Everything but text: lines, hatches, blocks, dimensions — rounded. */
const shapes = (db: AcDbDatabase) =>
  all(db)
    .filter(e => !(e instanceof AcDbText))
    .map(e => {
      const b = e.geometricExtents
      return [
        sheetOf(e),
        e.dxfTypeName,
        e.layer,
        [b.min.x, b.min.y, b.max.x, b.max.y].map(Math.round).join(',')
      ].join('|')
    })
    .sort()
const concrete = (v: Values) =>
  Object.fromEntries(
    acTpBtklMo(v)
      .items.filter(i => i.nhom === 'be_tong')
      .map(i => [i.key, i.khoiLuong])
  )
const notBuilt = (db: AcDbDatabase) =>
  all(db)
    .filter(e => e instanceof AcDbText)
    .map(e => (e as AcDbText).textString)
    .filter(t => /CHƯA DỰNG ĐƯỢC|CHƯA TÍNH ĐƯỢC/.test(t))

/** L1–L4 dossier: 8 m road, tThan 1,2 m, lCanh 4 m, D1000, lCoc 25 m. */
const L1: Values = {
  tenMo: 'QA-TEST-MO-A1',
  bMatDuong: 8000,
  tThan: 1200,
  lCanh: 4000,
  D: 1000,
  lCoc: 25000
}

async function dossier() {
  const db = new AcDbDatabase()
  db.createDefaultData()
  expect((await runDossierTool('tao_ho_so_mo', { thong_so: L1 }, db)).ok).toBe(
    true
  )
  return db
}
const edit = (db: AcDbDatabase, thong_so: Values) =>
  runDossierTool(
    'sua_ho_so_mo',
    { ma_lan_chay: listRuns(db)[0].id, thong_so },
    db
  )
const diffs = (a: number[], b: number[]) =>
  b.map((x, i) => Math.round((x - a[i]) * 1000) / 1000)

jest.setTimeout(900000)

/** The elevations the tools report (data.caoDo). */
type Said = {
  dayBe: number
  dinhBe: number
  keGoiTim: number
  keGoiTrai: number
  keGoiPhai: number
  bang: Record<string, number>
}

describe('raise the seat by 0,3 m — both ways, applied everywhere', () => {
  test('(b) keep the footing, lengthen the stem: hThan + 300', async () => {
    const db = await dossier()
    const v0 = { ...listRuns(db)[0].values } as Values
    const before = table(db)
    const tagsBefore = tags(db)
    const res = await edit(db, { hThan: Number(v0.hThan) + 300 })
    expect(res.ok).toBe(true)
    const v1 = { ...listRuns(db)[0].values } as Values
    const after = table(db)
    const d = diffs(before, after)
    numbers.b = { before, after, diffs: d, caoDo: (res.data as Values).caoDo }
    expect(before).toHaveLength(11)
    expect(after).toHaveLength(11)
    // Footing bottom and top stay; the seat and all above rise by exactly
    // 0,300 — the whole cross-falling seat strip moves as one (P1/M5; at
    // M4 its low side came out +0,295 / +0,299).
    expect(d).toEqual([0.3, 0.3, 0, 0, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3])
    // FG, FE (road / finished level) rise with the seat under (b): the road
    // sits on what the bearings carry (QA M5b S2, confirmed P1/0.3.1).
    const said0 = (
      (
        await runDossierTool(
          'kiem_tra_ho_so',
          { ma_lan_chay: listRuns(db)[0].id },
          db
        )
      ).data as { caoDo: { bang: Record<string, number> } }
    ).caoDo.bang
    expect(said0.FG - 237.491).toBeCloseTo(0.3, 6)
    expect(said0.FE - 237.441).toBeCloseTo(0.3, 6)
    expect(said0.EL3).toBe(235.854)
    expect(after).toContain(Number(v0.caoDoDayBe))
    expect(after).toContain(
      Math.round((Number(v0.caoDoDayBe) + Number(v0.hBe) / 1000) * 1000) / 1000
    )
    expect(notBuilt(db)).toEqual([])
    // The elevation tags on the drawing follow the same table.
    expect(tags(db)).not.toEqual(tagsBefore)
    // Take-off: the stem grows by bThan × tThan × 0,3; the footing does not.
    const c0 = concrete(v0)
    const c1 = concrete(v1)
    expect(c1.be).toBeCloseTo(c0.be!, 9)
    expect(c1.than! - c0.than!).toBeCloseTo((8.7 * 1.2 * 0.3) as number, 3)
    expect(c1.be_tong!).toBeGreaterThan(c0.be_tong!)
    // What the tool reports is what the table shows (one source).
    const said = (res.data as { caoDo: Said }).caoDo
    expect(said.dayBe).toBe(Number(v0.caoDoDayBe))
    expect(Object.values(said.bang).sort()).toEqual([...after].sort())
    numbers.bSaid = said
    // Views: the stem dimension measures the new height, the footing's not.
    expect(DOSSIER_DIM_SYMBOLS.H1A.giaTri(v1)).toBe(Number(v0.hThan) + 300)
    expect(DOSSIER_DIM_SYMBOLS.HB.giaTri(v1)).toBe(Number(v0.hBe))
  })

  test('(a) raise the whole abutment: caoDoDayBe + 0,3', async () => {
    const db = await dossier()
    const v0 = { ...listRuns(db)[0].values } as Values
    const before = table(db)
    const shapesBefore = shapes(db)
    const tagsBefore = tags(db)
    const res = await edit(db, {
      caoDoDayBe: Math.round((Number(v0.caoDoDayBe) + 0.3) * 1000) / 1000
    })
    expect(res.ok).toBe(true)
    const v1 = { ...listRuns(db)[0].values } as Values
    const after = table(db)
    numbers.a = { before, after, diffs: diffs(before, after) }
    // Every elevation, footing included, rises by exactly 0,300.
    expect(diffs(before, after)).toEqual(Array(11).fill(0.3))
    expect(tags(db)).not.toEqual(tagsBefore)
    // The geometry does not change: same shapes, same concrete.
    expect(shapes(db)).toEqual(shapesBefore)
    expect(v1.hThan).toBe(v0.hThan)
    expect(v1.hBe).toBe(v0.hBe)
    expect(concrete(v1)).toEqual(concrete(v0))
    expect(notBuilt(db)).toEqual([])
  })

  test('regression: tCanh 600 refuses; the 8 m road with 6 bearings builds', async () => {
    const db = new AcDbDatabase()
    db.createDefaultData()
    const refused = await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { tenMo: 'QA-M4-X1', tCanh: 600 } },
      db
    )
    expect(refused.ok).toBe(false)
    expect(refused.message).toContain('dày tường cánh = 500 mm')
    const road = await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { ...L1, soGoi: 6 } },
      db
    )
    expect(road.ok).toBe(true)
    expect(road.message).toContain('6 vị trí gối cách nhau 1400 mm')
  })
})

describe('the words and the question reach the agent', () => {
  const skill = readFileSync(
    join(__dirname, '../../../assets/skills/mo-cau/SKILL.md'),
    'utf8'
  )
  const descriptions = ['tao_ho_so_mo', 'sua_ho_so_mo'].map(
    name => DOSSIER_TOOLS.find(t => t.name === name)!.description
  )
  test.each([
    ['skill mo-cau', skill],
    ['tao_ho_so_mo', descriptions[0]],
    ['sua_ho_so_mo', descriptions[1]]
  ])('%s', (_name, text) => {
    for (const word of [
      'xà mũ mố',
      'bệ kê gối',
      'đỉnh thân',
      'đỉnh mố',
      'đỉnh tường đỉnh',
      'seat = caoDoDayBe + hBe + hThan',
      'seat + hDau',
      'nâng cả mố',
      'caoDoDayBe += Δ',
      'kéo dài thân',
      'hThan += Δ',
      'không tự chọn'
    ])
      expect(text).toContain(word)
    // The pier keeps its own «xà mũ».
    expect(text).toMatch(/xà mũ.{0,10}(của )?trụ/)
  })
})

// QA P1/M4: after (b) the agent said 235,941 / 235,767 while the table read
// 235.931 / 235.772, and (a) gave 235.777 for the same seat. Now the tools
// quote the table, and both ways give the same seat.
describe('one source of elevations: the drawn table', () => {
  test('(a) and (b) give the same seat; the tools say the drawn numbers', async () => {
    const seats: Said[] = []
    for (const way of ['a', 'b']) {
      const db = await dossier()
      const v0 = { ...listRuns(db)[0].values } as Values
      const created = (
        await runDossierTool(
          'kiem_tra_ho_so',
          { ma_lan_chay: listRuns(db)[0].id },
          db
        )
      ).data as { caoDo: Said }
      // Before any raise (M4 measurements): 235.631 / 235.477 / 235.554.
      expect(created.caoDo).toMatchObject({
        keGoiTrai: 235.631,
        keGoiPhai: 235.477,
        keGoiTim: 235.554
      })
      const res = await edit(
        db,
        way === 'a'
          ? {
              caoDoDayBe:
                Math.round((Number(v0.caoDoDayBe) + 0.3) * 1000) / 1000
            }
          : { hThan: Number(v0.hThan) + 300 }
      )
      const said = (res.data as { caoDo: Said }).caoDo
      const drawn = table(db)
      for (const k of ['keGoiTrai', 'keGoiPhai', 'keGoiTim'] as const)
        expect(drawn).toContain(said[k])
      expect(tags(db).join('\n')).toContain(String(said.keGoiTim))
      seats.push(said)
    }
    numbers.seats = seats
    for (const k of ['keGoiTrai', 'keGoiPhai', 'keGoiTim'] as const)
      expect(seats[1][k]).toBe(seats[0][k])
    expect(seats[0]).toMatchObject({
      keGoiTrai: 235.931,
      keGoiPhai: 235.777,
      keGoiTim: 235.854
    })
  })
})
