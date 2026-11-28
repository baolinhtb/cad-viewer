import type {
  AcTpParamSpec,
  AcTpParamValues
} from '@mlightcad/cad-template-sdk'

/**
 * Road cross-section (mặt cắt ngang đường) — the model: parameters, their
 * sources, the checks and the geometry in real millimetres.
 *
 * A drawing of the section as specified, the way the abutment dossier is a
 * drawing of the abutment: it designs nothing. No pavement strength, no
 * earthwork: the layers are the engineer's, the widths are the engineer's,
 * and what the two loaded standards (TCVN 4054:2005, TCVN 13592:2022) fix is
 * checked and cited clause by clause. A range the standards do not give is
 * an engineer's choice and says so.
 */

export const ROAD_ID = 'duong_mat_cat_ngang'
export const ROAD_VERSION = '0.1.0'

/** Road kind: which standard's tables bound the values. */
export type RoadKind = 'o_to' | 'do_thi'
/** Surface kind: picks the cross-fall row of the standard's table. */
export type RoadSurface = 'btn_btxm' | 'nhua_khac' | 'da_dam'

const ENGINEER = 'Giá trị kỹ sư chọn; tiêu chuẩn không quy định dải này.'
const NOT_LOADED =
  'Không có trong tệp tiêu chuẩn đã nạp (TCVN 4054:2005, TCVN 13592:2022); giá trị kỹ sư chọn.'

/** Default pavement: asphalt over crushed stone, total 570 mm. */
export const ROAD_DEFAULT_LAYERS =
  'BTNC 12,5 dày 5 cm|50; BTNC 19 dày 7 cm|70; CPĐD loại I|150; CPĐD loại II|300'

