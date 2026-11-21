/**
 * SUB-020 (UI acceptance P1/M4, QA-M4-A1): the two table titles still read
 * "… MỐ M1", and the name cell "MỐ QA-M4-A1" ran over the FG value next to
 * it ("…A1.791"). Checked on the drawn entities.
 */
jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import { readSemanticTag } from '@mlightcad/cad-template-sdk'
import {
  AcDbDatabase,
  AcDbEntity,
  AcDbLine,
  AcDbText
} from '@mlightcad/data-model'

import { runDossierTool } from '../src/dossier/tools'
import { entitiesOfRun } from '../src/runIdentity'

type Values = Record<string, number | string>
const sheetOf = (e: AcDbEntity) =>
  String(readSemanticTag(e)?.params?.sheet ?? '?')

async function dossier(thong_so: Values) {
  const db = new AcDbDatabase()
  db.createDefaultData()
  expect((await runDossierTool('tao_ho_so_mo', { thong_so }, db)).ok).toBe(true)
  return db
}
const sub020 = (db: AcDbDatabase) =>
  entitiesOfRun(db, 'r1').filter(e => sheetOf(e) === 'SUB-020')
const texts = (db: AcDbDatabase) =>
  sub020(db).filter((e): e is AcDbText => e instanceof AcDbText)

/**
 * Each name cell, with the text right of it on the same row and the first
 * vertical rule right of the name across its line.
 */
function nameCells(db: AcDbDatabase) {
  const all = texts(db)
  const rules = sub020(db).filter(
    (e): e is AcDbLine =>
      e instanceof AcDbLine && Math.abs(e.startPoint.x - e.endPoint.x) < 1
  )
  return all
    .filter(t => t.textString.startsWith('MỐ '))
    .map(name => {
      const b = name.geometricExtents
      const y = (b.min.y + b.max.y) / 2
      const rule = Math.min(
        ...rules
          .filter(
            r =>
              r.startPoint.x > b.min.x &&
              Math.min(r.startPoint.y, r.endPoint.y) <= y &&
              Math.max(r.startPoint.y, r.endPoint.y) >= y
          )
          .map(r => r.startPoint.x)
      )
      const right = all
        .filter(
          t =>
            t !== name &&
            Math.abs(t.position.y - name.position.y) < 1 &&
            t.position.x > name.position.x
        )
        .sort((p, q) => p.position.x - q.position.x)[0]
      return { name, box: b, rule, right }
    })
}

jest.setTimeout(600000)

describe('SUB-020 titles carry the dossier name', () => {
  test('QA-M4-A1: both titles, no lone "M1", spelt MỐ', async () => {
    const db = await dossier({
      tenMo: 'QA-M4-A1',
      bMatDuong: 8000,
      tThan: 1200,
      lCanh: 4000,
      D: 1000,
      lCoc: 25000
    })
    const shown = texts(db).map(t => t.textString)
    expect(shown).toContain('%%UBẢNG CAO ĐỘ MỐ QA-M4-A1')
    expect(shown).toContain('%%UBẢNG THÔNG SỐ KÍCH THƯỚC MỐ QA-M4-A1')
    expect(shown.filter(t => /(^|\s)M1(\s|$)/.test(t))).toEqual([])
    // "MÓ" (Ó, U+00D3) is not written anywhere on the sheet: every MỐ is
    // the precomposed Ố (U+1ED0).
    expect(shown.filter(t => t.includes('MÓ'))).toEqual([])
    expect(shown.every(t => t === t.normalize('NFC'))).toBe(true)
    expect(shown.filter(t => t.includes('MỐ')).length).toBeGreaterThanOrEqual(4)
  })
})

describe('the name cell stays inside its cell', () => {
  test.each(['M1', 'QA-M4-A1', 'MỐ TRÁI CẦU VƯỢT SÔNG HỒNG KM12+345,50'])(
    '%s',
    async tenMo => {
      const db = await dossier({ tenMo })
      const cells = nameCells(db)
      expect(cells).toHaveLength(2)
      for (const { name, box, rule, right } of cells) {
        expect(name.textString).toBe(`MỐ ${tenMo.toLocaleUpperCase('vi')}`)
        expect(box.max.x).toBeLessThanOrEqual(rule)
        expect(box.max.x).toBeLessThan(right.geometricExtents.min.x)
        // Still a readable text: never narrower than half width.
        expect(name.widthFactor).toBeGreaterThanOrEqual(0.5)
      }
    }
  )

  test('renaming in place narrows the name with it, same handles', async () => {
    const db = await dossier({ tenMo: 'M2' })
    const ids = entitiesOfRun(db, 'r1')
      .map(e => e.objectId)
      .sort()
    const res = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: 'r1', thong_so: { tenMo: 'QA-M4-A1-DAI-HON' } },
      db
    )
    expect(res.ok).toBe(true)
    expect(
      entitiesOfRun(db, 'r1')
        .map(e => e.objectId)
        .sort()
    ).toEqual(ids)
    for (const { name, box, rule, right } of nameCells(db)) {
      expect(name.textString).toBe('MỐ QA-M4-A1-DAI-HON')
      expect(name.widthFactor).toBeLessThan(1)
      expect(box.max.x).toBeLessThanOrEqual(rule)
      expect(box.max.x).toBeLessThan(right.geometricExtents.min.x)
    }
    expect(texts(db).map(t => t.textString)).toContain(
      '%%UBẢNG CAO ĐỘ MỐ QA-M4-A1-DAI-HON'
    )
  })
})
