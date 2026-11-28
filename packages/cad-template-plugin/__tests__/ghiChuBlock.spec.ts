/**
 * FIX-NOTE: generator warnings go into one GHI CHÚ block, in Vietnamese with
 * its marks, and the block covers nothing.
 *
 * User t54u, on «Mố cầu — mặt chính hoàn chỉnh (bản vẽ M1)»: «chữ đỏ đè lên
 * các thành phần khác» — the 6D note was printed at a fixed point under the
 * pile tips, across the 1000/7000/1000 dimension chain and the A/B/C section
 * marks, in ASCII ("trinh tu khoan coc…"). Overlap here is box against box, as
 * the data model sizes entities (`geometricExtents`): any shared area fails.
 */
jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import {
  acTpBoxesOverlap,
  acTpLayoutGhiChuBlock,
  acTpSegmentCrossesBox,
  acTpWrapGhiChu,
  createDrawContext,
  readSemanticTag,
  SEED_ROLE_LAYERS,
  validateParamValues
} from '@mlightcad/cad-template-sdk'
import {
  AcDbDatabase,
  AcDbEntity,
  AcDbLine,
  AcDbPolyline,
  AcDbText
} from '@mlightcad/data-model'

import { acapDeriveDossierValues } from '../src/dossier/derive'
import {
  buildDossierModel,
  DOSSIER_ID,
  DOSSIER_VERSION,
  dossierDefaults
} from '../src/dossier/model'
import { buildDossierScene, drawDossierScene } from '../src/dossier/scene'
import { acapDossierSheetNotes } from '../src/dossier/scene030'
import { runDossierTool } from '../src/dossier/tools'
import { entitiesOfRun, listRuns } from '../src/runIdentity'
import { ghiChuText } from './helpers/ghiChu'
import { loadLibraryTemplate } from './helpers/libraryTemplate'

type Box = { x0: number; y0: number; x1: number; y1: number }

function draw(file: string, overrides: Record<string, unknown> = {}) {
  const t = loadLibraryTemplate(file)
  const values: Record<string, unknown> = {}
  for (const p of t.params) values[p.key] = p.default
  Object.assign(values, overrides)
  expect(validateParamValues(t.params, values as never)).toEqual([])
  const db = new AcDbDatabase()
  db.createDefaultData()
  const ctx = createDrawContext(db, t.meta.id, SEED_ROLE_LAYERS)
  t.generate(ctx, values)
  return [...ctx.drawn] as AcDbEntity[]
}

const boxOf = (e: AcDbEntity): Box => {
  const b = e.geometricExtents
  return { x0: b.min.x, y0: b.min.y, x1: b.max.x, y1: b.max.y }
}
const inBlock = (e: AcDbEntity) =>
  e instanceof AcDbText && readSemanticTag(e)?.params?.khoi === 'GHI CHÚ'
const blockOf = (drawn: AcDbEntity[]) => drawn.filter(inBlock) as AcDbText[]

/** The block's notes, one per partId, without the heading or the numbering. */
function notesOf(drawn: AcDbEntity[]): string[] {
  const byPart = new Map<string, string[]>()
  for (const t of blockOf(drawn)) {
    if (t.textString === 'GHI CHÚ') continue
    const id = readSemanticTag(t)!.partId
    byPart.set(id, [...(byPart.get(id) ?? []), t.textString])
  }
  return [...byPart.values()].map(l => l.join(' ').replace(/^\d+\. /, ''))
}

/** Every (block text, other entity) pair whose boxes share an area. */
function overlaps(drawn: AcDbEntity[]) {
  const block = blockOf(drawn)
  const others = drawn.filter(e => !inBlock(e))
  const out: string[] = []
  for (const t of block)
    for (const o of others)
      if (acTpBoxesOverlap(boxOf(t), boxOf(o)))
        out.push(
          `${t.textString} × ${o.dxfTypeName} ${readSemanticTag(o)?.partId}`
        )
  return out
}

