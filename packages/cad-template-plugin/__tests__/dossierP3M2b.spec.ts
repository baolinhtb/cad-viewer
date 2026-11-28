/**
 * P3-M2b: the UI acceptance faults of P3-M2, through the real tools.
 *
 * - Case 6: `neo_khong_du` from a real prompt. The M1 layout puts the front
 *   pile row under the toe and the back row under the heel, each at D from
 *   the footing edge (grid030 `acTpDossierLayoutLimits`), with D ≥ 600 and
 *   hBe ≥ 500: every end the check covers gets more than its hook length,
 *   so no geometry the six sheets build is short. The proof is the table
 *   below and a sweep; the UI checklist uses the P1 flag (the M1 drawing
 *   itself) and the 11 m road's lap instead.
 * - Case 7: an 11 m road builds; SUB-010 shrinks to 1:125 to stay on A3.
 * - Steel flags reach the agent with their clause, «TCVN 11823-5 Đ 11.x».
 *
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

import { acTpBoxesOverlap, readSemanticTag } from '@mlightcad/cad-template-sdk'
import { AcDbDatabase, AcDbEntity, AcDbText } from '@mlightcad/data-model'

import {
  ACTP_LOP_PHU_M1,
  ACTP_NEO_VAT_LIEU,
  acTpKiemNeoMo,
  acTpLambdaDh
} from '../src/btkl/neoThep'
import { BTKL_TOOLS, runBtklTool } from '../src/btkl/tools'
import { acapDeriveDossierValues } from '../src/dossier/derive'
import { DOSSIER_DIM_SYMBOLS } from '../src/dossier/dimSymbols'
import { acTpDossierLayoutLimits } from '../src/dossier/grid030'
import {
  buildDossierModel,
  DOSSIER_PARAMS,
  dossierDefaults
} from '../src/dossier/model'
import layout from '../src/dossier/reference/layout-mo2.json'
import { buildDossierScene } from '../src/dossier/scene'
import { sheetViewBoxes } from '../src/dossier/scene030'
import { DOSSIER_PRESET_L1, runDossierTool } from '../src/dossier/tools'
import { entitiesOfRun, listRuns } from '../src/runIdentity'

jest.setTimeout(900000)

const OUT = process.env.QA_EVIDENCE_DIR
const numbers: Record<string, unknown> = {}
afterAll(() => {
  if (!OUT) return
  mkdirSync(OUT, { recursive: true })
  writeFileSync(
    join(OUT, 'p3-m2b-numbers.json'),
    JSON.stringify(numbers, null, 1)
  )
})

type Values = Record<string, string | number>
type Tong = {
  doiTuong: string
  beTongM3: number | null
  thepKg: number | null
  thepKgHienThi: string
  co: string[]
}
const database = () => {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}
const tong = (o: { data?: unknown }) => (o.data as { tong: Tong[] }).tong[0]
const coThep = (o: { data?: unknown }) =>
  (o.data as { tong: { coThep: string[] }[] }).tong[0].coThep
const param = (k: string) => DOSSIER_PARAMS.find(p => p.key === k)!
const L1 = acapDeriveDossierValues(dossierDefaults(), {
  ...DOSSIER_PRESET_L1
}).values as Values

describe('case 6: no valid geometry is short of anchorage (proof)', () => {
  const M = ACTP_NEO_VAT_LIEU
  const C = ACTP_LOP_PHU_M1
  const dMin = Number(param('D').min)
  const hBeMin = Number(param('hBe').min)

  test('the bounds: D ≥ 600, hBe ≥ 500; toe > D, heel > D + 300 (grid)', () => {
    expect([dMin, hBeMin]).toEqual([600, 500])
    // The grid limits as the refusal words them.
    const toe = acTpDossierLayoutLimits({ ...L1, muiBe: 1000 })
    expect(toe.find(l => l.code === 'mui_be_sau_tim_coc')!.min).toBe(1000)
    const heel = acTpDossierLayoutLimits({ ...L1, tThan: 3000, muiBe: 2500 })
    expect(heel.map(l => [l.code, l.value, l.min])).toEqual([
      ['got_be_sau_tim_coc', 500, 1300]
    ])
  })

  test('table: each end checked, required vs the least the valid range gives', () => {
    // Least straight run before the hook, mm, over every valid geometry.
    const least = {
      toe: dMin - C, // muiBe > D ≥ 600
      heel: dMin + 300 - C, // lBe − muiBe − tThan > D + 300
      stem: hBeMin - C // hBe ≥ 500
    }
    const rows = [
      ['f1 mũi bệ D18', acTpLambdaDh(18, M), least.toe],
      ['f3 mũi bệ D22', acTpLambdaDh(22, M), least.toe],
      ['f1 gót bệ D18', acTpLambdaDh(18, M), least.heel],
      ['f3 gót bệ D22', acTpLambdaDh(22, M), least.heel],
      ['a1 chân thân D22', acTpLambdaDh(22, M), least.stem],
      ['a2 chân thân D16', acTpLambdaDh(16, M), least.stem]
    ].map(([what, req, min]) => ({
      what,
      required: Math.round(Number(req)),
      least: Number(min),
      ok: Number(min) >= Number(req)
    }))
    numbers.case6Table = rows
    expect(rows.map(r => `${r.what} ${r.required}/${r.least}`)).toEqual([
      'f1 mũi bệ D18 250/525',
      'f3 mũi bệ D22 306/525',
      'f1 gót bệ D18 250/825',
      'f3 gót bệ D22 306/825',
      'a1 chân thân D22 306/425',
      'a2 chân thân D16 223/425'
    ])
    expect(rows.every(r => r.ok)).toBe(true)
    // P1 laps the stem bars on a leg fixed by the M1 drawing: 648 < 1 382
    // whatever the geometry — the M1 drawing's own, never neo_khong_du.
    for (const hDau of [600, 1887, 3000]) {
      const p1 = acTpKiemNeoMo({ ...L1, hDau }).find(c => c.mark === 'p1')!
      expect([p1.required, p1.provided, p1.ok, p1.banGoc]).toEqual([
        1382,
        648,
        false,
        true
      ])
    }
  })

  test('sweep: inside the grid limits no check is short but P1', () => {
    let valid = 0
    for (const D of [600, 800, 1000, 1500, 2500])
      for (const lBe of [3000, 4000, 6000, 9000, 12000])
        for (const tThan of [600, 1200, 2000, 3000])
          for (let muiBe = 300; muiBe <= 6000; muiBe += 100)
            for (const hBe of [500, 1000, 2000])
              for (const lCanh of [4000, 8000, 12000]) {
                const v = { ...L1, D, lBe, tThan, muiBe, hBe, lCanh }
                if (muiBe + tThan >= lBe) continue
                if (acTpDossierLayoutLimits(v, false).length) continue
                valid++
                const short = acTpKiemNeoMo(v).filter(c => !c.ok && !c.banGoc)
                expect([JSON.stringify(v), short]).toEqual([
                  JSON.stringify(v),
                  []
                ])
              }
    numbers.case6SweepValid = valid
    expect(valid).toBeGreaterThan(1000)
  })

  test('real tools: L1 muiBe 300 refused with the range; the extremes flag no neo_khong_du', async () => {
    const db = database()
    const made = await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { tenMo: 'L1' } },
      db
    )
    expect(made.ok).toBe(true)
    const runId = listRuns(db)[0].id
    const refused = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: runId, thong_so: { muiBe: 300 } },
      db
    ).catch((e: Error) => ({ ok: false, message: e.message }))
    expect(refused.ok).toBe(false)
    expect(refused.message).toContain(
      'mũi bệ dựng được đủ 6 tờ (kể cả tờ thép) từ 1 451 đến 3 499 mm'
    )
    expect(listRuns(db)[0].values.muiBe).toBe(2000)
    // The shortest toe, the shortest heel, the lowest footing the six
    // sheets build on L1: the take-off has P1 only.
    const btkl = await runBtklTool('tao_btkl', {}, db)
    expect(btkl.ok).toBe(true)
    const btklId = (btkl.data as { maLanChay: string }).maLanChay
    const extremes: Values[] = [{ muiBe: 1451 }, { muiBe: 3499 }, { hBe: 500 }]
    numbers.case6Extremes = []
    for (const thongSo of extremes) {
      const edited = await runDossierTool(
        'sua_ho_so_mo',
        {
          ma_lan_chay: runId,
          thong_so: { muiBe: 2000, hBe: 2000, ...thongSo }
        },
        db
      )
      expect([JSON.stringify(thongSo), edited.ok]).toEqual([
        JSON.stringify(thongSo),
        true
      ])
      const again = await runBtklTool(
        'cap_nhat_btkl',
        { ma_lan_chay: btklId },
        db
      )
      const flags = coThep(again)
      ;(numbers.case6Extremes as unknown[]).push({ thongSo, flags })
      expect(flags.some(f => f.startsWith('[neo_khong_du]'))).toBe(false)
      expect(flags.some(f => f.startsWith('[neo_ban_goc_chua_dat]'))).toBe(true)
    }
  })
})

describe('steel flags reach the agent with their clause', () => {
  test('L1: P1 flag with «TCVN 11823-5 Đ 11.5.3.1», the rule in the tool text', async () => {
    const db = database()
    await runDossierTool('tao_ho_so_mo', { thong_so: { tenMo: 'L1' } }, db)
    const made = await runBtklTool('tao_btkl', {}, db)
    expect(tong(made).thepKgHienThi).toBe('13 476,854')
    const flags = coThep(made)
    numbers.l1Flags = flags
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatch(/^\[neo_ban_goc_chua_dat\] /)
    expect(flags[0]).toContain('yêu cầu 1 382 mm, có 648 mm')
    expect(flags[0]).toContain(
      '(TCVN 11823-5 Đ 11.5.3.1, Đ 11.2.1.1 (PT 176, 177))'
    )
    expect(flags[0]).not.toMatch(/Đ11\./)
    // The same words as on the sheet's flag line.
    expect(tong(made).co.join(' ')).toContain(flags[0].slice(24, 120))
    expect(made.message).toContain('không bỏ, không viết lại điều khoản')
    for (const name of ['tao_btkl', 'cap_nhat_btkl'])
      expect(BTKL_TOOLS.find(t => t.name === name)!.description).toContain(
        'nói lại số liệu kèm nguyên điều khoản'
      )
  })
})

describe('case 7: an 11 m road builds, SUB-010 at 1:125', () => {
  const V11 = acapDeriveDossierValues(dossierDefaults(), {
    ...DOSSIER_PRESET_L1,
    bMatDuong: 11000
  }).values as Values

  test('scene: SUB-010 1:125 (title block and view labels), others 1:100', () => {
    const scene = buildDossierScene(buildDossierModel(V11))
    expect(scene.sheets.map(s => [s.id, s.viewScale ?? 100])).toEqual([
      ['SUB-010', 125],
      ['SUB-020', 100],
      ['SUB-070', 100],
      ['SUB-080', 100],
      ['SUB-090', 100],
      ['SUB-100', 100]
    ])
    const texts = (id: string) =>
      scene.sheets
        .find(s => s.id === id)!
        .primitives.filter(p => p.kind === 'text')
        .map(p => (p as { text: string }).text)
    expect(texts('SUB-010')).toContain('(TL: 1/125)')
    expect(texts('SUB-010')).not.toContain('(TL: 1/100)')
    // Every scale the sheet writes is the new one. The title block's TỈ LỆ
    // cell is left out on every sheet (it falls on the source's surviving
    // title texts, xref FR A3 missing): the view labels carry the scale.
    expect(texts('SUB-010').filter(t => /1[/:] ?1\d\d\b/.test(t))).toEqual(
      expect.arrayContaining(['(TL: 1/125)'])
    )
    expect(texts('SUB-010').filter(t => /1[/:] ?100\b/.test(t))).toEqual([])
    expect(texts('SUB-020')).toContain('(TL: 1/100)')
    // The shrunk drawing stays inside the source viewport.
    const vp = layout.sheets.find(l => l.id === 'SUB-010')!.viewport!
    const s010 = scene.sheets.find(s => s.id === 'SUB-010')!
    const outside = s010.primitives
      .filter(p => p.sourceHandle)
      .flatMap(p =>
        p.kind === 'path'
          ? p.points
          : p.kind === 'fill'
            ? p.loops.flat()
            : p.kind === 'text'
              ? [p.at]
              : []
      )
      .filter(
        ([x, y]) =>
          x < vp.x * 100 - 1e-6 ||
          x > (vp.x + vp.w) * 100 + 1e-6 ||
          y < vp.y * 100 - 1e-6 ||
          y > (vp.y + vp.h) * 100 + 1e-6
      )
    expect(outside).toEqual([])
    expect(texts('SUB-010').join(' ')).not.toMatch(/CHƯA DỰNG|vượt khung/)
    // Neighbouring views keep the source gaps, shrunk with the drawing
    // (the GĐ7a criterion of dossierParams030), inside the A3 viewport.
    const r = sheetViewBoxes(buildDossierModel(V11).values, 'SUB-010')
    if (!r || 'error' in r) throw new Error(JSON.stringify(r))
    expect(r.scale).toBe(125)
    const gaps = (boxes: typeof r.after) => {
      const out: Record<string, number> = {}
      for (const col of r.flow)
        for (let i = 1; i < col.length; i++)
          out[`${col[i - 1]} / ${col[i]}`] =
            boxes[col[i - 1]].y0 - boxes[col[i]].y1
      for (let j = 1; j < r.flow.length; j++) {
        const right = Math.max(...r.flow[j - 1].map(n => boxes[n].x1))
        const left = Math.min(...r.flow[j].map(n => boxes[n].x0))
        out[`cột ${j} / cột ${j + 1}`] = left - right
      }
      return out
    }
    const before = gaps(r.before)
    const after = gaps(r.after)
    numbers.v11Gaps = { before, after }
    for (const k of Object.keys(before))
      expect({ k, ok: after[k] >= (before[k] * 100) / 125 - 1 }).toEqual({
        k,
        ok: true
      })
    for (const b of Object.values(r.after)) {
      expect(b.x0).toBeGreaterThanOrEqual(-1)
      expect(b.x1).toBeLessThanOrEqual(38400 + 1)
      expect(b.y1).toBeLessThanOrEqual(25300 + 1)
    }
  })

  test('SUB-010 at 1:125: dimensions read the true length (DIMLFAC 1/f)', () => {
    const full = { ...dossierDefaults(), ...V11 }
    const scene = buildDossierScene(
      buildDossierModel({ ...V11, nhanKichThuoc: 'ky_hieu' })
    )
    const s010 = scene.sheets.find(s => s.id === 'SUB-010')!
    expect(s010.viewScale).toBe(125)
    const wrong: string[] = []
    const seen = new Set<string>()
    for (const p of s010.primitives) {
      if (p.kind !== 'dimension' || p.text === undefined) continue
      const symbol = DOSSIER_DIM_SYMBOLS[p.text]
      if (!symbol) continue
      seen.add(p.text)
      const dx = p.end[0] - p.start[0]
      const dy = p.end[1] - p.start[1]
      const drawnLength =
        p.direction === 'ngang'
          ? Math.abs(dx)
          : p.direction === 'dung'
            ? Math.abs(dy)
            : Math.hypot(dx, dy)
      const lfac = Number(
        (p.overrides as { dimlfac?: number } | undefined)?.dimlfac
      )
      const reads = drawnLength * lfac
      const tol = symbol.xapXi ? 200 : 5
      if (!(Math.abs(reads - symbol.giaTri(full)) <= tol))
        wrong.push(`${p.text} ${Math.round(reads)}≠${symbol.giaTri(full)}`)
    }
    expect(wrong).toEqual([])
    expect(seen.has('B Mố')).toBe(true)
  })

  test('real tools: tao_ho_so_mo → tao_btkl, F2 lap with its clause, numbers', async () => {
    const db = database()
    const made = await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { tenMo: 'L1', bMatDuong: 11000 } },
      db
    )
    expect(made.ok).toBe(true)
    expect((made.data as { tiLeTo: unknown }).tiLeTo).toEqual({
      'SUB-010': '1:125'
    })
    expect(made.message).toContain('Tờ SUB-010 vẽ tỉ lệ 1:125')
    const runId = listRuns(db)[0].id
    const ents = entitiesOfRun(db, runId)
    const sheetOf = (e: AcDbEntity) =>
      String(readSemanticTag(e)?.params?.sheet ?? '?')
    const bySheet: Record<string, number> = {}
    for (const e of ents) bySheet[sheetOf(e)] = (bySheet[sheetOf(e)] ?? 0) + 1
    numbers.v11Entities = bySheet
    // GHI CHÚ covers nothing on any sheet (as #80/#81).
    const box = (e: AcDbEntity) => {
      const b = e.geometricExtents
      return { x0: b.min.x, y0: b.min.y, x1: b.max.x, y1: b.max.y }
    }
    const note = (e: AcDbEntity) =>
      e instanceof AcDbText && readSemanticTag(e)?.params?.khoi === 'GHI CHÚ'
    const notes = ents.filter(note)
    expect(notes.length).toBeGreaterThan(0)
    const hits: string[] = []
    for (const t of notes)
      for (const o of ents)
        if (
          !note(o) &&
          sheetOf(o) === sheetOf(t) &&
          // The sheet border rectangles enclose everything: checked below.
          readSemanticTag(o)?.role !== 'khung_ban_ve' &&
          acTpBoxesOverlap(box(t), box(o))
        )
          hits.push(
            `${sheetOf(t)} ${(t as AcDbText).textString} × ${o.dxfTypeName} ${readSemanticTag(o)?.role} ${JSON.stringify(box(o))} ${JSON.stringify(box(t))}`
          )
    expect(hits).toEqual([])
    // Inside the inner border of their sheet.
    for (const t of notes) {
      const inner = ents
        .filter(
          o =>
            sheetOf(o) === sheetOf(t) &&
            readSemanticTag(o)?.role === 'khung_ban_ve'
        )
        .map(box)
        .sort((a, b) => a.x1 - a.x0 - (b.x1 - b.x0))[0]
      const b = box(t)
      expect(
        b.x0 >= inner.x0 &&
          b.x1 <= inner.x1 &&
          b.y0 >= inner.y0 &&
          b.y1 <= inner.y1
      ).toBe(true)
    }

    const btkl = await runBtklTool('tao_btkl', {}, db)
    expect(btkl.ok).toBe(true)
    const t = tong(btkl)
    const flags = coThep(btkl)
    numbers.v11 = { beTongM3: t.beTongM3, thepKg: t.thepKgHienThi, flags }
    const lap = flags.find(f => f.startsWith('[noi_chong_cay_thep]'))!
    expect(lap).toContain('TCVN 11823-5 Đ 11.5.3.1')
    const btklId = (btkl.data as { maLanChay: string }).maLanChay
    const sheetTexts = entitiesOfRun(db, btklId)
      .filter((e): e is AcDbText => e instanceof AcDbText)
      .map(e => e.textString)
      .join(' ')
    expect(sheetTexts.replace(/\s+/g, ' ')).toContain(
      'F2 nối chồng 1 mối × 1556 mm (TCVN 11823-5 Đ 11.5.3.1, loại B)'
    )
  })

  test('threshold: 12 000 says how the pile spacing came and that 3 piles fit; with 3 piles it builds', async () => {
    const db = database()
    const refused = await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { tenMo: 'L1', bMatDuong: 12000 } },
      db
    )
    expect(refused.ok).toBe(false)
    expect(refused.message).toContain(
      'Tim cọc ngang: cần số trong 600–10000 mm.'
    )
    expect(refused.message).toContain(
      'Tim cọc ngang 10 700 mm là số tự suy (cọc sát mép bệ: tim cọc ngang = bề rộng bệ − 2 × đường kính cọc), ngoài giới hạn 600–10 000 mm.'
    )
    expect(refused.message).toContain(
      'Với 3 cọc mỗi hàng thì tim cọc ngang = 5 350 mm'
    )
    expect(refused.message).toContain('không tự đặt')
    expect(listRuns(db)).toEqual([])
    const made = await runDossierTool(
      'tao_ho_so_mo',
      { thong_so: { tenMo: 'L1', bMatDuong: 12000, soCotCoc: 3 } },
      db
    )
    expect(made.ok).toBe(true)
    expect((made.data as { tiLeTo: unknown }).tiLeTo).toEqual({
      'SUB-010': '1:125'
    })
    // The widest road the parameter takes, 15 000: SUB-010 at 1:150.
    const wide = acapDeriveDossierValues(dossierDefaults(), {
      ...DOSSIER_PRESET_L1,
      bMatDuong: 15000,
      soCotCoc: 3
    }).values
    const scene = buildDossierScene(buildDossierModel(wide))
    expect(scene.sheets.find(s => s.id === 'SUB-010')!.viewScale).toBe(150)
    expect(Number(param('bMatDuong').max)).toBe(15000)
  })
})