export const ROAD_PARAMS: readonly AcTpParamSpec[] = [
  {
    key: 'tenHinh',
    label: 'Tên hình',
    type: 'text',
    default: 'MẶT CẮT NGANG ĐIỂN HÌNH',
    group: 'Chung'
  },
  {
    key: 'loaiDuong',
    label: 'Loại đường',
    type: 'choice',
    choices: [
      { value: 'o_to', label: 'Đường ô tô (TCVN 4054:2005)' },
      { value: 'do_thi', label: 'Đường đô thị (TCVN 13592:2022)' }
    ],
    default: 'o_to',
    group: 'Chung',
    hint: 'Chọn bảng tiêu chuẩn dùng để kiểm bề rộng làn và dốc ngang.'
  },
  {
    key: 'loaiMat',
    label: 'Loại mặt đường',
    type: 'choice',
    choices: [
      { value: 'btn_btxm', label: 'Bê tông nhựa / bê tông xi măng' },
      { value: 'nhua_khac', label: 'Mặt đường nhựa khác, lát đá tốt' },
      { value: 'da_dam', label: 'Đá dăm, cấp phối' }
    ],
    default: 'btn_btxm',
    group: 'Chung',
    hint: 'Chọn hàng của TCVN 4054 Bảng 9 / TCVN 13592 Bảng 12 cho dốc ngang mặt đường.'
  },
  {
    key: 'soLan',
    label: 'Số làn xe',
    type: 'integer',
    unit: 'làn',
    min: 1,
    max: 8,
    default: 2,
    group: 'Phần xe chạy',
    hint:
      'TCVN 4054 đ.4.2.1: số nguyên làn, nên chẵn. Có dải phân cách giữa thì ' +
      'phải chẵn và ≥ 4 (TCVN 4054 đ.4.4.1, TCVN 13592 đ.9.4.2). Tối đa 8 là giới hạn của bản vẽ.'
  },
  {
    key: 'bLan',
    label: 'Bề rộng một làn',
    type: 'number',
    unit: 'mm',
    min: 2750,
    max: 3750,
    default: 3500,
    group: 'Phần xe chạy',
    hint:
      'TCVN 4054 Bảng 6, Bảng 7: 2,75–3,75 m theo cấp đường; TCVN 13592 đ.9.2.3 Bảng 10: ' +
      '2,75–3,75 m, bội số 0,25 m.'
  },
  {
    key: 'iMat',
    label: 'Dốc ngang mặt đường',
    type: 'number',
    unit: '%',
    min: 1.5,
    max: 3.5,
    default: 2,
    group: 'Phần xe chạy',
    hint:
      'TCVN 4054 đ.4.9 Bảng 9 (mặt đường và lề gia cố): BTN/BTXM 1,5–2,0; nhựa khác, ' +
      'lát đá 2,0–3,0; đá dăm, cấp phối 3,0–3,5 %. TCVN 13592 đ.9.2.5 Bảng 12: BTN/BTXM ' +
      '1,5–2,5; nhựa khác 2,0–3,0; đá dăm 2,5–3,5 %. Lề gia cố dốc cùng mặt đường.'
  },
  {
    key: 'kieuDoc',
    label: 'Kiểu dốc ngang',
    type: 'choice',
    choices: [
      { value: 'hai_mai', label: 'Hai mái (từ tim ra hai mép)' },
      { value: 'mot_mai', label: 'Một mái (cao bên trái, thấp bên phải)' }
    ],
    default: 'hai_mai',
    group: 'Phần xe chạy',
    hint: 'TCVN 13592 đ.9.2.5: thông thường dốc hai mái từ tim đường ra mép đường.'
  },
  {
    key: 'bLeGiaCo',
    label: 'Bề rộng lề gia cố (mỗi bên)',
    type: 'number',
    unit: 'mm',
    min: 0,
    max: 4000,
    default: 2000,
    group: 'Lề',
    hint:
      'TCVN 4054 Bảng 6, Bảng 7 (số trong ngoặc) cho bề rộng gia cố tối thiểu theo cấp đường ' +
      '(0,50–3,00 m). Giới hạn trên 4 000 mm là giá trị kỹ sư chọn.'
  },
  {
    key: 'bLeDat',
    label: 'Bề rộng lề đất (mỗi bên)',
    type: 'number',
    unit: 'mm',
    min: 0,
    max: 3000,
    default: 500,
    group: 'Lề',
    hint:
      'Phần lề không gia cố ngoài lề gia cố. TCVN 4054 đ.4.3.3: lề đất còn lại tối thiểu 0,5 m ' +
      '(chỗ có làn phụ). Có bó vỉa thì không có lề đất (bằng 0). Giới hạn trên là giá trị kỹ sư chọn.'
  },
  {
    key: 'iLeDat',
    label: 'Dốc ngang lề đất',
    type: 'number',
    unit: '%',
    min: 4,
    max: 6,
    default: 4,
    group: 'Lề',
    hint: 'TCVN 4054 đ.4.9 Bảng 9: phần lề không gia cố 4,0–6,0 %.'
  },
  {
    key: 'bPhanCach',
    label: 'Bề rộng dải phân cách giữa',
    type: 'number',
    unit: 'mm',
    min: 0,
    max: 9000,
    default: 0,
    group: 'Dải phân cách',
    hint:
      '0 = không có. Đường ô tô: TCVN 4054 đ.4.4.1 Bảng 8, tối thiểu 1,50 m; đường đô thị: ' +
      'TCVN 13592 đ.9.4.4 Bảng 14, tối thiểu 1,00 m (giá trị nhỏ nhất của bảng). Chỉ khi ≥ 4 làn. ' +
      'Tối đa 9 000 mm theo TCVN 13592 Bảng 14 (giá trị mong muốn lớn nhất).'
  },
  {
    key: 'hBoViaPhanCach',
    label: 'Chiều cao bó vỉa dải phân cách',
    type: 'number',
    unit: 'mm',
    min: 150,
    max: 500,
    default: 300,
    group: 'Dải phân cách',
    hint:
      'TCVN 13592 đ.9.7.5: ≥ 30 cm so với mặt đường (≥ 15 cm khi tốc độ dưới 50 km/h); ' +
      'TCVN 4054 đ.4.4.3: ít nhất 18 cm khi dải rộng 3,00–4,50 m. Giới hạn trên là giá trị kỹ sư chọn.'
  },
  {
    key: 'coBoVia',
    label: 'Có bó vỉa ở mép mặt đường',
    type: 'boolean',
    default: false,
    group: 'Hè, bó vỉa',
    hint: 'Đường đô thị: bó vỉa ở mép lề, hè đường phía ngoài. Có bó vỉa thì không có lề đất, không có mái ta luy phía trong hè.'
  },
  {
    key: 'hBoVia',
    label: 'Chiều cao bó vỉa hè (trên mép mặt đường)',
    type: 'number',
    unit: 'mm',
    min: 125,
    max: 400,
    default: 150,
    group: 'Hè, bó vỉa',
    hint:
      'TCVN 13592 đ.9.7.4: đỉnh bó vỉa hè cao hơn mép ngoài mặt đường ít nhất 12,5 cm. ' +
      'Giới hạn trên là giá trị kỹ sư chọn.'
  },
  {
    key: 'bBoVia',
    label: 'Bề rộng bó vỉa',
    type: 'number',
    unit: 'mm',
    min: 100,
    max: 500,
    default: 200,
    group: 'Hè, bó vỉa',
    hint: ENGINEER
  },
  {
    key: 'bHe',
    label: 'Bề rộng hè (mỗi bên, kể cả bó vỉa)',
    type: 'number',
    unit: 'mm',
    min: 0,
    max: 10000,
    default: 0,
    group: 'Hè, bó vỉa',
    hint:
      '0 = không có. Chỉ khi có bó vỉa. TCVN 13592 đ.9.5.2 Bảng 15 cho bề rộng hè tối thiểu ' +
      '2,0–6,0 m theo loại đường (1,0 m khi cải tạo, chú thích của bảng). Giới hạn trên là giá trị kỹ sư chọn.'
  },
  {
    key: 'iHe',
    label: 'Dốc ngang hè (dốc về phía mặt đường)',
    type: 'number',
    unit: '%',
    min: 0,
    max: 4,
    default: 1.5,
    group: 'Hè, bó vỉa',
    hint: NOT_LOADED
  },
  {
    key: 'tHe',
    label: 'Bề dày lớp lát hè',
    type: 'number',
    unit: 'mm',
    min: 30,
    max: 300,
    default: 100,
    group: 'Hè, bó vỉa',
    hint: ENGINEER
  },
  {
    key: 'hNen',
    label: 'Chiều cao nền (đắp +, đào −) tại mép nền',
    type: 'number',
    unit: 'mm',
    min: -20000,
    max: 16000,
    default: 1500,
    group: 'Nền đường',
    hint:
      'Từ mặt đất tự nhiên tới mép nền (vai đường). 0 = không vẽ mái. Nền đắp đất không nên ' +
      'cao quá 16 m (TCVN 4054 đ.7.8.5); nền đào đất không nên vượt 20 m (TCVN 4054 Bảng 24, chú thích).'
  },
  {
    key: 'mMai',
    label: 'Hệ số mái ta luy 1:m',
    type: 'number',
    unit: '',
    min: 0.3,
    max: 3,
    default: 1.5,
    group: 'Nền đường',
    hint:
      'Mái đắp: TCVN 4054 đ.7.8.1 Bảng 25 (1:0,75–1:2), vùng ngập 1:2–1:3 (TCVN 4054 đ.7.8.3); ' +
      'mái đào: TCVN 4054 đ.7.7.1 Bảng 24 (1:0,3–1:1,75). Mặc định 1:1,5 (đắp cát, đất sét, Bảng 25).'
  },
  {
    key: 'lopAoDuong',
    label: 'Các lớp kết cấu áo đường (trên xuống)',
    type: 'text',
    default: ROAD_DEFAULT_LAYERS,
    group: 'Áo đường',
    hint:
      'Dạng «tên|dày mm; tên|dày mm; …», 1–8 lớp, mỗi lớp 20–1000 mm. Kết cấu do kỹ sư thiết kế; ' +
      'bản vẽ không kiểm cường độ. Tham khảo TCVN 4054 đ.8.3.1 (tầng mặt, tầng móng) và đ.8.3.9 (bề dày lớp).'
  },
  {
    key: 'caoDoTim',
    label: 'Cao độ thiết kế tim đường',
    type: 'number',
    unit: 'm',
    min: -1000,
    max: 5000,
    default: 0,
    group: 'Chung',
    hint: 'Chỉ để ghi nhãn. 0 = cao độ tương đối (ghi ±0,000). Dải −1 000…5 000 m chỉ chặn sai số nhập liệu.'
  },
  {
    key: 'duAn',
    label: 'Dự án',
    type: 'text',
    default: '',
    group: 'Khung tên'
  },
  {
    key: 'congTrinh',
    label: 'Công trình',
    type: 'text',
    default: '',
    group: 'Khung tên'
  },
  {
    key: 'donVi',
    label: 'Đơn vị thiết kế',
    type: 'text',
    default: '',
    group: 'Khung tên'
  },
  { key: 'ngay', label: 'Ngày', type: 'text', default: '', group: 'Khung tên' },
  {
    key: 'x',
    label: 'Góc dưới trái tờ — X',
    type: 'number',
    unit: 'mm',
    min: -1e9,
    max: 1e9,
    default: 0,
    group: 'Vị trí',
    hint: 'Chỉ chặn sai số nhập liệu.'
  },
  {
    key: 'y',
    label: 'Góc dưới trái tờ — Y',
    type: 'number',
    unit: 'mm',
    min: -1e9,
    max: 1e9,
    default: 0,
    group: 'Vị trí',
    hint: 'Chỉ chặn sai số nhập liệu.'
  }
]

