/**
 * SUB-010 front elevation, the seat strip (UI acceptance P1/M4): the
 * elevation tags EL3 / EL4.L / EL4.R sat on the bearings and stops once they
 * carried their value ("EL3 = 235.554"), and the front had no bearing labels
 * G1…Gn. Checked on the drawn entities, with the data model's own extents
 * (one text height a character — wider than the viewer draws).
 * Set QA_EVIDENCE_DIR to write the numbers.
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
  AcDbLine,
  AcDbMText,
  AcDbPolyline,
  AcDbText
} from '@mlightcad/data-model'

import { runDossierTool } from '../src/dossier/tools'
import { entitiesOfRun, listRuns } from '../src/runIdentity'

const OUT = process.env.QA_EVIDENCE_DIR
const numbers: Record<string, unknown> = {}
afterAll(() => {
  if (!OUT) return
  mkdirSync(OUT, { recursive: true })
  writeFileSync(
    join(OUT, 'p1-m5-seat-labels.json'),
    JSON.stringify(numbers, null, 1)
  )
})

type Values = Record<string, number | string>
type Box = { x0: number; x1: number; y0: number; y1: number }
const tagOf = (e: AcDbEntity) => readSemanticTag(e)?.params ?? {}
const sheetOf = (e: AcDbEntity) => String(tagOf(e).sheet ?? '?')
const sourceOf = (e: AcDbEntity) =>
  String(tagOf(e).sourceHandle ?? '').split('#')[0]
const box = (e: AcDbEntity): Box => {
  const b = e.geometricExtents
  return { x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y }
}
const hit = (a: Box, b: Box) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
const mid = (b: Box) => (b.x0 + b.x1) / 2

/** Front elevation stops (box and two bars each), source handles. */
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
const FRONT_BEARING_POLY = new Set(['20E92EA', '20E92FC', '20E930E', '20E9320'])
/** The seat strip's tags: EL4.R, EL3, EL4.L (front elevation). */
const SEAT_TAGS = new Set(['20EF3C8', '20EF404', '20EF3FA'])

function seat(db: AcDbDatabase) {
  const all = entitiesOfRun(db, 'r1').filter(e => sheetOf(e) === 'SUB-010')
  const bearings = all.filter(
    e =>
      tagOf(e).sourceLayer === 'OUTLINE' || FRONT_BEARING_POLY.has(sourceOf(e))
  )
  const stops = all.filter(e => FRONT_STOP.has(sourceOf(e)))
  const tags = all
    .filter(
      (e): e is AcDbBlockReference =>
        e instanceof AcDbBlockReference && SEAT_TAGS.has(sourceOf(e))
    )
    .flatMap(e => [...e.attributeIterator()])
  const labels = all.filter(
    (e): e is AcDbText =>
      e instanceof AcDbText &&
      /^G\d+$/.test(e.textString) &&
      String(tagOf(e).sourceHandle ?? '').includes('#F')
  )
  const texts = all.filter(
    (e): e is AcDbText =>
      e instanceof AcDbText && !labels.includes(e as AcDbText)
  )
  const dimTexts = all
    .filter((e): e is AcDbAlignedDimension => e instanceof AcDbAlignedDimension)
    .flatMap(d =>
      [...db.tables.blockTable.getAt(d.dimBlockId!)!.newIterator()].filter(
        (m): m is AcDbMText => m instanceof AcDbMText
      )
    )
  // Bearings one by one: their entities grouped where they touch.
  const groups: Box[] = []
  for (const b of bearings.map(box).sort((p, q) => p.x0 - q.x0)) {
    const last = groups[groups.length - 1]
    if (last && b.x0 - last.x1 < 200) {
      last.x0 = Math.min(last.x0, b.x0)
      last.x1 = Math.max(last.x1, b.x1)
      last.y0 = Math.min(last.y0, b.y0)
      last.y1 = Math.max(last.y1, b.y1)
    } else groups.push({ ...b })
  }
  return { bearings, groups, stops, tags, labels, texts, dimTexts }
}

