/**
 * The dossier's title block (0.2.0) and the runs made before it (0.1.0).
 *
 * A saved 0.1.0 dossier keeps its original border on every path that
 * regenerates or edits it; a new dossier gets the office title block; and
 * filling in the title block never touches the drawing itself.
 */
jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import {
  ACTP_FRAME_LAYOUTS,
  acTpBuildDrawingFrame,
  readSemanticTag
} from '@mlightcad/cad-template-sdk'
import { AcDbDatabase, AcDbEntity, AcDbText } from '@mlightcad/data-model'

import {
  buildDossierModel,
  DOSSIER_VERSION,
  dossierDefaults
} from '../src/dossier/model'
import { buildDossierScene } from '../src/dossier/scene'
import { runDossierTool } from '../src/dossier/tools'
import { entitiesOfRun, listRuns } from '../src/runIdentity'
import { runTemplate } from '../src/runTemplate'
import { findTemplateVersion } from '../src/templateRegistry'

const database = () => {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}
const roleOf = (e: AcDbEntity) => readSemanticTag(e)?.role ?? ''
const FRAME = new Set(['khung_ban_ve', 'khung_ten'])
const textsOf = (db: AcDbDatabase, runId: string, frame: boolean) =>
  entitiesOfRun(db, runId)
    .filter(e => e instanceof AcDbText && FRAME.has(roleOf(e)) === frame)
    .map(e => (e as AcDbText).textString)

describe('scene 0.2.0', () => {
  const scene = buildDossierScene(buildDossierModel(dossierDefaults()))

  test('a new dossier is 0.2.0 and every sheet carries the title block', () => {
    expect(DOSSIER_VERSION).toBe('0.2.0')
    expect(scene.version).toBe('0.2.0')
    for (const [i, s] of scene.sheets.entries()) {
      const texts = s.primitives.flatMap(p =>
        p.kind === 'text' && p.role === 'khung_ten' ? [p.text] : []
      )
      expect(texts).toEqual(
        expect.arrayContaining([
          `M1-${s.id}`,
          `${i + 1}/${scene.sheets.length}`,
          `1:${s.scale}`,
          'TKBVTC',
          'BẢN NHÁP — CHƯA PHÁT HÀNH THI CÔNG'
        ])
      )
      // The old border is gone from new dossiers.
      expect(
        s.primitives.some(p => p.role === 'tieu_de_ban_ve' && p.kind === 'path')
      ).toBe(false)
    }
  })

  test("no sheet's drawing reaches into the border or the title block", () => {
    for (const s of scene.sheets) {
      const area = acTpBuildDrawingFrame({ khoGiay: 'A1', truong: {} }).drawArea
      const k = s.scale
      const box = {
        x0: area.x * k,
        y0: area.y * k,
        x1: (area.x + area.w) * k,
        y1: (area.y + area.h) * k
      }
      for (const p of s.primitives) {
        if (FRAME.has(p.role)) continue
        const points =
          p.kind === 'path'
            ? p.points
            : p.kind === 'fill'
              ? p.loops.flat()
              : p.kind === 'circle'
                ? [
                    [p.at[0] - p.radius, p.at[1] - p.radius],
                    [p.at[0] + p.radius, p.at[1] + p.radius]
                  ]
                : p.kind === 'dimension'
                  ? [p.start, p.end]
                  : p.kind === 'leader'
                    ? p.points
                    : [p.at]
        for (const [x, y] of points) {
          expect({
            sheet: s.id,
            x,
            y,
            inside: x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1
          }).toMatchObject({ inside: true })
        }
      }
    }
  })

  test('A1 at the sheet scale: the frame is the sheet', () => {
    for (const s of scene.sheets) {
      const outer = s.primitives.find(
        p => p.role === 'khung_ban_ve' && p.kind === 'path'
      )
      expect(outer?.kind === 'path' && outer.points[2]).toEqual([
        ACTP_FRAME_LAYOUTS.A1.width * s.scale,
        ACTP_FRAME_LAYOUTS.A1.height * s.scale
      ])
      expect(s.width).toBeCloseTo(ACTP_FRAME_LAYOUTS.A1.width * s.scale)
    }
  })

  test('title-block fields reach the frame and never switch off the source drawing', () => {
    const filled = buildDossierScene(
      buildDossierModel({
        nguoiThietKe: 'Trần Thị Ngọc Ánh',
        duAn: 'Tuyến nối QL1A',
        ngay: '14/11/2026'
      })
    )
    expect(filled.detailMode).toBe(scene.detailMode)
    expect(filled.model.referenceSteelApplicable).toBe(
      scene.model.referenceSteelApplicable
    )
    const texts = filled.sheets[0].primitives.flatMap(p =>
      p.kind === 'text' ? [p.text] : []
    )
    expect(texts).toEqual(
      expect.arrayContaining([
        'Trần Thị Ngọc Ánh',
        'Tuyến nối QL1A',
        '14/11/2026'
      ])
    )
    // Not listed as design parameters on BC02.
    expect(texts.some(t => t.startsWith('nguoiThietKe'))).toBe(false)
  })

  test('an unknown generator version is refused, not guessed', () => {
    expect(() =>
      buildDossierScene(buildDossierModel(dossierDefaults()), '9.9.9')
    ).toThrow(/9\.9\.9/)
  })
})