export function roadDefaults(): AcTpParamValues {
  return Object.fromEntries(ROAD_PARAMS.map(p => [p.key, p.default!]))
}

/** One pavement layer, top down. */
export interface RoadLayer {
  ten: string
  day: number
}

/** A band across the section, left to right, at the finished surface. */
export interface RoadBand {
  /** What it is, for the dimension chain and the semantic part. */
  kind: 'le_dat' | 'le_gia_co' | 'lan' | 'phan_cach' | 'he'
  label: string
  /** Left and right edge, mm from the centreline (left negative). */
  x0: number
  x1: number
}

/** The checked model: values, bands, layers, totals, or errors. */
export interface RoadModel {
  values: AcTpParamValues
  errors: string[]
  layers: RoadLayer[]
  bands: RoadBand[]
  /** Carriageway width (lanes only), mm. */
  bMatDuong: number
  /** Roadbed width, edge to edge (lanes, divider, shoulders, sidewalks), mm. */
  bNen: number
  /** Total pavement thickness, mm. */
  tAoDuong: number
  /** Paved width the pavement layers span (lanes + hard shoulders + divider), mm. */
  bAoDuong: number
}

const fmt = (v: number, digits = 1) => v.toFixed(digits).replace('.', ',')
export const roadMm = (v: number) =>
  String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** Cross-fall range of the carriageway, %, with its clause. */
