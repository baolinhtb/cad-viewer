import type {
  AcTpParamSpec,
  AcTpParamValues
} from '@mlightcad/cad-template-sdk'

import { DOSSIER_ROAD_MARGIN } from './derive'

export const DOSSIER_ID = 'ho_so_mo_m1'
/**
 * Generator version written into every run.
 *
 * 0.2.0 replaced the sheet border with the office title block
 * (`acTpBuildDrawingFrame`). Runs recorded at an older version regenerate
 * with *their* generator — {@link DOSSIER_VERSIONS} — so a saved 0.1.0
 * dossier keeps its original frame exactly.
 */
export const DOSSIER_VERSION = '0.3.1'
/** Every generator version this build can still regenerate, oldest first. */
export const DOSSIER_VERSIONS: readonly string[] = [
  '0.1.0',
  '0.2.0',
  '0.3.0',
  DOSSIER_VERSION
]

/**
 * The first A3 generator (sheets laid out as the source, real entities,
 * stretch grids). Its runs are edited by regenerating them when the drawing
 * has no hand edits (decision Q6); older runs keep label-only edits.
 */
export const DOSSIER_A3_VERSION = '0.3.0'

/**
 * The A3 generators: 0.3.0, then 0.3.1 (P1, after M2–M5b changed what 0.3.0
 * draws). Both build with today's A3 scene; a 0.3.0 run whose drawing no
 * longer matches it is unlocked by the user (`mo_khoa_031`), never redrawn
 * silently — and never sent to the 0.1/0.2 A1 generators.
 */
export const DOSSIER_A3_VERSIONS: readonly string[] = [
  DOSSIER_A3_VERSION,
  DOSSIER_VERSION
]
/** Whether a run was made by an A3 generator (0.3.0 or 0.3.1). */
export const acapIsA3Version = (version: string) =>
  DOSSIER_A3_VERSIONS.includes(version)

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
    key: 'nhanKichThuoc',
    label: 'Chữ trên kích thước và cao độ',
    type: 'choice',
    default: 'ky_hieu',
    choices: [
      { value: 'ky_hieu', label: 'Ký hiệu như bản gốc (B Mố, HB, EL…)' },
      { value: 'so_do', label: 'Số đo theo thông số' },
      { value: 'ca_hai', label: 'Ký hiệu = số đo' }
    ],
    group: 'Trình bày',
    hint: 'Bản gốc ghi ký hiệu thay cho số trên kích thước và mốc cao độ; so_do/ca_hai cho hiện số đo, đổi theo thông số. Không đổi hình học.'
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
/** Drawn width of the source bearing `Goi I24` across the bridge, mm. */
export const DOSSIER_BEARING_WIDTH = 560
/** Drawn width of the source bearing stop `UCX dam I24`, mm. */
export const DOSSIER_STOP_WIDTH = 1000
/**
 * Least gap kept between a stop and each bearing beside it when the stop
 * has to be drawn narrower than the source to fit, mm (M1 has 220).
 */
export const DOSSIER_STOP_CLEARANCE = 100
/** Narrower than this a stop is not drawn at all, mm. */
const STOP_MIN_WIDTH = 100

/**
 * Where the bearing stops go: one at the middle of each pair of bearings,
 * floor(soGoi / 2) of them, pairs taken from the outside in on alternate sides —
 * (1–2) on the right, (n−1, n) on the left, then (3–4)… — so M1's 4
 * bearings give its two stops and an odd count leaves the middle bearing
 * alone. Offsets from the bearing centre line, like `bearings`.
 */
export function dossierStopOffsets(bearings: readonly number[]): number[] {
  const right = [...bearings].sort((a, b) => b - a)
  const out: number[] = []
  let lo = 0
  let hi = right.length - 1
  for (let k = 0; k < Math.floor(right.length / 2); k++)
    if (k % 2 === 0) {
      out.push((right[lo] + right[lo + 1]) / 2)
      lo += 2
    } else {
      out.push((right[hi] + right[hi - 1]) / 2)
      hi -= 2
    }
  return out.sort((a, b) => a - b)
}

/**
 * Width a stop is drawn at between bearings `aGoi` apart: the source's 1000
 * while it fits, otherwise narrowed to keep DOSSIER_STOP_CLEARANCE to each
 * bearing; 0 (not drawn) when even that leaves less than 100 mm.
 */
export function dossierStopWidth(aGoi: number): number {
  const room = aGoi - DOSSIER_BEARING_WIDTH - 2 * DOSSIER_STOP_CLEARANCE
  return Math.max(
    0,
    Math.min(DOSSIER_STOP_WIDTH, room >= STOP_MIN_WIDTH ? room : 0)
  )
}

