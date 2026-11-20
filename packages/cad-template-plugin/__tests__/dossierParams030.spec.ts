/**
 * GĐ6 — the 0.3.0 dossier follows its parameters through the agent tool
 * `sua_ho_so_mo`: each variant changes one thing (or several), and the
 * dimensions, elevations, tables and steel sheets must follow or refuse.
 *
 * With PARAM_OUT=<dir> it also writes each variant's DXF and the sheets that
 * changed, for `tools/fidelity/params.mjs` to render.
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

import { acTpDxfOut, readSemanticTag } from '@mlightcad/cad-template-sdk'
import {
  AcDbAlignedDimension,
  AcDbDatabase,
  AcDbEntity,
  AcDbText,
  AcGeMatrix3d
} from '@mlightcad/data-model'

import {
  buildDossierModel,
  DOSSIER_A3_VERSION,
  dossierDefaults
} from '../src/dossier/model'
import { buildDossierScene } from '../src/dossier/scene'
import { sheetViewBoxes } from '../src/dossier/scene030'
import { abutmentDossierTemplate } from '../src/dossier/template'
import { runDossierTool } from '../src/dossier/tools'
import { entitiesOfRun } from '../src/runIdentity'
import { runTemplate } from '../src/runTemplate'

jest.setTimeout(240_000)

/** One variant per parameter, and all together. */
export const VARIANTS: Record<string, Record<string, number>> = {
  hBe: { hBe: 2500 },
  // The source draws the stem as wide as the footing and the piles flush
  // with its edges: bThan and aCocNgang follow bBe.
  bBe: { bBe: 8500, bThan: 8500, aCocNgang: 6100 },
  // Pile diameter: the piles stay flush with the footing edges.
  'coc-D': { D: 1500, aCocNgang: 4700, aCocDoc: 3000 },
  // Pile count: a change of layout the stretch grid cannot follow.
  'coc-so': { soCotCoc: 3, bBe: 11000, bThan: 11000, aCocNgang: 4000 },
  caoDoDayBe: { caoDoDayBe: 230 },
  gop: {
    hBe: 2500,
    bBe: 8500,
    bThan: 8500,
    aCocNgang: 6100,
    caoDoDayBe: 230,
    lCanh: 7000
  }
}

const database = () => {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}
const sheetOf = (e: AcDbEntity) =>
  String(readSemanticTag(e)?.params?.sheet ?? '')

async function dossier() {
  const db = database()
  const made = await runTemplate(abutmentDossierTemplate, dossierDefaults(), db)
  expect(made.errors).toEqual([])
  return { db, runId: made.runId! }
}

/** Lengths of the dimensions labelled `label` on a sheet, mm. */
function dimLengths(
  db: AcDbDatabase,
  runId: string,
  sheet: string,
  label: string
) {
  return entitiesOfRun(db, runId)
    .filter(
      (e): e is AcDbAlignedDimension =>
        e instanceof AcDbAlignedDimension &&
        sheetOf(e) === sheet &&
        e.dimensionText === label
    )
    .map(d => {
      const vertical = Math.abs(Math.cos(d.rotation)) < 0.5
      const a = d.xLine1Point,
        b = d.xLine2Point
      return Math.round(vertical ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x))
    })
}
const texts = (db: AcDbDatabase, runId: string, sheet: string) =>
  entitiesOfRun(db, runId)
    .filter(e => e instanceof AcDbText && sheetOf(e) === sheet)
    .map(e => (e as AcDbText).textString)
const steelDrawn = (db: AcDbDatabase, runId: string, sheet: string) =>
  entitiesOfRun(db, runId).filter(
    e => sheetOf(e) === sheet && readSemanticTag(e)?.params?.sourceHandle
  ).length

/** Per-sheet fingerprint of the run, to tell which sheets a change touched. */
function fingerprint(db: AcDbDatabase, runId: string) {
  const out: Record<string, string[]> = {}
  for (const e of entitiesOfRun(db, runId)) {
    let box = ''
    try {
      const b = e.geometricExtents
      box = [b.min.x, b.min.y, b.max.x, b.max.y].map(Math.round).join(',')
    } catch {
      box = '?'
    }
    const t = e instanceof AcDbText ? e.textString : ''
    ;(out[sheetOf(e)] ??= []).push(`${e.dxfTypeName}|${box}|${t}`)
  }
  for (const k of Object.keys(out)) out[k].sort()
  return out
}

const OUT = process.env.PARAM_OUT
const results: Record<string, unknown> = {}
let defaultPrint: Record<string, string[]> = {}
let defaultHB: number[] = []