export function roadCrossFallRange(
  kind: RoadKind,
  surface: RoadSurface
): { min: number; max: number; nguon: string } {
  if (kind === 'do_thi') {
    const t = { btn_btxm: [1.5, 2.5], nhua_khac: [2, 3], da_dam: [2.5, 3.5] }[
      surface
    ]
    return { min: t[0], max: t[1], nguon: 'TCVN 13592 đ.9.2.5 Bảng 12' }
  }
  const t = { btn_btxm: [1.5, 2], nhua_khac: [2, 3], da_dam: [3, 3.5] }[surface]
  return { min: t[0], max: t[1], nguon: 'TCVN 4054 đ.4.9 Bảng 9' }
}

/** Parses «tên|dày; tên|dày». */
export function parseRoadLayers(text: string): {
  layers: RoadLayer[]
  errors: string[]
} {
  const errors: string[] = []
  const layers: RoadLayer[] = []
  const parts = String(text)
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
  for (const part of parts) {
    const bar = part.lastIndexOf('|')
    const ten = (bar >= 0 ? part.slice(0, bar) : '').trim()
    const day = Number(
      (bar >= 0 ? part.slice(bar + 1) : part).trim().replace(',', '.')
    )
    if (!ten || !Number.isFinite(day)) {
      errors.push(
        `Lớp áo đường «${part}» không đọc được: cần dạng «tên lớp|bề dày mm».`
      )
      continue
    }
    if (day < 20 || day > 1000)
      errors.push(
        `Lớp «${ten}» dày ${fmt(day, 0)} mm: mỗi lớp cần 20–1 000 mm (giới hạn của bản vẽ, không phải tiêu chuẩn).`
      )
    layers.push({ ten, day })
  }
  if (!layers.length && !errors.length)
    errors.push('Cần ít nhất một lớp kết cấu áo đường.')
  if (layers.length > 8)
    errors.push(
      `Có ${layers.length} lớp áo đường; bản vẽ nhận tối đa 8 lớp (giới hạn của bản vẽ).`
    )
  return { layers, errors }
}