describe('SDK: wrapping and placing the block', () => {
  test('wraps at spaces to the width, never inside a %% escape', () => {
    const lines = acTpWrapGhiChu(
      'Cọc %%c1200 %%UMẶT CHÍNH 100%%% xyz',
      9 * 100,
      100
    )
    expect(lines.every(l => [...l].length <= 9)).toBe(true)
    expect(lines.join(' ')).toBe('Cọc %%c1200 %%UMẶT CHÍNH 100%%% xyz')
    const cut = acTpWrapGhiChu('%%UABCDEFGH%%c%%%', 4 * 100, 100)
    for (const l of cut) expect(l).not.toMatch(/(^|[^%])%$|^%[^%]/)
    expect(cut.join('')).toBe('%%UABCDEFGH%%c%%%')
  })

  test('never returns a place that overlaps; goes outside when boxed in', () => {
    // A wall of boxes round the preferred place: nothing free within reach.
    const obstacles: Box[] = []
    for (let i = -20; i <= 20; i++)
      for (let j = -20; j <= 20; j++)
        obstacles.push({
          x0: i * 500,
          y0: j * 500,
          x1: i * 500 + 450,
          y1: j * 500 + 450
        })
    const layout = acTpLayoutGhiChuBlock(
      ['một ghi chú khá dài để xuống dòng'],
      {
        obstacles,
        at: { x: 0, y: 0 },
        maxSteps: 5
      }
    )!
    expect(layout.outside).toBe(true)
    for (const o of obstacles)
      expect(acTpBoxesOverlap(layout.box, o)).toBe(false)
    expect(layout.box.y1).toBeLessThan(-20 * 500)
  })

  test('a frame round the sheet is a set of strokes, not a filled box', () => {
    const frame = [
      [0, 0],
      [42000, 0],
      [42000, 29700],
      [0, 29700],
      [0, 0]
    ].map(([x, y]) => ({ x, y }))
    const layout = acTpLayoutGhiChuBlock(['ghi chú'], {
      obstacles: [],
      segments: frame.slice(1).map((p, i) => [frame[i], p] as const),
      at: { x: 40000, y: 3000 },
      corner: 'bottom-right',
      bounds: { x0: 0, y0: 0, x1: 42000, y1: 29700 }
    })!
    expect(layout.outside).toBe(false)
    expect(layout.box.x1).toBeLessThanOrEqual(40000)
    expect(layout.box.y0).toBeGreaterThanOrEqual(3000)
  })
})

describe('mo_mat_chinh: the 6D note in the GHI CHÚ block (QA t54u)', () => {
  // Default M1: tim–tim = B − 2D = 7700 − 2400 = 5300. The QA sheet: 7000,
  // so B = 7000 + 2D = 9400 with D 1200; 6D is 7200 in both.
  test.each([
    ['M1 mặc định', {}, 5300],
    ['tim–tim 7000 (bản QA)', { bBe: 9400, aCoc: 7000 }, 7000]
  ] as [string, Record<string, unknown>, number][])(
    '%s: note in Vietnamese, clear of dims, section marks and shapes',
    (_name, overrides, khoang) => {
      const drawn = draw('mo_mat_chinh.js', overrides)
      // (a) the block, its heading, the 6D obligation with its marks.
      const block = blockOf(drawn)
      expect(block[0].textString).toBe('GHI CHÚ')
      expect(block.every(t => t.color.colorIndex === 1)).toBe(true)
      expect(notesOf(drawn)).toEqual([
        `Tim–tim ${khoang} mm < 6D (7200 mm): trình tự khoan cọc phải được nêu rõ trong hồ sơ thiết kế — TCVN 11823-10:2017 §8.1.2`
      ])
      // The bottom dimension chain (D / B − 2D / D, then B) and the section
      // marks are there to be avoided.
      const dims = drawn.filter(e => e.dxfTypeName === 'DIMENSION')
      expect(dims.filter(d => boxOf(d).y0 < -1000)).toHaveLength(4)
      expect(
        drawn.filter(
          e =>
            readSemanticTag(e)?.role === 'ky_hieu_mat_cat' &&
            e instanceof AcDbText
        )
      ).toHaveLength(6)
      // (b) no block text shares an area with anything else drawn.
      expect(overlaps(drawn)).toEqual([])
      // Not under the pile tips any more: the block is above the bệ top.
      const be = drawn.filter(e => readSemanticTag(e)?.role === 'mo_be')
      const beTop = Math.max(...be.map(e => boxOf(e).y1))
      for (const t of block) expect(boxOf(t).y0).toBeGreaterThan(beTop)
      // (c) no ASCII leftovers.
      const texts = drawn
        .filter((e): e is AcDbText => e instanceof AcDbText)
        .map(t => t.textString)
        .join('\n')
      expect(texts).not.toMatch(/trinh tu khoan|Tim-tim|phai danh gia/)
    }
  )

  test('tim–tim under 4D: both notes, numbered, still clear', () => {
    const drawn = draw('mo_mat_chinh.js', { soCoc: 3, aCoc: 2400, bBe: 7700 })
    const notes = notesOf(drawn)
    expect(notes).toHaveLength(2)
    expect(notes[0]).toMatch(
      /^Tim–tim 2400 mm < 4D \(4800 mm\): phải đánh giá ảnh hưởng tương tác/
    )
    expect(notes[1]).toMatch(/^Tim–tim 2400 mm < 6D \(7200 mm\)/)
    expect(overlaps(drawn)).toEqual([])
  })

  test('from 6D up: no spacing note and no block', () => {
    const drawn = draw('mo_mat_chinh.js', { bBe: 9800, aCoc: 7400 })
    expect(blockOf(drawn)).toEqual([])
  })
})

