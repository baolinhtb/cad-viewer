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
  AcDbMText,
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
