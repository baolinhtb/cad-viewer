/**
 * P3-M2: detailing checks of the M1 bar layout laid over the dossier's
 * geometry — development length, hooked anchorage and tension lap splices
 * after TCVN 11823-5:2017 (Đ11.2.1.1 PT 176/177, Đ11.2.4.1 PT 182,
 * Đ11.2.4.2, Đ11.5.3.1). f'c 30 MPa from the M1 drawing (C30); fy 400 MPa,
 * 11 700 mm bars and class B laps assumed (GĐ6).
 */
jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import { acTpBtklMo } from '../src/btkl/mo'
import {
  ACTP_NEO_VAT_LIEU,
  acTpKiemNeoMo,
  acTpLambdaD,
  acTpLambdaDb,
  acTpLambdaDh,
  acTpLambdaHb,
  acTpNoiChong,
  acTpSoMoiNoi
} from '../src/btkl/neoThep'
import { acTpSteelScheduleMo } from '../src/btkl/thepMo'
import { acapDeriveDossierValues } from '../src/dossier/derive'
import { type AcTpSheetStretch, sheetStretch } from '../src/dossier/grid030'
import { buildDossierModel, dossierDefaults } from '../src/dossier/model'
import { buildDossierScene } from '../src/dossier/scene'
import { DOSSIER_PRESET_L1 } from '../src/dossier/tools'

jest.setTimeout(900000)

type Values = Record<string, string | number>
const L1 = acapDeriveDossierValues(dossierDefaults(), {
  ...DOSSIER_PRESET_L1
}).values as Values
const M = ACTP_NEO_VAT_LIEU
const SQRT30 = Math.sqrt(30)

describe('neoThep: TCVN 11823-5 formulas, numbers by hand', () => {
  test('materials: f′c 30 (M1 C30), fy 400, bars 11 700, class B', () => {
    expect(M).toEqual({ fy: 400, fc: 30, chieuDaiCayThep: 11700, capNoi: 'B' })
  })

  test('λdb = 0,91·db·fy/√f′c (PT 177)', () => {
    // D18: 0,91 × 18 × 400 / 5,4772 = 1 196,2; D25: 1 661,4.
    expect(acTpLambdaDb(18, M)).toBeCloseTo((0.91 * 18 * 400) / SQRT30, 6)
    expect(acTpLambdaDb(18, M)).toBeCloseTo(1196.2, 1)
    expect(acTpLambdaDb(25, M)).toBeCloseTo(1661.4, 1)
  })

  test('λd = λdb × λrl (PT 176), λrl 1,3 for top bars, ≥ 300', () => {
    expect(acTpLambdaD(18, M)).toBeCloseTo(1196.2, 1)
    expect(acTpLambdaD(18, M, true)).toBeCloseTo(1555.1, 1)
    // fy 100, D10: 0,91 × 10 × 100 / 5,477 = 166 → the 300 mm minimum.
    expect(acTpLambdaD(10, { ...M, fy: 100 })).toBe(300)
  })

  test('λhb = 100·db·fy/(420·√f′c) (PT 182); λdh ×0,8 at cover 75, ≥ max(8db, 150)', () => {
    // D22: 880 000 / 2 300,4 = 382,5 → × 0,8 = 306,0 (8db = 176).
    expect(acTpLambdaHb(22, M)).toBeCloseTo(382.5, 1)
    expect(acTpLambdaDh(22, M)).toBeCloseTo(306.0, 1)
    // Cover below 64 mm: no 0,8.
    expect(acTpLambdaDh(22, M, 50)).toBeCloseTo(382.5, 1)
    // D10: 173,9 × 0,8 = 139,1 < 150 → 150.
    expect(acTpLambdaDh(10, M)).toBe(150)
    // fy 100, D25: 108,7 × 0,8 = 87 < 8db = 200 → 200.
    expect(acTpLambdaDh(25, { ...M, fy: 100 })).toBe(200)
  })

  test('lap (Đ11.5.3.1): class B 1,3·λd, class A 1,0·λd, ≥ 300', () => {
    expect(acTpNoiChong(18, M)).toBeCloseTo(1.3 * 1196.2, 0)
    expect(acTpNoiChong(18, M, true)).toBeCloseTo(1.3 * 1555.1, 0)
    expect(acTpNoiChong(16, { ...M, capNoi: 'A' })).toBeCloseTo(1063.3, 1)
    expect(acTpNoiChong(10, { ...M, fy: 100, capNoi: 'A' })).toBe(300)
  })

  test('splices: n + 1 stock bars cover the bar and its n laps', () => {
    expect(acTpSoMoiNoi(11700, 1555, 11700)).toBe(0)
    expect(acTpSoMoiNoi(11701, 1555, 11700)).toBe(1)
    // 13 000 + 1 555 = 14 555 ≤ 2 × 11 700.
    expect(acTpSoMoiNoi(13000, 1555, 11700)).toBe(1)
    // 25 000: 2 laps → 28 110 > 23 400; 3 laps → 29 665 ≤ 35 100.
    expect(acTpSoMoiNoi(25000, 1555, 11700)).toBe(2)
    expect(acTpSoMoiNoi(13000, 12000, 11700)).toBeNaN()
  })
})