describe('a dossier saved with 0.1.0', () => {
  async function legacyRun() {
    const db = database()
    const template = findTemplateVersion('ho_so_mo_m1', '0.1.0')!
    const result = await runTemplate(
      template,
      { ...dossierDefaults(), thep: 'khong' },
      db
    )
    expect(result.errors).toEqual([])
    return db
  }

  test('keeps its version and its original border', async () => {
    const db = await legacyRun()
    expect(listRuns(db)[0].version).toBe('0.1.0')
    expect(entitiesOfRun(db, 'r1').some(e => FRAME.has(roleOf(e)))).toBe(false)
    expect(
      entitiesOfRun(db, 'r1').some(
        e => e instanceof AcDbText && e.textString.includes('| 0.1.0 |')
      )
    ).toBe(true)
  })

  test('a label edit patches it with the 0.1.0 generator, every handle kept', async () => {
    const db = await legacyRun()
    const ids = entitiesOfRun(db, 'r1').map(e => e.objectId)
    const result = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: 'r1', thong_so: { congTrinh: 'Cầu Km1+200' } },
      db
    )
    expect(result.ok).toBe(true)
    expect(entitiesOfRun(db, 'r1').map(e => e.objectId)).toEqual(ids)
    expect(textsOf(db, 'r1', false)).toContain('Cầu Km1+200')
    expect(listRuns(db)[0].version).toBe('0.1.0')
  })

  test('title-block fields are refused: there is no title block to write to', async () => {
    const db = await legacyRun()
    const result = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: 'r1', thong_so: { nguoiThietKe: 'Trần Thị Ngọc Ánh' } },
      db
    )
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/0\.1\.0.*khung tên/)
  })
})

describe('editing the title block of a 0.2.0 dossier', () => {
  async function run() {
    const db = database()
    const created = await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { thep: 'khong' } },
      db
    )
    expect(created.ok).toBe(true)
    return db
  }

  test('filling a blank cell redraws only the frame; the drawing keeps its handles', async () => {
    const db = await run()
    const drawingIds = entitiesOfRun(db, 'r1')
      .filter(e => !FRAME.has(roleOf(e)))
      .map(e => e.objectId)
    const result = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: 'r1', thong_so: { nguoiThietKe: 'Trần Thị Ngọc Ánh' } },
      db
    )
    expect(result.ok).toBe(true)
    expect(
      entitiesOfRun(db, 'r1')
        .filter(e => !FRAME.has(roleOf(e)))
        .map(e => e.objectId)
    ).toEqual(drawingIds)
    expect(
      textsOf(db, 'r1', true).filter(t => t === 'Trần Thị Ngọc Ánh')
    ).toHaveLength(6)
    expect(listRuns(db)[0].values.nguoiThietKe).toBe('Trần Thị Ngọc Ánh')
  })

  test('a title block edited by hand is not overwritten', async () => {
    const db = await run()
    const cell = entitiesOfRun(db, 'r1').find(
      e => e instanceof AcDbText && e.textString === 'TKBVTC'
    ) as AcDbText
    cell.textString = 'TKKT (sửa tay)'
    const result = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: 'r1', thong_so: { duAn: 'Tuyến nối QL1A' } },
      db
    )
    expect(result.ok).toBe(false)
    expect(result.message).toContain('sửa tay')
    expect(cell.textString).toBe('TKKT (sửa tay)')
  })
})
