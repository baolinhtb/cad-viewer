import {
  acTpBtklMo,
  acTpBtklSheets,
  acTpBtklTru,
  acTpBtklWorkbook,
  BTKL_TRU_DEFAULTS
} from '../src/btkl'
import { loadLibraryTemplate } from './helpers/libraryTemplate'

type R = ReturnType<typeof acTpBtklTru>
const line = (r: R, key: string) => {
  const found = r.items.find(i => i.key === key)
  if (!found) throw new Error(`no line ${key}`)
  return found
}
const kl = (r: R, key: string) => line(r, key).khoiLuong as number
const codes = (r: R, key: string) => (line(r, key).flags ?? []).map(f => f.code)
const PILE = Math.PI * 0.6 ** 2

describe('BTKL trụ — defaults match the library templates', () => {
  test.each(['tru_mat_chinh.js', 'tru_mat_ben.js'])('%s', file => {
    const t = loadLibraryTemplate(file)
    expect(t.meta.version).toBe('1.1.0')
    expect(
      Object.fromEntries(
        t.params.map((p: { key: string; default: unknown }) => [
          p.key,
          p.default
        ])
      )
    ).toEqual(BTKL_TRU_DEFAULTS)
  })
})

describe('BTKL trụ — wall stem, defaults', () => {
  const r = acTpBtklTru({}, 'Trụ T1')

  test('lines in order', () => {
    expect(r.errors).toEqual([])
    expect(r.doiTuong).toBe('Trụ T1')
    expect(r.items.map(i => `${i.stt} ${i.key}`)).toEqual([
      '1 be_tong',
      '1.1 be',
      '1.2 than',
      '1.3 xa_mu',
      '1.4 da_ke',
      '2 lot',
      '3 coc',
      '4 van_khuon',
      '4.1 van_khuon_be',
      '4.2 van_khuon_than',
      '4.3 van_khuon_xa_mu',
      '5 thep',
      '6.1 van_khuon_xa_mu_dau_day',
      '6.2 van_khuon_da_ke'
    ])
    expect(r.items.filter(i => i.banGoc !== undefined)).toEqual([])
  })

  test('concrete by hand', () => {
    expect(kl(r, 'be')).toBeCloseTo(9.5 * 6 * 2 - 6 * PILE * 0.15, 9)
    expect(kl(r, 'be')).toBeCloseTo(112.982124, 6)
    expect(codes(r, 'be')).toEqual(['gia_dinh'])
    expect(line(r, 'be').flags![0].message).toBe(
      'Giả định: đầu cọc ngàm vào bệ 150 mm như mố M1 (template trụ vẽ đầu cọc tại đáy bệ).'
    )
    expect(kl(r, 'than')).toBeCloseTo(6 * 1.4 * 6, 9)
    expect(line(r, 'than').flags).toBeUndefined()
    // Front: 12 × 0.8 + (12 − 2) × (1.5 − 0.8) = 16.6 m², × 2 m.
    expect(kl(r, 'xa_mu')).toBeCloseTo(33.2, 9)
    expect(kl(r, 'da_ke')).toBeCloseTo(5 * 2 * 0.8 * 0.6 * 0.2, 9)
    expect(kl(r, 'be_tong')).toBeCloseTo(112.982124 + 50.4 + 33.2 + 0.96, 6)
    expect(codes(r, 'be_tong')).toEqual([
      'mac_be_tong_chua_chot',
      'tru_bo_cuc_so_bo'
    ])
    expect(kl(r, 'lot')).toBeCloseTo((9.7 * 6.2 - 6 * PILE) * 0.1, 9)
  })

  test('piles refused without a length; no casing is an assumption', () => {
    expect(line(r, 'coc').nguon).toBe('tu_choi')
    expect(line(r, 'coc').lyDo).toBe('Chưa có chiều dài cọc (lCoc = 0).')
    expect(codes(r, 'coc')).toEqual(['gia_dinh'])
    const p = acTpBtklTru({ lCoc: 25000 })
    expect(kl(p, 'coc')).toBeCloseTo(6 * PILE * 25, 9)
    expect(line(p, 'coc').hangMuc).toBe('Bê tông cọc khoan nhồi D1200 (6 cọc)')
    expect(line(p, 'coc').flags![0].message).toBe(
      'Giả định: cọc không có ống vách.'
    )
  })

  test('formwork by hand: large faces as the abutment, flagged', () => {
    expect(kl(r, 'van_khuon_be')).toBeCloseTo(2 * 15.5 * 2, 9)
    expect(kl(r, 'van_khuon_than')).toBeCloseTo(2 * 6 * 6, 9)
    expect(kl(r, 'van_khuon_xa_mu')).toBeCloseTo(2 * 16.6, 9)
    expect(kl(r, 'van_khuon')).toBeCloseTo(62 + 72 + 33.2, 9)
    expect(codes(r, 'van_khuon')).toEqual(['van_khuon_cho_dinh_muc'])
    expect(line(r, 'van_khuon').flags![0].message).toBe(
      'Quy tắc đo ván khuôn như mố M1 (diện tích mặt tiếp xúc lớn: 4 mặt bên bệ; 2 mặt lớn của thân và xà mũ; cột tròn tính theo chu vi); chờ văn bản đo bóc/định mức để chốt (Q2).'
    )
  })

  test('faces the rule leaves out: listed apart, outside the totals', () => {
    // Cap: 2 ends + 2 chamfered soffits + flat soffit less the stem.
    expect(kl(r, 'van_khuon_xa_mu_dau_day')).toBeCloseTo(
      2 * 2 * 0.8 + 2 * 2 * Math.hypot(2, 0.7) + 2 * 8 - 6 * 1.4,
      9
    )
    expect(kl(r, 'van_khuon_da_ke')).toBeCloseTo(10 * 2 * 1.4 * 0.2, 9)
    for (const k of ['van_khuon_xa_mu_dau_day', 'van_khuon_da_ke']) {
      expect(line(r, k).nhom).toBe('ghi_chu')
      expect(line(r, k).trongTong).toBe(false)
    }
  })

  test('steel refused', () => {
    expect(line(r, 'thep').nguon).toBe('tu_choi')
    expect(line(r, 'thep').lyDo).toBe(
      'Trụ chưa có phương án cốt thép: template trụ là bố cục sơ bộ, không có bố trí thép.'
    )
    expect(r.bars).toEqual([])
  })
})

