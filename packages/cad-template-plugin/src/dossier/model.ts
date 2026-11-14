import type {
  AcTpParamSpec,
  AcTpParamValues
} from '@mlightcad/cad-template-sdk'

export const DOSSIER_ID = 'ho_so_mo_m1'
/**
 * Generator version written into every run.
 *
 * 0.2.0 replaced the sheet border with the office title block
 * (`acTpBuildDrawingFrame`). Runs recorded at an older version regenerate
 * with *their* generator — {@link DOSSIER_VERSIONS} — so a saved 0.1.0
 * dossier keeps its original frame exactly.
 */
export const DOSSIER_VERSION = '0.2.0'
/** Every generator version this build can still regenerate, oldest first. */
export const DOSSIER_VERSIONS: readonly string[] = ['0.1.0', DOSSIER_VERSION]

/**
 * Title-block fields (0.2.0). Text only: changing them never changes geometry,
 * so they neither switch the dossier off its source drawing nor need a
 * rebuild — a label edit patches them in place. May be left blank.
 */
export const DOSSIER_TITLE_KEYS: readonly string[] = [
  'duAn',
  'donVi',
  'nguoiChuTri',
  'nguoiThietKe',
  'nguoiKiemTra',
  'nguoiDuyet',
  'ngay'
]
export const REFERENCE_ID = 'btc-mo2-m1-2026-11-02'

/** Lengths are mm, elevations are m, slopes are percent. Screen x grows
 * towards LEFT chainage side in the reference's front elevation. */
