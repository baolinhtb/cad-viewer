/**
 * Bar schedule of the 0.3.x abutment for the dossier's own geometry (P3-M1):
 * the M1 bar layout — same marks, diameters, shapes and hooks — laid over the
 * new dimensions, not a new reinforcement design.
 *
 * Each mark of `reference/bars.json` (the SUB-100 table of the source) gets
 * the rule its M1 numbers show:
 *
 * - along the bar: the straight segment follows the member it runs in (F1
 *   5850 = bệ 6000 − 2 × 75 cover); hooks and covers stay the M1 ones;
 * - across the bars: the M1 spacing stays (150, 600…) and the count follows
 *   the width, ⌈span / spacing⌉ + 1 per set — a wider member gets more bars,
 *   never the same bars further apart (F1: 50 bars over 49 × 150 = 7350 of
 *   7700; 8700 → 57 bars).
 *
 * At the M1 values every rule gives the table's own count and length. A
 * group whose geometry changed in a way no rule follows (the wings: chamfer,
 * slopes, length, two-piece rows) is not re-laid here: its bars keep the M1
 * marks and its mass is estimated from the M1 ratio kg/m³ of that member
 * (`tamTinh`), flagged, as before P3-M1 — only for that group.
 */
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'

import { dossierDefaults, dossierParamLabel } from '../dossier/model'
import bars from '../dossier/reference/bars.json'
import {
  ACTP_NEO_VAT_LIEU,
  ACTP_THANH_NGANG_TREN,
  acTpNoiChong,
  acTpSoMoiNoi
} from './neoThep'
import { acTpSteelKgPerM } from './sourceM1'

/** A parameter's change from the M1 default, mm (or count). */
type Delta = (key: string) => number

/** One direction the bars of a set are spread over. */
interface Spread {
  /** Bars along this direction in one M1 set. */
  k0: number
  /** M1 spacing, mm (from the bar label, e.g. F1-D18-150). */
  s: number
  /** Change of the span the bars cover, mm. */
  along: (d: Delta) => number
}

interface Rule {
  /** Change of each segment (index into `segments`), mm. */
  segs?: Record<number, (d: Delta) => number>
  /** Identical sets (two faces, three rows…). */
  sets?: number
  spread?: Spread[]
}

/** A bar group of `bars.json` and how its marks follow the geometry. */
interface Group {
  label: string
  /** Parameters the group's bars depend on. */
  dependsOn: readonly string[]
  /** Those of them the rules follow; any other change estimates the group. */
  follows: readonly string[]
  /** The BTKL concrete line whose M1 ratio kg/m³ estimates the group. */
  concrete?: string
  rules?: Record<string, Rule>
  /** Count rule for every mark of the group, when not per mark. */
  count?: (count0: number, v: (key: string) => number) => number
}

const along =
  (...keys: string[]) =>
  (d: Delta) =>
    keys.reduce((sum, k) => sum + d(k), 0)
const spread = (k0: number, s: number, ...keys: string[]): Spread => ({
  k0,
  s,
  along: along(...keys)
})
const straight = (...keys: string[]) => ({ 1: along(...keys) })

/** Footing: F1/F3 along lBe across bBe, F2/F4 the other way (M1 cover 75). */
const FOOTING: Record<string, Rule> = {
  f1: { segs: straight('lBe'), spread: [spread(50, 150, 'bBe')] },
  f2: { segs: straight('bBe'), spread: [spread(40, 150, 'lBe')] },
  f3: { segs: straight('lBe'), spread: [spread(50, 150, 'bBe')] },
  f4: { segs: straight('bBe'), spread: [spread(40, 150, 'lBe')] },
  // Side bars of the two faces across the bridge, over the footing height.
  f5: { segs: straight('lBe'), sets: 2, spread: [spread(12, 150, 'hBe')] },
  // U bars of the faces along the bridge (2 × 50 across bBe) and across it.
  f6: { segs: straight('hBe'), sets: 2, spread: [spread(50, 150, 'bBe')] },
  f7: { segs: straight('bBe'), sets: 2, spread: [spread(12, 150, 'hBe')] },
  f8: { segs: straight('hBe'), sets: 2, spread: [spread(40, 150, 'lBe')] },
  // Ties F9-D16-600: a 13 × 11 grid.
  f9: {
    segs: straight('hBe'),
    spread: [spread(13, 600, 'bBe'), spread(11, 600, 'lBe')]
  }
}

