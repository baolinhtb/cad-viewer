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
      '7.2'
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
      ['hop_chot', SRC.hopChot],
      ['bt_nhua', SRC.btNhua],
      ['van_khuon', SRC.vanKhuon]
    ] as const) {
      expect(line(r, key).nguon).toBe('ban_goc')
      expect(kl(r, key)).toBe(value)
    }
    // The ear-wall formula found in B1 gives the same value.
    expect(2 * 0.15 * 1.2 * 1).toBeCloseTo(SRC.beTong.tai, 9)
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

  test('concrete follows, source-only lines and steel are refused with the reason', () => {
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
      'bt_nhua',
      'van_khuon'
    ]) {
      expect(line(r, key).nguon).toBe('tu_choi')
      expect(line(r, key).khoiLuong).toBeNull()
      expect(line(r, key).lyDo).toBe(
        'Hình học đã khác mẫu M1 (hBe); bản vẽ gốc không có đủ kích thước để tính lại dòng này.'
      )
    }
    expect(line(r, 'be_tong').khoiLuong).toBeNull()
    expect(line(r, 'be_tong').lyDo).toBe(
      'Thiếu tường tai, ụ chống xô, lan can trên tường cánh.'
    )
    expect(line(r, 'thep').nguon).toBe('tu_choi')
    expect(r.bars).toEqual([])
    expect(r.items.filter(i => i.key.startsWith('thep_'))).toEqual([])
  })

  test('no line is compared with the source any more, and no source flag stays', () => {
    expect(r.items.filter(i => i.banGoc !== undefined)).toEqual([])
    expect(r.items.flatMap(i => i.flags ?? []).map(f => f.code)).toEqual([
      'mau_thuan_lot'
    ])
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