describe('GĐ6: hồ sơ 0.3.0 theo tham số qua sua_ho_so_mo', () => {
  test('mặc định (đối chứng)', async () => {
    const { db, runId } = await dossier()
    defaultPrint = fingerprint(db, runId)
    defaultHB = dimLengths(db, runId, 'SUB-010', 'HB')
    if (OUT) {
      mkdirSync(OUT, { recursive: true })
      writeFileSync(join(OUT, 'macdinh.dxf'), acTpDxfOut(db, 6) as string)
    }
    expect(dimLengths(db, runId, 'SUB-010', 'HB')).toContain(2000)
  })

  test.each(Object.keys(VARIANTS))('biến thể %s', async name => {
    const { db, runId } = await dossier()
    const change = VARIANTS[name]
    const outcome = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: runId, thong_so: change },
      db
    )
    if (name === 'coc-so') {
      // A change of pile layout: the general arrangement cannot follow, so
      // the tool refuses and leaves the drawing as it was.
      expect(outcome.ok).toBe(false)
      expect(String(outcome.message)).toMatch(/soCotCoc/)
      expect(dimLengths(db, runId, 'SUB-010', 'HB').length).toBeGreaterThan(0)
      results[name] = {
        change,
        warnings: [String(outcome.message)],
        changedSheets: [],
        sub010: 'từ chối (công cụ không sửa gì)',
        HB: [],
        LC: [],
        BMo: [],
        DCoc: [],
        bangSUB020: [],
        thep: 'giữ nguyên (không sửa)'
      }
      return
    }
    expect(outcome.ok).toBe(true)
    const warnings = ((outcome.data as { canhBao?: string[] })?.canhBao ??
      []) as string[]
    const values = { ...dossierDefaults(), ...change }
    const num = (k: string) => Number(values[k])
    const after = buildDossierScene(
      buildDossierModel(values),
      DOSSIER_A3_VERSION
    )

    // Steel sheets: never stretched — when the geometry changed they keep
    // the M1 steel, marked as not updated (they used to go blank, −71 % of
    // the dossier); the elevation datum alone leaves the steel as it is.
    const geometric = Object.keys(change).some(k => k !== 'caoDoDayBe')
    for (const s of ['SUB-070', 'SUB-080', 'SUB-090']) {
      expect(steelDrawn(db, runId, s)).toBeGreaterThan(0)
      expect(
        texts(db, runId, s).includes(
          'THÉP THEO M1 GỐC, CHƯA CẬP NHẬT CHO THÔNG SỐ NÀY'
        )
      ).toBe(geometric)
    }
    expect(
      texts(db, runId, 'SUB-100').includes(
        'BẢNG THỐNG KÊ THÉP VÀ KHỐI LƯỢNG BÊN PHẢI LÀ CỦA M1 GỐC, CHƯA CẬP NHẬT CHO THÔNG SỐ NÀY'
      )
    ).toBe(geometric)

    const refused = texts(db, runId, 'SUB-010').some(t =>
      t.startsWith('CHƯA DỰNG ĐƯỢC HÌNH')
    )
    const hb = dimLengths(db, runId, 'SUB-010', 'HB')
    const lc = dimLengths(db, runId, 'SUB-010', 'LC')
    const bMo = dimLengths(db, runId, 'SUB-010', 'B Mố')
    const dCoc = dimLengths(db, runId, 'SUB-010', 'D Cọc')
    const table = texts(db, runId, 'SUB-020').filter(t => /^[\d.–]+$/.test(t))
    if (name === 'coc-so') {
      // Pile count changes the layout: SUB-010/020 refuse, tables too.
      expect(refused).toBe(true)
      expect(table.every(t => t === '–' || t === '1')).toBe(true)
    } else {
      expect(refused).toBe(false)
      const hBe = num('hBe')
      // Every HB dimension grows by exactly the change of hBe, against its
      // own default length (the source's HB measure 1997–2000 mm).
      expect(hb).toHaveLength(defaultHB.length)
      hb.forEach((h, k) =>
        expect(Math.abs(h - defaultHB[k] - (hBe - 2000))).toBeLessThanOrEqual(1)
      )
      for (const l of lc) expect(l).toBe(num('lCanh'))
      for (const b of bMo) expect(b).toBe(num('bBe'))
      for (const d of dCoc) expect(d).toBe(num('D'))
      // Elevations: EL6 = caoDoDayBe, EL5 = EL6 + hBe.
      const el6 = num('caoDoDayBe').toFixed(3)
      const el5 = (num('caoDoDayBe') + hBe / 1000).toFixed(3)
      expect(table).toEqual(expect.arrayContaining([el6, el5]))
      expect(table).toContain((hBe / 1000).toFixed(3))
    }
    const print = fingerprint(db, runId)
    const changedSheets = after.sheets
      .map(s => s.id)
      .filter(
        id =>
          JSON.stringify(print[id] ?? []) !==
          JSON.stringify(defaultPrint[id] ?? [])
      )
    results[name] = {
      change,
      warnings,
      changedSheets,
      sub010: refused ? 'từ chối' : 'co giãn',
      HB: [...new Set(hb)],
      LC: [...new Set(lc)],
      BMo: [...new Set(bMo)],
      DCoc: [...new Set(dCoc)],
      bangSUB020: table,
      thep: geometric ? 'từ chối' : 'giữ (chỉ đổi cao độ)'
    }
    if (OUT)
      writeFileSync(join(OUT, `${name}.dxf`), acTpDxfOut(db, 6) as string)
  })

  test('sửa tay rồi đổi kích thước: từ chối, không xoá gì', async () => {
    const { db, runId } = await dossier()
    const one = entitiesOfRun(db, runId).find(e => sheetOf(e) === 'SUB-010')!
    db.openEntityForWrite(one)!.transformBy(
      new AcGeMatrix3d().makeTranslation(50, 0, 0)
    )
    const before = entitiesOfRun(db, runId).length
    const outcome = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: runId, thong_so: { hBe: 2500 } },
      db
    )
    expect(outcome.ok).toBe(false)
    expect(String(outcome.message)).toMatch(/sửa tay/)
    expect(entitiesOfRun(db, runId)).toHaveLength(before)
  })

  afterAll(() => {
    if (!OUT) return
    const scene = buildDossierScene(
      buildDossierModel(dossierDefaults()),
      DOSSIER_A3_VERSION
    )
    writeFileSync(
      join(OUT, 'params-manifest.json'),
      JSON.stringify(
        {
          sheets: scene.sheets.map(s => ({
            id: s.id,
            window: {
              x0: s.origin[0],
              y0: s.origin[1],
              x1: s.origin[0] + s.width,
              y1: s.origin[1] + s.height
            }
          })),
          results
        },
        null,
        1
      )
    )
  })
})