/** Builds and checks the model; `errors` empty means it can be drawn. */
export function buildRoadModel(given: AcTpParamValues = {}): RoadModel {
  const v: AcTpParamValues = { ...roadDefaults(), ...given }
  const n = (k: string) => Number(v[k])
  const errors: string[] = []
  // Parameter ranges first, each with what the hint says about its source.
  for (const p of ROAD_PARAMS) {
    if (p.type === 'text' || p.type === 'choice') {
      if (
        p.type === 'choice' &&
        !p.choices!.some(c => c.value === String(v[p.key]))
      )
        errors.push(
          `${p.label}: nhận ${p.choices!.map(c => `«${c.value}»`).join(', ')} (nhận «${String(v[p.key])}»).`
        )
      continue
    }
    if (p.type === 'boolean') {
      if (typeof v[p.key] !== 'boolean')
        errors.push(`${p.label}: cần true/false.`)
      continue
    }
    const x = n(p.key)
    if (!Number.isFinite(x)) {
      errors.push(`${p.label}: cần một số (nhận «${String(v[p.key])}»).`)
      continue
    }
    if (p.type === 'integer' && !Number.isInteger(x))
      errors.push(`${p.label}: cần số nguyên (nhận ${x}).`)
    if (
      (p.min !== undefined && x < p.min) ||
      (p.max !== undefined && x > p.max)
    ) {
      const u = p.unit ? ` ${p.unit}` : ''
      const show = (y: number) =>
        p.unit === 'mm' ? roadMm(y) : String(y).replace('.', ',')
      errors.push(
        `${p.label} ${show(x)}${u} ngoài khoảng cho phép ${show(p.min!)}–${show(p.max!)}${u}${p.hint ? ` (${p.hint})` : ''}.`
      )
    }
  }
  const kind = String(v.loaiDuong) as RoadKind
  const surface = String(v.loaiMat) as RoadSurface
  const soLan = n('soLan')
  const divider = n('bPhanCach')
  const curb = v.coBoVia === true
  // Rules between parameters.
  if (kind === 'do_thi' && Number.isFinite(n('bLan')) && n('bLan') % 250 !== 0)
    errors.push(
      `Bề rộng một làn ${roadMm(n('bLan'))} mm: đường đô thị lấy bội số 250 mm (TCVN 13592 đ.9.2.3, 2,75–3,75 m bội số 0,25 m).`
    )
  if (['btn_btxm', 'nhua_khac', 'da_dam'].includes(surface)) {
    const r = roadCrossFallRange(kind, surface)
    if (n('iMat') < r.min || n('iMat') > r.max)
      errors.push(
        `Dốc ngang mặt đường ${fmt(n('iMat'))} % ngoài khoảng ${fmt(r.min)}–${fmt(r.max)} % của ${r.nguon} cho loại mặt đường đã chọn (đoạn siêu cao chưa hỗ trợ).`
      )
  }
  if (divider > 0) {
    const min = kind === 'do_thi' ? 1000 : 1500
    if (divider < min)
      errors.push(
        kind === 'do_thi'
          ? `Dải phân cách giữa ${roadMm(divider)} mm nhỏ hơn 1 000 mm (TCVN 13592 đ.9.4.4 Bảng 14: tối thiểu 1,00–3,00 m theo loại đường).`
          : `Dải phân cách giữa ${roadMm(divider)} mm nhỏ hơn 1 500 mm (TCVN 4054 đ.4.4.1 Bảng 8: tối thiểu 1,50 m).`
      )
    if (soLan < 4 || soLan % 2 !== 0)
      errors.push(
        `Dải phân cách giữa chỉ bố trí khi đường có số làn chẵn từ 4 trở lên (TCVN 4054 đ.4.4.1, TCVN 13592 đ.9.4.2); đang ${soLan} làn.`
      )
    if (String(v.kieuDoc) === 'mot_mai')
      errors.push(
        'Có dải phân cách giữa thì mỗi phần xe chạy dốc ra mép ngoài (hai mái); dốc một mái chưa hỗ trợ cùng dải phân cách.'
      )
  }
  if (curb && n('bLeDat') > 0)
    errors.push(
      `Có bó vỉa thì không có lề đất ngoài bó vỉa (đang ${roadMm(n('bLeDat'))} mm): đặt bề rộng lề đất = 0.`
    )
  if (!curb && n('bHe') > 0)
    errors.push(
      `Hè đường ${roadMm(n('bHe'))} mm chỉ vẽ khi có bó vỉa ở mép mặt đường: bật bó vỉa hoặc đặt bề rộng hè = 0.`
    )
  if (curb && n('bHe') > 0 && n('bHe') < n('bBoVia') + 500)
    errors.push(
      `Hè ${roadMm(n('bHe'))} mm (kể cả bó vỉa ${roadMm(n('bBoVia'))} mm) phải rộng hơn bó vỉa ít nhất 500 mm (giới hạn của bản vẽ).`
    )
  const parsed = parseRoadLayers(String(v.lopAoDuong ?? ''))
  errors.push(...parsed.errors)
  const tAoDuong = parsed.layers.reduce((s, l) => s + l.day, 0)
  if (tAoDuong > 1500)
    errors.push(
      `Tổng bề dày áo đường ${roadMm(tAoDuong)} mm vượt 1 500 mm (giới hạn của bản vẽ).`
    )
  if (curb && n('bHe') > 0 && n('tHe') >= n('hBoVia') + tAoDuong)
    errors.push('Lớp lát hè dày hơn chiều cao từ đáy áo đường tới đỉnh bó vỉa.')

  // Bands at the surface, left to right.
  const bands: RoadBand[] = []
  const lanes = Number.isInteger(soLan) && soLan > 0 ? soLan : 0
  const bLan = n('bLan')
  const bMatDuong = lanes * bLan
  const half = divider > 0 ? divider / 2 : 0
  const leftLanes = divider > 0 ? lanes / 2 : Math.ceil(lanes / 2)
  const rightLanes = lanes - leftLanes
  let x = -half - leftLanes * bLan
  if (divider <= 0) x = -bMatDuong / 2
  const lanesStart = x
  for (let i = 0; i < lanes; i++) {
    if (divider > 0 && i === leftLanes) {
      bands.push({
        kind: 'phan_cach',
        label: 'Dải phân cách',
        x0: -half,
        x1: half
      })
      x = half
    }
    bands.push({ kind: 'lan', label: 'Làn xe', x0: x, x1: x + bLan })
    x += bLan
  }
  void rightLanes
  const right = x
  const outer = (side: -1 | 1, edge: number) => {
    const out: RoadBand[] = []
    let e = edge
    const step = (kind: RoadBand['kind'], label: string, w: number) => {
      if (w <= 0) return
      const a = e
      e += side * w
      out.push({
        kind,
        label,
        x0: Math.min(a, e),
        x1: Math.max(a, e)
      })
    }
    step('le_gia_co', 'Lề gia cố', n('bLeGiaCo'))
    if (curb) step('he', 'Hè', n('bHe'))
    else step('le_dat', 'Lề đất', n('bLeDat'))
    return out
  }
  const leftBands = outer(-1, lanesStart).reverse()
  const rightBands = outer(1, right)
  const all = [...leftBands, ...bands, ...rightBands]
  const bNen = all.length ? all[all.length - 1].x1 - all[0].x0 : 0
  const bAoDuong = bMatDuong + divider + 2 * n('bLeGiaCo')
  return {
    values: v,
    errors,
    layers: parsed.layers,
    bands: all,
    bMatDuong,
    bNen,
    tAoDuong,
    bAoDuong
  }
}

