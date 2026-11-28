/**
 * P3-M1: the steel sheets SUB-070 / 080 / 090 and the SUB-100 bar table follow
 * the dossier's geometry. Before, a changed geometry kept the M1 steel drawing
 * frozen at the M1 size («THÉP THEO M1 GỐC, CHƯA CẬP NHẬT…») and the BTKL
 * steel was estimated from the M1 ratio kg/m³. Now the steel views use the
 * grid of the views they are cut from, bar ends keep the M1 cover to the new
 * faces, rows of bars in section are re-laid at the M1 spacing (more bars on
 * a wider member), and the BTKL counts the bars — the wings, which no rule
 * re-lays yet, stay estimated (flagged, that group only; P3-M2 counts the ear
 * walls: tai 54,377 estimated → 63,719 kg counted on L1, + 9,341).
 */
jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import { readSemanticTag } from '@mlightcad/cad-template-sdk'
import { AcDbDatabase, AcDbText } from '@mlightcad/data-model'

import { acTpBtklMo } from '../src/btkl/mo'
import { acTpBtklOfObject, btklObjectsFromValues } from '../src/btkl/template'
import { acTpBarsOver } from '../src/btkl/thepMo'
import { runBtklTool } from '../src/btkl/tools'
import { acapDeriveDossierValues } from '../src/dossier/derive'
import * as grid030 from '../src/dossier/grid030'
import { sheetStretch } from '../src/dossier/grid030'
import { buildDossierModel, dossierDefaults } from '../src/dossier/model'
import layout from '../src/dossier/reference/layout-mo2.json'
import { buildDossierScene, type DossierSheet } from '../src/dossier/scene'
import { acapDossierSheetNotes, acTpSteelRows } from '../src/dossier/scene030'
import { DOSSIER_PRESET_L1, runDossierTool } from '../src/dossier/tools'
import { entitiesOfRun, listRuns } from '../src/runIdentity'

jest.setTimeout(900000)

type XY = [number, number]
type Values = Record<string, string | number>

const L1 = acapDeriveDossierValues(dossierDefaults(), {
  ...DOSSIER_PRESET_L1
}).values as Values
const STEEL = ['SUB-070', 'SUB-080', 'SUB-090', 'SUB-100']
const sceneOf = (v: Values) => buildDossierScene(buildDossierModel(v))
const sheet = (scene: { sheets: DossierSheet[] }, id: string) =>
  scene.sheets.find(s => s.id === id)!
const texts = (s: DossierSheet) =>
  s.primitives.flatMap(p => (p.kind === 'text' ? [p.text] : []))
const OLD_WARNINGS =
  /THÉP THEO M1 GỐC|CỦA M1 GỐC, CHƯA CẬP NHẬT|CHƯA CÓ PHƯƠNG ÁN THÉP/

/** Source handle of the content primitive of `sheetId` through these points. */
function handleOf(sheetId: string, points: XY[]): string {
  const ls = layout.sheets.find(s => s.id === sheetId)!
  const near = (a: number[], b: XY) =>
    Math.abs(a[0] - b[0]) < 1 && Math.abs(a[1] - b[1]) < 1
  const p = (ls.content ?? []).find(
    c =>
      'points' in c &&
      Array.isArray(c.points) &&
      points.every(q => (c.points as number[][]).some(r => near(r, q)))
  )
  if (!p) throw new Error(`no primitive through ${JSON.stringify(points)}`)
  return (p as { handle: string }).handle
}
/** Drawn points of the primitive from source `handle`. */
function drawn(s: DossierSheet, handle: string): XY[] {
  const p = s.primitives.find(q => q.sourceHandle === handle)
  if (!p || p.kind !== 'path') throw new Error(`${handle} not drawn`)
  return p.points as XY[]
}
const xs = (pts: XY[]) => pts.map(p => p[0])
const width = (pts: XY[]) => Math.max(...xs(pts)) - Math.min(...xs(pts))

// Concrete edges of the source steel views (sheet-local source mm).
const FOOTING_TOP_070 = handleOf('SUB-070', [
  [16270, 15733],
  [8570, 15733]
])
const STEM_FRONT_33 = handleOf('SUB-070', [
  [29338, 20449],
  [29338, 15733]
])
const STEM_BACK_33 = handleOf('SUB-070', [
  [27838, 15733],
  [27838, 20927]
])
const HEAD_WALL_77 = handleOf('SUB-080', [
  [9396, 17891],
  [8396, 11216]
])
const WING_77 = handleOf('SUB-080', [
  [12396, 13002],
  [15896, 16502]
])