/** Stem: verticals across bThan, U caps over tThan, horizontals both faces. */
const STEM: Record<string, Rule> = {
  a1: { segs: straight('hThan'), spread: [spread(50, 150, 'bThan')] },
  a2: { segs: straight('hThan'), spread: [spread(50, 150, 'bThan')] },
  a3: { segs: straight('tThan'), spread: [spread(50, 150, 'bThan')] },
  a4: { segs: straight('bThan'), sets: 2, spread: [spread(47, 150, 'hThan')] },
  // Ties A5-D14-600: 13 across the stem, 12 rows up it.
  a5: {
    segs: straight('tThan'),
    spread: [spread(13, 600, 'bThan'), spread(12, 400, 'hThan')]
  }
}

/** Head wall (T 500 whatever tThan, standard assumption 9). */
const HEAD_WALL: Record<string, Rule> = {
  // Legs down the head wall height.
  p1: {
    segs: { 0: along('hDau'), 2: along('hDau') },
    spread: [spread(50, 150, 'bThan')]
  },
  p2: { spread: [spread(50, 150, 'bThan')] },
  p3: {
    segs: { 0: along('bThan') },
    sets: 2,
    spread: [spread(11, 150, 'hDau')]
  },
  p4: { sets: 3, spread: [spread(12, 600, 'bThan')] },
  h1: { spread: [spread(12, 500, 'bThan')] },
  h2: { spread: [spread(12, 500, 'bThan')] }
}

/** Rail on the wings: N1 along each wing, the rest every 150 along it. */
const RAIL: Record<string, Rule> = {
  n1: { segs: { 0: along('lCanh') } },
  n2: { sets: 2, spread: [spread(44, 150, 'lCanh')] },
  n3: { sets: 2, spread: [spread(44, 150, 'lCanh')] },
  t1: { sets: 2, spread: [spread(44, 150, 'lCanh')] },
  t2: { sets: 2, spread: [spread(44, 150, 'lCanh')] }
}

/**
 * Ear walls (P3-M2), read from the M1 table: each ear 150 × 1200 × N with
 * N = tThan − 500 (1000 at M1, as the take-off's concrete line), C1 D14 1685
 * = 1200 high + 485 into the stem, 2 ears × 2 faces × 6 bars along N
 * (≈ (1000 − 2 × 75)/5 = 170 apart); C2 D14 1485 = N + 485 along N, 2 ears ×
 * 8 rows up the ear (the height does not follow tThan).
 */
const EAR_WALL: Record<string, Rule> = {
  c1: { sets: 4, spread: [spread(6, 170, 'tThan')] },
  c2: { segs: { 0: along('tThan') } }
}

const WING_DEPENDS = [
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
]

/** Bar groups of the source table (`group` in bars.json). */
const GROUPS: Record<string, Group> = {
  be: {
    label: 'bệ mố',
    dependsOn: ['bBe', 'lBe', 'hBe'],
    follows: ['bBe', 'lBe', 'hBe'],
    concrete: 'be',
    rules: FOOTING
  },
  than: {
    label: 'tường thân',
    dependsOn: ['bThan', 'tThan', 'hThan'],
    follows: ['bThan', 'tThan', 'hThan'],
    concrete: 'than',
    rules: STEM
  },
  dau: {
    label: 'tường đỉnh',
    dependsOn: ['bThan', 'hDau'],
    follows: ['bThan', 'hDau'],
    concrete: 'dinh',
    rules: HEAD_WALL
  },
  // The wings' bars run over the 1:1 chamfer, the slopes and the head wall:
  // no M1 rule re-lays them yet (P3-M2).
  canh_trai: {
    label: 'tường cánh trái',
    dependsOn: WING_DEPENDS,
    follows: [],
    concrete: 'canh'
  },
  canh_phai: {
    label: 'tường cánh phải',
    dependsOn: WING_DEPENDS,
    follows: [],
    concrete: 'canh'
  },
  lan_can: {
    label: 'lan can trên tường cánh',
    dependsOn: ['lCanh', 'hLanCan'],
    follows: ['lCanh'],
    concrete: 'lan_can',
    rules: RAIL
  },
  tai: {
    label: 'tường tai',
    dependsOn: ['tThan'],
    follows: ['tThan'],
    concrete: 'tai',
    rules: EAR_WALL
  },
  // Per bearing (the M1 table is for 4); their spacing does not change them.
  goi: {
    label: 'gối',
    dependsOn: ['soGoi', 'aGoi'],
    follows: ['soGoi', 'aGoi'],
    count: (count0, v) => Math.ceil((count0 * v('soGoi')) / 4)
  },
  phu: { label: 'thép phụ', dependsOn: [], follows: [] }
}