async function dossier(thong_so: Values) {
  const db = new AcDbDatabase()
  db.createDefaultData()
  expect((await runDossierTool('tao_ho_so_mo', { thong_so }, db)).ok).toBe(true)
  return db
}
const edit = (db: AcDbDatabase, thong_so: Values) =>
  runDossierTool('sua_ho_so_mo', { ma_lan_chay: 'r1', thong_so }, db)

const ROAD_8M: Values = {
  tenMo: 'QA-M4-A1',
  bMatDuong: 8000,
  tThan: 1200,
  lCanh: 4000,
  D: 1000,
  lCoc: 25000
}

jest.setTimeout(900000)

describe('the seat strip reads clear', () => {
  test.each([
    ['source, 4 bearings', { tenMo: 'QA-M5-S' }, undefined],
    ['8 m road, 4 bearings', ROAD_8M, undefined],
    ['8 m road, 6 bearings', ROAD_8M, { soGoi: 6 }],
    ['7 m road, 6 bearings', { tenMo: 'QA-M5-B' }, { soGoi: 6 }],
    ['8 m road, (b) hThan + 300', ROAD_8M, 'b'],
    ['8 m road, (a) caoDoDayBe + 0,3', ROAD_8M, 'a']
  ] as [string, Values, Values | 'a' | 'b' | undefined][])(
    '%s',
    async (name, made, change) => {
      const db = await dossier(made)
      const v0 = listRuns(db)[0].values
      if (change) {
        const thong_so =
          change === 'b'
            ? { hThan: Number(v0.hThan) + 300 }
            : change === 'a'
              ? {
                  caoDoDayBe:
                    Math.round((Number(v0.caoDoDayBe) + 0.3) * 1000) / 1000
                }
              : change
        expect((await edit(db, thong_so)).ok).toBe(true)
      }
      const n = Number(listRuns(db)[0].values.soGoi)
      const s = seat(db)
      numbers[name] = {
        tags: s.tags.map(t => [t.textString, box(t)]),
        labels: s.labels.map(l => [l.textString, Math.round(mid(box(l)))]),
        bearings: s.groups.map(b => Math.round(mid(b)))
      }
      expect(s.groups).toHaveLength(n)
      expect(s.tags).toHaveLength(3)
      // Tags carry their value (the tool creates with numbers and symbols).
      for (const t of s.tags) expect(t.textString).toMatch(/^EL\S+ = \d/)
      // Nothing of the strip under a tag's text, nor another text.
      const parts = [...s.bearings, ...s.stops].map(box)
      for (const t of s.tags) {
        const b = box(t)
        expect(parts.filter(p => hit(b, p))).toEqual([])
        expect(s.labels.filter(l => hit(b, box(l)))).toEqual([])
        expect(
          s.dimTexts.filter(m => hit(b, box(m))).map(m => m.contents)
        ).toEqual([])
        expect(
          s.texts.filter(x => hit(b, box(x))).map(x => x.textString)
        ).toEqual([])
        for (const o of s.tags) if (o !== t) expect(hit(b, box(o))).toBe(false)
      }
      // Front labels G1…Gn, G1 on the right, centred above each bearing —
      // except on the source drawing itself, which has none there.
      if (name.startsWith('source')) {
        expect(s.labels).toEqual([])
        return
      }
      expect(s.labels.map(l => l.textString)).toEqual(
        expect.arrayContaining(Array.from({ length: n }, (_, i) => `G${i + 1}`))
      )
      expect(s.labels).toHaveLength(n)
      const byX = [...s.labels].sort((p, q) => mid(box(q)) - mid(box(p)))
      const xs = s.groups.map(mid).sort((p, q) => q - p)
      byX.forEach((l, i) => {
        expect(l.textString).toBe(`G${i + 1}`)
        expect(Math.abs(mid(box(l)) - xs[i])).toBeLessThan(30)
        expect(box(l).y0).toBeGreaterThan(s.groups[0].y0)
        expect(parts.filter(p => hit(box(l), p))).toEqual([])
        expect(s.dimTexts.filter(m => hit(box(l), box(m)))).toEqual([])
      })
    }
  )
})