describe('M1 defaults: the steel sheets as at 2433423a', () => {
  const scene = sceneOf({})
  test('same primitives, no warning, reference steel', () => {
    // Counts of the generator at 2433423a (qa-evidence/p3-m1/survey-render).
    expect(STEEL.map(id => sheet(scene, id).primitives.length)).toEqual([
      299, 238, 238, 1595
    ])
    expect(buildDossierModel({}).referenceSteelApplicable).toBe(true)
    for (const id of STEEL) {
      expect(texts(sheet(scene, id)).join(' ')).not.toMatch(OLD_WARNINGS)
      expect(acapDossierSheetNotes(sheet(scene, id))).toEqual([])
    }
    expect(buildDossierModel({}).issues.map(i => i.code)).not.toContain(
      'steel_outside_reference'
    )
  })

  test('rows of bars in section keep their M1 count', () => {
    for (const r of acTpSteelRows('SUB-070', dossierDefaults()))
      expect(r.spacing).toBeCloseTo(150, 6)
    expect(
      acTpSteelRows('SUB-070', dossierDefaults()).find(
        r => r.block === 'MO2_U412'
      )
    ).toMatchObject({ count: 51, span: 7500 })
  })
})

describe('L1: the steel sheets follow the L1 geometry', () => {
  const scene = sceneOf(L1)
  const model = buildDossierModel(L1)

  test('no «THÉP THEO M1 GỐC» or M1-table warning on SUB-070…100', () => {
    expect(model.referenceSteelApplicable).toBe(false)
    for (const id of STEEL) {
      const s = sheet(scene, id)
      expect(texts(s).join(' ')).not.toMatch(OLD_WARNINGS)
      expect(acapDossierSheetNotes(s).join(' ')).not.toMatch(OLD_WARNINGS)
    }
    for (const id of ['SUB-070', 'SUB-080', 'SUB-090'])
      expect('error' in sheetStretch(id, model.values)).toBe(false)
  })

  test('the issue no longer says the steel needs a plan from scratch', () => {
    const issue = model.issues.find(i => i.code === 'steel_outside_reference')!
    expect(issue.message).toContain('bố trí mẫu M1 kéo theo kích thước mới')
    expect(issue.message).toContain('chưa phải thiết kế cốt thép mới')
    expect(issue.message).not.toContain('Cần phương án thép mới')
  })

  test('footing 8700 wide (not 7700) in sections 1-1 / 2-2', () => {
    const s = sheet(scene, 'SUB-070')
    expect(width(drawn(s, FOOTING_TOP_070))).toBeCloseTo(8700, 3)
    expect(
      width(drawn(sheet(sceneOf({}), 'SUB-070'), FOOTING_TOP_070))
    ).toBeCloseTo(7700, 3)
  })

  test('stem 1200 thick (not 1500) in section 3-3', () => {
    const s = sheet(scene, 'SUB-070')
    const front = xs(drawn(s, STEM_FRONT_33))[0]
    // The polyline runs up the stem back from the footing (then the corbel).
    const back = drawn(s, STEM_BACK_33)[0][0]
    expect(front - back).toBeCloseTo(1200, 0)
  })

  test('wing 4000 long (not 6500) in section 7-7', () => {
    const s = sheet(scene, 'SUB-080')
    const face = Math.max(...xs(drawn(s, HEAD_WALL_77)))
    const end = Math.max(...xs(drawn(s, WING_77)))
    expect(end - face).toBeCloseTo(4000, 3)
    const m1 = sheet(sceneOf({}), 'SUB-080')
    expect(
      Math.max(...xs(drawn(m1, WING_77))) -
        Math.max(...xs(drawn(m1, HEAD_WALL_77)))
    ).toBeCloseTo(6500, 3)
  })

  test('piles D1000: outer pile centre 1000 from the footing edge', () => {
    const s = sheet(scene, 'SUB-070')
    const top = drawn(s, FOOTING_TOP_070)
    const edge = Math.min(...xs(top))
    const piles = s.primitives.filter(
      p =>
        p.kind === 'insert' &&
        p.block === 'D1m' &&
        p.at[1] < top[0][1] &&
        p.at[0] < Math.max(...xs(top))
    )
    const left = Math.min(
      ...piles.map(p => (p.kind === 'insert' ? p.at[0] : Infinity))
    )
    expect(left - edge).toBeCloseTo(1000, 0)
  })

  test('bar rows keep the M1 spacing: more bars, not wider spacing', () => {
    const row = acTpSteelRows('SUB-070', L1).find(r => r.block === 'MO2_U412')!
    // 7500 between end bars at M1 (cover 100 to the 7700 footing): 8500 now.
    expect(row.span).toBeCloseTo(8500, 3)
    expect(row.count).toBe(acTpBarsOver(51, 150, 1000))
    expect(row.count).toBe(58)
    expect(row.spacing).toBeLessThanOrEqual(150)
    expect(row.spacing).toBeGreaterThan(148)
    // Stretching the 51 bars would have put them 170 apart.
    expect(8500 / 50).toBe(170)
    for (const r of acTpSteelRows('SUB-070', L1))
      // Half a millimetre over a span takes no extra bar (acTpBarsOver).
      expect(r.spacing).toBeLessThanOrEqual(150.05)
  })

  test('cover: the end bars keep their M1 distance to the new edges', () => {
    // M1: the row MO2_U412 is one insert, its last bar at the insertion
    // point (mirrored), its first 7500 to the left.
    const m1s = sheet(sceneOf({}), 'SUB-070')
    const m1Edge = drawn(m1s, FOOTING_TOP_070)
    const row = m1s.primitives.find(p => p.sourceHandle === '211AAFF')!
    const last = row.kind === 'insert' ? row.at[0] : NaN
    const m1 = [
      last - 7500 - Math.min(...xs(m1Edge)),
      Math.max(...xs(m1Edge)) - last
    ]
    expect(m1[0]).toBeCloseTo(99.7, 1)
    const s = sheet(scene, 'SUB-070')
    const edge = drawn(s, FOOTING_TOP_070)
    const at = s.primitives.flatMap(p =>
      p.kind === 'insert' && p.sourceHandle?.startsWith('211AAFF.')
        ? [p.at[0]]
        : []
    )
    expect(at).toHaveLength(58)
    expect(Math.min(...at) - Math.min(...xs(edge))).toBeCloseTo(m1[0], 3)
    expect(Math.max(...xs(edge)) - Math.max(...at)).toBeCloseTo(m1[1], 3)
  })

  test('SUB-100: bar table relaid, totals = BTKL, take-off of L1', () => {
    const s = sheet(scene, 'SUB-100')
    const all = texts(s)
    // F1: 50 → 57 bars over the 8700 footing; overall total = BTKL item 6.
    expect(all).toContain('13476.854')
    expect(all).not.toContain('14058.319')
    expect(all.join(' ')).toContain('BẢNG KHỐI LƯỢNG L1 THEO THÔNG SỐ HIỆN TẠI')
    const notes = acapDossierSheetNotes(s).join(' ')
    expect(notes).toContain(
      '(*) tường cánh trái, tường cánh phải: số thanh, chiều dài theo M1; khối lượng tạm tính theo hàm lượng.'
    )
  })
})