/**
 * Bars along a direction: ⌈span / spacing⌉ + 1, the M1 spacing kept. A span
 * within half a millimetre of a whole number of spacings takes that number
 * (a hair of a change adds no bar).
 */
export function acTpBarsOver(k0: number, s: number, change: number): number {
  const span = (k0 - 1) * s + change
  if (k0 <= 1) return change === 0 ? k0 : NaN
  if (span <= 0) return NaN
  return Math.max(1, Math.ceil((span - 0.5) / s)) + 1
}

/** One mark of the schedule for the dossier's values. */
export interface AcTpSteelRow {
  /** Mark as in bars.json ("f1", "w1'"). */
  mark: string
  group: string
  diameter: number
  surface: 'plain' | 'ribbed'
  shape: string
  /** Segment lengths as the table writes them ("-" when none). */
  segments: string[]
  count: number
  /** One bar, mm. */
  length: number
  kgPerM: number
  kg: number
  /** M1 values of the mark. */
  m1: { count: number; length: number; kg: number; segments: string[] }
  /**
   * Set when the group is not re-laid: the ratio applied to the M1 mass
   * (new concrete volume / M1 volume) and why.
   */
  tamTinh?: { heSo: number; lyDo: string }
  /**
   * P3-M2: the bar is longer than a commercial bar, `soMoi` tension laps of
   * `chieuDai` mm each (Đ 11.5.3.1, class B assumed) are in `length` and `kg`.
   */
  noiChong?: { soMoi: number; chieuDai: number; cap: 'A' | 'B' }
}

/** The schedule and the groups estimated, with their reasons. */
export interface AcTpSteelSchedule {
  rows: AcTpSteelRow[]
  /** Groups estimated from the M1 ratio: label and reason. */
  estimated: { group: string; label: string; lyDo: string }[]
  /** Whether every bar is the M1 one (values at the M1 defaults). */
  reference: boolean
}

/**
 * The abutment's bar schedule for `values`: the M1 layout over the new
 * geometry. `volumeRatio(concreteKey)` gives new / M1 volume of a concrete
 * line, for the groups estimated; null when that volume is not known (the
 * group then keeps its M1 mass, flagged as such).
 */
