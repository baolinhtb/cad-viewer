/**
 * Stretch grids of the 0.3.0 dossier: how the source drawing follows the
 * parameters.
 *
 * Each view of a sheet has grid lines in X and Y at source coordinates tied
 * to the design: footing edges, stem faces, pile edges, the footing top, the
 * wall top… Each line moves by the change of the parameters that place it.
 * Every point is interpolated linearly between the two lines around it (and
 * shifted with the last line beyond the ends) — the dynamic-block stretch the
 * plan describes. At the default parameters every line stays where it is, so
 * the drawing is the source drawing, exactly.
 *
 * Positions are local to the sheet's viewport window (source model units
 * from the window's lower-left corner), as in `reference/layout-mo2.json`.
 * The lines were read from the source's own dimensions (B Mố, B Bệ, B1, B2,
 * B(TT), N, HB, H1A, H1B, LC, D Cọc).
 *
 * What the grid cannot follow is refused with the reason, never drawn wrong:
 * a change of topology (piles, bearings), of a value the drawing does not
 * show apart (stem width ≠ footing width), or one that would fold the grid.
 */
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'

import {
  DOSSIER_VERSION,
  dossierDefaults,
  dossierParamLabel,
  dossierParamValue
} from './model'

type XY = [number, number]

/** Parameter changes from the defaults, mm. */
type Delta = Record<
  | 'bBe'
  | 'lBe'
  | 'hBe'
  | 'hLot'
  | 'muiBe'
  | 'tThan'
  | 'hThan'
  | 'hDau'
  | 'lCanh'
  | 'D'
  | 'bMatDuong'
  | 'tCanh'
  | 'hLanCan'
  | 'docNgang'
  | 'docDoc',
  number
>
/**
 * A grid line: where it is in the source, how far it moves, and — for a line
 * a view can do without — when it is drawn at all (see {@link wingFits}).
 */
type Line = [
  source: number,
  shift: (d: Delta) => number,
  keepIf?: (d: Delta) => boolean
]

interface View {
  name: string
  /** Where the view sits, local coordinates. */
  box: { x0: number; y0: number; x1: number; y1: number }
  x: Line[]
  y: Line[]
  /** The view's tilt for changed slopes (see {@link Tilt}). */
  tilt?: (d: Delta, n: (key: string) => number, fx: Axis) => Tilt
}
type Axis = (v: number) => number
/**
 * How far a point rises for a changed slope, mm: from its stretched x and its
 * source y. The source is drawn sloped already (cross fall 2 %, wing top
 * 2,8 %), so a slope is not a grid line: what moves is the change from the
 * source slope (P2-M3), and at the source slopes nothing moves.
 */
type Tilt = (x: number, y: number) => number

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))
/** 0 at or below `from`, 1 at or above `to`, linear between (source y). */
const ramp = (y: number, from: number, to: number) =>
  clamp((y - from) / (to - from), 0, 1)
/**
 * The wing top's slope along the bridge (docDoc): the wing top rises by the
 * change × the distance from the head wall face, up to the wing end; the 1:1
 * chamfer below (ending `chamfer`, source y) stays, the wing top (from
 * `wallTop`) moves fully. `away` is +1 when the wing runs to the right.
 */
const wingTilt =
  (
    d: Delta,
    face: number,
    end: number,
    chamfer: number,
    wallTop: number
  ): Tilt =>
  (x, y) =>
    (d.docDoc / 100) *
    clamp(Math.sign(end - face) * (x - face), 0, Math.abs(end - face)) *
    ramp(y, chamfer, wallTop)

/** Parameters the grid follows. */
export const DOSSIER_STRETCH_KEYS = [
  'bBe',
  'lBe',
  'hBe',
  'hLot',
  'muiBe',
  'tThan',
  'hThan',
  'hDau',
  'lCanh',
  'D',
  'bMatDuong',
  'tCanh',
  'hLanCan',
  'docNgang',
  'docDoc'
] as const

/**
 * Parameters the drawing does not depend on (labels, tables, elevations
 * written as text, material choices, sheet position).
 */
export const DOSSIER_FREE_KEYS: ReadonlySet<string> = new Set([
  'tenMo',
  'congTrinh',
  'duAn',
  'donVi',
  'nguoiChuTri',
  'nguoiThietKe',
  'nguoiKiemTra',
  'nguoiDuyet',
  'ngay',
  'x',
  'y',
  'thep',
  'thepF3',
  'thepW16',
  'beTongLot',
  'caoDoDayBe',
  'lCoc',
  'nhanKichThuoc'
])