describe('BTKL steel: counted from the layout (old → new)', () => {
  const kl = (r: ReturnType<typeof acTpBtklMo>, key: string) =>
    r.items.find(i => i.key === key)?.khoiLuong ?? null

  test('M1 defaults: the table as before (69 marks, 14 058,319 kg)', () => {
    const r = acTpBtklMo()
    expect(r.bars).toHaveLength(69)
    expect(kl(r, 'thep')).toBeCloseTo(14058.319, 3)
  })

  test('L1: 12 859,837 (ratio) → 13 467,513 (P3-M1) → 13 476,854 kg (P3-M2)', () => {
    const r = acTpBtklMo(L1)
    // Before P3-M1: 12 859,837 kg, all estimated from the M1 ratios.
    // P3-M1: 13 467,513 kg; P3-M2 counts the ear walls (+ 9,341).
    expect(kl(r, 'thep')).toBeCloseTo(13476.854, 3)
    const thep = r.items.find(i => i.key === 'thep')!
    expect(thep.hangMuc).toBe('Cốt thép (bố trí mẫu M1 theo hình học mới)')
    expect(thep.flags?.map(f => f.code)).toEqual([
      'thep_bo_tri_m1_theo_hinh_hoc',
      'neo_ban_goc_chua_dat',
      'thep_tam_tinh_ham_luong'
    ])
    // Only the wings are estimated (P3-M2: the ear walls are counted).
    expect(
      r.items.filter(i => i.key.startsWith('thep_hl_')).map(i => i.key)
    ).toEqual(['thep_hl_canh'])
    expect(r.bars).toHaveLength(37)
    expect(r.bars.find(b => b.mark === 'F1')).toMatchObject({
      count: 57,
      length: 6350
    })
    expect(kl(r, 'thep_bt_be')).toBeCloseTo(5128.757, 3)
    expect(kl(r, 'thep_hl_canh')).toBeCloseTo(3005.297, 3)
    // Concrete unchanged by the steel.
    expect(kl(r, 'coc')).toBeCloseTo(78.54, 2)
    expect(kl(r, 'be')).toBeCloseTo(103.929, 3)
    expect(kl(r, 'canh')).toBeCloseTo(19.704, 3)
    expect(kl(r, 'lan_can')).toBeCloseTo(3.214, 3)
    expect(r.items.find(i => i.stt === '1')!.khoiLuong).toBeCloseTo(184.857, 3)
  })

  test('L1 at 3 %: 12 842,755 → 13 450,431 → 13 459,772 kg (P3-M2 ears)', () => {
    const r = acTpBtklMo({ ...L1, docNgang: 3 })
    expect(kl(r, 'thep')).toBeCloseTo(13459.772, 3)
    expect(kl(r, 'canh')).toBeCloseTo(19.592, 3)
    expect(r.items.find(i => i.stt === '1')!.khoiLuong).toBeCloseTo(184.745, 3)
  })
})

