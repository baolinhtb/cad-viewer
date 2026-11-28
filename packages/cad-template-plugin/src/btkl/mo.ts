/**
 * Quantity take-off (BTKL) of the abutment dossier `ho_so_mo_m1`.
 *
 * Pure: parameters in, lines out — no drawing is touched. Every computed line
 * carries its formula written with the run's own values, and is compared
 * with the SUB-100 table of the source while the geometry is the source's.
 *
 * Measurement rules read from the source (BTKL B1, `tools/fidelity/btkl-do.mjs`):
 * - footing: the pile heads embedded 150 mm in the footing are deducted;
 * - blinding: the cross-section of the piles running through it is deducted;
 * - stem and head wall: the seat and the head-wall top follow the cross fall
 *   linearly, so the centre heights are the mean heights;
 * - wings: from the stem back face to the wing end; on the footing, then a
 *   1:1 underside to the end the drawing shows (1500 at the source slopes,
 *   see {@link acTpBtklWingEnds}), the top rising with the long fall. The
 *   lower wing sits `docNgang · bMatDuong` lower, except on the flat footing;
 * - formwork (B4): contact faces — the footing's four sides and the two large
 *   faces of the stem, head wall and each wing; the corbel and haunches are
 *   listed apart, outside the totals.
 */
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'

import { acTpPreP3Steel, sheetStretch } from '../dossier/grid030'
import {
  buildDossierModel,
  DOSSIER_STOP_WIDTH,
  dossierDefaults,
  dossierParamLabel
} from '../dossier/model'
import bars from '../dossier/reference/bars.json'
import { acTpSteelKgPerM, BTKL_M1_SOURCE } from './sourceM1'
import { type AcTpSteelSchedule, acTpSteelScheduleMo } from './thepMo'
import type {
  AcTpBtklBar,
  AcTpBtklFlag,
  AcTpBtklItem,
  AcTpBtklResult
} from './types'

/** Pile heads embedded in the footing, mm (source: pile top 150 above its bottom). */
export const BTKL_PILE_EMBED = 150
/** Head-wall thickness T, mm (fixed in the source and the 0.3.0 generator). */
const HEAD_WALL = 500
/** Wing end height above the 1:1 underside, mm (source B–B and C–C). */
const WING_END = 1500
/**
 * The wing end dimensions of the drawing (source points, sheet-local): B–B
 * (SUB-010, left of the route, `20F02C3`) and C–C (SUB-020, right of the
 * route, `2111631`), top then the end of the 1:1 underside.
 */
const WING_END_DIMS: Record<
  'left' | 'right',
  { sheet: string; top: [number, number]; foot: [number, number] }
> = {
  left: {
    sheet: 'SUB-010',
    top: [35866.886, 22072.841],
    foot: [35866.886, 20572.841]
  },
  right: {
    sheet: 'SUB-020',
    top: [2221.749, 12085.621],
    foot: [2221.749, 10585.621]
  }
}

/**
 * The wing end height the drawing shows, mm, left and right of the route
 * (P2-M6): the source 1500 plus what the slopes add between the end's top
 * and the end of its 1:1 underside — the cross fall lifts the high wing's
 * top and lowers the low one's, the wing top slope (docDoc) lifts both; the
 * underside keeps its place. The heights (hThan, hDau) and the rail do not
 * change it: 1500, as the take-off always measured. The source 1500 when a
 * sheet cannot follow the values (the line is refused elsewhere then).
 */
export function acTpBtklWingEnds(values: AcTpParamValues): {
  left: number
  right: number
} {
  const end = (side: 'left' | 'right') => {
    const d = WING_END_DIMS[side]
    const s = sheetStretch(d.sheet, values)
    if ('error' in s || s.identity || !s.rise) return WING_END
    return WING_END + s.rise(d.top, d.top) - s.rise(d.foot, d.foot)
  }
  return { left: end('left'), right: end('right') }
}
/** Ear walls: thickness × height, mm, along the seat N (source front view). */
const EAR = { t: 150, h: 1200 }
/** Approach-slab corbel section, m² (A–A: 300 × 300 with a 300 haunch). */
const CORBEL_SECTION = 0.1365
/** Corbel underside below the head-wall top, mm (A–A: 21891 − 20481). */
const CORBEL_DROP = 1410
/** Stem–wing haunch leg, mm (plan); also the corbel's chamfer legs (A–A). */
const HAUNCH = 300
/** Corbel vertical face, mm (A–A: 20781 → 21081). */
const CORBEL_FACE = 300

const S = BTKL_M1_SOURCE
const PI = Math.PI

/**
 * Parameters each line depends on. A line is compared with — or copied from —
 * the source table only while every parameter in its own list still has the
 * M1 value; changing `hBe` therefore no longer refuses the ear walls or the
 * PVC pipes. Lines that are scaled from the source (`tyLe`) are recomputed
 * once one of their parameters changes; lines listed under `giuGoc` keep the
 * source value until one of theirs changes, and are then refused.
 */
export const BTKL_MO_PHU_THUOC: Record<string, readonly string[]> = {
  be: ['bBe', 'lBe', 'hBe', 'D', 'soCotCoc', 'soHangCoc'],
  than: ['bThan', 'tThan', 'hThan'],
  dinh: ['bThan', 'hDau'],
  canh: [
    'lBe',
    'muiBe',
    'tThan',
    'lCanh',
    'docDoc',
    'hThan',
    'hDau',
    'docNgang',
    'bMatDuong',
    'tCanh'
  ],
  tai: ['tThan'],
  // Fixed detail of the source: two blocks `UCX dam I24` of the same size,
  // one between each pair of bearings. Their size does not follow the stem
  // width; their number follows the bearings (decision 3, 21/11/2026).
  u_chong_xo: ['soGoi'],
  // Scaled with the wing length and the rail height (standard assumption 2,
  // docs/GIA-DINH-TIEU-CHUAN.md); the rail section is taken as independent
  // of the wing thickness.
  lan_can: ['lCanh', 'hLanCan'],
  lot: ['bBe', 'lBe', 'phuLot', 'hLot', 'D', 'soCotCoc', 'soHangCoc'],
  vua: ['soGoi'],
  // Drain pipes counted across the stem width (standard assumption 3).
  ong_pvc: ['bThan'],
  bot_xop: ['bThan'],
  hop_chot: ['soGoi'],
  bt_nhua: ['bMatDuong'],
  van_khuon: [
    'bBe',
    'lBe',
    'hBe',
    'bThan',
    'hThan',
    'hDau',
    'muiBe',
    'tThan',
    'lCanh',
    'docDoc',
    'docNgang',
    'bMatDuong',
    'tCanh'
  ]
}
const DEP = BTKL_MO_PHU_THUOC