/**
 * Elevation lines shared by the front view and both sections, ending with
 * the rail (P2-M2): everything up to just above the wing end's top (22073)
 * moves with the head wall top, as it did before — the FG tag (21941), the
 * rail feet — and every rail top, hLanCan (1140) above its foot, moves by
 * hLanCan as well. The rail tops are 23031 at the head wall (front, high
 * side, and B–B), 22891 on the front's low side (cross fall 140) and 23213
 * at the wing end (B–B); the rail's dimensions and the EL1/EL2 tags on its
 * top follow. At the default rail height these lines move with the head
 * wall top: no other parameter stretches differently.
 */
const heights = (stemTop: number): Line[] => [
  [13186, d => -d.hLot],
  [13286, () => 0],
  [15286, d => d.hBe],
  [stemTop, d => d.hBe + d.hThan],
  [21891, d => d.hBe + d.hThan + d.hDau],
  ...railTops(22100, [22891, 23031, 23213])
]
/** A line pinned to the head wall top, then the rail tops above it. */
const railTops = (pin: number, tops: number[]): Line[] => [
  [pin, d => d.hBe + d.hThan + d.hDau],
  ...tops.map((y): Line => [y, d => d.hBe + d.hThan + d.hDau + d.hLanCan])
]
/** Across the bridge: footing edges, inner pile edges, centre line. */
const across = (left: number): Line[] => [
  [left, d => -d.bBe / 2],
  [left + 1200, d => -d.bBe / 2 + d.D],
  [left + 3850, () => 0],
  [left + 6500, d => d.bBe / 2 - d.D],
  [left + 7700, d => d.bBe / 2]
]

/**
 * Front elevation across the bridge: the footing lines, plus the road edges
 * (B Mặt đường 3764–10764), which follow bMatDuong about the centre line —
 * not the footing width or the pile diameter that the lines either side of
 * them follow. The 350 mm strip outside each road edge (kerb, rail foot)
 * therefore moves as a block when the footing keeps that margin.
 */
const frontAcross = (left: number): Line[] =>
  [
    ...across(left),
    [left + 350, (d: Delta) => -d.bMatDuong / 2] as Line,
    [left + 7350, (d: Delta) => d.bMatDuong / 2] as Line,
    ...wingFaces(left, wingFits)
  ].sort((a, b) => a[0] - b[0])

/**
 * The inner faces of the wings (W(t) 500 inside each footing edge): tCanh
 * inside the footing edge, whatever the pile diameter (assumption 9(b)) —
 * the footing edge moves them by bBe, the wing thickness by tCanh (P2/M1).
 */
const wingFaces = (left: number, keepIf?: (d: Delta) => boolean): Line[] => [
  [left + 500, d => -d.bBe / 2 + d.tCanh, keepIf],
  [left + 7200, d => d.bBe / 2 - d.tCanh, keepIf]
]

/**
 * Whether the wing's inner face stays where the source draws it in the front
 * elevation: inside the road edge (350 from the footing edge in the source,
 * (bBe − bMatDuong)/2 now) and outside the outer pile centre (1200, now D).
 * A grid line cannot cross another, so when it would the front elevation
 * leaves the wing faces out — as it did before P2/M1, which keeps every
 * dossier that built then building — and a changed tCanh is refused
 * ({@link sheetStretch}).
 */
const wingFits = (d: Delta) =>
  500 + d.tCanh - d.bBe / 2 > 350 - d.bMatDuong / 2 &&
  500 + d.tCanh < 1200 + d.D

/**
 * Plan across the bridge: the footing lines, plus the inner faces of the
 * wings, so the wing is tCanh thick whatever the footing width or the pile
 * diameter.
 */
const planAcross = (left: number): Line[] =>
  [...across(left), ...wingFaces(left)].sort((a, b) => a[0] - b[0])

/**
 * Along the bridge (standard assumption 9): a thicker stem (tThan) widens the
 * seat N, not the head wall T. The head wall (T 500) sits at the stem back and
 * moves with it, and the wing — measured as LC from the head wall's front
 * face — moves with it too, as the take-off (BTKL) measures it.
 */