const PARAMS: readonly AcTpParamSpec[] = [
  {
    key: 'tenMo',
    label: 'Tên mố',
    type: 'text',
    default: 'M1',
    group: 'Hồ sơ'
  },
  {
    key: 'congTrinh',
    label: 'Công trình',
    type: 'text',
    default: 'Cầu Km0+400 — Tuyến số 2',
    group: 'Hồ sơ'
  },
  ...(
    [
      ['duAn', 'Dự án'],
      ['donVi', 'Đơn vị thiết kế'],
      ['nguoiChuTri', 'Chủ trì'],
      ['nguoiThietKe', 'Thiết kế'],
      ['nguoiKiemTra', 'Kiểm tra'],
      ['nguoiDuyet', 'Duyệt'],
      ['ngay', 'Ngày']
    ] as const
  ).map(
    ([key, label]): AcTpParamSpec => ({
      key,
      label,
      type: 'text',
      default: '',
      group: 'Khung tên',
      hint: 'Ghi vào khung tên của cả 6 tờ; để trống thì ô để trống.'
    })
  ),
  {
    key: 'bBe',
    label: 'Bề rộng bệ',
    type: 'number',
    unit: 'mm',
    min: 3000,
    max: 16000,
    default: 7700,
    group: 'Bệ và thân'
  },
  {
    key: 'lBe',
    label: 'Chiều dài bệ dọc cầu',
    type: 'number',
    unit: 'mm',
    min: 3000,
    max: 12000,
    default: 6000,
    group: 'Bệ và thân'
  },
  {
    key: 'hBe',
    label: 'Chiều cao bệ',
    type: 'number',
    unit: 'mm',
    min: 500,
    max: 4000,
    default: 2000,
    group: 'Bệ và thân'
  },
  {
    key: 'hLot',
    label: 'Dày bê tông lót',
    type: 'number',
    unit: 'mm',
    min: 50,
    max: 300,
    default: 100,
    group: 'Bệ và thân'
  },
  {
    key: 'phuLot',
    label: 'Lót nhô mỗi mép',
    type: 'number',
    unit: 'mm',
    min: 0,
    max: 500,
    default: 100,
    group: 'Bệ và thân'
  },
  {
    key: 'bThan',
    label: 'Bề rộng thân ngang cầu',
    type: 'number',
    unit: 'mm',
    min: 2000,
    max: 16000,
    default: 7700,
    group: 'Bệ và thân'
  },
  {
    key: 'tThan',
    label: 'Bề dày thân dọc cầu',
    type: 'number',
    unit: 'mm',
    min: 600,
    max: 3000,
    default: 1500,
    group: 'Bệ và thân'
  },
  {
    key: 'muiBe',
    label: 'Mép bệ tới mặt trước thân',
    type: 'number',
    unit: 'mm',
    min: 300,
    max: 6000,
    default: 2000,
    group: 'Bệ và thân'
  },
  {
    key: 'hThan',
    label: 'Cao thân tại tim từ đỉnh bệ',
    type: 'number',
    unit: 'mm',
    min: 1000,
    max: 10000,
    default: 4717,
    group: 'Cao độ'
  },
  {
    key: 'hDau',
    label: 'Cao tường đỉnh tại tim',
    type: 'number',
    unit: 'mm',
    min: 600,
    max: 3000,
    default: 1887,
    group: 'Cao độ'
  },
  {
    key: 'caoDoDayBe',
    label: 'Cao độ đáy bệ',
    type: 'number',
    unit: 'm',
    min: -1000,
    max: 9000,
    default: 228.837,
    group: 'Cao độ'
  },
  {
    key: 'docNgang',
    label: 'Dốc ngang, dương: trái tuyến cao',
    type: 'number',
    unit: '%',
    min: -8,
    max: 8,
    default: 2,
    group: 'Cao độ'
  },
  {
    key: 'docDoc',
    label: 'Dốc đỉnh cánh, dương: xa cầu cao',
    type: 'number',
    unit: '%',
    min: -8,
    max: 8,
    default: 2.8,
    group: 'Cao độ'
  },
  {
    key: 'lCanh',
    label: 'Chiều dài cánh Lc (không phải cọc)',
    type: 'number',
    unit: 'mm',
    min: 4000,
    max: 12000,
    default: 6500,
    group: 'Tường cánh'
  },
  {
    key: 'tCanh',
    label: 'Dày tường cánh',
    type: 'number',
    unit: 'mm',
    min: 200,
    max: 1000,
    default: 500,
    group: 'Tường cánh'
  },
  {
    key: 'bMatDuong',
    label: 'Bề rộng mặt đường',
    type: 'number',
    unit: 'mm',
    min: 2000,
    max: 15000,
    default: 7000,
    group: 'Tường cánh'
  },
  {
    key: 'hLanCan',
    label: 'Chiều cao thể hiện lan can',
    type: 'number',
    unit: 'mm',
    min: 600,
    max: 1800,
    default: 1140,
    group: 'Tường cánh'
  },
  {
    key: 'D',
    label: 'Đường kính cọc',
    type: 'number',
    unit: 'mm',
    min: 600,
    max: 2500,
    default: 1200,
    group: 'Cọc'
  },
  {
    key: 'soCotCoc',
    label: 'Số cọc mỗi hàng ngang',
    type: 'integer',
    unit: 'cọc',
    min: 1,
    max: 6,
    default: 2,
    group: 'Cọc'
  },
  {
    key: 'soHangCoc',
    label: 'Số hàng cọc dọc cầu',
    type: 'integer',
    unit: 'hàng',
    min: 1,
    max: 4,
    default: 2,
    group: 'Cọc'
  },
  {
    key: 'aCocNgang',
    label: 'Tim cọc ngang',
    type: 'number',
    unit: 'mm',
    min: 600,
    max: 10000,
    default: 5300,
    group: 'Cọc'
  },
  {
    key: 'aCocDoc',
    label: 'Tim cọc dọc',
    type: 'number',
    unit: 'mm',
    min: 600,
    max: 10000,
    default: 3600,
    group: 'Cọc'
  },
  {
    key: 'lCoc',
    label: 'Chiều dài cọc thực (0: chưa có thiết kế)',
    type: 'number',
    unit: 'mm',
    min: 0,
    max: 100000,
    default: 0,
    group: 'Cọc'
  },
  {
    key: 'soGoi',
    label: 'Số vị trí gối',
    type: 'integer',
    unit: 'gối',
    min: 2,
    max: 8,
    default: 4,
    group: 'Gối'
  },
  {
    key: 'aGoi',
    label: 'Tim gối',
    type: 'number',
    unit: 'mm',
    min: 500,
    max: 4000,
    default: 2000,
    group: 'Gối'
  },
  {
    key: 'thep',
    label: 'Cốt thép',
    type: 'choice',
    default: 'mau',
    choices: [
      { value: 'mau', label: 'Tham chiếu mẫu M1' },
      { value: 'khong', label: 'Chỉ bố trí chung' }
    ],
    group: 'Đối chiếu'
  },
  {
    key: 'beTongLot',
    label: 'Bê tông lót (hình C8, bảng C10)',
    type: 'choice',
    default: 'chua_chot',
    choices: [
      { value: 'chua_chot', label: 'Chưa chốt' },
      { value: 'C8', label: 'C8' },
      { value: 'C10', label: 'C10' }
    ],
    group: 'Đối chiếu'
  },
  {
    key: 'thepF3',
    label: 'F3 (hình D22/D25)',
    type: 'choice',
    default: 'chua_chot',
    choices: [
      { value: 'chua_chot', label: 'Chưa chốt' },
      { value: 'D22', label: 'D22' },
      { value: 'D25', label: 'D25 — cần phương án gia công mới' }
    ],
    group: 'Đối chiếu'
  },
  {
    key: 'thepW16',
    label: 'W16/W16′ (hình D14, bảng D16)',
    type: 'choice',
    default: 'chua_chot',
    choices: [
      { value: 'chua_chot', label: 'Chưa chốt' },
      { value: 'D14', label: 'D14 — cần phương án gia công mới' },
      { value: 'D16', label: 'D16' }
    ],
    group: 'Đối chiếu'
  },
  {
    key: 'x',
    label: 'Gốc bộ tờ X',
    type: 'number',
    unit: 'mm',
    min: -1e9,
    max: 1e9,
    default: 0,
    group: 'Bố trí'
  },
  {
    key: 'y',
    label: 'Gốc bộ tờ Y',
    type: 'number',
    unit: 'mm',
    min: -1e9,
    max: 1e9,
    default: 0,
    group: 'Bố trí'
  }
]
export const DOSSIER_PARAMS: readonly AcTpParamSpec[] = PARAMS.map(p => ({
  ...p,
  hint:
    p.hint ??
    'Kích thước do thiết kế quyết định; dải chỉ chặn sai số nhập liệu, không phải giới hạn tiêu chuẩn.'
}))