describe('BTKL trụ — column stem: round columns, flagged', () => {
  const r = acTpBtklTru({ loaiThan: 'cot' })
  const area = Math.PI * 0.6 ** 2

  test('stem, formwork and cap soffit use the round section', () => {
    expect(line(r, 'than').hangMuc).toBe('Thân trụ — 2 cột tròn D1200')
    expect(kl(r, 'than')).toBeCloseTo(2 * area * 6, 9)
    expect(codes(r, 'than')).toEqual(['gia_dinh'])
    expect(line(r, 'than').flags![0].message).toBe(
      'Giả định: cột tròn đường kính dCot (hai hình chiếu chỉ cho cạnh dCot; chủ dự án chốt cột tròn).'
    )
    expect(kl(r, 'van_khuon_than')).toBeCloseTo(2 * Math.PI * 1.2 * 6, 9)
    expect(codes(r, 'van_khuon_than')).toEqual(['gia_dinh'])
    expect(kl(r, 'van_khuon')).toBeCloseTo(62 + 2 * Math.PI * 1.2 * 6 + 33.2, 9)
    expect(kl(r, 'van_khuon_xa_mu_dau_day')).toBeCloseTo(
      2 * 2 * 0.8 + 2 * 2 * Math.hypot(2, 0.7) + 2 * 8 - 2 * area,
      9
    )
    expect(kl(r, 'be_tong')).toBeCloseTo(
      112.982124 + 2 * area * 6 + 33.2 + 0.96,
      6
    )
  })
})