export function acTpSteelScheduleMo(
  values: AcTpParamValues,
  volumeRatio: (concrete: string) => number | null
): AcTpSteelSchedule {
  const defaults = dossierDefaults()
  const v = (k: string) => Number(values[k] ?? defaults[k])
  const d: Delta = k => v(k) - Number(defaults[k])
  const changed = (keys: readonly string[]) =>
    keys.filter(k => values[k] !== undefined && values[k] !== defaults[k])
  const rows: AcTpSteelRow[] = []
  const estimated: AcTpSteelSchedule['estimated'] = []
  // Per group: rows laid over the geometry, or why they cannot be.
  const laid = new Map<string, AcTpSteelRow[] | string>()
  for (const [key, group] of Object.entries(GROUPS)) {
    const marks = bars.filter(b => b.group === key)
    const other = changed(group.dependsOn).filter(
      k => !group.follows.includes(k)
    )
    if (other.length) {
      laid.set(
        key,
        `đã đổi ${other.map(dossierParamLabel).join(', ')}; bố trí M1 của nhóm này chưa có quy tắc theo kích thước mới (P3-M2)`
      )
      continue
    }
    const out: AcTpSteelRow[] = []
    let refused: string | undefined
    for (const b of marks) {
      const kgPerM = b.kgPerM ?? acTpSteelKgPerM(b.diameter)
      const rule = group.rules?.[b.mark] ?? {}
      const segments = [...b.segments]
      let length = b.length
      for (const [i, change] of Object.entries(rule.segs ?? {})) {
        const dv = change(d)
        if (!dv) continue
        segments[Number(i)] = String(Number(b.segments[Number(i)]) + dv)
        length += dv
      }
      let count = b.count
      if (group.count) count = group.count(b.count, v)
      else if (rule.spread?.length)
        count =
          (rule.sets ?? 1) *
          rule.spread.reduce(
            (p, s) => p * acTpBarsOver(s.k0, s.s, s.along(d)),
            1
          )
      // P3-M2: a bar the new geometry made longer than a commercial bar is
      // lap spliced (Đ 11.5.3.1); the laps add to the mark's length.
      const m = ACTP_NEO_VAT_LIEU
      const lap = acTpNoiChong(
        b.diameter,
        m,
        ACTP_THANH_NGANG_TREN.includes(b.mark)
      )
      const soMoi = acTpSoMoiNoi(length, lap, m.chieuDaiCayThep)
      const noiChong =
        soMoi > 0
          ? { soMoi, chieuDai: Math.ceil(lap), cap: m.capNoi }
          : undefined
      if (noiChong) length += noiChong.soMoi * noiChong.chieuDai
      if (
        !(count >= 1) ||
        !(length > 0) ||
        !(soMoi >= 0) ||
        segments.some(s => Number(s) <= 0)
      ) {
        refused = `số hiệu ${b.mark.toUpperCase()} không còn chỗ bố trí với lớp phủ và cự ly mẫu M1`
        break
      }
      out.push({
        mark: b.mark,
        group: key,
        diameter: b.diameter,
        surface: b.surface as AcTpSteelRow['surface'],
        shape: b.shape,
        segments,
        count,
        length,
        kgPerM,
        kg: (count * length * kgPerM) / 1000,
        m1: {
          count: b.count,
          length: b.length,
          kg: (b.count * b.length * kgPerM) / 1000,
          segments: b.segments
        },
        ...(noiChong ? { noiChong } : {})
      })
    }
    laid.set(key, refused ?? out)
  }
  for (const [key, group] of Object.entries(GROUPS)) {
    const result = laid.get(key)!
    if (typeof result !== 'string') {
      rows.push(...result)
      continue
    }
    const ratio = group.concrete ? volumeRatio(group.concrete) : null
    const heSo = ratio ?? 1
    const lyDo =
      ratio === null
        ? `${result}; giữ khối lượng M1 (chưa có thể tích mới)`
        : `${result}; tạm tính theo hàm lượng M1 × ${heSo.toFixed(3).replace('.', ',')} (thể tích mới / M1)`
    if (!estimated.some(e => e.label === group.label))
      estimated.push({ group: key, label: group.label, lyDo })
    for (const b of bars.filter(x => x.group === key)) {
      const kgPerM = b.kgPerM ?? acTpSteelKgPerM(b.diameter)
      const kg0 = (b.count * b.length * kgPerM) / 1000
      rows.push({
        mark: b.mark,
        group: key,
        diameter: b.diameter,
        surface: b.surface as AcTpSteelRow['surface'],
        shape: b.shape,
        segments: [...b.segments],
        count: b.count,
        length: b.length,
        kgPerM,
        kg: kg0 * heSo,
        m1: { count: b.count, length: b.length, kg: kg0, segments: b.segments },
        tamTinh: { heSo, lyDo }
      })
    }
  }
  // Table order (bars.json), not group order.
  const order = new Map(bars.map((b, i) => [b.mark, i]))
  rows.sort((a, b) => order.get(a.mark)! - order.get(b.mark)!)
  return {
    rows,
    estimated,
    reference: rows.every(
      r => !r.tamTinh && r.count === r.m1.count && r.length === r.m1.length
    )
  }
}