describe('refusals unchanged', () => {
  test.each([
    ['F3 D25', { thepF3: 'D25' }],
    ['W16 D14', { thepW16: 'D14' }],
    ['thep khong', { thep: 'khong' }]
  ])('%s on L1: no bar layout drawn, BTKL steel refused', (_, extra) => {
    const v = { ...L1, ...extra } as Values
    const scene = sceneOf(v)
    for (const id of ['SUB-070', 'SUB-080', 'SUB-090']) {
      const s = sheet(scene, id)
      expect(acapDossierSheetNotes(s)[0]).toBe(
        'CHƯA CÓ PHƯƠNG ÁN THÉP CHO HÌNH HỌC NÀY'
      )
      expect(s.primitives.some(p => p.role === 'cot_thep')).toBe(false)
    }
    const r = acTpBtklMo(v)
    expect(r.items.find(i => i.key === 'thep')!.nguon).toBe('tu_choi')
    expect(r.bars).toEqual([])
  })

  test('F3 D25 at the M1 geometry: still refused', () => {
    expect(buildDossierModel({ thepF3: 'D25' }).referenceSteelApplicable).toBe(
      false
    )
    expect(
      buildDossierModel({ thepF3: 'D25' }).issues.find(
        i => i.code === 'steel_outside_reference'
      )!.message
    ).toContain('Cần phương án thép mới')
  })
})

