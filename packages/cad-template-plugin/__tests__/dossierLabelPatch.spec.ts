/**
 * P1/M5 (plan P0–P1 section 2.7): changing the elevation datum (caoDoDayBe)
 * or the label mode (nhanKichThuoc) of a 0.3.0 dossier patches the drawing in
 * place — texts, dimension texts, elevation tag attributes — keeping every
 * handle, instead of erasing and redrawing the dossier. A hand-edited label
 * is never overwritten. Set QA_EVIDENCE_DIR to write the numbers.
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
    join(OUT, 'p1-m5-label-patch.json'),
    JSON.stringify(numbers, null, 1)
  )
})

type Values = Record<string, number | string>
const sheetOf = (e: AcDbEntity) =>
  String(readSemanticTag(e)?.params?.sheet ?? '?')
const ids = (db: AcDbDatabase) =>
  entitiesOfRun(db, 'r1')
    .map(e => e.objectId)
    .sort()
const table = (db: AcDbDatabase) =>
  entitiesOfRun(db, 'r1')
    .filter(
      (e): e is AcDbText => e instanceof AcDbText && sheetOf(e) === 'SUB-020'
    )
    .map(e => Number(e.textString.replace(',', '.')))
    .filter(n => Number.isFinite(n) && n > 200 && n < 300)
const tags = (db: AcDbDatabase) =>
  entitiesOfRun(db, 'r1')
    .filter(
      (e): e is AcDbBlockReference =>
        e instanceof AcDbBlockReference && e.blockName === 'cd11'
    )
    .flatMap(e => [...e.attributeIterator()].map(a => a.textString))
const dims = (db: AcDbDatabase) =>
  entitiesOfRun(db, 'r1').filter(
    (e): e is AcDbAlignedDimension => e instanceof AcDbAlignedDimension
  )
/** The text drawn inside a dimension's block. */
const shown = (db: AcDbDatabase, d: AcDbAlignedDimension) =>
  [...db.tables.blockTable.getAt(d.dimBlockId!)!.newIterator()]
    .filter((e): e is AcDbMText => e instanceof AcDbMText)
    .map(e => e.contents)
const shapes = (db: AcDbDatabase) =>
  entitiesOfRun(db, 'r1')
    .filter(e => !(e instanceof AcDbText))
    .map(e => {
      const b = e.geometricExtents
      return [e.objectId, e.dxfTypeName, e.layer]
        .concat(
          [b.min.x, b.min.y, b.max.x, b.max.y].map(v => String(Math.round(v)))
        )
        .join('|')
    })
    .sort()

const L1: Values = {
  tenMo: 'QA-TEST-MO-A1',
  bMatDuong: 8000,
  tThan: 1200,
  lCanh: 4000,
  D: 1000,
  lCoc: 25000
}

async function dossier(thong_so: Values) {
  const db = new AcDbDatabase()
  db.createDefaultData()
  expect((await runDossierTool('tao_ho_so_mo', { thong_so }, db)).ok).toBe(true)
  return db
}
const edit = (db: AcDbDatabase, thong_so: Values) =>
  runDossierTool('sua_ho_so_mo', { ma_lan_chay: 'r1', thong_so }, db)

jest.setTimeout(900000)

describe('caoDoDayBe is patched in place', () => {
  test.each([
    ['8 m road (L1)', L1],
    ['source geometry', { tenMo: 'QA-M5-S' }]
  ])('%s: same handles, every elevation +0,300', async (name, thong_so) => {
    const db = await dossier(thong_so)
    const v0 = listRuns(db)[0].values
    const before = { ids: ids(db), table: table(db), tags: tags(db) }
    const shapesBefore = shapes(db)
    const res = await edit(db, {
      caoDoDayBe: Math.round((Number(v0.caoDoDayBe) + 0.3) * 1000) / 1000
    })
    expect(res.ok).toBe(true)
    expect((res.data as { soDoiTuongXoa: number }).soDoiTuongXoa).toBe(0)
    const after = { ids: ids(db), table: table(db), tags: tags(db) }
    numbers[name] = {
      before: before.table,
      after: after.table,
      tags: after.tags
    }
    expect(after.ids).toEqual(before.ids)
    expect(shapes(db)).toEqual(shapesBefore)
    expect(after.table).toHaveLength(11)
    after.table.forEach((x, i) =>
      expect(x - before.table[i]).toBeCloseTo(0.3, 6)
    )
    expect(after.tags).not.toEqual(before.tags)
    expect(listRuns(db)[0].values.caoDoDayBe).toBeCloseTo(
      Number(v0.caoDoDayBe) + 0.3,
      9
    )
    // Undo takes the patch back, still with the same handles.
    expect(db.transactionManager.undo()).toBe(true)
    expect(ids(db)).toEqual(before.ids)
    expect(table(db)).toEqual(before.table)
    expect(tags(db)).toEqual(before.tags)
  })
})