describe('mo_coc_khoan_nhoi: same block, clear of the piles', () => {
  test.each([
    [{ D: 1000, khoangCach: 3000, soCoc: 3, beRongBe: 8000 }, 2],
    [{ D: 1000, khoangCach: 5000, soCoc: 2, beRongBe: 8000 }, 1]
  ] as [Record<string, unknown>, number][])('%j: %i note(s)', (v, count) => {
    const drawn = draw('mo_coc_khoan_nhoi.js', v)
    expect(notesOf(drawn)).toHaveLength(count)
    expect(overlaps(drawn)).toEqual([])
    // Right of the cap, not under the pile tips.
    for (const t of blockOf(drawn))
      expect(boxOf(t).x0).toBeGreaterThan(Number(v.beRongBe) / 2)
  })
})

/**
 * The QA dossier L1 of dossierSuaTay (8 m road, stem 1,2 m, wings 4 m, D1000
 * piles 25 m): its geometry differs from M1. Before P3-M1 the steel sheets
 * carried «THÉP THEO M1 GỐC…» and SUB-100 its M1-table warning; now the
 * steel follows the geometry and only SUB-100 has a note — the wings and
 * ear walls still estimated (*).
 */
const L1 = {
  tenMo: 'QA-FIX-NOTE',
  bMatDuong: 8000,
  tThan: 1200,
  lCanh: 4000,
  D: 1000,
  lCoc: 25000
}
const FRAME = new Set(['khung_ban_ve', 'khung_ten'])
const sheetOf = (e: AcDbEntity) => readSemanticTag(e)?.params?.sheet as string
const isNote = (e: AcDbEntity) =>
  e instanceof AcDbText && readSemanticTag(e)?.params?.khoi === 'GHI CHÚ'
/** Strokes of a frame entity (the frame encloses the sheet: not a box). */
function strokes(e: AcDbEntity) {
  if (e instanceof AcDbLine) return [[e.startPoint, e.endPoint]]
  if (e instanceof AcDbPolyline) {
    const pts = Array.from({ length: e.numberOfVertices }, (_, i) =>
      e.getPoint2dAt(i)
    )
    if (e.closed) pts.push(pts[0])
    return pts.slice(1).map((p, i) => [pts[i], p])
  }
  return []
}

/**
 * Every (note line, entity) pair of the same sheet that shares an area —
 * boxes as the data model gives them (`geometricExtents`); frame strokes
 * checked as strokes.
 */
function dossierOverlaps(entities: AcDbEntity[]) {
  const out: string[] = []
  const notes = entities.filter(isNote)
  for (const n of notes) {
    const a = boxOf(n)
    for (const o of entities) {
      if (isNote(o) || sheetOf(o) !== sheetOf(n)) continue
      const tag = readSemanticTag(o)
      const hit = FRAME.has(tag?.role ?? '')
        ? strokes(o).some(([p, q]) => acTpSegmentCrossesBox(p, q, a))
        : acTpBoxesOverlap(a, boxOf(o))
      if (hit)
        out.push(
          `${sheetOf(n)}: «${(n as AcDbText).textString}» × ${o.dxfTypeName} ${tag?.partId} ${tag?.params?.sourceHandle ?? ''}`
        )
    }
  }
  return out
}