/** SUB-010 — front elevation, sections A–A and B–B, plans. */
const SUB_010: View[] = [
  {
    name: 'Mặt chính',
    box: { x0: 0, y0: 12000, x1: 13500, y1: 26000 },
    x: frontAcross(3414),
    // Cross fall about the centre line (7264), left of the route (drawn on
    // the right) up. The seat strip, stem top and EL4 tags take it at the
    // stem edges (3414 / 11114); the head wall top, the road, the rail tops
    // and EL1 tags — everything from the head wall top (21700) up — at the
    // road edges (3764 / 10764), where the source measures them (the kerb
    // strip outside rides along). The footing (15286 and below) stays; the
    // stem stretches up to the seat (19900, under its low end).
    tilt: (d, _n, fx) => {
      const i = d.docNgang / 100
      const centre = fx(7264)
      const stem = [fx(3414), fx(11114)]
      const road = [fx(3764), fx(10764)]
      return (x, y) => {
        const [lo, hi] = y >= 21700 ? road : stem
        return i * (clamp(x, lo, hi) - centre) * ramp(y, 15286, 19900)
      }
    },
    y: [
      ...heights(20015).slice(0, 3),
      // The seat falls across the bridge (19916 at its low end, 20080 at
      // its high end), about the stem top line 20015. A line just below its
      // low end moves with the stem top too, so the whole seat strip —
      // bearings, stops, elevation tags EL3/EL4 — rises as one with hThan,
      // instead of its low side rising by 0,983 Δ (P1/M5).
      [19900, d => d.hBe + d.hThan] as Line,
      ...heights(20015).slice(3)
    ]
  },
  {
    name: 'Mặt bằng mố',
    box: { x0: 0, y0: 0, x1: 13500, y1: 12000 },
    x: planAcross(3414),
    y: [
      [1446, () => 0],
      [3446, d => d.muiBe],
      // Front of the head wall: the stem back less a fixed T 500.
      [4446, d => d.muiBe + d.tThan],
      [4946, d => d.muiBe + d.tThan],
      [7446, d => d.lBe],
      [10946, d => d.muiBe + d.tThan + d.lCanh]
    ]
  },
  {
    // B1 · B(TT) · B2 from the left; the head wall (T 500) at the stem back,
    // the seat N (tThan − 500) in front of it.
    name: 'Mặt cắt A–A',
    box: { x0: 13500, y0: 12000, x1: 25000, y1: 26000 },
    x: [
      [15732, () => 0],
      [16932, d => d.D],
      [18232, d => d.lBe - d.muiBe - d.tThan],
      [18732, d => d.lBe - d.muiBe - d.tThan],
      [19732, d => d.lBe - d.muiBe],
      [20532, d => d.lBe - d.D],
      [21732, d => d.lBe]
    ],
    y: heights(20003)
  },
  {
    name: 'Mặt bằng cọc',
    box: { x0: 13500, y0: 0, x1: 25000, y1: 12000 },
    x: across(15714),
    y: [
      [2149, () => 0],
      [3349, d => d.D],
      [6949, d => d.lBe - d.D],
      [8149, d => d.lBe]
    ]
  },
  {
    // Mirrored: B2 · B(TT) · B1 from the left, wing to LC beyond.
    name: 'Mặt cắt B–B',
    // Cut at the high road edge (left of the route): its stem is 140 taller
    // than C–C's (2 % × 7000). A cross fall change lifts it by the change ×
    // half the road width: the stem from the footing top up to the seat, the
    // wing only above its 1:1 chamfer (which keeps its place on the footing,
    // as the gate wing_profile_inverted measures it). The wing top tilts
    // along the wing from the head wall face (29367) to its end (35867).
    tilt: (d, n, fx) => {
      const face = fx(29367)
      const wing = wingTilt(d, face, fx(35867), 20573, 21891)
      const lift = ((d.docNgang / 100) * n('bMatDuong')) / 2
      return (x, y) =>
        lift * (x > face ? ramp(y, 20573, 21891) : ramp(y, 15286, 20000)) +
        wing(x, y)
    },
    box: { x0: 25000, y0: 0, x1: 40000, y1: 26000 },
    x: [
      [26367, () => 0],
      [27567, d => d.D],
      [28367, d => d.muiBe],
      [29367, d => d.muiBe + d.tThan],
      [29867, d => d.muiBe + d.tThan],
      [31167, d => d.lBe - d.D],
      [32367, d => d.lBe],
      [35867, d => d.muiBe + d.tThan + d.lCanh]
    ],
    y: heights(20073)
  }
]