describe('the source drawing keeps its tags where they were', () => {
  test('symbols only (ky_hieu): EL3 / EL4 at the source place', async () => {
    const db = await dossier({ tenMo: 'QA-M5-K', nhanKichThuoc: 'ky_hieu' })
    const s = seat(db)
    const at = Object.fromEntries(
      s.tags.map(t => [t.textString, [t.position.x, t.position.y]])
    )
    numbers.kyHieu = at
    // Source attribute places (local) moved by the sheet's own offset only:
    // the three keep their relative layout exactly.
    expect(at.EL3[1] - at['EL4.R'][1]).toBeCloseTo(20160.287 - 20095.497, 3)
    expect(at['EL4.L'][0] - at.EL3[0]).toBeCloseTo(12237.89 - 7704.112, 3)
  })
})

/**
 * QA 0.3.1b, V7: the live QA-031-A1, (b) hThan +300, then 6 bearings — the
 * tags EL4.R / EL3 had a dashed hidden edge (Hide_01) drawn through them.
 * Dashed and hidden lines are obstacles now; the tags keep the generator's
 * colour and layer, as a dossier made at once with the same values.
 */
describe('tags clear of dashed lines, styled as generated', () => {
  /** Every dashed or hidden segment of the front elevation sheet. */
  function dashed(db: AcDbDatabase): [number[], number[]][] {
    const out: [number[], number[]][] = []
    for (const e of entitiesOfRun(db, 'r1')) {
      if (sheetOf(e) !== 'SUB-010' || !/DASH|HIDDEN/i.test(e.lineType)) continue
      if (e instanceof AcDbLine)
        out.push([
          [e.startPoint.x, e.startPoint.y],
          [e.endPoint.x, e.endPoint.y]
        ])
      if (e instanceof AcDbPolyline)
        for (let i = 1; i < e.numberOfVertices; i++) {
          const a = e.getPoint2dAt(i - 1)
          const b = e.getPoint2dAt(i)
          out.push([
            [a.x, a.y],
            [b.x, b.y]
          ])
        }
    }
    return out
  }
  const cuts = (seg: [number[], number[]], r: Box) => {
    for (let k = 0; k <= 200; k++) {
      const t = k / 200
      const x = seg[0][0] + (seg[1][0] - seg[0][0]) * t
      const y = seg[0][1] + (seg[1][1] - seg[0][1]) * t
      if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) return true
    }
    return false
  }
  /** Tag attributes of the front elevation, by their tag name (EL3, FG…). */
  const front = (db: AcDbDatabase) =>
    new Map(
      entitiesOfRun(db, 'r1')
        .filter(
          (e): e is AcDbBlockReference =>
            e instanceof AcDbBlockReference &&
            e.blockName === 'cd11' &&
            sheetOf(e) === 'SUB-010'
        )
        .flatMap(e =>
          [...e.attributeIterator()].map(
            a => [a.textString.split(' ')[0], { ref: e, a }] as const
          )
        )
    )

  test('8 m road, (b) hThan +300, then 6 bearings, as the QA did', async () => {
    const db = await dossier({ ...ROAD_8M, tenMo: 'QA-031-A1' })
    const v0 = listRuns(db)[0].values
    expect((await edit(db, { hThan: Number(v0.hThan) + 300 })).ok).toBe(true)
    expect((await edit(db, { soGoi: 6 })).ok).toBe(true)
    const v = listRuns(db)[0].values
    expect(v).toMatchObject({ hThan: 5017, soGoi: 6, aGoi: 1400 })

    const lines = dashed(db)
    expect(lines.length).toBeGreaterThan(10)
    const tags = front(db)
    for (const name of ['EL3', 'EL4.R', 'EL4.L', 'FG', 'FE']) {
      const { a } = tags.get(name)!
      const b = box(a)
      expect([name, lines.filter(seg => cuts(seg, b)).length]).toEqual([
        name,
        0
      ])
    }
    // The numbers after (b), unchanged by the bearings.
    const shown = [...tags.values()].map(t => t.a.textString)
    for (const want of [
      'EL3 = 235.854',
      'EL4.L = 235.931',
      'EL4.R = 235.777',
      'FG = 237.791',
      'FE = 237.741',
      'EL6 = 228.837'
    ])
      expect(shown).toContain(want)
    // As a dossier made at once with the same values: colour, layer, place.
    const fresh = await dossier({
      ...ROAD_8M,
      tenMo: 'QA-031-A1',
      hThan: 5017,
      soGoi: 6
    })
    const again = front(fresh)
    for (const name of ['EL3', 'EL4.R', 'EL4.L', 'FG', 'FE']) {
      const x = tags.get(name)!
      const y = again.get(name)!
      expect([
        name,
        x.a.color.colorIndex,
        x.a.layer,
        x.ref.color.colorIndex,
        x.ref.layer,
        x.a.textString,
        Math.round(x.a.position.x),
        Math.round(x.a.position.y)
      ]).toEqual([
        name,
        y.a.color.colorIndex,
        y.a.layer,
        y.ref.color.colorIndex,
        y.ref.layer,
        y.a.textString,
        Math.round(y.a.position.x),
        Math.round(y.a.position.y)
      ])
    }
    // Bearings and stops as before: G1…G6, three stops.
    const s = seat(db)
    expect(s.groups).toHaveLength(6)
    expect(s.labels.map(l => l.textString).sort()).toEqual([
      'G1',
      'G2',
      'G3',
      'G4',
      'G5',
      'G6'
    ])
    expect(
      new Set(s.stops.map(e => String(tagOf(e).sourceHandle).split('#')[1]))
        .size
    ).toBe(3)
  })

  test('patched in place afterwards ((a) +0,3), the tags still match a fresh dossier', async () => {
    const db = await dossier({ ...ROAD_8M, tenMo: 'QA-031-A1' })
    const v0 = listRuns(db)[0].values
    await edit(db, { hThan: Number(v0.hThan) + 300 })
    await edit(db, { soGoi: 6 })
    const ids = entitiesOfRun(db, 'r1').map(e => e.objectId)
    const datum = Math.round((Number(v0.caoDoDayBe) + 0.3) * 1000) / 1000
    expect((await edit(db, { caoDoDayBe: datum })).ok).toBe(true)
    // In place: the same entities.
    expect(entitiesOfRun(db, 'r1').map(e => e.objectId)).toEqual(ids)
    const fresh = await dossier({
      ...ROAD_8M,
      tenMo: 'QA-031-A1',
      hThan: 5017,
      soGoi: 6,
      caoDoDayBe: datum
    })
    const tags = front(db)
    const again = front(fresh)
    const lines = dashed(db)
    for (const name of ['EL3', 'EL4.R', 'EL4.L', 'FG', 'FE', 'EL6']) {
      const x = tags.get(name)!
      const y = again.get(name)!
      const look = (t: typeof x) => [
        t.a.textString,
        t.a.color.colorIndex,
        t.a.layer,
        t.a.styleName,
        t.ref.color.colorIndex,
        t.ref.layer
      ]
      expect([name, ...look(x)]).toEqual([name, ...look(y)])
      expect([name, lines.filter(seg => cuts(seg, box(x.a))).length]).toEqual([
        name,
        0
      ])
    }
    expect(tags.get('EL6')!.a.textString).toBe('EL6 = 229.137')
  })
})