/**
 * Sums the lines `parts` into the line `total`. A line the drawing cannot
 * give (`khoiLuong: null`) does not blank the total (decision 3, 21/11/2026,
 * standard assumption 13): the lines that can be taken off are summed, and
 * the total says what it leaves out — in its explanation ("CHƯA GỒM …") and
 * in the flag `tong_thieu_dong`, which every BTKL view shows in red.
 */
export function acTpBtklSumInto(
  total: AcTpBtklItem,
  parts: readonly AcTpBtklItem[]
): void {
  const counted = parts.filter(i => i.khoiLuong !== null)
  const refused = parts.filter(i => i.khoiLuong === null)
  total.khoiLuong = counted.reduce((s, i) => s + i.khoiLuong!, 0)
  if (!refused.length) {
    total.dienGiai = `Cộng ${parts[0].stt}–${parts[parts.length - 1].stt}`
    return
  }
  const missing = refused.map(i => `${i.stt} ${i.hangMuc.toLowerCase()}`)
  total.dienGiai = `Cộng ${counted.map(i => i.stt).join(', ')}; CHƯA GỒM ${missing.join(', ')}`
  total.flags = [
    ...(total.flags ?? []),
    {
      code: 'tong_thieu_dong',
      message: `Tổng chưa gồm ${missing.join(', ')}: bản vẽ không đủ kích thước để tính lại, cần kỹ sư bổ sung.`
    }
  ]
}

/** Asphalt layer thickness, m — the standard 7 cm (standard assumption 4). */
export const BTKL_BT_NHUA_DAY = 0.07
/**
 * Asphalt length on the abutment, m: the M1 table's area over the M1 road
 * width (118.448 m² / 7 m). The source does not dimension it.
 */
export const BTKL_BT_NHUA_DAI = BTKL_M1_SOURCE.btNhua / 7

/** Steel groups of `bars.json` and the concrete line whose volume carries them. */
const STEEL_GROUPS: [string, string[], string][] = [
  ['be', ['be'], 'Bệ mố'],
  ['than', ['than'], 'Tường thân'],
  ['dinh', ['dau'], 'Tường đỉnh'],
  ['canh', ['canh_trai', 'canh_phai'], 'Tường cánh (2 bên)'],
  ['tai', ['tai'], 'Tường tai'],
  ['lan_can', ['lan_can'], 'Lan can trên tường cánh']
]

/** M1 steel by bar group, kg, at the table's kg/m (estimate before P3-M1). */
function m1SteelByGroup(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const b of bars)
    out[b.group] =
      (out[b.group] ?? 0) +
      (b.count * b.length * (b.kgPerM ?? acTpSteelKgPerM(b.diameter))) / 1000
  return out
}

/** Lines of the steel take-off by bar group, for a changed geometry. */
const STEEL_GROUP_LINES: [string, string[], string][] = [
  ...STEEL_GROUPS,
  ['goi', ['goi'], 'Gối'],
  ['phu', ['phu'], 'Phụ']
]

let m1Cache: AcTpBtklResult | undefined
/** The take-off at the M1 defaults: the volumes the steel ratios refer to. */
function m1(): AcTpBtklResult {
  return (m1Cache ??= acTpBtklMo())
}

/**
 * The bar schedule of an abutment run for its geometry (P3-M1, thepMo): the
 * groups no rule re-lays are estimated from the M1 ratio kg/m³ of their
 * member, as on the take-off.
 */
export function acTpBtklSteelSchedule(
  values: AcTpParamValues = {}
): AcTpSteelSchedule {
  const r = acTpBtklMo(values)
  return acTpSteelScheduleMo(
    buildDossierModel(values).values,
    volumeRatio(r.items, m1().items)
  )
}

/** New / M1 volume of a concrete line, null when either is unknown. */
const volumeRatio =
  (items: AcTpBtklItem[], base: AcTpBtklItem[]) => (key: string) => {
    const vol = items.find(i => i.key === key)?.khoiLuong ?? null
    const vol0 = base.find(i => i.key === key)?.khoiLuong ?? null
    return vol === null || !vol0 ? null : vol / vol0
  }

/** "1 234,567" — Vietnamese grouping, 3 decimals at most. */
export function acTpBtklNumber(v: number, digits = 3): string {
  const [i, f] = (Math.round(v * 10 ** digits) / 10 ** digits)
    .toFixed(digits)
    .split('.')
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const frac = f?.replace(/0+$/, '')
  return frac ? `${int},${frac}` : int
}
const f = (mm: number) => acTpBtklNumber(mm / 1000)

/** Concrete parts of one wing section, m² (see the module comment). */
function wingSection(
  top: number,
  onFooting: number,
  run: number,
  rise: number,
  lCanh: number,
  wingEnd: number = WING_END
) {
  // top: wing top over the footing top at the head-wall face; positions
  // along the wing from that face (mm).
  const at = (s: number) => top + rise * s
  const s0 = HEAD_WALL
  const s1 = s0 + onFooting
  const footingPart = ((at(s0) + at(s1)) / 2) * onFooting
  if (run <= 0) return { area: footingPart / 1e6, step: null }
  const step = at(lCanh) - run - wingEnd
  const slopePart = ((at(s1) - step + wingEnd) / 2) * run
  return { area: (footingPart + slopePart) / 1e6, step }
}

/**
 * The take-off of an abutment run. `values` are the run's parameters (the
 * dossier defaults fill the rest).
 */
