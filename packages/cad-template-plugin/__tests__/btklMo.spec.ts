import {
  acTpBtklMo,
  acTpBtklNumber,
  acTpSteelKgPerM,
  BTKL_M1_SOURCE as SRC
} from '../src/btkl'
import bars from '../src/dossier/reference/bars.json'

const line = (r: ReturnType<typeof acTpBtklMo>, key: string) => {
  const found = r.items.find(i => i.key === key)
  if (!found) throw new Error(`no line ${key}`)
  return found
}
const kl = (r: ReturnType<typeof acTpBtklMo>, key: string) =>
  line(r, key).khoiLuong as number
const PILE = Math.PI * 0.6 ** 2

describe('BTKL mố — M1 against the SUB-100 table', () => {
  const r = acTpBtklMo()

  test('no errors, every line in order', () => {
    expect(r.errors).toEqual([])
    expect(r.doiTuong).toBe('Mố M1')
    expect(r.items.map(i => i.stt)).toEqual([
      '1',
      '1.1',
      '1.2',
      '1.3',
      '1.4',
      '1.5',
      '1.6',
      '1.7',
      '2',
      '3',
      '4.1',
      '4.2',
      '4.3',
      '4.4',
      '4.5',
      '5',
      '5.1',
      '5.2',
      '5.3',
      '5.4',
      '6',
      '6.1',
      '6.2',
      '6.3',
      '6.4',
      '6.5',
      '6.6',
      '6.7',
      '6.8',
      '6.9',
      '6.10',
      '6.11',
      '7.1',
      '7.2',
      '7.3',
      '7.4'
    ])
  })

  test('footing, blinding: the source deducts the piles and matches exactly', () => {
    expect(kl(r, 'be')).toBeCloseTo(7.7 * 6 * 2 - 4 * PILE * 0.15, 9)
    expect(kl(r, 'be')).toBeCloseTo(SRC.beTong.be, 3)
    expect(line(r, 'be').dienGiai).toBe(
      '7,7 × 6 × 2 − 4 × π × 1,2²/4 × 0,15 (trừ đầu cọc ngàm vào bệ)'
    )
    expect(kl(r, 'lot')).toBeCloseTo((7.9 * 6.2 - 4 * PILE) * 0.1, 9)
    expect(kl(r, 'lot')).toBeCloseTo(SRC.lot, 3)
    expect(line(r, 'lot').hangMuc).toBe('Bê tông đệm C10')
    expect(line(r, 'lot').flags?.map(f => f.code)).toEqual(['mau_thuan_lot'])
  })

  test('head wall: rounding only', () => {
    expect(kl(r, 'dinh')).toBeCloseTo(7.7 * 0.5 * 1.887, 9)
    expect(SRC.beTong.dinh - kl(r, 'dinh')).toBeCloseTo(0.0021, 4)
    expect(line(r, 'dinh').flags).toBeUndefined()
  })

  test('stem: true geometry, the source is 0.814 m³ smaller — flagged', () => {
    expect(kl(r, 'than')).toBeCloseTo(7.7 * 1.5 * 4.717, 9)
    expect(SRC.beTong.than - kl(r, 'than')).toBeCloseTo(-0.8143, 4)
    expect(line(r, 'than').banGoc).toBe(53.667)
    expect(line(r, 'than').flags?.map(f => f.code)).toEqual([
      'lech_ban_goc_than'
    ])
  })

  test('wings: true geometry, the source is 0.049 m³ larger — flagged', () => {
    // High wing: on the footing 2500 (top 6618 → 6688), then 1:1 over 3500
    // from H4 1786 to the 1500 end; low wing 140 lower except on the footing.
    const high = (6653 * 2500 + ((6688 - 1786 + 1500) / 2) * 3500) / 1e6
    const low = high - 0.14 * 2.5
    expect(high).toBeCloseTo(27.836, 9)
    expect(kl(r, 'canh')).toBeCloseTo(0.5 * (high + low), 9)
    expect(SRC.beTong.canh - kl(r, 'canh')).toBeCloseTo(0.049, 3)
    expect(line(r, 'canh').flags?.map(f => f.code)).toEqual([
      'lech_ban_goc_canh'
    ])
    expect(line(r, 'canh').dienGiai).toContain('H4 1,786 / 1,646')
  })

  test('ear walls, shear keys, parapet, materials, formwork: the source values', () => {
    for (const [key, value] of [
      ['tai', SRC.beTong.tai],
      ['u_chong_xo', SRC.beTong.uChongXo],
      ['lan_can', SRC.beTong.lanCan],
      ['vua', SRC.vuaKhongCoNgot],
      ['ong_pvc', SRC.ongPvcD125],
      ['bot_xop', SRC.chenBotXop],
      ['hop_chot', SRC.hopChot]
    ] as const) {
      expect(line(r, key).nguon).toBe('ban_goc')
      expect(kl(r, key)).toBe(value)
    }
    // Asphalt is computed (assumption 4) and lands on the table at M1.
    expect(line(r, 'bt_nhua').nguon).toBe('tham_so')
    expect(kl(r, 'bt_nhua')).toBeCloseTo(SRC.btNhua, 9)
    expect(line(r, 'bt_nhua').banGoc).toBe(SRC.btNhua)
    // The ear-wall formula found in B1 gives the same value.
    expect(2 * 0.15 * 1.2 * 1).toBeCloseTo(SRC.beTong.tai, 9)
  })

  test('formwork: contact faces, 0.546 m² over the source — flagged', () => {
    // Wing sections as in line 1.4.
    const high = (6653 * 2500 + ((6688 - 1786 + 1500) / 2) * 3500) / 1e6
    const low = high - 0.14 * 2.5
    expect(kl(r, 'van_khuon_be')).toBeCloseTo(2 * (7.7 + 6) * 2, 9)
    expect(kl(r, 'van_khuon_than')).toBeCloseTo(2 * 7.7 * 4.717, 9)
    expect(kl(r, 'van_khuon_dinh')).toBeCloseTo(2 * 7.7 * 1.887, 9)
    expect(kl(r, 'van_khuon_canh')).toBeCloseTo(2 * (high + low), 9)
    const sum = ['be', 'than', 'dinh', 'canh'].reduce(
      (s, k) => s + kl(r, `van_khuon_${k}`),
      0
    )
    expect(kl(r, 'van_khuon')).toBeCloseTo(sum, 9)
    expect(kl(r, 'van_khuon')).toBeCloseTo(267.1456, 4)
    expect(kl(r, 'van_khuon') - SRC.vanKhuon).toBeCloseTo(0.5456, 4)
    expect(line(r, 'van_khuon').nguon).toBe('tham_so')
    expect(line(r, 'van_khuon').laTong).toBe(true)
    expect(line(r, 'van_khuon').banGoc).toBe(266.6)
    expect(line(r, 'van_khuon').flags?.map(f => f.code)).toEqual([
      'lech_ban_goc_van_khuon',
      'van_khuon_cho_dinh_muc'
    ])
    expect(line(r, 'van_khuon').flags![0].message).toBe(
      'Bảng gốc ghi 266,6 m², nhỏ hơn quy tắc mặt tiếp xúc 0,546 m² (0,2 %); chưa tái lập đúng số của bảng.'
    )
  })

  test('formwork of the corbel and haunches: listed apart, outside the totals', () => {
    const chamfer = Math.hypot(0.3, 0.3)
    expect(kl(r, 'van_khuon_vai_ke')).toBeCloseTo((chamfer + 0.3) * 6.7, 9)
    expect(kl(r, 'van_khuon_vut')).toBeCloseTo(2 * chamfer * 5.194, 9)
    for (const k of ['van_khuon_vai_ke', 'van_khuon_vut']) {
      expect(line(r, k).nhom).toBe('ghi_chu')
      expect(line(r, k).trongTong).toBe(false)
    }
  })

  test('concrete total: the parts, 0.763 m³ over the source total', () => {
    const parts = ['be', 'than', 'dinh', 'canh', 'tai', 'u_chong_xo', 'lan_can']
    const sum = parts.reduce((s, k) => s + kl(r, k), 0)
    expect(kl(r, 'be_tong')).toBeCloseTo(sum, 9)
    expect(kl(r, 'be_tong') - SRC.beTong.tong).toBeCloseTo(0.7627, 4)
    expect(line(r, 'be_tong').laTong).toBe(true)
  })

  test('piles: refused without a length', () => {
    expect(line(r, 'coc').nguon).toBe('tu_choi')
    expect(line(r, 'coc').khoiLuong).toBeNull()
  })

  test('steel: 69 marks at the table kg/m give the table total exactly', () => {
    expect(r.bars).toHaveLength(69)
    for (const b of r.bars) expect(b.kgPerMSource).toBe('bang_goc')
    bars.forEach((b, i) =>
      expect(Math.abs(r.bars[i].kg - b.sourceKg)).toBeLessThan(0.0015)
    )
    expect(kl(r, 'thep')).toBeCloseTo(SRC.thep.tong, 3)
    const by = (k: string) => kl(r, k)
    const ribbed = ['D12', 'D14', 'D16', 'D18', 'D22', 'D32']
    expect(ribbed.reduce((s, d) => s + by(`thep_${d}`), 0)).toBeCloseTo(
      SRC.thep.coGo,
      3
    )
    expect(by('thep_R6') + by('thep_R8')).toBeCloseTo(SRC.thep.tron, 3)
    // The table's per-diameter cells are rounded; the exact sums differ by
    // less than half a kilogram.
    for (const d of ribbed)
      expect(
        Math.abs(by(`thep_${d}`) - line(r, `thep_${d}`).banGoc!)
      ).toBeLessThan(0.5)
    expect(by('thep_le10')).toBeCloseTo(9.481, 3)
    expect(by('thep_le18')).toBeCloseTo(12057.586, 3)
    expect(by('thep_gt18')).toBeCloseTo(1991.252, 3)
    for (const k of ['thep_le10', 'thep_le18', 'thep_gt18'])
      expect(line(r, k).trongTong).toBe(false)
  })

  test('steel conflicts stay as the table and are flagged until resolved', () => {
    expect(line(r, 'thep').flags?.map(f => f.code)).toEqual([
      'mau_thuan_f3',
      'mau_thuan_w16'
    ])
    expect(r.bars.filter(b => b.flags).map(b => [b.mark, b.diameter])).toEqual([
      ['F3', 22],
      ['W16', 16],
      ['W16\u0027', 16]
    ])
    const settled = acTpBtklMo({
      thepF3: 'D22',
      thepW16: 'D16',
      beTongLot: 'C8'
    })
    expect(line(settled, 'thep').flags).toBeUndefined()
    expect(settled.bars.some(b => b.flags)).toBe(false)
    expect(line(settled, 'lot').hangMuc).toBe('Bê tông đệm C8')
    expect(line(settled, 'lot').flags).toBeUndefined()
  })

  test('corbel and haunches: noted, never in a total', () => {
    expect(kl(r, 'vai_ke')).toBeCloseTo(0.1365 * 6.7, 9)
    expect(kl(r, 'vut')).toBeCloseTo(0.3 ** 2 * 5.194, 9)
    for (const k of ['vai_ke', 'vut']) {
      expect(line(r, k).nhom).toBe('ghi_chu')
      expect(line(r, k).trongTong).toBe(false)
    }
  })
})