describe('anchorage of the M1 layout', () => {
  const brief = (v: Values) =>
    acTpKiemNeoMo(v).map(
      c =>
        `${c.mark} ${c.viTri}: ${c.required}/${c.provided} ${c.ok ? 'đạt' : c.banGoc ? 'bản gốc chưa đạt' : 'KHÔNG ĐẠT'}`
    )

  test('M1: everything anchors but P1 (the M1 drawing itself)', () => {
    expect(brief(dossierDefaults() as Values)).toEqual([
      'f1 mũi bệ (từ mặt trước thân): 250/1925 đạt',
      'f1 gót bệ (từ mặt sau thân): 250/2425 đạt',
      'f3 mũi bệ (từ mặt trước thân): 306/1925 đạt',
      'f3 gót bệ (từ mặt sau thân): 306/2425 đạt',
      'a1 chân thân ngàm vào bệ (từ đỉnh bệ): 306/1925 đạt',
      'a2 chân thân ngàm vào bệ (từ đỉnh bệ): 223/1925 đạt',
      'p1 chân P1 nối chồng với A1/A2 dưới đỉnh thân: 1382/648 bản gốc chưa đạt'
    ])
  })

  test('L1: the thinner stem lengthens the heel, P1 as in M1', () => {
    const r = acTpKiemNeoMo(L1)
    expect(r.find(c => c.mark === 'f1' && c.viTri.startsWith('gót'))).toEqual(
      expect.objectContaining({ provided: 2725, ok: true })
    )
    expect(r.filter(c => !c.ok).map(c => [c.mark, c.banGoc])).toEqual([
      ['p1', true]
    ])
  })

  test('a short toe is reported neo_khong_du, the drawing kept', () => {
    // muiBe 300: toe 225 < λdh D18 250 and D22 306.
    const v = { ...L1, muiBe: 300 }
    const bad = acTpKiemNeoMo(v).filter(c => !c.ok && !c.banGoc)
    expect(bad.map(c => `${c.mark} ${c.required}/${c.provided}`)).toEqual([
      'f1 250/225',
      'f3 306/225'
    ])
    const thep = acTpBtklMo(v).items.find(i => i.key === 'thep')!
    const flag = thep.flags!.find(f => f.code === 'neo_khong_du')!
    expect(flag.message).toContain('F1 mũi bệ')
    expect(flag.message).toContain('yêu cầu 306 mm, có 225 mm')
    expect(flag.message).toContain('Đ11.2.4.1 (PT 182)')
  })

  test('L1 take-off: P1 reported as the M1 drawing, no neo_khong_du', () => {
    const thep = acTpBtklMo(L1).items.find(i => i.key === 'thep')!
    const codes = thep.flags!.map(f => f.code)
    expect(codes).not.toContain('neo_khong_du')
    expect(codes).toContain('neo_ban_goc_chua_dat')
    expect(
      thep.flags!.find(f => f.code === 'neo_ban_goc_chua_dat')!.message
    ).toContain('P1 chân P1 nối chồng')
  })
})

