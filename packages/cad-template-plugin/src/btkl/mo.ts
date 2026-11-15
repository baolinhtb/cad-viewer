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
 *   1:1 underside to a 1500 end, the top rising with the long fall. The
 *   lower wing sits `docNgang · bMatDuong` lower, except on the flat footing.
 */
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'

import { buildDossierModel, dossierDefaults } from '../dossier/model'
import bars from '../dossier/reference/bars.json'
import { acTpSteelKgPerM, BTKL_M1_SOURCE } from './sourceM1'
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
/** Wing end height above the 1:1 underside, mm (source B–B). */
const WING_END = 1500
/** Ear walls: thickness × height, mm, along the seat N (source front view). */
const EAR = { t: 150, h: 1200 }
/** Approach-slab corbel section, m² (A–A: 300 × 300 with a 300 haunch). */
const CORBEL_SECTION = 0.1365
/** Corbel underside below the head-wall top, mm (A–A: 21891 − 20481). */
const CORBEL_DROP = 1410
/** Stem–wing haunch leg, mm (plan). */
const HAUNCH = 300

const S = BTKL_M1_SOURCE
const PI = Math.PI

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
  lCanh: number
) {
  // top: wing top over the footing top at the head-wall face; positions
  // along the wing from that face (mm).
  const at = (s: number) => top + rise * s
  const s0 = HEAD_WALL
  const s1 = s0 + onFooting
  const footingPart = ((at(s0) + at(s1)) / 2) * onFooting
  if (run <= 0) return { area: footingPart / 1e6, step: null }
  const step = at(lCanh) - run - WING_END
  const slopePart = ((at(s1) - step + WING_END) / 2) * run
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
  // The source's own geometry: the condition the dossier already uses for
  // its steel sheets, minus the steel choices themselves.
  const sourceGeometry = Object.keys(defaults)
    .filter(
      k =>
        typeof defaults[k] === 'number' &&
        !['x', 'y', 'caoDoDayBe', 'lCoc'].includes(k)
    )
    .every(k => v[k] === defaults[k])
  const changedGeometry = Object.keys(defaults).filter(
    k =>
      typeof defaults[k] === 'number' &&
      !['x', 'y', 'caoDoDayBe', 'lCoc'].includes(k) &&
      v[k] !== defaults[k]
  )
  const refusedGeometry = `Hình học đã khác mẫu M1 (${changedGeometry.join(', ')}); bản vẽ gốc không có đủ kích thước để tính lại dòng này.`

  const items: AcTpBtklItem[] = []
  const add = (
    item: Omit<AcTpBtklItem, 'trongTong'> & { trongTong?: boolean }
  ) => items.push({ trongTong: true, ...item })
  const compare = (banGoc: number) => (sourceGeometry ? { banGoc } : {})

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
    ...compare(S.beTong.be)
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
    ...compare(S.beTong.than),
    flags: sourceGeometry
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
    ...compare(S.beTong.dinh)
  })
  const onFooting = n('lBe') - n('muiBe') - n('tThan')
  const run = n('lCanh') - HEAD_WALL - onFooting
  const rise = n('docDoc') / 100
  const topHigh = n('hThan') + n('hDau')
  const drop = (Math.abs(n('docNgang')) / 100) * n('bMatDuong')
  const high = wingSection(topHigh, onFooting, run, rise, n('lCanh'))
  const low = wingSection(topHigh - drop, onFooting, run, rise, n('lCanh'))
  const wingFlags: AcTpBtklFlag[] = []
  if (sourceGeometry)
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
        ? ` + phần vát 1:1 dài ${f(run)}, đầu cánh ${f(WING_END)}, H4 ${f(high.step!)} / ${f(low.step!)}`
        : '') +
      `; cánh thấp hạ ${f(drop)} = ${n('docNgang')} % × ${f(n('bMatDuong'))}`,
    nguon: 'tham_so',
    ...compare(S.beTong.canh),
    flags: wingFlags.length ? wingFlags : undefined
  })
  const fromSource = (
    key: string,
    stt: string,
    hangMuc: string,
    donVi: AcTpBtklItem['donVi'],
    value: number,
    nhom: AcTpBtklItem['nhom'] = 'be_tong',
    hint = ''
  ) =>
    add(
      sourceGeometry
        ? {
            key,
            stt,
            nhom,
            hangMuc,
            donVi,
            khoiLuong: value,
            dienGiai: `Bảng SUB-100 bản gốc${hint}`,
            nguon: 'ban_goc',
            banGoc: value
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
            lyDo: refusedGeometry
          }
    )
  fromSource(
    'tai',
    '1.5',
    'Tường tai',
    'm3',
    S.beTong.tai,
    'be_tong',
    ` (= 2 × ${f(EAR.t)} × ${f(EAR.h)} × N = ${f(n('tThan') - HEAD_WALL)})`
  )
  fromSource('u_chong_xo', '1.6', 'Ụ chống xô', 'm3', S.beTong.uChongXo)
  fromSource('lan_can', '1.7', 'Lan can trên tường cánh', 'm3', S.beTong.lanCan)
  const parts = items.filter(i => i.nhom === 'be_tong' && i.stt.includes('.'))
  const refused = parts.filter(i => i.khoiLuong === null)
  const total = items[0]
  if (refused.length) {
    total.nguon = 'tu_choi'
    total.lyDo = `Thiếu ${refused.map(i => i.hangMuc.toLowerCase()).join(', ')}.`
  } else {
    total.khoiLuong = parts.reduce((s, i) => s + i.khoiLuong!, 0)
    total.dienGiai = `Cộng ${parts[0].stt}–${parts[parts.length - 1].stt}`
    if (sourceGeometry) total.banGoc = S.beTong.tong
  }

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
    ...compare(S.lot),
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
          lyDo: 'Chưa có chiều dài cọc (lCoc = 0); bản gốc cũng không thống kê cọc.'
        }
  )

  // ---- 4. Materials ------------------------------------------------------
  fromSource(
    'vua',
    '4.1',
    'Vữa không co ngót',
    'm3',
    S.vuaKhongCoNgot,
    'vat_tu'
  )
  fromSource('ong_pvc', '4.2', 'Ống PVC D125', 'm', S.ongPvcD125, 'vat_tu')
  fromSource('bot_xop', '4.3', 'Chèn bọt xốp', 'm3', S.chenBotXop, 'vat_tu')
  fromSource('hop_chot', '4.4', 'Hộp chốt', 'hộp', S.hopChot, 'vat_tu')
  fromSource(
    'bt_nhua',
    '4.5',
    'Bê tông nhựa nóng 2 kg/m²',
    'm2',
    S.btNhua,
    'vat_tu'
  )

  // ---- 5. Formwork (B4) --------------------------------------------------
  fromSource(
    'van_khuon',
    '5',
    'Ván khuôn',
    'm2',
    S.vanKhuon,
    'van_khuon',
    '; quy tắc đo ván khuôn chưa chốt (B4)'
  )

  // ---- 6. Steel ----------------------------------------------------------
  const barList: AcTpBtklBar[] = []
  if (!model.referenceSteelApplicable)
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
          : 'Hình học hoặc cấu tạo thép đã khác mẫu M1: không dùng bảng thép cũ; cần phương án thép mới.'
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
  return { doiTuong: name, items, bars: barList, errors: [] }
}