describe('GĐ7a: hình chiếu dời để giữ khoảng hở, tràn khung thì từ chối', () => {
  const gaps = (
    boxes: Record<string, { x0: number; y0: number; x1: number; y1: number }>,
    flow: string[][]
  ) => {
    const out: Record<string, number> = {}
    for (const col of flow)
      for (let i = 1; i < col.length; i++)
        out[`${col[i - 1]} / ${col[i]}`] =
          boxes[col[i - 1]].y0 - boxes[col[i]].y1
    for (let j = 1; j < flow.length; j++) {
      const right = Math.max(...flow[j - 1].map(n => boxes[n].x1))
      const left = Math.min(...flow[j].map(n => boxes[n].x0))
      out[`cột ${j} / cột ${j + 1}`] = left - right
    }
    return out
  }

  test.each(['hBe', 'bBe', 'coc-D', 'gop'])(
    '%s: mọi cặp hình kề nhau giữ khoảng hở ≥ bản gốc, trong khung A3',
    name => {
      const values = buildDossierModel({
        ...dossierDefaults(),
        ...VARIANTS[name]
      }).values
      const r = sheetViewBoxes(values, 'SUB-010')
      if (!r || 'error' in r) throw new Error(JSON.stringify(r))
      const before = gaps(r.before, r.flow)
      const after = gaps(r.after, r.flow)
      for (const k of Object.keys(before))
        expect({ k, ok: after[k] >= before[k] - 1 }).toEqual({ k, ok: true })
      for (const b of Object.values(r.after)) {
        expect(b.x0).toBeGreaterThanOrEqual(-1)
        expect(b.x1).toBeLessThanOrEqual(38400 + 1)
        expect(b.y1).toBeLessThanOrEqual(25300 + 1)
      }
    }
  )

  test('mặc định: không dời gì, hình y nguyên', () => {
    expect(sheetViewBoxes(dossierDefaults(), 'SUB-010')).toBeUndefined()
  })

  test('tràn khung A3 thì từ chối, nói hình chiếu nào và tràn bao nhiêu', () => {
    const scene = buildDossierScene(
      buildDossierModel({ lCanh: 12000 }),
      DOSSIER_A3_VERSION
    )
    const texts = scene.sheets[0].primitives.flatMap(p =>
      p.kind === 'text' ? [p.text] : []
    )
    expect(texts.some(t => /vượt khung A3/.test(t))).toBe(true)
    expect(scene.sheets[0].primitives.some(p => p.sourceHandle)).toBe(false)
  })
})