function drawScene(given: Record<string, number | string>) {
  const v = acapDeriveDossierValues(dossierDefaults(), given as never).values
  const scene = buildDossierScene(buildDossierModel(v))
  const db = new AcDbDatabase()
  db.createDefaultData()
  const ctx = createDrawContext(db, DOSSIER_ID, SEED_ROLE_LAYERS, {
    id: 'r1',
    version: DOSSIER_VERSION,
    values: scene.model.values
  })
  drawDossierScene(ctx, scene)
  return { scene, entities: [...ctx.drawn] as AcDbEntity[] }
}

describe('hồ sơ L1: cảnh báo vào khối GHI CHÚ, không đè hình', () => {
  jest.setTimeout(300000)

  test('tao_ho_so_mo L1: the SUB-100 note (no STEEL_AS_M1), clear of the sheet', async () => {
    const db = new AcDbDatabase()
    db.createDefaultData()
    const r = await runDossierTool('tao_ho_so_mo', { thong_so: L1 }, db)
    expect(r.ok).toBe(true)
    const run = listRuns(db).find(x => x.templateId === 'ho_so_mo_m1')!
    const entities = entitiesOfRun(db, run.id)
    const notes = entities.filter(isNote) as AcDbText[]
    // P3-M1: no block on the steel sheets any more; SUB-100 keeps one.
    const sheets = [...new Set(notes.map(sheetOf))].sort()
    expect(sheets).toEqual(['SUB-100'])
    expect(notes.every(n => n.color.colorIndex === 1)).toBe(true)
    const own = notes.filter(n => sheetOf(n) === 'SUB-100')
    expect(own[0].textString).toBe('GHI CHÚ')
    const said = own.map(n => n.textString).join(' ')
    expect(said).toContain('(*) tường cánh trái, tường cánh phải, tường tai')
    expect(said).not.toMatch(/THÉP THEO M1 GỐC|CỦA M1 GỐC/)
    // No warning left outside a block.
    const loose = entities.filter(
      e =>
        e instanceof AcDbText &&
        !isNote(e) &&
        /^(CHƯA|THÉP THEO M1 GỐC|BẢNG .*CHƯA)/.test(e.textString)
    )
    expect(loose).toEqual([])
    expect(dossierOverlaps(entities)).toEqual([])
    // Inside its sheet's frame (the drawing area), not pushed off the page.
    const frames = new Map<
      string,
      { x0: number; x1: number; y0: number; y1: number }
    >()
    for (const e of entities)
      if (readSemanticTag(e)?.role === 'khung_ban_ve') {
        const b = boxOf(e)
        const f = frames.get(sheetOf(e))
        frames.set(sheetOf(e), f && f.x1 - f.x0 > b.x1 - b.x0 ? f : b)
      }
    for (const n of notes) {
      const b = boxOf(n)
      const f = frames.get(sheetOf(n))!
      expect([b.x0 > f.x0, b.x1 < f.x1, b.y0 > f.y0, b.y1 < f.y1]).toEqual([
        true,
        true,
        true,
        true
      ])
    }
  })

  test.each([
    ['dốc ngang 3 %', { docNgang: 3 }],
    ['3 cột cọc', { soCotCoc: 3 }],
    ['ngoài lưới (phần lót 200): «CHƯA DỰNG ĐƯỢC…»', { phuLot: 200 }],
    ['không thép: bảng chưa áp dụng', { thep: 'khong' }]
  ] as [string, Record<string, number | string>][])(
    'L1 %s: every note in a block, clear of the sheet',
    (_name, change) => {
      const { scene, entities } = drawScene({ ...L1, ...change })
      expect(dossierOverlaps(entities)).toEqual([])
      const loose = entities.filter(
        e =>
          e instanceof AcDbText &&
          !isNote(e) &&
          /^(CHƯA|THÉP THEO M1 GỐC|BẢNG .*CHƯA)/.test(e.textString)
      )
      expect(loose).toEqual([])
      // A heading and the reason after it are read back whole.
      if (change.phuLot) {
        const sub010 = acapDossierSheetNotes(scene.sheets[0])
        expect(sub010[0]).toBe('CHƯA DỰNG ĐƯỢC HÌNH CHO BỘ THÔNG SỐ NÀY')
        expect(sub010[1]).toMatch(/phần lót nhô mỗi mép = 100 mm\.$/)
      }
    }
  )
})

