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
  | 'bMatDuong',
  number
>
type Line = [source: number, shift: (d: Delta) => number]

interface View {
  name: string
  /** Where the view sits, local coordinates. */
  box: { x0: number; y0: number; x1: number; y1: number }
  x: Line[]
  y: Line[]
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
  'bMatDuong'
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

/** Elevation lines shared by the front view and both sections. */
const heights = (stemTop: number): Line[] => [
  [13186, d => -d.hLot],
  [13286, () => 0],
  [15286, d => d.hBe],
  [stemTop, d => d.hBe + d.hThan],
  [21891, d => d.hBe + d.hThan + d.hDau]
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
    [left + 7350, (d: Delta) => d.bMatDuong / 2] as Line
  ].sort((a, b) => a[0] - b[0])

/**
 * Plan across the bridge: the footing lines, plus the inner faces of the
 * wings (W(t) 500 inside each footing edge), which follow the footing edge
 * so the wing keeps its thickness tCanh whatever the pile diameter.
 */
const planAcross = (left: number): Line[] =>
  [
    ...across(left),
    [left + 500, (d: Delta) => -d.bBe / 2] as Line,
    [left + 7200, (d: Delta) => d.bBe / 2] as Line
  ].sort((a, b) => a[0] - b[0])

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
      [11904, d => d.hBe + d.hThan + d.hDau]
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
  try {
    const maps = views.map(v => ({
      box: v.box,
      fx: axis(v.x, d, v.name, 'ngang'),
      fy: axis(v.y, d, v.name, 'đứng')
    }))
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
        return [m.fx(p[0]), m.fy(p[1])]
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