/**
 * Finished-surface level relative to the centreline, mm, at offset `x`
 * (left negative). Two-way: falls from the centre (or from each divider
 * edge) at iMat over lanes and hard shoulders, then iLeDat over the earth
 * shoulder. One-way: falls left to right. Sidewalks rise towards the
 * outside from the curb top.
 */
export function roadSurfaceLevel(model: RoadModel, x: number): number {
  const v = model.values
  const n = (k: string) => Number(v[k])
  const iMat = n('iMat') / 100
  const iLe = n('iLeDat') / 100
  const half = Math.max(n('bPhanCach'), 0) / 2
  const oneWay = String(v.kieuDoc) === 'mot_mai'
  const hardEdge = model.bAoDuong / 2
  // One-way: high at the left hard edge, the centreline at 0.
  if (oneWay) {
    const xc = Math.max(-hardEdge, Math.min(hardEdge, x))
    let y = -iMat * xc
    if (Math.abs(x) > hardEdge) {
      const yEdge = -iMat * Math.sign(x) * hardEdge
      y = yEdge - iLe * (Math.abs(x) - hardEdge)
      if (v.coBoVia === true) y = yEdge
    }
    return y
  }
  const ax = Math.abs(x)
  if (ax <= half) return 0
  const toHard = Math.min(ax, hardEdge) - half
  let y = -iMat * toHard
  if (ax > hardEdge && v.coBoVia !== true) y -= iLe * (ax - hardEdge)
  return y
}