describe('lap splices past the commercial bar length', () => {
  test('L1: no bar longer than 11 700 mm, no splice', () => {
    const s = acTpSteelScheduleMo(L1, () => 1)
    expect(s.rows.filter(r => r.noiChong)).toEqual([])
    expect(Math.max(...s.rows.map(r => r.length))).toBeLessThan(11700)
  })

  test('an 11 m road: the long bars get a class B lap, mass included', () => {
    const v = acapDeriveDossierValues(dossierDefaults(), {
      ...DOSSIER_PRESET_L1,
      bMatDuong: 11000
    }).values as Values
    const s = acTpSteelScheduleMo(v, () => 1)
    const laps = s.rows.filter(r => r.noiChong)
    expect(laps.length).toBeGreaterThan(0)
    for (const r of laps) {
      const top = ['f3', 'f4', 'f5', 'f7', 'a4', 'p3', 'n1'].includes(r.mark)
      const lap = Math.ceil(acTpNoiChong(r.diameter, M, top))
      expect(r.noiChong).toEqual({ soMoi: 1, chieuDai: lap, cap: 'B' })
      expect(r.kg).toBeCloseTo((r.count * r.length * r.kgPerM) / 1000, 6)
      // The bar without its lap is past one stock bar.
      expect(r.length - lap).toBeGreaterThan(11700)
    }
    const f2 = laps.find(r => r.mark === 'f2')!
    // F2 D18 bottom: 1,3 × 1 196,2 = 1 555,1 → 1 556 mm.
    expect(f2.noiChong!.chieuDai).toBe(1556)
    const r = acTpBtklMo(v)
    expect(r.errors ?? []).toEqual([])
    const thep = r.items.find(i => i.key === 'thep')!
    expect(thep.flags!.map(f => f.code)).toContain('noi_chong_cay_thep')
    const be = r.items.find(i => i.key === 'thep_bt_be')!
    expect(be.dienGiai).toContain(
      'F2 nối chồng 1 mối × 1556 mm (TCVN 11823-5 Đ11.5.3.1, loại B)'
    )
  })
})

describe('ear walls counted (B), the wings still estimated', () => {
  test('M1 rule gives the table: C1 24 × 1685, C2 16 × 1485', () => {
    const s = acTpSteelScheduleMo(dossierDefaults(), () => 1)
    expect(
      s.rows
        .filter(r => r.group === 'tai')
        .map(r => [r.mark, r.count, r.length, !!r.tamTinh])
    ).toEqual([
      ['c1', 24, 1685, false],
      ['c2', 16, 1485, false]
    ])
  })

  test('L1 (tThan 1200, N 700): C1 4 × 5, C2 16 × 1185; 54,377 → 63,719 kg', () => {
    const s = acTpSteelScheduleMo(L1, () => 1)
    const tai = s.rows.filter(r => r.group === 'tai')
    expect(tai.map(r => [r.mark, r.count, r.length, !!r.tamTinh])).toEqual([
      ['c1', 20, 1685, false],
      ['c2', 16, 1185, false]
    ])
    // 20 × 1,685 × 1,21 + 16 × 1,185 × 1,21 = 40,777 + 22,942 = 63,7186.
    expect(tai.reduce((k, r) => k + r.kg, 0)).toBeCloseTo(63.719, 3)
    expect(s.estimated.map(e => e.group)).toEqual(['canh_trai', 'canh_phai'])
    const r = acTpBtklMo(L1)
    expect(r.items.find(i => i.key === 'thep_bt_tai')!.khoiLuong).toBeCloseTo(
      63.719,
      3
    )
    expect(r.items.some(i => i.key === 'thep_hl_tai')).toBe(false)
    const flag = r.items
      .find(i => i.key === 'thep')!
      .flags!.find(f => f.code === 'thep_tam_tinh_ham_luong')!
    expect(flag.message).toContain('Chỉ tường cánh trái, tường cánh phải:')
  })
})