/**
 * SUB-020 — section C–C: B–B seen from the other side. The footing edge on
 * the B2 side stays put; the wing (LC from the back of the head wall) runs
 * to the left.
 */
const SUB_020: View[] = [
  {
    name: 'Mặt cắt C–C',
    // The low road edge (right of the route), the wing running left from the
    // head wall face (8722) to its end (2222).
    tilt: (d, n, fx) => {
      const face = fx(8722)
      const wing = wingTilt(d, face, fx(2222), 10586, 11904)
      const lift = ((d.docNgang / 100) * n('bMatDuong')) / 2
      return (x, y) =>
        -lift * (x < face ? ramp(y, 10586, 11904) : ramp(y, 5439, 10013)) +
        wing(x, y)
    },
    box: { x0: 0, y0: 0, x1: 14000, y1: 16000 },
    x: [
      [2222, d => -d.muiBe - d.tThan - d.lCanh],
      [5722, d => -d.lBe],
      [6922, d => -d.lBe + d.D],
      [8222, d => -d.muiBe - d.tThan],
      [8722, d => -d.muiBe - d.tThan],
      [9722, d => -d.muiBe],
      [10522, d => -d.D],
      [11722, () => 0]
    ],
    y: [
      [3339, d => -d.hLot],
      [3439, () => 0],
      [5439, d => d.hBe],
      [10086, d => d.hBe + d.hThan],
      [11904, d => d.hBe + d.hThan + d.hDau],
      // The rail as on B–B, 9987 lower: tops 13044 (head wall), 13226
      // (wing end, EL2.R).
      ...railTops(12113, [13044, 13226])
    ]
  }
]

/**
 * How a sheet's views sit: columns left to right, each listing its views top
 * to bottom (indices into the sheet's views). When a view grows, the views
 * below it and the columns to its right move to keep the source's gaps.
 */
const FLOWS: Record<string, number[][]> = {
  'SUB-010': [[0, 1], [2, 3], [4]],
  'SUB-020': [[0]]
}

const GRIDS: Record<string, View[]> = {
  'SUB-010': SUB_010,
  'SUB-020': SUB_020
}

/** A piecewise-linear map through the moved lines. */
function axis(lines: Line[], d: Delta, view: string, label: string) {
  const src = lines.map(l => l[0])
  const dst = lines.map(l => l[0] + l[1](d))
  for (let i = 1; i < dst.length; i++)
    if (!(dst[i] > dst[i - 1]))
      throw new Error(
        `${view}: thông số mới làm các đường mốc ${label} chồng hoặc đảo nhau (${src[i - 1]} → ${src[i]}); bộ sinh ${DOSSIER_VERSION} không vẽ được hình này.`
      )
  return (v: number) => {
    if (v <= src[0]) return v + (dst[0] - src[0])
    const last = src.length - 1
    if (v >= src[last]) return v + (dst[last] - src[last])
    let i = 1
    while (src[i] < v) i++
    const t = (v - src[i - 1]) / (src[i] - src[i - 1])
    return dst[i - 1] + t * (dst[i] - dst[i - 1])
  }
}

/** How a sheet's viewport drawing follows the parameters. */
export interface AcTpSheetStretch {
  /** True when nothing moves (default geometry). */
  identity: boolean
  /** Maps a local point; `at` picks the view (an entity's centre). */
  map(p: XY, at?: XY): XY
  /**
   * The rise for changed slopes at stretched `x`, source `y` (already in
   * `map`): for an item placed at its own distance across, not at `map`'s x.
   */
  tilt?(x: number, y: number, at?: XY): number
  /** Index of the view a point belongs to. */
  viewOf(at: XY): number
  /** View names, by index. */
  views: string[]
  /** Columns of views, top to bottom (see {@link FLOWS}). */
  flow: number[][]
}

/**
 * The stretch of sheet `id` for `values`, or an error message explaining
 * why the drawing cannot follow them.
 */