/**
 * FIX-NOTE QA (SUB-100): the take-off of the current parameters is a sparse
 * table (stt / item / unit / value) and the GHI CHÚ block was placed in the
 * gap between its columns; the table also ran down into the title strip
 * (CHỦ TRÌ / THIẾT KẾ). Both are checked as solid blocks here: the union box
 * of the table's texts and of the title strip with its texts.
 */
describe('SUB-100: GHI CHÚ clear of the take-off table, table above the title strip', () => {
  jest.setTimeout(300000)

  const union = (es: AcDbEntity[]): Box =>
    es.map(boxOf).reduce((a, b) => ({
      x0: Math.min(a.x0, b.x0),
      y0: Math.min(a.y0, b.y0),
      x1: Math.max(a.x1, b.x1),
      y1: Math.max(a.y1, b.y1)
    }))

  test.each([
    ['L1 đủ thông số', L1, 'D1000', '78,54'],
    // The QA «8 m only» prompt: other values are dossierDefaults() — D1200,
    // lCoc 0 — so the pile line is «không tính». Not the L1 defaults.
    [
      'L1 chỉ bề mặt đường 8 m',
      { tenMo: 'L1', bMatDuong: 8000 },
      'D1200',
      'không tính'
    ]
  ] as [string, Record<string, number | string>, string, string][])(
    '%s',
    (_name, given, pile, pileValue) => {
      const { scene, entities } = drawScene(given)
      if (!('D' in given)) {
        expect(scene.model.values.D).toBe(1200)
        expect(Number(scene.model.values.lCoc)).toBe(0)
      }
      const sub = entities.filter(e => sheetOf(e) === 'SUB-100')
      const table = sub.filter(
        e => readSemanticTag(e)?.partId === 'ghi_chu_btkl_SUB-100'
      )
      const strip = sub.filter(e =>
        ['khung_ten', 'tieu_de_ban_ve'].includes(readSemanticTag(e)?.role ?? '')
      )
      const notes = sub.filter(isNote)
      expect(table.length).toBeGreaterThan(60)
      expect(strip.length).toBeGreaterThan(0)
      expect(notes.length).toBeGreaterThan(0)
      // P3-M1: the (*) note of the groups still estimated, not the M1-table
      // caveat.
      expect(ghiChuText(entities, 'SUB-100')).toContain(
        '(*) tường cánh trái, tường cánh phải'
      )
      expect(ghiChuText(entities, 'SUB-100')).not.toContain('CỦA M1 GỐC')
      // The pile line of the take-off.
      const lines = table.map(e => (e as AcDbText).textString)
      const pileRow = lines.indexOf(`Bê tông cọc khoan nhồi ${pile}`)
      expect(pileRow).toBeGreaterThan(0)
      expect(lines).toContain(pileValue)
      const tableBox = union(table)
      const stripBox = union(strip)
      // The table: wholly above the strip with room (≥ 300), not on it.
      expect(acTpBoxesOverlap(tableBox, stripBox)).toBe(false)
      expect(tableBox.y0 - stripBox.y1).toBeGreaterThanOrEqual(300 - 1e-6)
      // ... and clear of everything else on the sheet but the frame border.
      const others = sub.filter(
        e =>
          !table.includes(e) &&
          !isNote(e) &&
          !FRAME.has(readSemanticTag(e)?.role ?? '') &&
          readSemanticTag(e)?.role !== 'tieu_de_ban_ve'
      )
      expect(
        others
          .filter(e => acTpBoxesOverlap(tableBox, boxOf(e)))
          .map(e => `${e.dxfTypeName} ${readSemanticTag(e)?.partId}`)
      ).toEqual([])
      // Every GHI CHÚ line: clear of both blocks as a whole.
      for (const n of notes) {
        expect([
          (n as AcDbText).textString,
          acTpBoxesOverlap(boxOf(n), tableBox),
          acTpBoxesOverlap(boxOf(n), stripBox)
        ]).toEqual([(n as AcDbText).textString, false, false])
      }
      // The block, read back from the scene, is the same as drawn.
      const sheet = scene.sheets.find(s => s.id === 'SUB-100')!
      // P3-M1: the (*) note of the groups still estimated (wings, and the
      // ear walls when tThan changed), not the M1-table caveat.
      const read = acapDossierSheetNotes(sheet).join(' ')
      expect(read).toMatch(
        /^\(\*\) tường cánh trái, tường cánh phải(, tường tai)?: số thanh, chiều dài theo M1; khối lượng tạm tính theo hàm lượng\.$/
      )
      expect(read).not.toContain('CHƯA CẬP NHẬT CHO THÔNG SỐ NÀY')
      // The existing per-entity check over every sheet still holds.
      expect(dossierOverlaps(entities)).toEqual([])
    }
  )
})