export function acTpBtklMo(values: AcTpParamValues = {}): AcTpBtklResult {
  const model = buildDossierModel(values)
  const v = model.values
  const errors = model.issues
    .filter(i => i.level === 'error')
    .map(i => i.message)
  const name = `Mố ${v.tenMo}`
  if (errors.length) return { doiTuong: name, items: [], bars: [], errors }
  const n = (k: string) => Number(v[k])
  const defaults = dossierDefaults()
  // Per line, not for the whole run: a line is the source's own while the
  // parameters it depends on are (see BTKL_MO_PHU_THUOC).
  const changedOf = (keys: readonly string[]) =>
    keys.filter(k => v[k] !== defaults[k])
  const same = (...keys: string[]) =>
    keys.every(k => changedOf(DEP[k]).length === 0)
  const refusedFor = (key: string) =>
    `Đã đổi ${changedOf(DEP[key]).map(dossierParamLabel).join(', ')} so với mẫu M1; bản vẽ gốc không có đủ kích thước để tính lại dòng này.`

  const items: AcTpBtklItem[] = []
  const add = (
    item: Omit<AcTpBtklItem, 'trongTong'> & { trongTong?: boolean }
  ) =>
    items.push({
      trongTong: true,
      ...(DEP[item.key] ? { phuThuoc: [...DEP[item.key]] } : {}),
      ...item
    })
  const compare = (key: string, banGoc: number) => (same(key) ? { banGoc } : {})

  const piles = model.piles.length
  const pileArea = (PI * n('D') ** 2) / 4

  // ---- 1. Concrete C30 ------------------------------------------------------
  add({
    key: 'be_tong',
    stt: '1',
    nhom: 'be_tong',
    hangMuc: 'Bê tông C30 mố',
    donVi: 'm3',
    khoiLuong: null,
    dienGiai: '',
    nguon: 'tham_so',
    laTong: true
  })
  const footing =
    (n('bBe') * n('lBe') * n('hBe') - piles * pileArea * BTKL_PILE_EMBED) / 1e9
  add({
    key: 'be',
    stt: '1.1',
    nhom: 'be_tong',
    hangMuc: 'Bệ mố',
    donVi: 'm3',
    khoiLuong: footing,
    dienGiai: `${f(n('bBe'))} × ${f(n('lBe'))} × ${f(n('hBe'))} − ${piles} × π × ${f(n('D'))}²/4 × ${f(BTKL_PILE_EMBED)} (trừ đầu cọc ngàm vào bệ)`,
    nguon: 'tham_so',
    ...compare('be', S.beTong.be)
  })
  const stem = (n('bThan') * n('tThan') * n('hThan')) / 1e9
  add({
    key: 'than',
    stt: '1.2',
    nhom: 'be_tong',
    hangMuc: 'Tường thân',
    donVi: 'm3',
    khoiLuong: stem,
    dienGiai: `${f(n('bThan'))} × ${f(n('tThan'))} × ${f(n('hThan'))} (chiều cao tại tim = trung bình theo dốc ngang)`,
    nguon: 'tham_so',
    ...compare('than', S.beTong.than),
    flags: same('than')
      ? [
          {
            code: 'lech_ban_goc_than',
            message:
              'Bảng gốc ghi 53,667 m³, nhỏ hơn hình học 0,814 m³ (1,5 %); chưa giải thích được — đang chờ kỹ sư xác nhận.'
          }
        ]
      : undefined
  })
  const head = (n('bThan') * HEAD_WALL * n('hDau')) / 1e9
  add({
    key: 'dinh',
    stt: '1.3',
    nhom: 'be_tong',
    hangMuc: 'Tường đỉnh',
    donVi: 'm3',
    khoiLuong: head,
    dienGiai: `${f(n('bThan'))} × ${f(HEAD_WALL)} × ${f(n('hDau'))}`,
    nguon: 'tham_so',
    ...compare('dinh', S.beTong.dinh)
  })
  const onFooting = n('lBe') - n('muiBe') - n('tThan')
  const run = n('lCanh') - HEAD_WALL - onFooting
  const rise = n('docDoc') / 100
  const topHigh = n('hThan') + n('hDau')
  const drop = (Math.abs(n('docNgang')) / 100) * n('bMatDuong')
  // The wing end heights as drawn (P2-M6), no longer a fixed 1500: the high
  // wing is left of the route for a positive cross fall.
  const ends = acTpBtklWingEnds(v)
  const [endHigh, endLow] =
    n('docNgang') >= 0 ? [ends.left, ends.right] : [ends.right, ends.left]
  const sourceEnds = [endHigh, endLow].every(e => Math.abs(e - WING_END) < 1e-6)
  const high = wingSection(topHigh, onFooting, run, rise, n('lCanh'), endHigh)
  const low = wingSection(
    topHigh - drop,
    onFooting,
    run,
    rise,
    n('lCanh'),
    endLow
  )
  const wingFlags: AcTpBtklFlag[] = []
  if (same('canh'))
    wingFlags.push({
      code: 'lech_ban_goc_canh',
      message:
        'Bảng gốc ghi 27,710 m³, lớn hơn hình học 0,049 m³ (0,2 %): đỉnh cánh của bảng có thể đã làm tròn.'
    })
  if (high.step !== null && (low.step ?? 0) <= 0)
    return {
      doiTuong: name,
      items: [],
      bars: [],
      errors: [
        'Bậc đáy cánh (H4) không dương: đỉnh cánh quá thấp so với vát 1:1 của cấu tạo mẫu.'
      ]
    }
  add({
    key: 'canh',
    stt: '1.4',
    nhom: 'be_tong',
    hangMuc: 'Tường cánh (2 bên)',
    donVi: 'm3',
    khoiLuong: ((high.area + low.area) * n('tCanh')) / 1000,
    dienGiai:
      `${f(n('tCanh'))} × (${acTpBtklNumber(high.area)} + ${acTpBtklNumber(low.area)}); ` +
      `mỗi tiết diện = phần trên bệ dài ${f(onFooting)}` +
      (run > 0
        ? ` + phần vát 1:1 dài ${f(run)}, đầu cánh ${sourceEnds ? f(WING_END) : `${f(endHigh)} / ${f(endLow)} (theo hình)`}, H4 ${f(high.step!)} / ${f(low.step!)}`
        : '') +
      `; cánh thấp hạ ${f(drop)} = ${n('docNgang')} % × ${f(n('bMatDuong'))}`,
    nguon: 'tham_so',
    ...compare('canh', S.beTong.canh),
    flags: wingFlags.length ? wingFlags : undefined
  })
  /**
   * A line the drawing does not dimension: the source value while the line's
   * own parameters are M1's; afterwards `derive` (a formula, or the source
   * value scaled) when it can, else refused with the parameters that changed.
   */
  const fromSource = (
    key: string,
    stt: string,
    hangMuc: string,
    donVi: AcTpBtklItem['donVi'],
    value: number,
    nhom: AcTpBtklItem['nhom'] = 'be_tong',
    hint = '',
    derive?: { khoiLuong: number; dienGiai: string; tyLe?: boolean } | null,
    flags?: AcTpBtklFlag[]
  ) =>
    add(
      same(key)
        ? {
            key,
            stt,
            nhom,
            hangMuc,
            donVi,
            khoiLuong: value,
            dienGiai: `Bảng SUB-100 bản gốc${hint}`,
            nguon: 'ban_goc',
            banGoc: value,
            ...(flags ? { flags } : {})
          }
        : derive
          ? {
              key,
              stt,
              nhom,
              hangMuc,
              donVi,
              khoiLuong: derive.khoiLuong,
              dienGiai: derive.dienGiai,
              nguon: 'tham_so',
              ...(derive.tyLe || flags
                ? {
                    flags: [
                      ...(derive.tyLe
                        ? [
                            {
                              code: 'ty_le_ban_goc',
                              message: `Tỉ lệ từ bảng gốc M1 theo ${changedOf(DEP[key]).map(dossierParamLabel).join(', ')}; cấu tạo giữ như mẫu — cần kỹ sư xác nhận.`
                            }
                          ]
                        : []),
                      ...(flags ?? [])
                    ]
                  }
                : {})
            }
          : {
              key,
              stt,
              nhom,
              hangMuc,
              donVi,
              khoiLuong: null,
              dienGiai: '',
              nguon: 'tu_choi',
              lyDo: refusedFor(key)
            }
    )
  /** `value × now / was`, written out with the M1 value and the ratio. */
  const scaled = (
    value: number,
    now: number,
    was: number,
    what: string,
    digits = 3
  ) => ({
    khoiLuong: (value * now) / was,
    dienGiai: `${acTpBtklNumber(value, digits)} × ${acTpBtklNumber(now, digits)}/${acTpBtklNumber(was, digits)} (bảng gốc M1 theo tỉ lệ ${what})`,
    tyLe: true
  })
  const d0 = (k: string) => Number(defaults[k])
  const N = n('tThan') - HEAD_WALL
  fromSource(
    'tai',
    '1.5',
    'Tường tai',
    'm3',
    S.beTong.tai,
    'be_tong',
    ` (= 2 × ${f(EAR.t)} × ${f(EAR.h)} × N = ${f(N)})`,
    {
      khoiLuong: (2 * EAR.t * EAR.h * N) / 1e9,
      dienGiai: `2 × ${f(EAR.t)} × ${f(EAR.h)} × N, N = tThan − ${f(HEAD_WALL)} = ${f(N)} (cấu tạo tai như mẫu M1)`
    }
  )
  // M1: 4 bearings, 2 stops (one per pair), 0,304 m³ — 0,152 m³ a stop,
  // floor(soGoi / 2) stops, the number the dossier draws (dossierStopOffsets).
  // ASCII only: the sheet's SHX font has no floor brackets (drawn as `?`).
  const perStop = S.beTong.uChongXo / 2
  const stopFlags = (f: AcTpBtklFlag[]) => (f.length ? f : undefined)
  const stops = model.stops.offsets.length
  fromSource(
    'u_chong_xo',
    '1.6',
    'Ụ chống xô',
    'm3',
    S.beTong.uChongXo,
    'be_tong',
    '',
    {
      khoiLuong: perStop * stops,
      dienGiai: `${acTpBtklNumber(perStop)} × ${stops} ụ (bảng gốc M1: 1 ụ giữa mỗi cặp gối, ${acTpBtklNumber(perStop)} m³/ụ; ${n('soGoi') % 2 ? `floor(${n('soGoi')}/2)` : `${n('soGoi')}/2`} = ${stops} ụ)`,
      tyLe: true
    },
    stopFlags([
      ...(n('soGoi') % 2
        ? [
            {
              code: 'u_chong_xo_goi_le',
              message: `Số gối lẻ (${n('soGoi')}): ${stops} ụ trên các cặp gối từ ngoài vào, gối giữa không có cặp; số ụ cần kỹ sư chốt.`
            }
          ]
        : []),
      ...(model.stops.width < DOSSIER_STOP_WIDTH
        ? [
            {
              code: 'u_chong_xo_thu_hep',
              message: `Ụ vẽ hẹp ${model.stops.width} mm để lọt khe giữa hai gối cách ${n('aGoi')} mm; khối lượng vẫn theo ụ M1 ${acTpBtklNumber(perStop)} m³/ụ.`
            }
          ]
        : [])
    ])
  )
  fromSource(
    'lan_can',
    '1.7',
    'Lan can trên tường cánh',
    'm3',
    S.beTong.lanCan,
    'be_tong',
    '',
    // Length × rail height, both relative to M1 (standard assumption 2).
    {
      khoiLuong:
        (S.beTong.lanCan * n('lCanh') * n('hLanCan')) /
        (d0('lCanh') * d0('hLanCan')),
      dienGiai: `${acTpBtklNumber(S.beTong.lanCan)} × ${f(n('lCanh'))}/${f(d0('lCanh'))} × ${f(n('hLanCan'))}/${f(d0('hLanCan'))} (bảng gốc M1 theo tỉ lệ chiều dài cánh × chiều cao lan can)`,
      tyLe: true
    }
  )
  const parts = items.filter(i => i.nhom === 'be_tong' && i.stt.includes('.'))
  const total = items[0]
  acTpBtklSumInto(total, parts)
  if (
    parts.every(i => i.khoiLuong !== null) &&
    same('be', 'than', 'dinh', 'canh', 'tai', 'u_chong_xo', 'lan_can')
  )
    total.banGoc = S.beTong.tong

  // ---- 2. Blinding -------------------------------------------------------
  const bL = n('bBe') + 2 * n('phuLot')
  const lL = n('lBe') + 2 * n('phuLot')
  const grade = v.beTongLot === 'chua_chot' ? 'C10' : (v.beTongLot as string)
  add({
    key: 'lot',
    stt: '2',
    nhom: 'be_tong',
    hangMuc: `Bê tông đệm ${grade}`,
    donVi: 'm3',
    khoiLuong: (bL * lL * n('hLot') - piles * pileArea * n('hLot')) / 1e9,
    dienGiai: `(${f(bL)} × ${f(lL)} − ${piles} × π × ${f(n('D'))}²/4) × ${f(n('hLot'))} (trừ tiết diện cọc qua lớp đệm)`,
    nguon: 'tham_so',
    ...compare('lot', S.lot),
    flags:
      v.beTongLot === 'chua_chot'
        ? [
            {
              code: 'mau_thuan_lot',
              message:
                'Hình ghi C8, bảng ghi C10; chưa được kỹ sư chốt — đang theo bảng.'
            }
          ]
        : undefined
  })

  // ---- 3. Bored piles ----------------------------------------------------
  add(
    n('lCoc') > 0
      ? {
          key: 'coc',
          stt: '3',
          nhom: 'coc',
          hangMuc: `Bê tông cọc khoan nhồi D${n('D')}`,
          donVi: 'm3',
          khoiLuong: (piles * pileArea * n('lCoc')) / 1e9,
          dienGiai: `${piles} × π × ${f(n('D'))}²/4 × ${f(n('lCoc'))}`,
          nguon: 'tham_so'
        }
      : {
          key: 'coc',
          stt: '3',
          nhom: 'coc',
          hangMuc: `Bê tông cọc khoan nhồi D${n('D')}`,
          donVi: 'm3',
          khoiLuong: null,
          dienGiai: '',
          nguon: 'tu_choi',
          lyDo: `Chưa có chiều dài cọc (lCoc = 0); bản gốc M1 cũng không thống kê cọc. Nhập lCoc (mm, chiều dài một cọc theo hồ sơ địa chất) qua sua_ho_so_mo hoặc cap_nhat_btkl rồi chạy lại — không làm đổi hình vẽ; sẽ tính ${piles} × π × ${f(n('D'))}²/4 × lCoc.`
        }
  )

  // ---- 4. Materials ------------------------------------------------------
  fromSource(
    'vua',
    '4.1',
    'Vữa không co ngót',
    'm3',
    S.vuaKhongCoNgot,
    'vat_tu',
    '',
    scaled(S.vuaKhongCoNgot, n('soGoi'), d0('soGoi'), 'số gối')
  )
  fromSource(
    'ong_pvc',
    '4.2',
    'Ống PVC D125',
    'm',
    S.ongPvcD125,
    'vat_tu',
    '',
    scaled(S.ongPvcD125, n('bThan') / 1000, d0('bThan') / 1000, 'bThan')
  )
  fromSource(
    'bot_xop',
    '4.3',
    'Chèn bọt xốp',
    'm3',
    S.chenBotXop,
    'vat_tu',
    '',
    scaled(S.chenBotXop, n('bThan') / 1000, d0('bThan') / 1000, 'bThan')
  )
  fromSource('hop_chot', '4.4', 'Hộp chốt', 'hộp', S.hopChot, 'vat_tu', '', {
    khoiLuong: (S.hopChot * n('soGoi')) / d0('soGoi'),
    dienGiai: `${acTpBtklNumber(S.hopChot / d0('soGoi'))} hộp/gối × ${n('soGoi')} gối (như mẫu M1)`
  })
  // Asphalt (standard assumption 4): carriageway width × length on the
  // abutment × layer thickness. The length is the M1 table's area over its
  // road width (the source does not dimension it); the thickness is the
  // standard 7 cm. Both flagged as assumptions.
  const asphaltArea = (n('bMatDuong') / 1000) * BTKL_BT_NHUA_DAI
  const asphaltFlag = {
    code: 'bt_nhua_gia_dinh',
    message: `Giả định: chiều dài trên mố ${acTpBtklNumber(BTKL_BT_NHUA_DAI)} m lấy từ bảng M1 (118,448 m² / 7 m), lớp dày ${acTpBtklNumber(BTKL_BT_NHUA_DAY)} m theo tiêu chuẩn — kỹ sư xác nhận theo hồ sơ thực.`
  }
  add({
    key: 'bt_nhua',
    stt: '4.5',
    nhom: 'vat_tu',
    hangMuc: 'Bê tông nhựa nóng 2 kg/m²',
    donVi: 'm2',
    khoiLuong: asphaltArea,
    dienGiai: `${f(n('bMatDuong'))} × ${acTpBtklNumber(BTKL_BT_NHUA_DAI)} (bề rộng phần xe chạy × chiều dài trên mố); khối lượng lớp mặt ${acTpBtklNumber(asphaltArea)} × ${acTpBtklNumber(BTKL_BT_NHUA_DAY)} = ${acTpBtklNumber(asphaltArea * BTKL_BT_NHUA_DAY)} m³`,
    nguon: 'tham_so',
    ...compare('bt_nhua', S.btNhua),
    flags: [asphaltFlag]
  })

  // ---- 5. Formwork (B4) --------------------------------------------------
  // Contact-face rule read from the source: the four sides of the footing and
  // the two large faces of the stem, the head wall and each wing — 267.146
  // at M1 against the table's 266.600 (+0.2 %); no reading of the drawing
  // gives the table's figure exactly. Pending the measurement document.
  const formFaces: [string, string, number, string][] = [
    [
      'van_khuon_be',
      'Ván khuôn bệ (4 mặt bên)',
      (2 * (n('bBe') + n('lBe')) * n('hBe')) / 1e6,
      `2 × (${f(n('bBe'))} + ${f(n('lBe'))}) × ${f(n('hBe'))}`
    ],
    [
      'van_khuon_than',
      'Ván khuôn tường thân (2 mặt)',
      (2 * n('bThan') * n('hThan')) / 1e6,
      `2 × ${f(n('bThan'))} × ${f(n('hThan'))}`
    ],
    [
      'van_khuon_dinh',
      'Ván khuôn tường đỉnh (2 mặt)',
      (2 * n('bThan') * n('hDau')) / 1e6,
      `2 × ${f(n('bThan'))} × ${f(n('hDau'))}`
    ],
    [
      'van_khuon_canh',
      'Ván khuôn tường cánh (2 mặt × 2 bên)',
      2 * (high.area + low.area),
      `2 × (${acTpBtklNumber(high.area)} + ${acTpBtklNumber(low.area)}) (tiết diện cánh như dòng 1.4)`
    ]
  ]
  const formTotal = formFaces.reduce((sum, face) => sum + face[2], 0)
  add({
    key: 'van_khuon',
    stt: '5',
    nhom: 'van_khuon',
    hangMuc: 'Ván khuôn',
    donVi: 'm2',
    khoiLuong: formTotal,
    dienGiai: `Cộng 5.1–5.${formFaces.length}: diện tích mặt tiếp xúc (4 mặt bên bệ; 2 mặt lớn của thân, tường đỉnh, mỗi tường cánh)`,
    nguon: 'tham_so',
    laTong: true,
    ...compare('van_khuon', S.vanKhuon),
    flags: [
      ...(same('van_khuon')
        ? [
            {
              code: 'lech_ban_goc_van_khuon',
              message: `Bảng gốc ghi 266,6 m², nhỏ hơn quy tắc mặt tiếp xúc ${acTpBtklNumber(formTotal - S.vanKhuon)} m² (${acTpBtklNumber(((formTotal - S.vanKhuon) / S.vanKhuon) * 100, 1)} %); chưa tái lập đúng số của bảng.`
            }
          ]
        : []),
      {
        code: 'van_khuon_cho_dinh_muc',
        message:
          'Quy tắc đo ván khuôn theo bản gốc M1 (diện tích mặt tiếp xúc); chờ văn bản đo bóc/định mức để chốt (Q2).'
      }
    ]
  })
  formFaces.forEach(([key, hangMuc, value, dienGiai], k) =>
    add({
      key,
      stt: `5.${k + 1}`,
      nhom: 'van_khuon',
      hangMuc,
      donVi: 'm2',
      khoiLuong: value,
      dienGiai,
      nguon: 'tham_so'
    })
  )

  // ---- 6. Steel ----------------------------------------------------------
  const barList: AcTpBtklBar[] = []
  // A changed geometry with the M1 bar layout otherwise intact: estimated
  // from the M1 ratio kg/m³ of each member (decision d, option 2). A changed
  // bar choice (F3 D25, W16 D14) is a new detailing, not an estimate.
  const estimateSteel =
    !model.referenceSteelApplicable &&
    v.thep === 'mau' &&
    v.thepF3 !== 'D25' &&
    v.thepW16 !== 'D14'
  if (estimateSteel && acTpPreP3Steel()) {
    // As before P3-M1 (only to recognise a dossier drawn then, edit.ts).
    const kgOf = m1SteelByGroup()
    const base = m1()
    const volume = (list: AcTpBtklItem[], key: string) =>
      list.find(i => i.key === key)?.khoiLuong ?? null
    const missing = STEEL_GROUPS.filter(([key]) => volume(items, key) === null)
    if (missing.length)
      add({
        key: 'thep',
        stt: '6',
        nhom: 'cot_thep',
        hangMuc: 'Cốt thép',
        donVi: 'kg',
        khoiLuong: null,
        dienGiai: '',
        nguon: 'tu_choi',
        lyDo: `Không quy đổi được thép theo hàm lượng mẫu M1: thiếu thể tích ${missing.map(m => m[2].toLowerCase()).join(', ')}.`
      })
    else {
      const parts: [string, string, number, string][] = STEEL_GROUPS.map(
        ([key, groups, label]) => {
          const kg0 = groups.reduce((s, g) => s + (kgOf[g] ?? 0), 0)
          const vol0 = volume(base.items, key)!
          const vol = volume(items, key)!
          const ratio = kg0 / vol0
          return [
            `thep_hl_${key}`,
            `Thép ${label.toLowerCase()}`,
            ratio * vol,
            `${acTpBtklNumber(ratio, 1)} kg/m³ × ${acTpBtklNumber(vol)} m³ (M1: ${acTpBtklNumber(kg0, 1)} kg / ${acTpBtklNumber(vol0)} m³)`
          ]
        }
      )
      const goi = kgOf.goi ?? 0
      parts.push([
        'thep_hl_goi',
        'Thép gối',
        (goi * n('soGoi')) / d0('soGoi'),
        `${acTpBtklNumber(goi / d0('soGoi'), 1)} kg/gối × ${n('soGoi')} gối (bảng M1)`
      ])
      parts.push([
        'thep_hl_phu',
        'Thép phụ',
        kgOf.phu ?? 0,
        'Giữ nguyên bảng M1'
      ])
      add({
        key: 'thep',
        stt: '6',
        nhom: 'cot_thep',
        hangMuc: 'Cốt thép (tạm tính theo hàm lượng mẫu M1)',
        donVi: 'kg',
        khoiLuong: parts.reduce((s, p) => s + p[2], 0),
        dienGiai: `Cộng 6.1–6.${parts.length}: hàm lượng kg/m³ của từng cấu kiện mẫu M1 × thể tích mới`,
        nguon: 'tham_so',
        laTong: true,
        flags: [
          {
            code: 'thep_tam_tinh_ham_luong',
            message:
              'Tạm tính theo hàm lượng mẫu M1 (sai số cỡ ±10–15 %), đã tính vào tổng thép; chỉ dùng cho dự toán sơ bộ, chưa có bố trí thép cho hình học này.'
          }
        ]
      })
      parts.forEach(([key, hangMuc, kg, dienGiai], k) =>
        add({
          key,
          stt: `6.${k + 1}`,
          nhom: 'cot_thep',
          hangMuc,
          donVi: 'kg',
          khoiLuong: kg,
          dienGiai,
          nguon: 'tham_so'
        })
      )
    }
  } else if (estimateSteel) {
    // P3-M1: the M1 bar layout laid over the new geometry (thepMo): along
    // the bar the M1 covers and hooks, across the bars the M1 spacing, more
    // or fewer bars as the member widens or narrows. A group no rule
    // follows yet (the wings, the ear walls) keeps the M1 ratio kg/m³ of its
    // member — that group only, flagged.
    const base = m1()
    const volume = (list: AcTpBtklItem[], key: string) =>
      list.find(i => i.key === key)?.khoiLuong ?? null
    const schedule = acTpSteelScheduleMo(v, volumeRatio(items, base.items))
    // An estimated group needs its member's volume (as before P3-M1).
    const missing = STEEL_GROUPS.filter(
      ([key, groups]) =>
        volume(items, key) === null &&
        schedule.estimated.some(e => groups.includes(e.group))
    )
    if (missing.length)
      add({
        key: 'thep',
        stt: '6',
        nhom: 'cot_thep',
        hangMuc: 'Cốt thép',
        donVi: 'kg',
        khoiLuong: null,
        dienGiai: '',
        nguon: 'tu_choi',
        lyDo: `Không quy đổi được thép theo hàm lượng mẫu M1: thiếu thể tích ${missing.map(m => m[2].toLowerCase()).join(', ')}.`
      })
    else {
      for (const r of schedule.rows)
        if (!r.tamTinh)
          barList.push({
            mark: r.mark.toUpperCase(),
            diameter: r.diameter,
            surface: r.surface,
            count: r.count,
            length: r.length,
            kgPerM: r.kgPerM,
            kgPerMSource: bars.find(b => b.mark === r.mark)?.kgPerM
              ? 'bang_goc'
              : 'cong_thuc',
            kg: r.kg,
            group: r.group
          })
      const parts: [string, string, number, string][] = []
      for (const [key, groups, label] of STEEL_GROUP_LINES) {
        const of = schedule.rows.filter(r => groups.includes(r.group))
        if (!of.length) continue
        const kg = of.reduce((s, r) => s + r.kg, 0)
        const kg0 = of.reduce((s, r) => s + r.m1.kg, 0)
        const estimated = of.find(r => r.tamTinh)
        if (estimated) {
          const vol = volume(items, key)
          parts.push([
            `thep_hl_${key}`,
            `Thép ${label.toLowerCase()} (tạm tính theo hàm lượng mẫu M1)`,
            kg,
            vol === null
              ? `Giữ khối lượng M1 ${acTpBtklNumber(kg0, 1)} kg`
              : `${acTpBtklNumber(kg0 / volume(base.items, key)!, 1)} kg/m³ × ${acTpBtklNumber(vol)} m³ (M1: ${acTpBtklNumber(kg0, 1)} kg / ${acTpBtklNumber(volume(base.items, key)!)} m³) — chưa bố trí lại theo kích thước mới`
          ])
        } else {
          const changed = of.filter(
            r => r.count !== r.m1.count || r.length !== r.m1.length
          )
          parts.push([
            `thep_bt_${key}`,
            `Thép ${label.toLowerCase()}`,
            kg,
            `${of.length} số hiệu theo bố trí: Σ số lượng × dài × kg/m${
              changed.length
                ? `; theo kích thước mới: ${changed
                    .slice(0, 4)
                    .map(
                      r =>
                        `${r.mark.toUpperCase()} ${r.m1.count}→${r.count} thanh × ${r.length} mm`
                    )
                    .join(', ')}${changed.length > 4 ? '…' : ''}`
                : ' (như M1)'
            } (M1: ${acTpBtklNumber(kg0, 1)} kg)`
          ])
        }
      }
      const flags: AcTpBtklFlag[] = [
        {
          code: 'thep_bo_tri_m1_theo_hinh_hoc',
          message:
            'Bố trí thép mẫu M1 (đường kính, số hiệu, móc, lớp phủ, cự ly) đã kéo theo kích thước mới — chưa phải thiết kế cốt thép mới, chưa kiểm toán kết cấu.'
        }
      ]
      if (schedule.estimated.length)
        flags.push({
          code: 'thep_tam_tinh_ham_luong',
          message: `Chỉ ${schedule.estimated.map(e => e.label).join(', ')}: tạm tính theo hàm lượng mẫu M1 (sai số cỡ ±10–15 %), đã tính vào tổng thép — bố trí M1 của nhóm này chưa có quy tắc theo kích thước mới.`
        })
      add({
        key: 'thep',
        stt: '6',
        nhom: 'cot_thep',
        hangMuc: 'Cốt thép (bố trí mẫu M1 theo hình học mới)',
        donVi: 'kg',
        khoiLuong: parts.reduce((s, p) => s + p[2], 0),
        dienGiai: `Cộng 6.1–6.${parts.length}: ${barList.length} số hiệu đếm theo bố trí${
          schedule.estimated.length
            ? `, ${schedule.estimated.map(e => e.label).join(', ')} tạm tính theo hàm lượng`
            : ''
        }`,
        nguon: 'tham_so',
        laTong: true,
        flags
      })
      parts.forEach(([key, hangMuc, kg, dienGiai], k) =>
        add({
          key,
          stt: `6.${k + 1}`,
          nhom: 'cot_thep',
          hangMuc,
          donVi: 'kg',
          khoiLuong: kg,
          dienGiai,
          nguon: 'tham_so'
        })
      )
    }
  } else if (!model.referenceSteelApplicable)
    add({
      key: 'thep',
      stt: '6',
      nhom: 'cot_thep',
      hangMuc: 'Cốt thép',
      donVi: 'kg',
      khoiLuong: null,
      dienGiai: '',
      nguon: 'tu_choi',
      lyDo:
        v.thep === 'khong'
          ? 'Hồ sơ chỉ có bố trí chung, chưa có phương án cốt thép.'
          : 'Cấu tạo thép đã khác mẫu M1 (F3 D25 hoặc W16 D14): không dùng bảng thép cũ; cần phương án thép mới.'
    })
  else {
    for (const b of bars) {
      const flags: AcTpBtklFlag[] = []
      if (b.mark === 'f3' && v.thepF3 === 'chua_chot')
        flags.push({
          code: 'mau_thuan_f3',
          message:
            'Hình ghi cả D22 lẫn D25, bảng D22; chưa chốt — đang theo bảng.'
        })
      if (b.mark.startsWith('w16') && v.thepW16 === 'chua_chot')
        flags.push({
          code: 'mau_thuan_w16',
          message: 'Hình ghi D14, bảng D16; chưa chốt — đang theo bảng.'
        })
      const kgPerM = b.kgPerM ?? acTpSteelKgPerM(b.diameter)
      barList.push({
        mark: b.mark.toUpperCase(),
        diameter: b.diameter,
        surface: b.surface as AcTpBtklBar['surface'],
        count: b.count,
        length: b.length,
        kgPerM,
        kgPerMSource: b.kgPerM ? 'bang_goc' : 'cong_thuc',
        kg: (b.count * b.length * kgPerM) / 1000,
        group: b.group,
        flags: flags.length ? flags : undefined
      })
    }
    const sum = (list: AcTpBtklBar[]) => list.reduce((s, b) => s + b.kg, 0)
    const flagged = barList.flatMap(b => b.flags ?? [])
    add({
      key: 'thep',
      stt: '6',
      nhom: 'cot_thep',
      hangMuc: 'Cốt thép',
      donVi: 'kg',
      khoiLuong: sum(barList),
      dienGiai: `${barList.length} số hiệu: Σ số lượng × dài × kg/m (kg/m theo bảng gốc)`,
      nguon: 'tham_so',
      banGoc: S.thep.tong,
      laTong: true,
      flags: flagged.length
        ? flagged.filter(
            (x, i) => flagged.findIndex(y => y.code === x.code) === i
          )
        : undefined
    })
    const diameters = [...new Set(barList.map(b => b.diameter))].sort(
      (a, b) => a - b
    )
    let k = 0
    for (const surface of ['ribbed', 'plain'] as const) {
      const list = barList.filter(b => b.surface === surface)
      for (const d of diameters.filter(d => list.some(b => b.diameter === d))) {
        const of = list.filter(b => b.diameter === d)
        add({
          key: `thep_${surface === 'ribbed' ? 'D' : 'R'}${d}`,
          stt: `6.${++k}`,
          nhom: 'cot_thep',
          hangMuc: `Thép ${surface === 'ribbed' ? 'có gờ D' : 'trơn R'}${d}`,
          donVi: 'kg',
          khoiLuong: sum(of),
          dienGiai: `${of.length} số hiệu × kg/m ${acTpBtklNumber(of[0].kgPerM)}`,
          nguon: 'tham_so',
          banGoc: S.thep.theoDuongKinh[d]
        })
      }
    }
    const classes: [string, string, (d: number) => boolean][] = [
      ['le10', 'Thép d ≤ 10', d => d <= 10],
      ['le18', 'Thép 10 < d ≤ 18', d => d > 10 && d <= 18],
      ['gt18', 'Thép d > 18', d => d > 18]
    ]
    for (const [key, label, test] of classes)
      add({
        key: `thep_${key}`,
        stt: `6.${++k}`,
        nhom: 'cot_thep',
        hangMuc: label,
        donVi: 'kg',
        khoiLuong: sum(barList.filter(b => test(b.diameter))),
        dienGiai: 'Theo nhóm đường kính (định mức gia công)',
        nguon: 'tham_so',
        // Already counted in the per-diameter lines.
        trongTong: false
      })
  }

  // ---- 7. Notes: drawn, not counted by the source table -------------------
  const between = n('bThan') - 2 * n('tCanh')
  add({
    key: 'vai_ke',
    stt: '7.1',
    nhom: 'ghi_chu',
    hangMuc: 'Vai kê bản quá độ (có trên hình, bảng gốc không tính)',
    donVi: 'm3',
    khoiLuong: (CORBEL_SECTION * between) / 1000,
    dienGiai: `${acTpBtklNumber(CORBEL_SECTION, 4)} × ${f(between)} (bỏ qua vát đầu)`,
    nguon: 'tham_so',
    trongTong: false
  })
  const haunchHeight = n('hThan') + n('hDau') - CORBEL_DROP
  add({
    key: 'vut',
    stt: '7.2',
    nhom: 'ghi_chu',
    hangMuc: 'Vút thân–cánh 300 × 300 (có trên hình, bảng gốc không tính)',
    donVi: 'm3',
    khoiLuong: (2 * (HAUNCH * HAUNCH) * haunchHeight) / 2 / 1e9,
    dienGiai: `2 × ${f(HAUNCH)}²/2 × ${f(haunchHeight)}`,
    nguon: 'tham_so',
    trongTong: false
  })
  // Their formwork, listed apart like their concrete: the corbel's chamfered
  // underside and vertical face (its top carries the approach slab, its ends
  // meet the wings); the haunch's diagonal face.
  const chamfer = Math.hypot(HAUNCH, HAUNCH)
  add({
    key: 'van_khuon_vai_ke',
    stt: '7.3',
    nhom: 'ghi_chu',
    hangMuc: 'Ván khuôn vai kê bản quá độ (không cộng tổng)',
    donVi: 'm2',
    khoiLuong: ((chamfer + CORBEL_FACE) * between) / 1e6,
    dienGiai: `(${acTpBtklNumber(chamfer / 1000)} + ${f(CORBEL_FACE)}) × ${f(between)} (mặt vát dưới + mặt đứng)`,
    nguon: 'tham_so',
    trongTong: false
  })
  add({
    key: 'van_khuon_vut',
    stt: '7.4',
    nhom: 'ghi_chu',
    hangMuc: 'Ván khuôn vút thân–cánh (không cộng tổng)',
    donVi: 'm2',
    khoiLuong: (2 * chamfer * haunchHeight) / 1e6,
    dienGiai: `2 × ${acTpBtklNumber(chamfer / 1000)} × ${f(haunchHeight)} (mặt chéo)`,
    nguon: 'tham_so',
    trongTong: false
  })
  return { doiTuong: name, items, bars: barList, errors: [] }
}
