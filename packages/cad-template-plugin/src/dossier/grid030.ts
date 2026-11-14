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

import { dossierDefaults } from './model'

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
  | 'D',
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
const STRETCH = [
  'bBe',
  'lBe',
  'hBe',
  'hLot',
  'muiBe',
  'tThan',
  'hThan',
  'hDau',
  'lCanh',
  'D'
] as const

/**
 * Parameters the drawing does not depend on (labels, tables, elevations
 * written as text, material choices, sheet position).
 */
const FREE = new Set([
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
  'lCoc'
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

/** SUB-010 — front elevation, sections A–A and B–B, plans. */
const SUB_010: View[] = [
  {
    name: 'Mặt chính',
    box: { x0: 0, y0: 12000, x1: 13500, y1: 26000 },
    x: across(3414),
    y: heights(20015)
  },
  {
    name: 'Mặt bằng mố',
    box: { x0: 0, y0: 0, x1: 13500, y1: 12000 },
    x: across(3414),
    y: [
      [1446, () => 0],
      [3446, d => d.muiBe],
      // Back of the head wall: the stem front plus a fixed 1000.
      [4446, d => d.muiBe],
      [4946, d => d.muiBe + d.tThan],
      [7446, d => d.lBe],
      [10946, d => d.muiBe + d.lCanh]
    ]
  },
  {
    // B1 · B(TT) · B2 from the left; the head wall (N 1000) at the stem back.
    name: 'Mặt cắt A–A',
    box: { x0: 13500, y0: 12000, x1: 25000, y1: 26000 },
    x: [
      [15732, () => 0],
      [16932, d => d.D],
      [18232, d => d.lBe - d.muiBe - d.tThan],
      [18732, d => d.lBe - d.muiBe],
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
      [29367, d => d.muiBe],
      [29867, d => d.muiBe + d.tThan],
      [31167, d => d.lBe - d.D],
      [32367, d => d.lBe],
      [35867, d => d.muiBe + d.lCanh]
    ],
    y: heights(20073)
  }
]

const GRIDS: Record<string, View[]> = { 'SUB-010': SUB_010 }

/** A piecewise-linear map through the moved lines. */
function axis(lines: Line[], d: Delta, view: string, label: string) {
  const src = lines.map(l => l[0])
  const dst = lines.map(l => l[0] + l[1](d))
  for (let i = 1; i < dst.length; i++)
    if (!(dst[i] > dst[i - 1]))
      throw new Error(
        `${view}: thông số mới làm các đường mốc ${label} chồng hoặc đảo nhau (${src[i - 1]} → ${src[i]}); bộ sinh 0.3.0 không vẽ được hình này.`
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
  const geometric = changed.filter(k => !FREE.has(k))
  if (!geometric.length) return { identity: true, map: p => [p[0], p[1]] as XY }
  const views = GRIDS[id]
  if (!views) return { error: `Tờ ${id} chưa có lưới co giãn ở bộ sinh 0.3.0.` }
  const n = (k: string) => Number(values[k])
  const unsupported = geometric.filter(
    k => !(STRETCH as readonly string[]).includes(k) && !DERIVED.has(k)
  )
  if (unsupported.length)
    return {
      error: `Bộ sinh 0.3.0 chưa dựng được khi đổi ${unsupported.join(', ')} (đổi số lượng/bố trí, chưa có trong lưới co giãn).`
    }
  // Values the source draws as one line with another.
  if (n('bThan') !== n('bBe'))
    return {
      error: `Bản gốc vẽ thân rộng bằng bệ (bThan = bBe); bThan ${n('bThan')} ≠ bBe ${n('bBe')} chưa dựng được.`
    }
  if (
    n('aCocNgang') !== n('bBe') - 2 * n('D') ||
    n('aCocDoc') !== n('lBe') - 2 * n('D')
  )
    return {
      error: `Bản gốc đặt cọc sát mép bệ: aCocNgang = bBe − 2D (${n('bBe') - 2 * n('D')}), aCocDoc = lBe − 2D (${n('lBe') - 2 * n('D')}); giá trị khác chưa dựng được.`
    }
  const d = Object.fromEntries(
    STRETCH.map(k => [k, n(k) - Number(defaults[k])])
  ) as Delta
  try {
    const maps = views.map(v => ({
      box: v.box,
      fx: axis(v.x, d, v.name, 'ngang'),
      fy: axis(v.y, d, v.name, 'đứng')
    }))
    const pick = (q: XY) =>
      maps.find(
        m =>
          q[0] >= m.box.x0 &&
          q[0] < m.box.x1 &&
          q[1] >= m.box.y0 &&
          q[1] < m.box.y1
      ) ?? maps[0]
    return {
      identity: false,
      map: (p, at = p) => {
        const m = pick(at)
        return [m.fx(p[0]), m.fy(p[1])]
      }
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/** Parameters fixed by others in the source arrangement (checked above). */
const DERIVED = new Set(['bThan', 'aCocNgang', 'aCocDoc'])
