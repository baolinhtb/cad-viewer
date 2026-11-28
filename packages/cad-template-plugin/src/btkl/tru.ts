/**
 * Quantity take-off (BTKL) of a pier drawn by the library templates
 * `tru_mat_chinh` / `tru_mat_ben` (and their assembly `tru_cau_hoan_chinh`).
 *
 * Those templates are a preliminary layout, not measured from an office
 * drawing, and have no reinforcement: the take-off follows exactly what they
 * draw and says so. Pure — parameters in, lines out.
 *
 * Geometry as drawn (library 1.0.0):
 * - blinding under the footing, the piles pass through it (deducted, as the
 *   abutment source does);
 * - stem: a wall `bThan × tThan`, or `soCot` columns of side `dCot`;
 *
 * Assumptions settled by the project owner for B3, each flagged `gia_dinh`
 * on its line: columns are round; pile heads are embedded 150 mm in the
 * footing as in the abutment (the templates draw them stopping at the footing
 * bottom); no permanent casing.
 * - cap: front polygon (overhangs chamfered over `lHang` down to `hXaMuDau`)
 *   × `lXaMu`;
 * - bearing seats: `soGoi × soHangGoi` blocks.
 *
 * Formwork follows the abutment's rule read from its source (B4): the
 * footing's four sides and the two large faces of the stem and the cap;
 * round columns by their perimeter. The faces that rule leaves out — the
 * cap's ends and soffits, the bearing seats — are listed apart, outside the
 * totals. Pending the measurement document (question Q2).
 */
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'

import { acTpBtklNumber, BTKL_PILE_EMBED } from './mo'
import type { AcTpBtklFlag, AcTpBtklItem, AcTpBtklResult } from './types'

/**
 * Defaults of the pier templates (library `tru_mat_chinh.js` 1.0.0, same in
 * `tru_mat_ben.js`). A spec checks they still match the library files.
 */
export const BTKL_TRU_DEFAULTS: Readonly<Record<string, number | string>> = {
  bXaMu: 12000,
  lXaMu: 2000,
  hXaMu: 1500,
  hXaMuDau: 800,
  lHang: 2000,
  soGoi: 5,
  aGoi: 2400,
  soHangGoi: 2,
  eGoi: 500,
  bDaKe: 800,
  lDaKe: 600,
  hDaKe: 200,
  loaiThan: 'tuong',
  bThan: 6000,
  tThan: 1400,
  soCot: 2,
  dCot: 1200,
  aCot: 6000,
  hThan: 6000,
  bBe: 9500,
  lBe: 6000,
  hBe: 2000,
  hLot: 100,
  phuLot: 100,
  D: 1200,
  soCocNgang: 3,
  soCocDoc: 2,
  aCocNgang: 3600,
  aCocDoc: 3600,
  lCoc: 0,
  // Seat-width check inputs (1.1.0): no quantity depends on them, but a run
  // that passed them must still be read.
  lNhip: 0,
  gocXien: 0,
  phanTramN: 0,
  x: 0,
  y: 0,
  ghiKichThuoc: 'co'
}

/** Keys where 0 is a value, not a missing one. */
const ZERO_OK = ['lCoc', 'lNhip', 'gocXien', 'phanTramN', 'x', 'y']

const f = (mm: number) => acTpBtklNumber(mm / 1000)
const PI = Math.PI

/** Provisional formwork rule, shown with every formwork line. */
const FORMWORK_FLAG: AcTpBtklFlag = {
  code: 'van_khuon_cho_dinh_muc',
  message:
    'Quy tắc đo ván khuôn như mố M1 (diện tích mặt tiếp xúc lớn: 4 mặt bên bệ; 2 mặt lớn của thân và xà mũ; cột tròn tính theo chu vi); chờ văn bản đo bóc/định mức để chốt (Q2).'
}
const GRADE_FLAG: AcTpBtklFlag = {
  code: 'mac_be_tong_chua_chot',
  message:
    'Template trụ chưa có mác bê tông; cần kỹ sư chốt mác cho từng cấu kiện.'
}
const assumption = (message: string): AcTpBtklFlag => ({
  code: 'gia_dinh',
  message: `Giả định: ${message}`
})
const ROUND_COLUMNS = assumption(
  'cột tròn đường kính dCot (hai hình chiếu chỉ cho cạnh dCot; chủ dự án chốt cột tròn).'
)
const PILE_EMBED = assumption(
  `đầu cọc ngàm vào bệ ${BTKL_PILE_EMBED} mm như mố M1 (template trụ vẽ đầu cọc tại đáy bệ).`
)
const NO_CASING = assumption('cọc không có ống vách.')
const LAYOUT_FLAG: AcTpBtklFlag = {
  code: 'tru_bo_cuc_so_bo',
  message:
    'Trụ là bố cục sơ bộ, chưa đối chiếu bản vẽ văn phòng: khối lượng theo đúng hình template vẽ.'
}