describe('BTKL mố — changed geometry', () => {
  const r = acTpBtklMo({ hBe: 2500 })
  const m1 = acTpBtklMo()
  const kgOf = (group: string) =>
    bars
      .filter(b => b.group === group)
      .reduce(
        (s, b) =>
          s +
          (b.count * b.length * (b.kgPerM ?? acTpSteelKgPerM(b.diameter))) /
            1000,
        0
      )

  test('a footing height refuses nothing that does not depend on it', () => {
    expect(kl(r, 'be')).toBeCloseTo(7.7 * 6 * 2.5 - 4 * PILE * 0.15, 9)
    expect(kl(r, 'than')).toBeCloseTo(7.7 * 1.5 * 4.717, 9)
    for (const key of [
      'tai',
      'u_chong_xo',
      'lan_can',
      'vua',
      'ong_pvc',
      'bot_xop',
      'hop_chot',
      'bt_nhua'
    ]) {
      expect(line(r, key).nguon).not.toBe('tu_choi')
      expect(kl(r, key)).toBe(kl(m1, key))
      expect(line(r, key).phuThuoc).not.toContain('hBe')
    }
    expect(r.items.filter(i => i.nguon === 'tu_choi').map(i => i.key)).toEqual([
      'coc'
    ])
    const parts = ['be', 'than', 'dinh', 'canh', 'tai', 'u_chong_xo', 'lan_can']
    expect(kl(r, 'be_tong')).toBeCloseTo(
      parts.reduce((s, k) => s + kl(r, k), 0),
      9
    )
    // Formwork follows the footing height.
    expect(kl(r, 'van_khuon_be')).toBeCloseTo(2 * (7.7 + 6) * 2.5, 9)
    expect(line(r, 'van_khuon').nguon).toBe('tham_so')
  })

  test('only lines whose own parameters changed lose the source comparison', () => {
    expect(line(r, 'be').banGoc).toBeUndefined()
    expect(line(r, 'be_tong').banGoc).toBeUndefined()
    expect(line(r, 'van_khuon').banGoc).toBeUndefined()
    expect(line(r, 'than').banGoc).toBe(53.667)
    expect(line(r, 'canh').banGoc).toBe(27.71)
    expect(line(r, 'lot').banGoc).toBe(4.446)
    expect(r.items.flatMap(i => i.flags ?? []).map(f => f.code)).toEqual([
      'lech_ban_goc_than',
      'lech_ban_goc_canh',
      'mau_thuan_lot',
      'bt_nhua_gia_dinh',
      'van_khuon_cho_dinh_muc',
      'thep_tam_tinh_ham_luong'
    ])
  })

  test('steel: estimated from the M1 kg/m³ of each member, and flagged', () => {
    expect(r.bars).toEqual([])
    const thep = line(r, 'thep')
    expect(thep.nguon).toBe('tham_so')
    expect(thep.hangMuc).toBe('Cốt thép (tạm tính theo hàm lượng mẫu M1)')
    expect(thep.flags?.[0].message).toContain('Tạm tính theo hàm lượng mẫu M1')
    // The footing's steel follows its volume; every other member keeps its M1 steel.
    expect(kl(r, 'thep_hl_be')).toBeCloseTo(
      (kgOf('be') * kl(r, 'be')) / kl(m1, 'be'),
      6
    )
    expect(kl(r, 'thep_hl_be')).toBeGreaterThan(kgOf('be') * 1.2)
    expect(kl(r, 'thep_hl_than')).toBeCloseTo(kgOf('than'), 6)
    expect(kl(r, 'thep_hl_canh')).toBeCloseTo(
      kgOf('canh_trai') + kgOf('canh_phai'),
      6
    )
    expect(kl(r, 'thep_hl_goi')).toBeCloseTo(kgOf('goi'), 6)
    const parts = r.items.filter(i => i.key.startsWith('thep_hl_'))
    expect(parts.map(i => i.stt)).toEqual([
      '6.1',
      '6.2',
      '6.3',
      '6.4',
      '6.5',
      '6.6',
      '6.7',
      '6.8'
    ])
    expect(kl(r, 'thep')).toBeCloseTo(
      parts.reduce((s, i) => s + i.khoiLuong!, 0),
      9
    )
    // At M1 the members' steel adds up to the table.
    expect(
      [
        'be',
        'than',
        'dau',
        'canh_trai',
        'canh_phai',
        'tai',
        'lan_can',
        'goi',
        'phu'
      ]
        .map(kgOf)
        .reduce((s, x) => s + x, 0)
    ).toBeCloseTo(SRC.thep.tong, 2)
    expect(line(r, 'thep_hl_be').dienGiai).toMatch(/^49,9 kg\/m³ × /)
  })

  test('the ear walls follow the stem thickness by their formula', () => {
    const t = acTpBtklMo({ tThan: 1800 })
    expect(line(t, 'tai').nguon).toBe('tham_so')
    expect(kl(t, 'tai')).toBeCloseTo(2 * 0.15 * 1.2 * 1.3, 9)
    expect(line(t, 'tai').dienGiai).toContain('N = tThan − 0,5 = 1,3')
    expect(line(t, 'tai').flags).toBeUndefined()
    expect(line(t, 'u_chong_xo').nguon).toBe('ban_goc')
  })

  test('the rail scales with the wing length and the rail height (assumption 2)', () => {
    const w = acTpBtklMo({ lCanh: 8000 })
    expect(kl(w, 'lan_can')).toBeCloseTo((5.223 * 8) / 6.5, 9)
    expect(line(w, 'lan_can').flags?.map(f => f.code)).toEqual([
      'ty_le_ban_goc'
    ])
    const h = acTpBtklMo({ hLanCan: 1300 })
    expect(line(h, 'lan_can').nguon).toBe('tham_so')
    expect(kl(h, 'lan_can')).toBeCloseTo((5.223 * 1300) / 1140, 9)
    const both = acTpBtklMo({ lCanh: 8000, hLanCan: 1300 })
    expect(kl(both, 'lan_can')).toBeCloseTo(
      5.223 * (8 / 6.5) * (1300 / 1140),
      9
    )
    // Nothing refused any more: the concrete total and the steel follow.
    expect(line(h, 'be_tong').nguon).toBe('tham_so')
    expect(line(h, 'thep').nguon).toBe('tham_so')
    // The wing thickness does not size the rail.
    expect(line(acTpBtklMo({ tCanh: 600 }), 'lan_can').nguon).toBe('ban_goc')
  })

  test('materials follow the bearings and the stem width (assumption 3)', () => {
    const g = acTpBtklMo({ soGoi: 2 })
    expect(kl(g, 'vua')).toBeCloseTo(0.02, 9)
    expect(kl(g, 'hop_chot')).toBe(2)
    expect(line(g, 'hop_chot').dienGiai).toBe('1 hộp/gối × 2 gối (như mẫu M1)')
    expect(line(g, 'u_chong_xo').nguon).toBe('tu_choi')
    const b = acTpBtklMo({ bThan: 7000 })
    expect(kl(b, 'bot_xop')).toBeCloseTo((0.049 * 7) / 7.7, 9)
    expect(kl(b, 'ong_pvc')).toBeCloseTo((9.5 * 7) / 7.7, 9)
    expect(line(b, 'ong_pvc').dienGiai).toBe(
      '9,5 × 7/7,7 (bảng gốc M1 theo tỉ lệ bThan)'
    )
    expect(line(b, 'u_chong_xo').lyDo).toContain('Đã đổi bThan')
    // The drain no longer follows the stem height.
    expect(kl(acTpBtklMo({ hThan: 5000 }), 'ong_pvc')).toBe(9.5)
  })

  test('asphalt: carriageway × length on the abutment × 7 cm, flagged (assumption 4)', () => {
    const area = line(m1, 'bt_nhua')
    expect(area.nguon).toBe('tham_so')
    expect(area.khoiLuong).toBeCloseTo(118.448, 9)
    expect(area.flags?.map(f => f.code)).toEqual(['bt_nhua_gia_dinh'])
    // The volume of the layer is written out on the same line.
    expect(area.dienGiai).toContain(
      'khối lượng lớp mặt 118,448 × 0,07 = 8,291 m³'
    )
    const w = acTpBtklMo({ bMatDuong: 6500 })
    expect(kl(w, 'bt_nhua')).toBeCloseTo((6.5 * 118.448) / 7, 9)
    expect(line(w, 'bt_nhua').banGoc).toBeUndefined()
    expect(line(w, 'bt_nhua').flags![0].message).toMatch(/^Giả định:/)
  })

  test('estimated steel counts in the steel total, flag kept (assumption 1)', () => {
    const r = acTpBtklMo({ hBe: 2500 })
    const thep = line(r, 'thep')
    expect(thep.trongTong).toBe(true)
    const parts = r.items.filter(i => i.key.startsWith('thep_hl_'))
    for (const p of parts) expect(p.trongTong).toBe(true)
    expect(thep.khoiLuong).toBeCloseTo(
      parts.reduce((s, i) => s + i.khoiLuong!, 0),
      9
    )
    expect(thep.flags?.[0].message).toContain('đã tính vào tổng thép')
  })

  // From the server session's draft of item d.
  test('the estimate meets the real schedule where the geometry does', () => {
    // A hair of a change leaves the source bar schedule behind; the ratio
    // estimate must land on its total, not somewhere near it.
    const hair = acTpBtklMo({ hBe: 2000.001 })
    expect(hair.bars).toEqual([])
    expect(kl(hair, 'thep')).toBeCloseTo(SRC.thep.tong, 1)
  })

  test('several changes at once: each line names only its own parameters', () => {
    const w = acTpBtklMo({ bThan: 7000, bBe: 7000, aCocNgang: 4600 })
    expect(line(w, 'u_chong_xo').lyDo).toBe(
      'Đã đổi bThan so với mẫu M1; bản vẽ gốc không có đủ kích thước để tính lại dòng này.'
    )
    expect(line(w, 'be_tong').lyDo).toBe('Thiếu ụ chống xô.')
    expect(kl(w, 'bot_xop')).toBeCloseTo(SRC.chenBotXop * (7 / 7.7), 9)
    expect(line(w, 'bot_xop').banGoc).toBeUndefined()
    // aCocNgang moves the piles but changes no quantity line's own inputs.
    expect(line(w, 'lot').banGoc).toBeUndefined()
    expect(line(acTpBtklMo({ aCocNgang: 4600 }), 'lot').banGoc).toBe(SRC.lot)
  })

  test('longer wings by hand', () => {
    const w = acTpBtklMo({ lCanh: 8000 })
    // On the footing 2500, then 1:1 over 5000 to the 1500 end; H4 328/188.
    const high = (6653 * 2500 + ((6688 - 328 + 1500) / 2) * 5000) / 1e6
    const low = (6513 * 2500 + ((6548 - 188 + 1500) / 2) * 5000) / 1e6
    expect(kl(w, 'canh')).toBeCloseTo(0.5 * (high + low), 9)
    expect(kl(w, 'canh')).toBeCloseTo(36.1075, 9)
    expect(line(w, 'canh').dienGiai).toContain('H4 0,328 / 0,188')
  })

  test('no cross fall: both wings alike', () => {
    const w = acTpBtklMo({ docNgang: 0 })
    const high = (6653 * 2500 + ((6688 - 1786 + 1500) / 2) * 3500) / 1e6
    expect(kl(w, 'canh')).toBeCloseTo(0.5 * 2 * high, 9)
  })

  test('the pile grid enters the footing and blinding deductions', () => {
    const p = acTpBtklMo({ D: 1000, aCocNgang: 5700, aCocDoc: 4000 })
    const a = Math.PI * 0.5 ** 2
    expect(kl(p, 'be')).toBeCloseTo(7.7 * 6 * 2 - 4 * a * 0.15, 9)
    expect(kl(p, 'lot')).toBeCloseTo((7.9 * 6.2 - 4 * a) * 0.1, 9)
  })

  test('pile concrete once the length is given; the rest stays M1', () => {
    const p = acTpBtklMo({ lCoc: 30000 })
    expect(kl(p, 'coc')).toBeCloseTo(4 * PILE * 30, 9)
    expect(line(p, 'coc').dienGiai).toBe('4 × π × 1,2²/4 × 30')
    expect(line(p, 'than').banGoc).toBe(53.667)
    expect(line(p, 'thep').nguon).toBe('tham_so')
    expect(p.bars).toHaveLength(69)
    expect(line(acTpBtklMo(), 'coc').lyDo).toContain('Nhập lCoc (mm')
  })

  test('steel left out of the dossier is refused with that reason', () => {
    const p = acTpBtklMo({ thep: 'khong' })
    expect(line(p, 'thep').lyDo).toBe(
      'Hồ sơ chỉ có bố trí chung, chưa có phương án cốt thép.'
    )
    expect(kl(p, 'be_tong')).toBeCloseTo(kl(acTpBtklMo(), 'be_tong'), 9)
  })

  test('a steel change refuses the steel only', () => {
    const p = acTpBtklMo({ thepF3: 'D25' })
    expect(line(p, 'thep').nguon).toBe('tu_choi')
    expect(line(acTpBtklMo({ hBe: 2500, thepW16: 'D14' }), 'thep').nguon).toBe(
      'tu_choi'
    )
    expect(line(p, 'tai').nguon).toBe('ban_goc')
  })

  test('invalid parameters stop the take-off', () => {
    const p = acTpBtklMo({ hBe: 'abc' })
    expect(p.items).toEqual([])
    expect(p.errors.length).toBeGreaterThan(0)
  })
})

describe('BTKL helpers', () => {
  test('numbers in Vietnamese notation', () => {
    expect(acTpBtklNumber(14058.319)).toBe('14 058,319')
    expect(acTpBtklNumber(6)).toBe('6')
    expect(acTpBtklNumber(0.1365, 4)).toBe('0,1365')
  })
  test('unit weight by formula', () => {
    expect(acTpSteelKgPerM(22)).toBeCloseTo(2.98628, 9)
  })
})