export interface DossierIssue {
  code: string
  level: 'error' | 'warning'
  message: string
}
export interface DossierPoint {
  x: number
  y: number
}
export interface DossierModel {
  values: AcTpParamValues
  piles: DossierPoint[]
  bearings: number[]
  elevations: {
    bottom: number
    footing: number
    seat: number
    wall: number
    seatLeft: number
    seatRight: number
  }
  issues: DossierIssue[]
  referenceSteelApplicable: boolean
  quantities: {
    footing: number
    blinding: number
    stem: number
    pileConcrete: number | null
  }
}

export function dossierDefaults(): AcTpParamValues {
  return Object.fromEntries(DOSSIER_PARAMS.map(p => [p.key, p.default!]))
}

export function buildDossierModel(input: AcTpParamValues = {}): DossierModel {
  const values = { ...dossierDefaults(), ...input }
  const issues: DossierIssue[] = []
  const issue = (code: string, level: DossierIssue['level'], message: string) =>
    issues.push({ code, level, message })
  const known = new Set(DOSSIER_PARAMS.map(p => p.key))
  for (const key of Object.keys(input))
    if (!known.has(key))
      issue(
        'unknown_parameter',
        'error',
        `Không có thông số "${key}"; chưa áp dụng thay đổi.`
      )
  for (const p of DOSSIER_PARAMS) {
    const raw = values[p.key]
    if (p.type === 'number' || p.type === 'integer') {
      const n =
        typeof raw === 'number'
          ? raw
          : typeof raw === 'string' && raw.trim()
            ? Number(raw)
            : NaN
      if (
        !Number.isFinite(n) ||
        (p.type === 'integer' && !Number.isInteger(n)) ||
        (p.min !== undefined && n < p.min) ||
        (p.max !== undefined && n > p.max)
      ) {
        issue(
          'invalid_parameter',
          'error',
          `${p.label}: cần ${p.type === 'integer' ? 'số nguyên' : 'số'} trong ${p.min}–${p.max} ${p.unit}.`
        )
      } else values[p.key] = n
    } else if (p.type === 'choice' && !p.choices?.some(c => c.value === raw))
      issue('invalid_parameter', 'error', `${p.label}: lựa chọn không hợp lệ.`)
    else if (
      p.type === 'text' &&
      (typeof raw !== 'string' ||
        // Title-block fields may be blank; every other text is required.
        (!raw.trim() && p.default !== '') ||
        raw.length > 100 ||
        raw.split('').some(c => c.charCodeAt(0) < 32))
    )
      issue(
        'invalid_parameter',
        'error',
        `${p.label}: cần chuỗi một dòng từ 1 đến 100 ký tự.`
      )
  }
  // Do not calculate with malformed values: callers can inspect diagnostics safely.
  if (issues.some(i => i.level === 'error'))
    return {
      values,
      piles: [],
      bearings: [],
      elevations: {
        bottom: 0,
        footing: 0,
        seat: 0,
        wall: 0,
        seatLeft: 0,
        seatRight: 0
      },
      issues,
      referenceSteelApplicable: false,
      quantities: { footing: 0, blinding: 0, stem: 0, pileConcrete: null }
    }
  const n = (key: string) => values[key] as number
  if (n('bThan') > n('bBe'))
    issue('stem_outside_footing', 'error', 'Tường thân vượt bề rộng bệ.')
  if (n('muiBe') + n('tThan') >= n('lBe'))
    issue(
      'stem_outside_footing',
      'error',
      'Vị trí và bề dày thân không nằm trong chiều dài bệ.'
    )
  if (n('bMatDuong') > n('bThan') + 300)
    issue(
      'road_outside_wall',
      'error',
      'Mặt đường vượt bề rộng bố trí phía trên mố.'
    )
  if (2 * n('tCanh') >= n('bThan'))
    issue('wing_overlap', 'error', 'Hai tường cánh không còn khoảng lọt lòng.')
  if (
    n('hThan') +
      n('hDau') -
      ((Math.abs(n('docNgang')) / 100) * n('bThan')) / 2 +
      (n('docDoc') / 100) * n('lCanh') <=
    5200
  )
    issue(
      'wing_profile_inverted',
      'error',
      'Đỉnh tường cánh thấp hơn điểm kết thúc đoạn vát 1:1 của cấu tạo mẫu; cần cấu tạo cánh khác.'
    )
  if (n('hThan') <= ((Math.abs(n('docNgang')) / 100) * n('bThan')) / 2)
    issue(
      'negative_stem_height',
      'error',
      'Dốc ngang làm chiều cao thân tại mép không dương.'
    )
  const spanX = (n('soCotCoc') - 1) * n('aCocNgang')
  const spanY = (n('soHangCoc') - 1) * n('aCocDoc')
  if (
    (n('bBe') - spanX - n('D')) / 2 < 300 ||
    (n('lBe') - spanY - n('D')) / 2 < 300
  )
    issue(
      'pile_edge_clearance',
      'error',
      'Mặt bên cọc ngoài cùng phải cách mép bệ ít nhất 300 mm trong cả hai phương.'
    )
  if (
    (n('soCotCoc') > 1 && n('aCocNgang') <= n('D')) ||
    (n('soHangCoc') > 1 && n('aCocDoc') <= n('D'))
  )
    issue(
      'pile_overlap',
      'error',
      'Các cọc giao nhau; khoảng cách tim phải lớn hơn đường kính.'
    )
  if ((n('soGoi') - 1) * n('aGoi') + 500 > n('bThan'))
    issue(
      'bearing_outside_wall',
      'error',
      'Các vị trí gối vượt bề rộng thân (kể cả bề rộng ký hiệu 500 mm).'
    )
  const piles: DossierPoint[] = []
  for (let row = 0; row < n('soHangCoc'); row++)
    for (let col = 0; col < n('soCotCoc'); col++)
      piles.push({
        x: -spanX / 2 + col * n('aCocNgang'),
        y: -spanY / 2 + row * n('aCocDoc')
      })
  const bottom = n('caoDoDayBe'),
    footing = bottom + n('hBe') / 1000
  const seat = footing + n('hThan') / 1000,
    wall = seat + n('hDau') / 1000
  const crossRise = ((n('docNgang') / 100) * n('bThan')) / 2000
  const defaults = dossierDefaults()
  const geometryKeys = DOSSIER_PARAMS.filter(
    p => p.type === 'number' || p.type === 'integer'
  )
    .map(p => p.key)
    .filter(k => !['x', 'y', 'caoDoDayBe', 'lCoc'].includes(k))
  const referenceSteelApplicable =
    values.thep === 'mau' &&
    geometryKeys.every(k => values[k] === defaults[k]) &&
    values.thepF3 !== 'D25' &&
    values.thepW16 !== 'D14'
  if (values.thep === 'mau' && !referenceSteelApplicable)
    issue(
      'steel_outside_reference',
      'warning',
      'Hình học hoặc cấu tạo thép đã khác mẫu M1: không sao chép hình thép và khối lượng thép cũ. Cần phương án thép mới.'
    )
  if (values.thep === 'khong')
    issue(
      'steel_missing',
      'warning',
      'Chỉ dựng bố trí chung; hồ sơ chưa có phương án cốt thép.'
    )
  for (const key of ['beTongLot', 'thepF3', 'thepW16'])
    if (values[key] === 'chua_chot')
      issue(
        `unresolved_${key}`,
        'warning',
        DOSSIER_PARAMS.find(p => p.key === key)!.label +
          ': chưa được kỹ sư chốt.'
      )
  if (!n('lCoc'))
    issue(
      'pile_length_missing',
      'warning',
      'Chưa có chiều dài cọc thực; phần cọc trên hình đứng chỉ thể hiện ngắt đoạn, chưa tính khối lượng cọc.'
    )
  issue(
    'source_height_conflict',
    'warning',
    'Mẫu có chênh chiều cao giữa hình chính và bảng. Bộ sinh dùng H1A=4717, H1B=1887 mm và dốc từ mô hình; chưa xác nhận thay thế hồ sơ gốc.'
  )
  issue(
    'detail_coverage',
    'warning',
    'Chi tiết neo, nối, cốt thép cọc, gối và bản quá độ chưa đủ dữ liệu để phát hành thi công; các tờ giữ trạng thái bản nháp.'
  )
  return {
    values,
    piles,
    bearings: Array.from(
      { length: n('soGoi') },
      (_, i) => (i - (n('soGoi') - 1) / 2) * n('aGoi')
    ),
    elevations: {
      bottom,
      footing,
      seat,
      wall,
      seatLeft: seat + crossRise,
      seatRight: seat - crossRise
    },
    issues,
    referenceSteelApplicable,
    quantities: {
      footing: (n('bBe') * n('lBe') * n('hBe')) / 1e9,
      blinding:
        ((n('bBe') + 2 * n('phuLot')) *
          (n('lBe') + 2 * n('phuLot')) *
          n('hLot')) /
        1e9,
      stem: (n('bThan') * n('tThan') * n('hThan')) / 1e9,
      pileConcrete: n('lCoc')
        ? (piles.length * Math.PI * (n('D') / 2) ** 2 * n('lCoc')) / 1e9
        : null
    }
  }
}
