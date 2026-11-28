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
 * Bearings and piles are arrays the scene places from the model (count and
 * spacing), not grid lines. What the grid cannot follow is refused with the
 * reason, never drawn wrong: a value the drawing does not show apart (stem
 * width ≠ footing width), or one that would fold the grid.
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
  | 'docDoc'
  /**
   * Footing edge to the outer pile centre across the bridge, change from the
   * source's 1200 (P2-M4): `d.D` while the piles sit flush with the edges as
   * the source draws them, otherwise where the pile array really puts them.
   */
  | 'eNgang',
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
type Tilt = (x: number, y: number, xs?: number) => number

/** Source cross fall (front elevation, sections B–B / C–C), %. */
export const DOSSIER_SOURCE_CROSS_FALL = 2
/** Source road width the cross fall is drawn over, mm. */
const SOURCE_ROAD = 7000
/** Source stem (and footing) width, mm. */
const SOURCE_STEM = 7700

/**
 * Generator revision of the drawing. P2-M6 corrected three things a dossier
 * drawn before shows differently: the head-wall top and the seat strip of
 * the front elevation follow hDau / hThan as one (lines 21700, 20750), the
 * cross fall is the stated slope on any road width (not the source's 140 mm
 * stretched), and a flush 2 × 2 front elevation draws its two pile stubs at
 * the true spacing (not the source pair 5300 apart). `legacy` draws as
 * before, only to recognise such a dossier when it is edited — never to
 * build a new one (see `acapDossierRevisionFor` in edit.ts).
 */
let legacy = false

/**
 * Runs `build` with the drawing of the generator before P2-M6 (see
 * {@link legacy}). Synchronous: the flag is restored before returning.
 */
export function acTpWithLegacyDossierGeometry<T>(build: () => T): T {
  const was = legacy
  legacy = true
  // Drawn before P2-M6 is drawn before P3-M1 too.
  try {
    return acTpWithPreP3Steel(build)
  } finally {
    legacy = was
  }
}

/**
 * Steel of the generator before P3-M1: for a changed geometry the steel
 * sheets kept the M1 drawing at the M1 size, marked «THÉP THEO M1 GỐC…»,
 * SUB-100 the M1 tables, and the BTKL steel was the M1 ratio estimate of
 * every group. Only to recognise such a dossier when it is edited — never
 * to build a new one (see `acapDossierRevisionFor` in edit.ts).
 */
let preP3Steel = false

/** Runs `build` with the steel of the generator before P3-M1 (synchronous). */
export function acTpWithPreP3Steel<T>(build: () => T): T {
  const was = preP3Steel
  preP3Steel = true
  try {
    return build()
  } finally {
    preP3Steel = was
  }
}

/** Whether the steel is being drawn / counted as before P3-M1. */
export function acTpPreP3Steel(): boolean {
  return preP3Steel
}

/** Whether a drawing is being built as before P2-M6. */
export function acTpLegacyDossierGeometry(): boolean {
  return legacy
}

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

/**
 * How far the high road edge rises for the cross fall, beyond what the
 * source draws there (sections B–B / C–C are cut at the road edges): the
 * change of slope over half the road, plus — since P2-M6 — the source slope
 * over the half-width added to the source road (L1: 10 mm), so the edges sit
 * `docNgang · bMatDuong / 2` from the centre whatever the road width.
 */
const edgeLift = (d: Delta, n: (key: string) => number) =>
  ((d.docNgang / 100) * n('bMatDuong')) / 2 +
  (legacy
    ? 0
    : ((DOSSIER_SOURCE_CROSS_FALL / 100) * (n('bMatDuong') - SOURCE_ROAD)) / 2)

/**
 * The source fall over the width a band gained (P2-M6), mm, at source x
 * `xs` (stretched `x` when the caller has no source x): with the source
 * slope drawn as is, the band's edges end up at `i_s · (k − 1) · e` from the
 * stated slope, k the band's stretch and e the source edge offset. Zero at
 * the source widths, and before P2-M6.
 */