describe('BTKL trụ — other shapes and refusals', () => {
  test('a cap without chamfer is a plain prism', () => {
    const r = acTpBtklTru({ hXaMuDau: 1500 })
    expect(kl(r, 'xa_mu')).toBeCloseTo(12 * 1.5 * 2, 9)
    expect(kl(r, 'van_khuon_xa_mu')).toBeCloseTo(2 * 18, 9)
    // The "chamfer" is then the horizontal soffit of the overhang.
    expect(kl(r, 'van_khuon_xa_mu_dau_day')).toBeCloseTo(
      2 * 2 * 1.5 + 2 * 2 * 2 + 2 * 8 - 8.4,
      9
    )
  })

  test('one row of seats, pile grid changes', () => {
    const r = acTpBtklTru({ soHangGoi: 1, soCocNgang: 2, soCocDoc: 2 })
    expect(kl(r, 'da_ke')).toBeCloseTo(5 * 0.8 * 0.6 * 0.2, 9)
    expect(kl(r, 'be')).toBeCloseTo(114 - 4 * PILE * 0.15, 9)
  })

  test('invalid values stop the take-off, as the templates refuse them', () => {
    const lib = loadLibraryTemplate('tru_mat_chinh.js')
    for (const bad of <Record<string, string | number>[]>[
      { hXaMuDau: 1600 },
      { lHang: 3500 },
      { loaiThan: 'cot', soCot: 3, aCot: 1000 }
    ]) {
      expect(acTpBtklTru(bad).errors.length).toBeGreaterThan(0)
      expect(lib.validate(bad).length).toBeGreaterThan(0)
    }
    expect(acTpBtklTru({ bBe: 'abc' }).errors).toEqual([
      'Thông số trụ bBe: cần một số.'
    ])
    expect(acTpBtklTru({ khong: 1 }).errors).toEqual([
      'Không có thông số trụ "khong".'
    ])
    expect(acTpBtklTru({ loaiThan: 'xa' }).errors).toEqual([
      'Dạng thân trụ: cần "tuong" hoặc "cot".'
    ])
  })
})

describe('BTKL trụ with the abutment in one sheet set and workbook', () => {
  const results = [acTpBtklMo(), acTpBtklTru({}, 'Trụ T1')]

  test('sheets list both, flags in red', () => {
    const texts = acTpBtklSheets(results).flatMap(s =>
      s.primitives.flatMap(p => (p.kind === 'text' ? [p] : []))
    )
    expect(texts.map(t => t.text)).toEqual(
      expect.arrayContaining(['MỐ M1', 'TRỤ T1'])
    )
    expect(
      texts.some(
        t => t.color === 1 && t.text.startsWith('[!] Giả định: đầu cọc ngàm')
      )
    ).toBe(true)
  })

  test('workbook: one steel sheet each, the pier one says why it is empty', () => {
    const bytes = acTpBtklWorkbook(results)
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('<sheet name="Thép 2 Trụ T1"')
    expect(text).toContain('Không có bảng thép: Trụ chưa có phương án cốt thép')
  })
})

describe('BTKL trụ — a pier drawn with the seat-width inputs (1.1.0)', () => {
  test('lNhip / gocXien / phanTramN are read, and change no quantity', () => {
    const base = acTpBtklTru({}, 'Trụ T1')
    const withN = acTpBtklTru(
      { lNhip: 33000, gocXien: 0, phanTramN: 100 },
      'Trụ T1'
    )
    expect(withN.errors).toEqual([])
    expect(withN.items.map(i => [i.key, i.khoiLuong])).toEqual(
      base.items.map(i => [i.key, i.khoiLuong])
    )
    // Unchanged defaults: 197,542 m³ concrete, 5,335 m³ lean, 167,2 m² formwork.
    expect(kl(withN, 'be_tong')).toBeCloseTo(197.542, 3)
    expect(kl(withN, 'lot')).toBeCloseTo(5.335, 3)
    expect(kl(withN, 'van_khuon')).toBeCloseTo(167.2, 1)
  })
})