describe('tools: «Tạo hồ sơ L1, lập BTKL mặc định», then 3 %', () => {
  const database = () => {
    const db = new AcDbDatabase()
    db.createDefaultData()
    return db
  }
  const runOf = (db: AcDbDatabase) =>
    listRuns(db).find(r => r.templateId === 'ho_so_mo_m1')!
  const steelOf = (db: AcDbDatabase) => {
    const run = listRuns(db).find(r => r.templateId === 'btkl_ket_cau')!
    const r = acTpBtklOfObject(btklObjectsFromValues(run.values).objects[0])
    return r.items.find(i => i.stt === '6')!
  }
  const warningsOnSheets = (db: AcDbDatabase) =>
    entitiesOfRun(db, runOf(db).id)
      .filter((e): e is AcDbText => e instanceof AcDbText)
      .filter(e =>
        STEEL.includes(String(readSemanticTag(e)?.params?.sheet ?? ''))
      )
      .map(e => e.textString)
      .filter(t => OLD_WARNINGS.test(t))

  test('steel on the BTKL sheet, no M1 warning, steel stays L1 after 3 %', async () => {
    const db = database()
    expect(
      (await runDossierTool('tao_ho_so_mo', { thong_so: { tenMo: 'L1' } }, db))
        .ok
    ).toBe(true)
    expect((await runBtklTool('tao_btkl', {}, db)).ok).toBe(true)
    expect(steelOf(db).khoiLuong).toBeCloseTo(13476.854, 3)
    expect(warningsOnSheets(db)).toEqual([])
    const res = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: runOf(db).id, thong_so: { docNgang: 3 } },
      db
    )
    expect(res.ok).toBe(true)
    const said = ((res.data as { canhBao?: string[] }).canhBao ?? []).join(' ')
    expect(said).toContain('Đã tự cập nhật tờ BTKL')
    expect(said).toContain('tổng C30 184,857 → 184,745 m³')
    expect(steelOf(db).khoiLuong).toBeCloseTo(13459.772, 3)
    expect(warningsOnSheets(db)).toEqual([])
  })

  // Live QA before P3-M1: L1, sua hBe 2500, xuat_btkl → the steel sheet of
  // the xlsx said only «Không có bảng thép…». Now: the bars counted on the
  // edited dossier, a line per group still estimated, total = BTKL item 6.
  test('xuat_btkl after sua hBe 2500: the edited bars, estimates, total = item 6', async () => {
    const db = database()
    await runDossierTool('tao_ho_so_mo', { thong_so: { tenMo: 'L1' } }, db)
    expect((await runBtklTool('tao_btkl', {}, db)).ok).toBe(true)
    const res = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: runOf(db).id, thong_so: { hBe: 2500 } },
      db
    )
    expect(res.ok).toBe(true)
    const item6 = steelOf(db)
    // 37 marks counted on the 8700 × 6000 × 2500 footing (+ wings
    // estimated): 13 954,488 kg (P3-M1, ears estimated: 13 945,147).
    expect(item6.khoiLuong).toBeCloseTo(13954.488, 3)
    const files: { name: string; content: unknown }[] = []
    const btkl = listRuns(db).find(r => r.templateId === 'btkl_ket_cau')!
    const out = await runBtklTool(
      'xuat_btkl',
      { ma_lan_chay: btkl.id },
      db,
      f => files.push(f)
    )
    expect(out.ok).toBe(true)
    // A stored (uncompressed) ZIP: the steel worksheet is readable as is.
    const text = new TextDecoder().decode(files[0].content as Uint8Array)
    const sheet = text
      .split('<?xml')
      .find(x => x.includes('BẢNG THỐNG KÊ CỐT THÉP'))!
    const cell = new Map<string, string>()
    for (const m of sheet.matchAll(
      /<c r="([A-Z]+\d+)"[^>]*?(?:\/>|>(.*?)<\/c>)/g
    )) {
      const body = m[2] ?? ''
      cell.set(
        m[1],
        body.match(/<t xml:space="preserve">(.*?)<\/t>/)?.[1] ??
          body.match(/<v>(.*?)<\/v>/)?.[1] ??
          ''
      )
    }
    const values = [...cell.values()]
    expect(values.some(v => v.startsWith('Không có bảng thép'))).toBe(false)
    // Bars of the edited footing: F1 57 bars; F5 every 150 up 2500: 2 × 16.
    const rowOf = (mark: string) =>
      [...cell.entries()]
        .find(([k, v]) => k.startsWith('B') && v === mark)![0]
        .slice(1)
    expect(cell.get(`E${rowOf('F1')}`)).toBe('57')
    expect(cell.get(`E${rowOf('F5')}`)).toBe('32')
    // The groups still estimated, each a line with its mass.
    const estimates = [...cell.entries()].filter(
      ([k, v]) => k.startsWith('B') && v === 'Tạm tính'
    )
    expect(estimates.map(([k]) => cell.get(`J${k.slice(1)}`))).toEqual([
      'Thép tường cánh (2 bên) (tạm tính theo hàm lượng mẫu M1)'
    ])
    // Total row: the sum of the mass column = BTKL item 6.
    const total = [...cell.entries()].find(
      ([k, v]) => k.startsWith('B') && v === 'Tổng cộng'
    )![0]
    expect(Number(cell.get(`I${total.slice(1)}`))).toBeCloseTo(
      item6.khoiLuong!,
      3
    )
  })

  // A dossier drawn before P3-M1 (steel frozen at the M1 size, «THÉP THEO
  // M1 GỐC…», BTKL steel all estimated) is recognised as the generator's
  // when edited — not as 93 hand edits — and the edit redraws its steel.
  test('a dossier drawn before P3-M1 is edited, not refused; its steel follows', async () => {
    // The steel before P3-M1, exactly: the old number of the take-off.
    expect(
      grid030.acTpWithPreP3Steel(
        () => acTpBtklMo(L1).items.find(i => i.key === 'thep')!.khoiLuong
      )
    ).toBeCloseTo(12859.837, 3)
    const db = database()
    const old = jest.spyOn(grid030, 'acTpPreP3Steel').mockReturnValue(true)
    try {
      expect(
        (
          await runDossierTool(
            'tao_ho_so_mo',
            { thong_so: { tenMo: 'L1' } },
            db
          )
        ).ok
      ).toBe(true)
    } finally {
      old.mockRestore()
    }
    // The old block, wrapped: one per steel sheet.
    expect(
      warningsOnSheets(db).filter(t => /^THÉP THEO M1 GỐC/.test(t))
    ).toHaveLength(3)
    const res = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: runOf(db).id, thong_so: { docNgang: 3 } },
      db
    )
    expect([res.ok, res.message]).toEqual([true, expect.any(String)])
    const said = ((res.data as { canhBao?: string[] }).canhBao ?? []).join(' ')
    expect(said).not.toContain('sửa tay')
    expect(warningsOnSheets(db)).toEqual([])
  })
})