export interface DossierModel {
  values: AcTpParamValues
  piles: DossierPoint[]
  bearings: number[]
  /** Bearing stops: offsets from the bearing centre line and drawn width. */
  stops: { offsets: number[]; width: number }
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

/**
 * Label mode of a dossier created now (standard assumption 10): symbol and
 * measurement, "B Mố = 7700". The parameter's own default stays `ky_hieu`,
 * because it is also what a run stored before the parameter existed means —
 * those runs must regenerate exactly as they were drawn.
 */
export const DOSSIER_NEW_LABEL_MODE = 'ca_hai'

/**
 * How a parameter is named to the user: short spoken names where the dialog
 * label is long, otherwise the label without its bracketed note, lower-case.
 * Tool messages are often repeated word for word by the agent, so they name
 * parameters this way, never by key (QA P1/M6).
 */
const SPOKEN: Record<string, string> = {
  bThan: 'bề rộng thân',
  tThan: 'dày tường thân',
  lBe: 'chiều dài bệ',
  hThan: 'chiều cao thân',
  hDau: 'chiều cao tường đỉnh',
  muiBe: 'khoảng mép bệ tới mặt trước thân',
  phuLot: 'phần lót nhô mỗi mép',
  docNgang: 'dốc ngang',
  docDoc: 'dốc đỉnh cánh',
  lCanh: 'chiều dài tường cánh',
  hLanCan: 'chiều cao lan can',
  lCoc: 'chiều dài cọc',
  soGoi: 'số gối',
  aGoi: 'tim gối'
}
export function dossierParamLabel(key: string): string {
  if (SPOKEN[key]) return SPOKEN[key]
  const label = DOSSIER_PARAMS.find(p => p.key === key)?.label
  if (!label) return key
  const plain = label
    .replace(/\s*\(.*\)\s*/g, ' ')
    .split(',')[0]
    .trim()
  return plain.charAt(0).toLocaleLowerCase('vi') + plain.slice(1)
}
/** A parameter and its value as the user reads it: «dày tường cánh = 500 mm». */
export function dossierParamValue(key: string, value: unknown): string {
  const unit = DOSSIER_PARAMS.find(p => p.key === key)?.unit
  return `${dossierParamLabel(key)} = ${String(value)}${unit ? ` ${unit}` : ''}`
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
      stops: { offsets: [], width: 0 },
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
  // M1 keeps DOSSIER_ROAD_MARGIN between road edge and stem edge (kerb,
  // rail foot); narrower is only a warning. The error threshold is the one
  // the check always had, so dossiers it accepted still build.
  const roadMargin = (n('bThan') - n('bMatDuong')) / 2
  if (roadMargin < DOSSIER_ROAD_MARGIN) {
    const proposed = n('bMatDuong') + 2 * DOSSIER_ROAD_MARGIN
    const outside = n('bMatDuong') > n('bThan') + 300
    issue(
      'road_outside_wall',
      outside ? 'error' : 'warning',
      `${outside ? 'Mặt đường vượt bề rộng bố trí phía trên mố' : `Lề mép đường mỗi bên ${roadMargin} mm, nhỏ hơn ${DOSSIER_ROAD_MARGIN} mm của M1 (dải gờ/chân lan can bị thu hẹp)`}: bề rộng mặt đường ${n('bMatDuong')} mm, bề rộng thân ${n('bThan')} mm. Đề xuất bề rộng bệ = bề rộng thân = bề rộng mặt đường + 2 × ${DOSSIER_ROAD_MARGIN} = ${proposed} mm.`
    )
  }
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
  const bearings = Array.from(
    { length: n('soGoi') },
    (_, i) => (i - (n('soGoi') - 1) / 2) * n('aGoi')
  )
  const stopWidth = dossierStopWidth(n('aGoi'))
  if (n('soGoi') >= 2 && stopWidth < DOSSIER_STOP_WIDTH)
    issue(
      'u_chong_xo_thu_hep',
      'warning',
      stopWidth
        ? `Ụ chống xô vẽ hẹp ${stopWidth} mm (mẫu M1 ${DOSSIER_STOP_WIDTH}) để lọt khe giữa hai gối cách ${n('aGoi')} mm, chừa ${DOSSIER_STOP_CLEARANCE} mm mỗi bên; khối lượng vẫn tính theo ụ M1 — cần kỹ sư chốt cấu tạo ụ.`
        : `Gối cách ${n('aGoi')} mm không còn chỗ vẽ ụ chống xô; khối lượng vẫn tính theo ụ M1 — cần kỹ sư chốt cấu tạo ụ.`
    )
  return {
    values,
    piles,
    bearings,
    stops: { offsets: dossierStopOffsets(bearings), width: stopWidth },
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