export function sheetStretch(
  id: string,
  values: AcTpParamValues
): AcTpSheetStretch | { error: string } {
  const defaults = dossierDefaults()
  const changed = Object.keys(defaults).filter(
    k => values[k] !== undefined && values[k] !== defaults[k]
  )
  const geometric = changed.filter(k => !DOSSIER_FREE_KEYS.has(k))
  if (!geometric.length)
    return {
      identity: true,
      map: p => [p[0], p[1]] as XY,
      viewOf: () => 0,
      views: [],
      flow: []
    }
  const views = GRIDS[id]
  if (!views)
    return {
      error: `Tờ ${id} chưa có lưới co giãn ở bộ sinh ${DOSSIER_VERSION}.`
    }
  const n = (k: string) => Number(values[k])
  const unsupported = geometric.filter(
    k =>
      !(DOSSIER_STRETCH_KEYS as readonly string[]).includes(k) &&
      !DOSSIER_DERIVED_KEYS.has(k) &&
      !DOSSIER_ARRAYED_KEYS.has(k)
  )
  if (unsupported.length)
    return {
      error: `Bộ sinh ${DOSSIER_VERSION} chưa dựng được khi đổi ${unsupported.map(dossierParamLabel).join(', ')} (đổi số lượng/bố trí, chưa có trong lưới co giãn). Để dựng lại được, đưa về giá trị mẫu: ${unsupported.map(k => dossierParamValue(k, defaults[k])).join(', ')}.`
    }
  // Values the source draws as one line with another.
  if (n('bThan') !== n('bBe'))
    return {
      error: `Bản gốc vẽ thân rộng bằng bệ (bề rộng thân = bề rộng bệ); bề rộng thân ${n('bThan')} mm ≠ bề rộng bệ ${n('bBe')} mm chưa dựng được.`
    }
  if (
    n('aCocNgang') !== n('bBe') - 2 * n('D') ||
    n('aCocDoc') !== n('lBe') - 2 * n('D')
  )
    return {
      error: `Bản gốc đặt cọc sát mép bệ: tim cọc ngang = bề rộng bệ − 2 × đường kính cọc (${n('bBe') - 2 * n('D')} mm), tim cọc dọc = chiều dài bệ − 2 × đường kính cọc (${n('lBe') - 2 * n('D')} mm); giá trị khác chưa dựng được.`
    }
  const d = Object.fromEntries(
    DOSSIER_STRETCH_KEYS.map(k => [k, n(k) - Number(defaults[k])])
  ) as Delta
  if (d.tCanh !== 0 && !wingFits(d))
    return {
      error: `Bản gốc vẽ mặt trong tường cánh nằm giữa mép mặt đường và tim cọc ngoài cùng: dày tường cánh phải lớn hơn khoảng từ mép bệ tới mép mặt đường (${(n('bBe') - n('bMatDuong')) / 2} mm) và nhỏ hơn khoảng từ mép bệ tới tim cọc ngoài cùng (${n('D')} mm); dày tường cánh ${n('tCanh')} mm chưa dựng được.`
    }
  const kept = (lines: Line[]) => lines.filter(l => !l[2] || l[2](d))
  try {
    const tilted = d.docNgang !== 0 || d.docDoc !== 0
    const maps = views.map(v => {
      const fx = axis(kept(v.x), d, v.name, 'ngang')
      return {
        box: v.box,
        fx,
        fy: axis(kept(v.y), d, v.name, 'đứng'),
        tilt: (tilted && v.tilt?.(d, n, fx)) || (() => 0)
      }
    })
    const index = (q: XY) =>
      Math.max(
        0,
        maps.findIndex(
          m =>
            q[0] >= m.box.x0 &&
            q[0] < m.box.x1 &&
            q[1] >= m.box.y0 &&
            q[1] < m.box.y1
        )
      )
    return {
      identity: false,
      map: (p, at = p) => {
        const m = maps[index(at)]
        const x = m.fx(p[0])
        return [x, m.fy(p[1]) + m.tilt(x, p[1])]
      },
      tilt: (x, y, at = [x, y]) => maps[index(at)].tilt(x, y),
      viewOf: index,
      views: views.map(v => v.name),
      flow: FLOWS[id] ?? [views.map((_, k) => k)]
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Parameters drawn as an array of blocks placed from the model (the
 * bearings), not through the grid: the scene re-places them
 * (`arrayedBearings` in scene030), the grid ignores them.
 */
export const DOSSIER_ARRAYED_KEYS: ReadonlySet<string> = new Set([
  'soGoi',
  'aGoi'
])

/** Parameters fixed by others in the source arrangement (checked above). */
export const DOSSIER_DERIVED_KEYS: ReadonlySet<string> = new Set([
  'bThan',
  'aCocNgang',
  'aCocDoc'
])