function fallFix(
  fx: Axis,
  centre: number,
  stem: [number, number],
  road: [number, number]
) {
  const band = (b: [number, number]) => ({
    b,
    k: (fx(b[1]) - fx(b[0])) / (b[1] - b[0])
  })
  const bands = [band(stem), band(road)]
  const i = DOSSIER_SOURCE_CROSS_FALL / 100
  return (onRoad: boolean, x: number, xs?: number) => {
    const { b, k } = bands[onRoad ? 1 : 0]
    if (legacy || Math.abs(k - 1) < 1e-12) return 0
    const u = clamp(xs ?? inverse(fx, x), b[0], b[1])
    return i * (k - 1) * (u - centre)
  }
}
/** The source coordinate a monotonic axis map takes to `x` (bisection). */
function inverse(f: Axis, x: number) {
  let lo = -1e6
  let hi = 1e6
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2
    if (f(mid) < x) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

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
/**
 * Across the bridge: footing edges, outer pile centres, centre line. The
 * pile lines follow the outer pile centres of the array (`eNgang`, P2-M4):
 * at D from the edges while the piles are flush with them, as the source.
 */
const across = (left: number): Line[] => [
  [left, d => -d.bBe / 2],
  [left + 1200, d => -d.bBe / 2 + d.eNgang],
  [left + 3850, () => 0],
  [left + 6500, d => d.bBe / 2 - d.eNgang],
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
  500 + d.tCanh < 1200 + d.eNgang

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
    //
    // The source draws that fall over its own widths (140 over the 7000
    // road, 154 over the 7700 stem); stretched wider it would be a flatter
    // slope than stated (L1: 1,75 % for 2 %, a 20 mm tilt left at 0 %).
    // `fallFix` adds the source fall over the width added (P2-M6), from the
    // source x, so the drawn slope is the stated one on any width.
    tilt: (d, _n, fx) => {
      const i = d.docNgang / 100
      const centre = fx(7264)
      const stem = [fx(3414), fx(11114)]
      const road = [fx(3764), fx(10764)]
      const fix = fallFix(fx, 7264, [3414, 11114], [3764, 10764])
      return (x, y, xs) => {
        const [lo, hi] = y >= 21700 ? road : stem
        return (
          (i * (clamp(x, lo, hi) - centre) + fix(y >= 21700, x, xs)) *
          ramp(y, 15286, 19900)
        )
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
      ...heights(20015).slice(3, 4),
      // P2-M6: above the seat's high end (20080) the bearings, stops and
      // their bars (up to 20743) and the EL4.R tag rode the hDau band:
      // +0,3 m on hDau raised EL4.R by 12 mm and stretched the stops. They
      // rise with the seat now; the line is left out where hDau would fold
      // it onto the one above (head wall under 937 mm).
      [20750, d => d.hBe + d.hThan, d => !legacy && d.hDau > -900] as Line,
      // P2-M6: the head-wall top falls across the bridge (21751 at its low
      // road edge, 21891 at its high one). Below 21891 its low side rode the
      // hDau band and rose by 0,925 Δ: H2 measured 7042 for 7204 after the
      // chain of height changes (plan P0–P1, section 7). The whole top now
      // rises as one with hDau, as the tilt already treats it.
      [21700, d => d.hBe + d.hThan + d.hDau, () => !legacy] as Line,
      ...heights(20015).slice(4)
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
      const lift = edgeLift(d, n)
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
      const lift = edgeLift(d, n)
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
 * Steel sheets SUB-070 / 080 / 090 (P3-M1): the same lines as the general
 * views the sections are cut from (front elevation for 1-1/2-2, the plan for
 * 4-4/5-5, A–A / B–B / C–C for 3-3 and the wing sections), so the bars
 * follow the dossier's dimensions. Two things are added for reinforcement:
 *
 * - a band line 150 inside each concrete face, moving with that face: what
 *   lies between a face and its band moves rigidly, so a bar end or a bar
 *   row keeps the M1 cover to the new face (75–100 in the source) instead
 *   of the cover growing or shrinking with the member;
 * - no slope tilt: the source draws the steel at its own falls; a changed
 *   cross or longitudinal fall is not re-drawn on these sheets (P3-M2).
 *
 * Rows of bars in section (the `MO2_U4xx` arrays, 150 apart) are re-laid at
 * the M1 spacing by the scene (`acTpSteelRowCount`), not stretched apart.
 */
const STEEL_BAND = 150

/**
 * Lines along the bridge of a side section, from the toe edge `e` (the
 * muiBe side) in direction `s`: stem front (muiBe), head wall front and
 * stem back (+ tThan, assumption 9), heel edge (lBe); the outer pile
 * centres at D from the edges where piles are drawn; the wing end (LC from
 * the head wall front) where the wing is drawn.
 */
function steelSide(
  e: number,
  s: 1 | -1,
  { piles = false, wing = false }: { piles?: boolean; wing?: boolean } = {}
): Line[] {
  const stem = (d: Delta) => s * (d.muiBe + d.tThan)
  const lines: Line[] = [
    [e, () => 0],
    [e + s * STEEL_BAND, () => 0],
    [e + s * 2000, d => s * d.muiBe],
    [e + s * (2000 + STEEL_BAND), d => s * d.muiBe],
    [e + s * 3000, stem],
    [e + s * 3500, stem],
    // The corbel and the 300 haunch behind the stem move with its back.
    [e + s * (3500 + 300), stem],
    [e + s * (6000 - STEEL_BAND), d => s * d.lBe],
    [e + s * 6000, d => s * d.lBe]
  ]
  if (piles)
    lines.push(
      [e + s * 1200, d => s * d.D],
      [e + s * 4800, d => s * (d.lBe - d.D)]
    )
  if (wing) {
    const end = (d: Delta) => s * (d.muiBe + d.tThan + d.lCanh)
    lines.push([e + s * (9500 - STEEL_BAND), end], [e + s * 9500, end])
  }
  return lines.sort((a, b) => a[0] - b[0])
}

/**
 * Heights of a steel section: lean concrete, footing (with its bands), the
 * stem top / seat (`seat`, its lowest point in the section), the head wall
 * top (`top`, lowest point), and the rail top where drawn.
 */
function steelHeights(
  bottom: number,
  seat: number,
  top: number,
  rail?: number
): Line[] {
  const head = (d: Delta) => d.hBe + d.hThan + d.hDau
  return [
    [bottom - 100, d => -d.hLot],
    [bottom, () => 0],
    [bottom + STEEL_BAND, () => 0],
    [bottom + 2000 - STEEL_BAND, d => d.hBe],
    [bottom + 2000, d => d.hBe],
    [seat - STEEL_BAND, d => d.hBe + d.hThan],
    [top - STEEL_BAND, head],
    ...(rail === undefined
      ? []
      : [[rail, (d: Delta) => head(d) + d.hLanCan] as Line])
  ]
}

/** Across the bridge, with the bands inside the footing edges. */
const steelAcross = (lines: Line[], left: number): Line[] =>
  [
    ...lines,
    [left + STEEL_BAND, (d: Delta) => -d.bBe / 2] as Line,
    [left + SOURCE_STEM - STEEL_BAND, (d: Delta) => d.bBe / 2] as Line
  ].sort((a, b) => a[0] - b[0])

/** Wing sections 9-9 / 10-10 in plan: thickness tCanh from the outer face. */
const wingPlan = (cut: number, outer: number, s: 1 | -1): Line[] =>
  [
    [cut, () => 0] as Line,
    [outer - s * 500, (d: Delta) => -s * d.tCanh] as Line,
    [outer, () => 0] as Line
  ].sort((a, b) => a[0] - b[0])

/** SUB-070 — half sections 1-1 / 2-2, half plans 4-4 / 5-5, section 3-3. */
const SUB_070: View[] = [
  {
    name: 'Mặt cắt 1-1 / 2-2',
    box: { x0: 0, y0: 11000, x1: 20000, y1: 30000 },
    x: steelAcross(frontAcross(8570), 8570),
    y: steelHeights(13733, 20384, 22190)
  },
  {
    name: 'Mặt cắt 4-4 / 5-5',
    box: { x0: 0, y0: 0, x1: 20000, y1: 11000 },
    x: steelAcross(planAcross(8570), 8570),
    y: [
      [1843, () => 0],
      [1843 + STEEL_BAND, () => 0],
      [3843, d => d.muiBe],
      [5343, d => d.muiBe + d.tThan],
      [7843 - STEEL_BAND, d => d.lBe],
      [7843, d => d.lBe]
    ]
  },
  {
    name: 'Mặt cắt 3-3',
    box: { x0: 20000, y0: 0, x1: 40000, y1: 30000 },
    x: steelSide(31338, -1, { piles: true }),
    y: steelHeights(13733, 20449, 22337)
  }
]

/** SUB-080 — left wing: sections 7-7, 8-8 (over 9-9, 10-10) and 6-6. */
const SUB_080: View[] = [
  {
    name: 'Mặt cắt 7-7',
    box: { x0: 0, y0: 7000, x1: 17500, y1: 30000 },
    x: steelSide(6396, 1, { piles: true, wing: true }),
    y: steelHeights(9216, 16002, 17821, 18900)
  },
  {
    name: 'Mặt cắt 9-9',
    box: { x0: 0, y0: 0, x1: 17500, y1: 7000 },
    x: steelSide(6396, 1, { wing: true }),
    y: wingPlan(715, 3225, 1)
  },
  {
    name: 'Mặt cắt 8-8',
    box: { x0: 17500, y0: 7000, x1: 29500, y1: 30000 },
    x: steelSide(18436, 1, { piles: true, wing: true }),
    y: steelHeights(9216, 16002, 17821, 18900)
  },
  {
    name: 'Mặt cắt 10-10',
    box: { x0: 17500, y0: 0, x1: 29500, y1: 7000 },
    x: steelSide(18436, 1),
    y: wingPlan(715, 3225, 1)
  },
  {
    name: 'Mặt cắt 6-6',
    box: { x0: 29500, y0: 0, x1: 40000, y1: 30000 },
    x: [
      [32726, d => -d.tCanh],
      [33226, () => 0]
    ],
    y: steelHeights(9216, 16002, 17821)
  }
]

/** SUB-090 — right wing, SUB-080 mirrored: 8-8, 7-7 (over 10-10, 9-9), 6-6. */
const SUB_090: View[] = [
  {
    name: 'Mặt cắt 8-8',
    box: { x0: 0, y0: 7000, x1: 14500, y1: 30000 },
    x: steelSide(13686, -1, { piles: true, wing: true }),
    y: steelHeights(9954, 16741, 18559, 19640)
  },
  {
    name: 'Mặt cắt 10-10',
    box: { x0: 0, y0: 0, x1: 14500, y1: 7000 },
    x: steelSide(13686, -1),
    y: wingPlan(1453, 3963, 1)
  },
  {
    name: 'Mặt cắt 7-7',
    box: { x0: 14500, y0: 7000, x1: 27000, y1: 30000 },
    x: steelSide(25726, -1, { piles: true, wing: true }),
    y: steelHeights(9954, 16741, 18559, 19640)
  },
  {
    name: 'Mặt cắt 9-9',
    box: { x0: 14500, y0: 0, x1: 27000, y1: 7000 },
    x: steelSide(25726, -1, { wing: true }),
    y: wingPlan(1453, 3963, 1)
  },
  {
    name: 'Mặt cắt 6-6',
    box: { x0: 27000, y0: 0, x1: 40000, y1: 30000 },
    x: [
      [30006, () => 0],
      [30506, d => d.tCanh]
    ],
    y: steelHeights(9954, 16741, 18559)
  }
]

/**
 * How a sheet's views sit: columns left to right, each listing its views top
 * to bottom (indices into the sheet's views). When a view grows, the views
 * below it and the columns to its right move to keep the source's gaps.
 */
const FLOWS: Record<string, number[][]> = {
  'SUB-010': [[0, 1], [2, 3], [4]],
  'SUB-020': [[0]],
  'SUB-070': [[0, 1], [2]],
  'SUB-080': [[0, 1], [2, 3], [4]],
  'SUB-090': [[0, 1], [2, 3], [4]]
}

const GRIDS: Record<string, View[]> = {
  'SUB-010': SUB_010,
  'SUB-020': SUB_020,
  'SUB-070': SUB_070,
  'SUB-080': SUB_080,
  'SUB-090': SUB_090
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
  /**
   * The rise for the slopes at source point `p` (already in `map`): what
   * the cross fall and the wing top slope add to where `p` is drawn (P2-M6,
   * the BTKL wing end height).
   */
  rise?(p: XY, at?: XY): number
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
  // The piles are an array placed from the model (arrayedPiles in
  // scene030): any count and spacing the model accepts (edge clearance 300,
  // no overlap) is drawn, not only the source's flush 2 × 2 (P2-M4).
  const outer = dossierOuterPileEdge(values)
  const d = {
    ...Object.fromEntries(
      DOSSIER_STRETCH_KEYS.map(k => [k, n(k) - Number(defaults[k])])
    ),
    eNgang: outer - dossierOuterPileEdge(defaults)
  } as Delta
  // The plan always draws the wing faces: they must stay outside the outer
  // pile centre line. The front leaves them out when they cross the road
  // edge at the source thickness (dossiers built before P2/M1).
  if ((d.tCanh !== 0 && !wingFits(d)) || 500 + d.tCanh >= 1200 + d.eNgang)
    return {
      error: `Bản gốc vẽ mặt trong tường cánh nằm giữa mép mặt đường và tim cọc ngoài cùng: dày tường cánh phải lớn hơn khoảng từ mép bệ tới mép mặt đường (${(n('bBe') - n('bMatDuong')) / 2} mm) và nhỏ hơn khoảng từ mép bệ tới tim cọc ngoài cùng (${outer} mm); dày tường cánh ${n('tCanh')} mm chưa dựng được.`
    }
  const kept = (lines: Line[]) => lines.filter(l => !l[2] || l[2](d))
  try {
    // Since P2-M6 a road or stem wider than the source tilts too (the
    // source fall over the added width), at any slope.
    const tilted =
      d.docNgang !== 0 ||
      d.docDoc !== 0 ||
      (!legacy && (n('bMatDuong') !== SOURCE_ROAD || n('bBe') !== SOURCE_STEM))
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
        return [x, m.fy(p[1]) + m.tilt(x, p[1], p[0])]
      },
      tilt: (x, y, at = [x, y]) => maps[index(at)].tilt(x, y),
      rise: (p, at = p) => {
        const m = maps[index(at)]
        return m.tilt(m.fx(p[0]), p[1], p[0])
      },
      viewOf: index,
      views: views.map(v => v.name),
      flow: FLOWS[id] ?? [views.map((_, k) => k)]
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Footing edge to the outer pile centre across the bridge, mm: where the
 * pile array puts it, `(bBe − (soCotCoc − 1) · aCocNgang) / 2` (D for the
 * source's flush piles). A single pile per row has no outer pile near the
 * wings: the source's D stands, so the wing limit stays the source's.
 */
export function dossierOuterPileEdge(values: AcTpParamValues): number {
  const n = (k: string) => Number(values[k])
  return n('soCotCoc') > 1
    ? (n('bBe') - (n('soCotCoc') - 1) * n('aCocNgang')) / 2
    : n('D')
}

/** Bearing count and spacing, drawn as an array (`arrayedBearings`). */
export const DOSSIER_BEARING_KEYS: readonly string[] = ['soGoi', 'aGoi']
/** Pile count and spacing both ways, drawn as an array (`arrayedPiles`). */
export const DOSSIER_PILE_KEYS: readonly string[] = [
  'soCotCoc',
  'soHangCoc',
  'aCocNgang',
  'aCocDoc'
]
/**
 * Parameters drawn as arrays of blocks placed from the model (bearings,
 * piles), not through the grid: the scene re-places them (`arrayedBearings`,
 * `arrayedPiles` in scene030), the grid ignores them — except the outer
 * pile centre across, which bounds the wing thickness ({@link wingFits}).
 */
export const DOSSIER_ARRAYED_KEYS: ReadonlySet<string> = new Set([
  ...DOSSIER_BEARING_KEYS,
  ...DOSSIER_PILE_KEYS
])

/** Parameters fixed by others in the source arrangement (checked above). */
export const DOSSIER_DERIVED_KEYS: ReadonlySet<string> = new Set(['bThan'])