/**
 * FIX-NOTE L1 defaults: «hồ sơ L1» through the tool (tenMo "L1" only, the
 * preset applied), as drawn in the database — fresh and after a 3 % cross
 * fall. The GHI CHÚ block is there without any sua, clear of the take-off
 * table (union) and of the title strip; the table, its red footer included
 * («Đỏ: không tính…», a caption of the table, not the GHI CHÚ heading), is
 * clear of the title strip.
 */
describe('hồ sơ L1 mặc định (tao_ho_so_mo tenMo "L1"): SUB-100 boxes', () => {
  jest.setTimeout(600000)

  const union = (es: AcDbEntity[]): Box =>
    es.map(boxOf).reduce((a, b) => ({
      x0: Math.min(a.x0, b.x0),
      y0: Math.min(a.y0, b.y0),
      x1: Math.max(a.x1, b.x1),
      y1: Math.max(a.y1, b.y1)
    }))

  function checkSub100(entities: AcDbEntity[]) {
    const sub = entities.filter(e => sheetOf(e) === 'SUB-100')
    const table = sub.filter(
      e => readSemanticTag(e)?.partId === 'ghi_chu_btkl_SUB-100'
    )
    const strip = sub.filter(e =>
      ['khung_ten', 'tieu_de_ban_ve'].includes(readSemanticTag(e)?.role ?? '')
    )
    const notes = sub.filter(isNote) as AcDbText[]
    expect(table.length).toBeGreaterThan(60)
    expect(strip.length).toBeGreaterThan(0)
    expect(notes.map(n => n.textString)).toContain('GHI CHÚ')
    // The footer is in the table's part: the table box covers it.
    const footer = table.filter(
      e => e instanceof AcDbText && /^Đỏ: không tính/.test(e.textString)
    )
    expect(footer).toHaveLength(1)
    const tableBox = union(table)
    const stripBox = union(strip)
    expect(acTpBoxesOverlap(tableBox, stripBox)).toBe(false)
    expect(acTpBoxesOverlap(boxOf(footer[0]), stripBox)).toBe(false)
    for (const n of notes)
      expect([
        n.textString,
        acTpBoxesOverlap(boxOf(n), tableBox),
        acTpBoxesOverlap(boxOf(n), stripBox)
      ]).toEqual([n.textString, false, false])
    expect(dossierOverlaps(entities)).toEqual([])
  }

  test('fresh, then after dốc ngang 3 %', async () => {
    const db = new AcDbDatabase()
    db.createDefaultData()
    const r = await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { tenMo: 'L1' } },
      db
    )
    expect(r.ok).toBe(true)
    const run = () => listRuns(db).find(x => x.templateId === DOSSIER_ID)!
    expect(run().values).toMatchObject({ D: 1000, lCoc: 25000, bBe: 8700 })
    // The red block without any sua: the geometry is not M1's. P3-M1: only
    // SUB-100 (the steel sheets follow L1, no «THÉP THEO M1 GỐC»).
    const notes = entitiesOfRun(db, run().id).filter(isNote)
    expect([...new Set(notes.map(sheetOf))].sort()).toEqual(['SUB-100'])
    checkSub100(entitiesOfRun(db, run().id))
    const res = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: run().id, thong_so: { docNgang: 3 } },
      db
    )
    expect(res.ok).toBe(true)
    checkSub100(entitiesOfRun(db, run().id))
  })
})

describe('library versions to publish (drawings pin id@version)', () => {
  test.each([
    ['mo_mat_chinh.js', '2.0.1'],
    ['mo_coc_khoan_nhoi.js', '1.0.1'],
    ['tru_mat_chinh.js', '1.0.1'],
    ['tru_mat_ben.js', '1.0.1']
  ])('%s is %s', (file, version) => {
    expect(loadLibraryTemplate(file).meta.version).toBe(version)
  })
})
