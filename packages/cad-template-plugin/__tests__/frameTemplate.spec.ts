/**
 * `khung_ban_ve`: the drawing border and title block as a bundled template,
 * run the way the dialog and `chay_template` run it.
 */
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  acapRunGroupedEdit: async (
    _db: unknown,
    _label: string,
    fn: () => void | Promise<void>
  ) => {
    await fn()
  }
}))

import {
  readSemanticTag,
  validateParamValues
} from '@mlightcad/cad-template-sdk'
import { AcDbDatabase, AcDbText } from '@mlightcad/data-model'

import {
  drawingFrameTemplate,
  FRAME_TEMPLATE_ID,
  frameFieldsFromValues
} from '../src/frame/template'
import { defaultValues, runTemplate } from '../src/runTemplate'
import { renderTemplatePreview } from '../src/templatePreview'
import { findTemplate } from '../src/templateRegistry'
import { runTemplateTool } from '../src/templateTools'

function newDatabase() {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}
const entities = (db: AcDbDatabase) => [
  ...db.tables.blockTable.modelSpace.newIterator()
]
function extents(db: AcDbDatabase) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const e of entities(db)) {
    const b = e.geometricExtents
    x0 = Math.min(x0, b.min.x)
    y0 = Math.min(y0, b.min.y)
    x1 = Math.max(x1, b.max.x)
    y1 = Math.max(y1, b.max.y)
  }
  return [x0, y0, x1, y1]
}

describe('khung_ban_ve', () => {
  test('bundled, declares what the contract requires, and no standard', () => {
    expect(findTemplate(FRAME_TEMPLATE_ID)).toBe(drawingFrameTemplate)
    expect(drawingFrameTemplate.meta.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(drawingFrameTemplate.placement).toBe('world')
    expect(
      validateParamValues(
        drawingFrameTemplate.params,
        defaultValues(drawingFrameTemplate)
      )
    ).toEqual([])
    const hints = drawingFrameTemplate.params.map(p => p.hint ?? '').join(' ')
    expect(hints).not.toMatch(/TCVN|QCVN|ISO/)
  })

  test('A3 at 1:100 is 42 000 × 29 700 on the _33_ frame layers', async () => {
    const db = newDatabase()
    const result = await runTemplate(
      drawingFrameTemplate,
      { ...defaultValues(drawingFrameTemplate), x: 1000, y: 2000 },
      db
    )
    expect(result.errors).toEqual([])
    expect(result.layers.sort()).toEqual(['_33_Khungbanve', '_33_Khungten'])
    const [x0, y0, x1, y1] = extents(db)
    expect(x0).toBeCloseTo(1000)
    expect(y0).toBeCloseTo(2000)
    expect(x1).toBeCloseTo(1000 + 42000)
    expect(y1).toBeCloseTo(2000 + 29700)
    expect(entities(db).every(e => readSemanticTag(e))).toBe(true)
  })

  test('A1 at 1:50, with the fields filled in Vietnamese', async () => {
    const db = newDatabase()
    await runTemplate(
      drawingFrameTemplate,
      {
        ...defaultValues(drawingFrameTemplate),
        khoGiay: 'A1',
        tiLe: 50,
        tenBanVe: 'Bố trí chung trụ T1',
        thietKe: 'Trần Thị Ngọc Ánh'
      },
      db
    )
    const [x0, y0, x1, y1] = extents(db)
    expect([x1 - x0, y1 - y0].map(v => Math.round(v))).toEqual([42050, 29700])
    const texts = entities(db)
      .filter((e): e is AcDbText => e instanceof AcDbText)
      .map(e => e.textString)
    expect(texts).toEqual(
      expect.arrayContaining([
        'Bố trí chung trụ T1',
        'Trần Thị Ngọc Ánh',
        '1:50',
        'TKBVTC'
      ])
    )
    const named = entities(db).find(
      e => e instanceof AcDbText && e.textString === 'Trần Thị Ngọc Ánh'
    )!
    expect(readSemanticTag(named)?.params).toMatchObject({ truong: 'thietKe' })
  })

  test('blank fields are left out', () => {
    expect(frameFieldsFromValues({ duAn: '  ', ngay: '14/11/2026' })).toEqual({
      ngay: '14/11/2026'
    })
  })

  test('the agent runs it with chay_template', async () => {
    const db = newDatabase()
    const outcome = await runTemplateTool(
      'chay_template',
      {
        ma_template: 'khung_ban_ve',
        thong_so: { khoGiay: 'A3', tenBanVe: 'Mặt chính mố M1' }
      },
      db
    )
    expect(outcome.ok).toBe(true)
    expect(outcome.message).toContain('khung_ban_ve')
  })

  test('the dialog can preview it', () => {
    expect(renderTemplatePreview(drawingFrameTemplate)).not.toHaveProperty(
      'reason'
    )
  })
})