/**
 * The take-off of a pier run. `ten` names it in the sheet ("Trụ T1").
 */
export function acTpBtklTru(
  values: AcTpParamValues = {},
  ten = 'Trụ'
): AcTpBtklResult {
  const v = { ...BTKL_TRU_DEFAULTS, ...values }
  const errors: string[] = []
  for (const key of Object.keys(values))
    if (!(key in BTKL_TRU_DEFAULTS))
      errors.push(`Không có thông số trụ "${key}".`)
  for (const [key, def] of Object.entries(BTKL_TRU_DEFAULTS))
    if (typeof def === 'number') {
      const n = typeof v[key] === 'string' ? Number(v[key]) : v[key]
      if (typeof n !== 'number' || !Number.isFinite(n))
        errors.push(`Thông số trụ ${key}: cần một số.`)
      else if (n < 0 || (n === 0 && !ZERO_OK.includes(key)))
        errors.push(`Thông số trụ ${key}: cần số dương.`)
      else v[key] = n
    }
  if (!['tuong', 'cot'].includes(String(v.loaiThan)))
    errors.push('Dạng thân trụ: cần "tuong" hoặc "cot".')
  if (errors.length) return { doiTuong: ten, items: [], bars: [], errors }
  const n = (k: string) => v[k] as number
  const cot = v.loaiThan === 'cot'
  const thanNgang = cot ? (n('soCot') - 1) * n('aCot') + n('dCot') : n('bThan')
  const thanDoc = cot ? n('dCot') : n('tThan')
  // The checks of the templates' own validation that the quantities need.
  if (n('hXaMuDau') > n('hXaMu'))
    errors.push('Đầu hẫng xà mũ cao hơn chiều cao tại thân.')
  if (n('lHang') > (n('bXaMu') - thanNgang) / 2)
    errors.push('Đoạn vát đầu hẫng chạy vào tới thân trụ.')
  if (thanNgang > n('bBe') || thanDoc > n('lBe'))
    errors.push('Thân trụ vượt kích thước bệ.')
  if (thanDoc > n('lXaMu')) errors.push('Thân trụ dày hơn bề rộng xà mũ.')
  if (cot && n('soCot') > 1 && n('aCot') <= n('dCot'))
    errors.push('Các cột chồng lên nhau.')
  if (errors.length) return { doiTuong: ten, items: [], bars: [], errors }

  const items: AcTpBtklItem[] = []
  const add = (
    item: Omit<AcTpBtklItem, 'trongTong'> & { trongTong?: boolean }
  ) => items.push({ trongTong: true, ...item })
  const piles = n('soCocNgang') * n('soCocDoc')
  const pileArea = (PI * n('D') ** 2) / 4
  const columnArea = (PI * n('dCot') ** 2) / 4

  // ---- 1. Concrete -------------------------------------------------------
  add({
    key: 'be_tong',
    stt: '1',
    nhom: 'be_tong',
    hangMuc: 'Bê tông trụ (mác chưa chốt)',
    donVi: 'm3',
    khoiLuong: null,
    dienGiai: '',
    nguon: 'tham_so',
    laTong: true,
    flags: [GRADE_FLAG, LAYOUT_FLAG]
  })
  add({
    key: 'be',
    stt: '1.1',
    nhom: 'be_tong',
    hangMuc: 'Bệ trụ',
    donVi: 'm3',
    khoiLuong:
      (n('bBe') * n('lBe') * n('hBe') - piles * pileArea * BTKL_PILE_EMBED) /
      1e9,
    dienGiai: `${f(n('bBe'))} × ${f(n('lBe'))} × ${f(n('hBe'))} − ${piles} × π × ${f(n('D'))}²/4 × ${f(BTKL_PILE_EMBED)} (trừ đầu cọc ngàm vào bệ)`,
    nguon: 'tham_so',
    flags: [PILE_EMBED]
  })
  add(
    cot
      ? {
          key: 'than',
          stt: '1.2',
          nhom: 'be_tong',
          hangMuc: `Thân trụ — ${n('soCot')} cột tròn D${n('dCot')}`,
          donVi: 'm3',
          khoiLuong: (n('soCot') * columnArea * n('hThan')) / 1e9,
          dienGiai: `${n('soCot')} × π × ${f(n('dCot'))}²/4 × ${f(n('hThan'))}`,
          nguon: 'tham_so',
          flags: [ROUND_COLUMNS]
        }
      : {
          key: 'than',
          stt: '1.2',
          nhom: 'be_tong',
          hangMuc: 'Thân trụ — tường đặc',
          donVi: 'm3',
          khoiLuong: (n('bThan') * n('tThan') * n('hThan')) / 1e9,
          dienGiai: `${f(n('bThan'))} × ${f(n('tThan'))} × ${f(n('hThan'))}`,
          nguon: 'tham_so'
        }
  )
  const B = n('bXaMu'),
    h = n('hXaMu'),
    hd = n('hXaMuDau'),
    lh = n('lHang')
  const capFront = B * hd + (B - lh) * (h - hd)
  add({
    key: 'xa_mu',
    stt: '1.3',
    nhom: 'be_tong',
    hangMuc: 'Xà mũ',
    donVi: 'm3',
    khoiLuong: (capFront * n('lXaMu')) / 1e9,
    dienGiai: `(${f(B)} × ${f(hd)} + (${f(B)} − ${f(lh)}) × (${f(h)} − ${f(hd)})) × ${f(n('lXaMu'))} (mặt chính có hai đầu hẫng vát × bề rộng)`,
    nguon: 'tham_so'
  })
  const seats = n('soGoi') * n('soHangGoi')
  add({
    key: 'da_ke',
    stt: '1.4',
    nhom: 'be_tong',
    hangMuc: 'Đá kê gối',
    donVi: 'm3',
    khoiLuong: (seats * n('bDaKe') * n('lDaKe') * n('hDaKe')) / 1e9,
    dienGiai: `${n('soGoi')} × ${n('soHangGoi')} × ${f(n('bDaKe'))} × ${f(n('lDaKe'))} × ${f(n('hDaKe'))}`,
    nguon: 'tham_so'
  })
  const parts = items.filter(i => i.stt.startsWith('1.'))
  const total = items[0]
  const refused = parts.filter(i => i.khoiLuong === null)
  if (refused.length) {
    total.nguon = 'tu_choi'
    total.lyDo = `Thiếu ${refused.map(i => i.hangMuc.toLowerCase()).join(', ')}.`
  } else {
    total.khoiLuong = parts.reduce((s, i) => s + i.khoiLuong!, 0)
    total.dienGiai = `Cộng 1.1–1.${parts.length}`
  }

  // ---- 2. Blinding ---------------------------------------------------------
  const bL = n('bBe') + 2 * n('phuLot')
  const lL = n('lBe') + 2 * n('phuLot')
  add({
    key: 'lot',
    stt: '2',
    nhom: 'be_tong',
    hangMuc: 'Bê tông lót (mác chưa chốt)',
    donVi: 'm3',
    khoiLuong: (bL * lL * n('hLot') - piles * pileArea * n('hLot')) / 1e9,
    dienGiai: `(${f(bL)} × ${f(lL)} − ${piles} × π × ${f(n('D'))}²/4) × ${f(n('hLot'))} (trừ tiết diện cọc qua lớp lót, như quy tắc của mố)`,
    nguon: 'tham_so'
  })

  // ---- 3. Bored piles ----------------------------------------------------
  add(
    n('lCoc') > 0
      ? {
          key: 'coc',
          stt: '3',
          nhom: 'coc',
          hangMuc: `Bê tông cọc khoan nhồi D${n('D')} (${piles} cọc)`,
          donVi: 'm3',
          khoiLuong: (piles * pileArea * n('lCoc')) / 1e9,
          dienGiai: `${n('soCocNgang')} × ${n('soCocDoc')} × π × ${f(n('D'))}²/4 × ${f(n('lCoc'))}`,
          nguon: 'tham_so',
          flags: [NO_CASING]
        }
      : {
          key: 'coc',
          stt: '3',
          nhom: 'coc',
          hangMuc: `Bê tông cọc khoan nhồi D${n('D')} (${piles} cọc)`,
          donVi: 'm3',
          khoiLuong: null,
          dienGiai: '',
          nguon: 'tu_choi',
          lyDo: 'Chưa có chiều dài cọc (lCoc = 0).',
          flags: [NO_CASING]
        }
  )

  // ---- 4. Formwork (large contact faces, as the abutment) -----------------
  add({
    key: 'van_khuon',
    stt: '4',
    nhom: 'van_khuon',
    hangMuc: 'Ván khuôn',
    donVi: 'm2',
    khoiLuong: null,
    dienGiai: '',
    nguon: 'tham_so',
    laTong: true,
    flags: [FORMWORK_FLAG]
  })
  add({
    key: 'van_khuon_be',
    stt: '4.1',
    nhom: 'van_khuon',
    hangMuc: 'Ván khuôn bệ (4 mặt bên)',
    donVi: 'm2',
    khoiLuong: (2 * (n('bBe') + n('lBe')) * n('hBe')) / 1e6,
    dienGiai: `2 × (${f(n('bBe'))} + ${f(n('lBe'))}) × ${f(n('hBe'))}`,
    nguon: 'tham_so'
  })
  add(
    cot
      ? {
          key: 'van_khuon_than',
          stt: '4.2',
          nhom: 'van_khuon',
          hangMuc: 'Ván khuôn thân (mặt bên cột tròn)',
          donVi: 'm2',
          khoiLuong: (n('soCot') * PI * n('dCot') * n('hThan')) / 1e6,
          dienGiai: `${n('soCot')} × π × ${f(n('dCot'))} × ${f(n('hThan'))}`,
          nguon: 'tham_so',
          flags: [ROUND_COLUMNS]
        }
      : {
          key: 'van_khuon_than',
          stt: '4.2',
          nhom: 'van_khuon',
          hangMuc: 'Ván khuôn thân tường (2 mặt lớn)',
          donVi: 'm2',
          khoiLuong: (2 * n('bThan') * n('hThan')) / 1e6,
          dienGiai: `2 × ${f(n('bThan'))} × ${f(n('hThan'))}`,
          nguon: 'tham_so'
        }
  )
  add({
    key: 'van_khuon_xa_mu',
    stt: '4.3',
    nhom: 'van_khuon',
    hangMuc: 'Ván khuôn xà mũ (2 mặt chính)',
    donVi: 'm2',
    khoiLuong: (2 * capFront) / 1e6,
    dienGiai: `2 × ${acTpBtklNumber(capFront / 1e6)} (mặt chính như dòng 1.3)`,
    nguon: 'tham_so'
  })
  const forms = items.filter(i => i.stt.startsWith('4.'))
  const formTotal = items.find(i => i.key === 'van_khuon')!
  const formRefused = forms.filter(i => i.khoiLuong === null)
  if (formRefused.length) {
    formTotal.nguon = 'tu_choi'
    formTotal.lyDo = `Thiếu ${formRefused.map(i => i.hangMuc.toLowerCase()).join(', ')}.`
  } else {
    formTotal.khoiLuong = forms.reduce((s, i) => s + i.khoiLuong!, 0)
    formTotal.dienGiai = `Cộng 4.1–4.${forms.length}`
  }

  // ---- 5. Steel ----------------------------------------------------------
  add({
    key: 'thep',
    stt: '5',
    nhom: 'cot_thep',
    hangMuc: 'Cốt thép',
    donVi: 'kg',
    khoiLuong: null,
    dienGiai: '',
    nguon: 'tu_choi',
    lyDo: 'Trụ chưa có phương án cốt thép: template trụ là bố cục sơ bộ, không có bố trí thép.'
  })

  // ---- 6. Formwork the rule leaves out, listed apart ------------------------
  const slope = Math.hypot(lh, h - hd)
  const footprint = cot ? n('soCot') * columnArea : n('bThan') * n('tThan')
  add({
    key: 'van_khuon_xa_mu_dau_day',
    stt: '6.1',
    nhom: 'ghi_chu',
    hangMuc: 'Ván khuôn mặt đầu và mặt đáy xà mũ (không cộng tổng)',
    donVi: 'm2',
    khoiLuong:
      (2 * n('lXaMu') * hd +
        2 * n('lXaMu') * slope +
        n('lXaMu') * (B - 2 * lh) -
        footprint) /
      1e6,
    dienGiai: `2 mặt đầu 2 × ${f(n('lXaMu'))} × ${f(hd)} + đáy vát 2 × ${f(n('lXaMu'))} × ${acTpBtklNumber(slope / 1000)} + đáy phẳng ${f(n('lXaMu'))} × ${f(B - 2 * lh)} − ${cot ? `${n('soCot')} cột × π × ${f(n('dCot'))}²/4` : `thân ${f(n('bThan'))} × ${f(n('tThan'))}`}`,
    nguon: 'tham_so',
    trongTong: false
  })
  add({
    key: 'van_khuon_da_ke',
    stt: '6.2',
    nhom: 'ghi_chu',
    hangMuc: 'Ván khuôn đá kê gối (không cộng tổng)',
    donVi: 'm2',
    khoiLuong: (seats * 2 * (n('bDaKe') + n('lDaKe')) * n('hDaKe')) / 1e6,
    dienGiai: `${seats} × 2 × (${f(n('bDaKe'))} + ${f(n('lDaKe'))}) × ${f(n('hDaKe'))}`,
    nguon: 'tham_so',
    trongTong: false
  })
  return { doiTuong: ten, items, bars: [], errors: [] }
}