describe('nhanKichThuoc is patched in place', () => {
  test('ca_hai → ky_hieu → so_do: dimension texts and tags, same handles', async () => {
    const db = await dossier(L1)
    const before = ids(db)
    // A dimension's extents follow its text; everything else must not move.
    const solid = () => shapes(db).filter(k => !k.includes('|DIMENSION|'))
    const shapesBefore = solid()
    const bMo = () =>
      dims(db).find(d => d.dimensionText?.startsWith('B Mố = 87') ?? false)
    const target = bMo()!
    expect(target.dimensionText).toBe('B Mố = 8700')
    expect(shown(db, target)).toEqual(['B Mố = 8700'])
    expect(tags(db)).toContain('EL3 = 235.554')

    expect((await edit(db, { nhanKichThuoc: 'ky_hieu' })).ok).toBe(true)
    expect(ids(db)).toEqual(before)
    expect(solid()).toEqual(shapesBefore)
    expect(target.dimensionText).toBe('B Mố')
    expect(shown(db, target)).toEqual(['B Mố'])
    expect(tags(db)).toContain('EL3')
    expect(tags(db)).not.toContain('EL3 = 235.554')

    expect((await edit(db, { nhanKichThuoc: 'so_do' })).ok).toBe(true)
    expect(ids(db)).toEqual(before)
    expect(target.dimensionText).toBe('8700')
    expect(shown(db, target)).toEqual(['8700'])
    expect(tags(db)).toContain('235.554')
    numbers.labelModes = { dim: target.dimensionText, tags: tags(db) }
  })
})

describe('a hand-edited label is never overwritten', () => {
  const tableText = (db: AcDbDatabase) =>
    entitiesOfRun(db, 'r1').find(
      (e): e is AcDbText =>
        e instanceof AcDbText &&
        sheetOf(e) === 'SUB-020' &&
        (e.textString === '228.837' || e.textString === '228.900')
    )!
  const firstTag = (db: AcDbDatabase) =>
    [
      ...entitiesOfRun(db, 'r1')
        .find(
          (e): e is AcDbBlockReference =>
            e instanceof AcDbBlockReference && e.blockName === 'cd11'
        )!
        .attributeIterator()
    ][0]
  const bMo = (db: AcDbDatabase) =>
    dims(db).find(d => d.dimensionText?.startsWith('B Mố = 8') ?? false)!
  // [what the engineer edited, read it back, changes that would overwrite
  // it (refused), changes that do not touch it (go ahead, keep it)].
  const datum = (db: AcDbDatabase) => ({
    caoDoDayBe: Number(listRuns(db)[0].values.caoDoDayBe) + 0.3
  })
  const mode = () => ({ nhanKichThuoc: 'ky_hieu' })
  test.each([
    [
      'an elevation in the SUB-020 table',
      (db: AcDbDatabase) => (tableText(db).textString = '228.900'),
      (db: AcDbDatabase) => tableText(db).textString,
      [datum],
      [mode]
    ],
    [
      'an elevation tag',
      (db: AcDbDatabase) => (firstTag(db).textString = 'EL? = 999'),
      (db: AcDbDatabase) => firstTag(db).textString,
      [datum, mode],
      []
    ],
    [
      'a dimension text',
      (db: AcDbDatabase) => (bMo(db).dimensionText = 'B Mố = 8800'),
      (db: AcDbDatabase) => bMo(db)?.dimensionText ?? '',
      [mode],
      [datum]
    ]
  ] as [
    string,
    (db: AcDbDatabase) => void,
    (db: AcDbDatabase) => string,
    ((db: AcDbDatabase) => Values)[],
    ((db: AcDbDatabase) => Values)[]
  ][])('%s', async (_name, handEdit, read, refused, harmless) => {
    const db = await dossier(L1)
    handEdit(db)
    const edited = read(db)
    for (const change of refused) {
      const before = { ids: ids(db), table: table(db), tags: tags(db) }
      const v0 = { ...listRuns(db)[0].values }
      const res = await edit(db, change(db))
      expect(res.ok).toBe(false)
      expect(res.message).toMatch(/sửa tay/)
      expect(ids(db)).toEqual(before.ids)
      expect(table(db)).toEqual(before.table)
      expect(tags(db)).toEqual(before.tags)
      expect(listRuns(db)[0].values).toEqual(v0)
      expect(read(db)).toBe(edited)
    }
    for (const change of harmless) {
      const before = ids(db)
      expect((await edit(db, change(db))).ok).toBe(true)
      expect(ids(db)).toEqual(before)
      expect(read(db)).toBe(edited)
    }
  })
})

describe('a wording change mixed with geometry still regenerates', () => {
  test('caoDoDayBe with hThan: rebuilt through the grid, as before', async () => {
    const db = await dossier(L1)
    const before = ids(db)
    const v0 = listRuns(db)[0].values
    const res = await edit(db, {
      caoDoDayBe: Number(v0.caoDoDayBe) + 0.3,
      hThan: Number(v0.hThan) + 300
    })
    expect(res.ok).toBe(true)
    expect(ids(db)).not.toEqual(before)
  })
})