describe('cross fall on sections 1-1 / 2-2 (C)', () => {
  const stretch = (v: Values) =>
    sheetStretch('SUB-070', buildDossierModel(v).values) as AcTpSheetStretch
  // Source points of the half sections: stem edges 8570 / 16270, footing top
  // 15733, seat 20384 (lowest), head-wall top 22190 (lowest).
  const LEFT = 8570 + 300
  const RIGHT = 16270 - 300
  const SEAT = 20384
  const TOP = 22190

  test('M1 and L1 at the source fall: no extra tilt at M1', () => {
    const s = stretch(dossierDefaults() as Values)
    expect(s.identity).toBe(true)
  })

  test('L1 3 %: bar ends keep the 75 cover to the sloped seat and top, both sides', () => {
    const s3 = stretch({ ...L1, docNgang: 3 })
    const s2 = stretch(L1)
    for (const x of [LEFT, RIGHT])
      for (const y of [SEAT, TOP]) {
        const face = s3.map([x, y])
        const end = s3.map([x, y - 75])
        expect(face[1] - end[1]).toBeCloseTo(75, 0)
        // The footing does not move with the fall.
        expect(s3.map([x, 15733])[1]).toBeCloseTo(s2.map([x, 15733])[1], 6)
      }
    // The bar tops fall 3 % across the bridge (2 % before): the extra 1 %
    // over the stretched distance between the two ends.
    const rise = (s: AcTpSheetStretch, x: number) => s.map([x, SEAT - 75])
    const [l3, r3] = [rise(s3, LEFT), rise(s3, RIGHT)]
    const [l2, r2] = [rise(s2, LEFT), rise(s2, RIGHT)]
    const dx = r3[0] - l3[0]
    expect(l3[0]).toBeCloseTo(l2[0], 6)
    // The right (high) side rises; within 1 mm (the bar end sits just
    // under the end of the elevation's ramp, 0,8 % of the tilt short).
    expect(Math.abs(r3[1] - l3[1] - (r2[1] - l2[1]) - 0.01 * dx)).toBeLessThan(
      1
    )
  })

  test('L1 3 %: the take-off steel stays 13 459,772 (fall symmetric about the centre)', () => {
    const r = acTpBtklMo({ ...L1, docNgang: 3 })
    expect(r.items.find(i => i.key === 'thep')!.khoiLuong).toBeCloseTo(
      13459.772,
      3
    )
  })
})

describe('SUB-100: no stray table border past the sheet (E2)', () => {
  // The pasted OLE bar table carries borders past its last column: the top
  // one to paper x 423, beyond the A3 sheet (thin blue line, QA P3-M1 c1).
  const extent = (v: Values) => {
    const sh = buildDossierScene(buildDossierModel(v)).sheets.find(
      x => x.id === 'SUB-100'
    )!
    const paths = sh.primitives.flatMap(p =>
      p.kind === 'path'
        ? [p as { closed?: boolean; points: [number, number][] }]
        : []
    )
    const maxX = (list: typeof paths) =>
      Math.max(...list.flatMap(p => p.points.map(q => q[0])))
    // The A3 border: the widest closed outline.
    return { frame: maxX(paths.filter(p => p.closed)), all: maxX(paths) }
  }

  test('L1: every line inside the A3 sheet', () => {
    const e = extent(L1)
    expect(e.all).toBeLessThanOrEqual(e.frame + 1e-6)
  })

  test('M1: the source drawing kept as is (its stray border too)', () => {
    const e = extent(dossierDefaults() as Values)
    expect(e.all).toBeGreaterThan(e.frame)
  })
})
