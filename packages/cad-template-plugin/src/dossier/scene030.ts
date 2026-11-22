/**
 * Generator 0.3.0 of the abutment dossier: the six A3 sheets of
 * `02. BTC- mo_2.dwg`, laid out as the engineer laid them out.
 *
 * Each sheet is an A3 page at 1:100 drawn in model space (paper mm × 100),
 * numbered as the source (SUB-010 … SUB-100):
 *
 * - the drawing sits where the source viewport sat, showing the same model
 *   window, clipped to the viewport rectangle;
 * - the A3 frame and title strip, with the three title texts of the source at
 *   their measured positions;
 * - what the source drew in paper space — the section key plan of SUB-070
 *   (section symbols as block inserts with their `CS` attribute) and the
 *   bar-shape legend of SUB-100 (real dimensions, `_33_` styles).
 *
 * The drawing inside each viewport is still the 0.2.0 source extract
 * (`reference/reinforcement.json`); rebuilding it with real dimensions,
 * hatches and blocks is the next stage. Positions come from
 * `reference/layout-mo2.json` (tools/fidelity/extract-layout.mjs).
 */
import type {
  AcTpBlockDef,
  AcTpBlockEntity,
  AcTpDimStyleVars
} from '@mlightcad/cad-template-sdk'
import {
  ACTP_DIM_STYLES_33,
  acTpBuildDrawingFrame,
  acTpDecodeVnText
} from '@mlightcad/cad-template-sdk'

import { acTpBtklMo, acTpBtklNumber } from '../btkl/mo'
import { acTpDimensionText, type AcTpDimLabelMode } from './dimSymbols'
import { acTpLegacyDossierGeometry, sheetStretch } from './grid030'
import type { DossierModel } from './model'
import {
  DOSSIER_BEARING_WIDTH,
  DOSSIER_STOP_WIDTH,
  dossierDefaults,
  dossierStopOffsets,
  REFERENCE_ID
} from './model'
import layout from './reference/layout-mo2.json'
import reference from './reference/reinforcement.json'
import type {
  DossierAttribute,
  DossierPrimitive,
  DossierScene,
  DossierSheet,
  XY
} from './scene'

/** Paper millimetres → sheet units. */
const K = 100
const A3W = 420 * K,
  A3H = 297 * K
/** Gap between sheets laid out in model space. */
const GAP = 5000

const SHEET_TITLES: Record<string, string> = {
  'SUB-010': 'Bố trí chung (1/2)',
  'SUB-020': 'Bố trí chung (2/2)',
  'SUB-070': 'Bố trí cốt thép (1/3)',
  'SUB-080': 'Bố trí cốt thép (2/3)',
  'SUB-090': 'Bố trí cốt thép (3/3)',
  'SUB-100': 'Tổng hợp khối lượng'
}

/** The source's own text for the default project name. */
const SOURCE_PROJECT = 'CẦU KM0+400 (TUYẾN SỐ 2)'
const DEFAULT_PROJECT = 'Cầu Km0+400 — Tuyến số 2'

type LayoutPrimitive = {
  kind: string
  color?: number
  lineType?: string
  lineWeight?: number
  points?: XY[]
  bulges?: number[]
  closed?: boolean
  line?: boolean
  at?: XY
  radius?: number
  startAngle?: number
  endAngle?: number
  loops?: XY[][]
  pattern?: string
  patternScale?: number
  patternAngle?: number
  text?: string
  height?: number
  rotation?: number
  align?: number
  widthFactor?: number
  style?: string
  start?: XY
  end?: XY
  dimLine?: XY
  textAt?: XY
  aligned?: boolean
  dimStyle?: string
  vars?: Record<string, number>
  block?: string
  scale?: XY
  attributes?: Record<
    string,
    | string
    | {
        value: string
        position: XY
        height?: number
        rotationDeg?: number
        align?: number
        widthFactor?: number
        style?: string
      }
  >
  arrowHead?: boolean
  linetypeScale?: number
  /** Handle of the OLE table this line or text was read from. */
  ole?: string
  /** Model content: source layer, handle and entity type. */
  src?: string
  handle?: string
  type?: string
}
interface LayoutSheet {
  id: string
  viewport: { x: number; y: number; w: number; h: number } | null
  model: { x0: number; y0: number; x1: number; y1: number } | null
  view?: keyof typeof reference.views
  offset?: XY
  title: LayoutPrimitive[]
  paper: LayoutPrimitive[]
  /** The viewport drawing as real entities (sheets rebuilt in GĐ4). */
  content?: LayoutPrimitive[]
}
const LAYOUT = layout as unknown as {
  blocks: AcTpBlockDef[]
  sheets: LayoutSheet[]
}

/** Dimension variables a `_33_` style can carry, for overrides. */
const DIM_KEYS: (keyof AcTpDimStyleVars)[] = [
  'dimtxt',
  'dimasz',
  'dimexo',
  'dimexe',
  'dimgap',
  'dimtad',
  'dimdec',
  'dimrnd',
  'dimfxl',
  'dimfxlon',
  'dimlfac',
  'dimclrd',
  'dimclre',
  'dimclrt'
]

/**
 * Where the source dimension differs from its `_33_` style: those variables
 * become per-dimension overrides, as the source's DSTYLE overrides were.
 */
function dimOverrides(
  style: string,
  vars: Record<string, number> | undefined
): AcTpDimStyleVars | undefined {
  const base = ACTP_DIM_STYLES_33[style] as unknown as
    | Record<string, unknown>
    | undefined
  if (!vars || !base) return undefined
  const out: Record<string, number> = {}
  for (const key of DIM_KEYS) {
    const value = vars[key]
    if (value === undefined) continue
    const own = base[key]
    if (typeof own !== 'number' || Math.abs(own - value) > 1e-6)
      out[key] = value
  }
  return Object.keys(out).length ? (out as AcTpDimStyleVars) : undefined
}

/** Centre of an extracted primitive: picks its view in the stretch grid. */
function centreOf(p: LayoutPrimitive): XY {
  const pts: XY[] =
    p.kind === 'insert'
      ? insertDrawnPoints(p)
      : [
          ...(p.points ?? []),
          ...(p.loops?.flat() ?? []),
          ...(p.at ? [p.at] : []),
          ...(p.start ? [p.start, p.end!, p.dimLine!] : [])
        ]
  const xs = pts.map(q => q[0]),
    ys = pts.map(q => q[1])
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2
  ]
}

/** Points a block draws, in its own coordinates (nested blocks included). */
const blockPointCache = new Map<string, XY[]>()
function blockPoints(name: string, depth = 0): XY[] {
  const cached = blockPointCache.get(name)
  if (cached) return cached
  const def = LAYOUT.blocks.find(b => b.name === name)
  const out: XY[] = []
  for (const e of (def?.entities ?? []) as unknown as Record<
    string,
    unknown
  >[]) {
    const P = (q: unknown) => {
      const v = q as { x: number; y: number }
      return [v.x, v.y] as XY
    }
    if (e.start) out.push(P(e.start), P(e.end))
    if (Array.isArray(e.points)) out.push(...(e.points as unknown[]).map(P))
    if (Array.isArray(e.boundary)) out.push(...(e.boundary as unknown[]).map(P))
    if (e.center && typeof e.radius === 'number') {
      const [cx, cy] = P(e.center)
      const r = e.radius
      if (e.kind === 'arc') {
        // An arc: its ends and the axis extremes its sweep passes through.
        const a0 = e.startAngle as number
        let a1 = e.endAngle as number
        while (a1 < a0) a1 += 2 * Math.PI
        const at = (t: number): XY => [
          cx + r * Math.cos(t),
          cy + r * Math.sin(t)
        ]
        out.push(at(a0), at(a1))
        for (
          let q = Math.ceil(a0 / (Math.PI / 2));
          q * (Math.PI / 2) <= a1;
          q++
        )
          out.push(at(q * (Math.PI / 2)))
      } else out.push([cx - r, cy - r], [cx + r, cy + r])
    }
    if (e.position && e.kind !== 'insert') out.push(P(e.position))
    if (e.kind === 'insert' && depth < 8) {
      const at = P(e.position)
      const sc = e.scale as { x: number; y: number } | number | undefined
      const sx = typeof sc === 'number' ? sc : (sc?.x ?? 1),
        sy = typeof sc === 'number' ? sc : (sc?.y ?? 1)
      const a = (((e.rotationDeg as number) ?? 0) * Math.PI) / 180
      for (const [x, y] of blockPoints(String(e.block), depth + 1)) {
        const lx = x * sx,
          ly = y * sy
        out.push([
          at[0] + lx * Math.cos(a) - ly * Math.sin(a),
          at[1] + lx * Math.sin(a) + ly * Math.cos(a)
        ])
      }
    }
  }
  blockPointCache.set(name, out)
  return out
}

/**
 * Where an insert draws, in sheet-local coordinates. Some source blocks are
 * drawn in absolute coordinates and inserted from far away (bearings
 * `Goi I24`): their insertion point says nothing about their place.
 */
function insertDrawnPoints(p: LayoutPrimitive): XY[] {
  const own = blockPoints(p.block ?? '')
  if (!own.length || !p.at) return p.at ? [p.at] : []
  const [sx, sy] = p.scale ?? [1, 1]
  const a = ((p.rotation ?? 0) * Math.PI) / 180
  return own.map(([x, y]) => {
    const lx = x * sx,
      ly = y * sy
    return [
      p.at![0] + lx * Math.cos(a) - ly * Math.sin(a),
      p.at![1] + lx * Math.sin(a) + ly * Math.cos(a)
    ] as XY
  })
}

/** Bearing block of the source plan (drawn there only, in absolute
 * coordinates: its insertion point says nothing about its place). */
const BEARING_BLOCK = 'Goi I24'
/** Bearing stop block of the source plan. */
const STOP_BLOCK = 'UCX dam I24'
/**
 * Heights of the source front elevation's bearing seat strip, source mm: its
 * bearings and stops are exploded lines, not blocks, at the plan bearings'
 * x (both views share the bridge axis).
 */
const FRONT_STRIP = { y0: 19800, y1: 20800 }
/** Dimension the source writes over its outer bearings (front elevation). */
const BEARING_DIM_TEXT = '@B(G)'
/** Gap between a front bearing's top and its label, source mm. */
const FRONT_LABEL_GAP = 60
/** Bearing labels of the plan, G1 on the right. */
const BEARING_LABEL = /^G\d+$/
/**
 * A primitive placed at a true distance across the bridge from the bearing
 * centre line (source x `fromCentre`): the grid moves that line, not the
 * distances, so a bearing array keeps its spacing whatever the width does.
 */
type ArrayedPrimitive = LayoutPrimitive & {
  fromCentre?: number
  /**
   * The source point whose view maps this item (P2-M4 piles): the item was
   * placed through that view's stretch, wherever its own centre falls.
   */
  viewAt?: XY
}

/**
 * The view's content with every bearing-related item placed from the model
 * (`model.bearings`, `model.stops`), in place of the source's four bearings:
 *
 * - plan: `soGoi` copies of the `Goi I24` insert, labels `G1`…`Gn` (G1 on the
 *   right, as the source), one `UCX dam I24` stop per pair;
 * - front elevation: `soGoi` copies of the exploded bearing (13 lines and a
 *   polyline), the exploded stops (box and two bars) per pair, all following
 *   the seat's cross fall; the `@B(G)` dimension over the outer bearings.
 *
 * Stops narrower than the source (`model.stops.width` < 1000) are scaled
 * across the bridge about their centre. Returned untouched when the grid is
 * the identity (the source parameters), so the source drawing stays exact.
 */
function arrayedBearings(
  content: LayoutPrimitive[],
  model: DossierModel,
  keepSource: boolean
): LayoutPrimitive[] {
  const plan = content.filter(
    p => p.kind === 'insert' && p.block === BEARING_BLOCK
  )
  if (!plan.length) return content
  const X = plan.map(p => centreOf(p)[0]).sort((a, b) => a - b)
  const centre = (X[0] + X[X.length - 1]) / 2
  const sourceStops = dossierStopOffsets(X.map(x => x - centre)).map(
    o => centre + o
  )
  const inStrip = (p: LayoutPrimitive, x: number, half: number) =>
    p.kind === 'path' &&
    !!p.points?.length &&
    p.points.every(
      q =>
        Math.abs(q[0] - x) <= half &&
        q[1] > FRONT_STRIP.y0 &&
        q[1] < FRONT_STRIP.y1
    )
  const frontBearings = X.map(x =>
    content.filter(
      p =>
        p.color === 8 &&
        (p.src === 'OUTLINE' || p.src === '0') &&
        inStrip(p, x, DOSSIER_BEARING_WIDTH / 2 + 10)
    )
  )
  const frontStops = sourceStops.map(x =>
    content.filter(
      p =>
        p.src === '0' &&
        (p.color === 7 || p.color === 4) &&
        inStrip(p, x, DOSSIER_STOP_WIDTH / 2 + 20)
    )
  )
  const planStops = content.filter(
    p => p.kind === 'insert' && p.block === STOP_BLOCK
  )
  const labels = content
    .filter(p => p.kind === 'text' && BEARING_LABEL.test(p.text ?? ''))
    .sort((a, b) => a.at![0] - b.at![0])
  const dims = content.filter(
    p => p.kind === 'dimension' && p.text === BEARING_DIM_TEXT
  )
  // The seat falls across the bridge: its bearings step up with x.
  const bottom = (cluster: LayoutPrimitive[]) =>
    Math.min(...cluster.flatMap(p => p.points!.map(q => q[1])))
  const slope =
    (bottom(frontBearings[X.length - 1]) - bottom(frontBearings[0])) /
    (X[X.length - 1] - X[0])
  // The front elevation has no bearing labels of its own: G1… (G1 on the
  // right, as the plan) centred just above each bearing, where the stops —
  // between the bearings — leave room.
  const top = Math.max(
    ...frontBearings[0].flatMap(p => p.points!.map(q => q[1]))
  )
  const frontLabels = (xs: number[]): LayoutPrimitive[] =>
    labels.length
      ? [...xs]
          .sort((a, b) => b - a)
          .map(
            (x, i): ArrayedPrimitive => ({
              ...labels[0],
              handle: `${labels[0].handle}#F${i + 1}`,
              text: `G${i + 1}`,
              align: 1,
              at: [x, top + slope * (x - X[0]) + FRONT_LABEL_GAP],
              fromCentre: centre
            })
          )
      : []
  // The source parameters keep the source drawing exactly — which has no
  // labels on its front elevation.
  if (keepSource) return content
  const replaced = new Set<LayoutPrimitive>([
    ...plan,
    ...frontBearings.flat(),
    ...frontStops.flat(),
    ...planStops,
    ...labels,
    ...dims
  ])
  const copy = (
    p: LayoutPrimitive,
    tag: string,
    extra: Partial<LayoutPrimitive>
  ): ArrayedPrimitive => ({
    ...p,
    handle: `${p.handle}#${tag}`,
    ...extra,
    fromCentre: centre
  })
  const placed: ArrayedPrimitive[] = []
  const targets = model.bearings.map(o => centre + o)
  targets.forEach((x, i) => {
    const t = plan[0]
    placed.push(
      copy(t, `${i + 1}`, {
        at: [t.at![0] + x - centreOf(t)[0], t.at![1]]
      })
    )
    const dx = x - X[0]
    for (const p of frontBearings[0])
      placed.push(
        copy(p, `${i + 1}`, {
          points: p.points!.map(q => [q[0] + dx, q[1] + slope * dx] as XY)
        })
      )
  })
  placed.push(...frontLabels(targets))
  // Labels G1… from the right, at the source's place under each bearing.
  if (labels.length) {
    const near = (x: number) =>
      X.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a))
    const offsets = labels.map(l => l.at![0] - near(l.at![0])).sort()
    const offset = offsets[Math.floor(offsets.length / 2)]
    const t = labels[0]
    ;[...targets]
      .sort((a, b) => b - a)
      .forEach((x, i) =>
        placed.push(
          copy(t, `${i + 1}`, {
            text: `G${i + 1}`,
            at: [x + offset, t.at![1]]
          })
        )
      )
  }
  const f = model.stops.width / DOSSIER_STOP_WIDTH
  if (f > 0)
    model.stops.offsets.forEach((o, j) => {
      const x = centre + o
      const t = planStops[0]
      if (t) {
        const c = centreOf(t)[0]
        placed.push(
          copy(t, `${j + 1}`, {
            at: [x - (c - t.at![0]) * f, t.at![1]],
            scale: [t.scale![0] * f, t.scale![1]]
          })
        )
      }
      const from = sourceStops[0]
      for (const p of frontStops[0] ?? [])
        placed.push(
          copy(p, `${j + 1}`, {
            points: p.points!.map(
              q => [x + (q[0] - from) * f, q[1] + slope * (x - from)] as XY
            )
          })
        )
    })
  for (const t of dims) {
    const right = Math.max(...targets)
    const left = Math.min(...targets)
    // The source measures right to left, from the tops of the outer bearings.
    const [ra, la] =
      t.start![0] > t.end![0] ? [t.start!, t.end!] : [t.end!, t.start!]
    const rNew: XY = [right, ra[1] + slope * (right - ra[0])]
    const lNew: XY = [left, la[1] + slope * (left - la[0])]
    const [start, end] = t.start![0] > t.end![0] ? [rNew, lNew] : [lNew, rNew]
    placed.push(
      copy(t, '1', {
        start,
        end,
        dimLine: [end[0], t.dimLine![1]],
        ...(t.textAt ? { textAt: [centre, t.textAt[1]] as XY } : {})
      })
    )
  }
  const first = content.findIndex(p => replaced.has(p))
  const rest = content.filter(p => !replaced.has(p))
  return [...rest.slice(0, first), ...placed, ...rest.slice(first)]
}

/**
 * One axis of a view's pile array: the source footing edges on it, the
 * count, spacing and width parameters that place the piles along it, and
 * the source items measuring them (by handle).
 */
interface PileAxis {
  /** 0: the view's horizontal; 1: its vertical (pile plan rows). */
  k: 0 | 1
  /** Source footing edges, local (the grid maps them to the footing). */
  edges: [number, number]
  /** Across the bridge (soCotCoc, aCocNgang, bBe) or along it. */
  across: boolean
  /** Edge → outer pile dimensions and the outer-to-outer one. */
  dims: { edge: string[]; middle: string }
  /** Leaders whose first point sits on a pile ("CỌC KHOAN NHỒI"). */
  leaders?: string[]
}
/** The source's pile items of one view, by handle. */
interface PileView {
  /** Pile inserts (one pile each), or the front's nested pair. */
  piles: string[]
  axes: PileAxis[]
}
/**
 * Pile items of the general-arrangement sheets (handles read from
 * `reference/layout-mo2.json`): the pile plan (2 × 2 `D1200-1`), the front
 * elevation (one `MO2_U351` drawing the pair, 5300 apart), sections A–A,
 * B–B and C–C (`D1m` stubs, one per row).
 */
const PILE_VIEWS: Record<string, PileView[]> = {
  'SUB-010': [
    {
      // Front elevation.
      piles: ['2111C60'],
      axes: [
        {
          k: 0,
          edges: [3413.649, 11113.649],
          across: true,
          dims: { edge: ['20EFB44', '211A15A'], middle: '20EFB37' },
          leaders: ['20EFA0F', '20EFA10']
        }
      ]
    },
    {
      // Section A–A.
      piles: ['20EB327', '20EB328'],
      axes: [
        {
          k: 0,
          edges: [15732.274, 21732.274],
          across: false,
          dims: { edge: ['20F00AF', '211B746'], middle: '20F00BC' },
          leaders: ['20F00AD', '20F00AC']
        }
      ]
    },
    {
      // Section B–B (mirrored).
      piles: ['20EF24F', '20EF24E'],
      axes: [
        {
          k: 0,
          edges: [26366.886, 32366.886],
          across: false,
          dims: { edge: ['211B76E', '211B771'], middle: '211B76F' },
          leaders: ['20F0C99', '20F0C9A']
        }
      ]
    },
    {
      // Pile plan: rows along the bridge (y), piles across (x).
      piles: ['20EF26C', '20EF269', '20EF26B', '20EF26A'],
      axes: [
        {
          k: 0,
          edges: [15714.259, 23414.259],
          across: true,
          dims: { edge: ['211B943', '211B945'], middle: '211B942' }
        },
        {
          k: 1,
          edges: [2149.253, 8149.253],
          across: false,
          dims: { edge: ['211B99A', '211B99D'], middle: '211B99B' }
        }
      ]
    }
  ],
  'SUB-020': [
    {
      // Section C–C.
      piles: ['2111623', '2111624'],
      axes: [
        {
          k: 0,
          edges: [5721.75, 11721.75],
          across: false,
          dims: { edge: ['211B7C6', '211B7C9'], middle: '211B7C7' },
          leaders: ['2111651', '2111650']
        }
      ]
    }
  ]
}
/** The front elevation's pair block and the one-pile block it nests. */
const FRONT_PILE_PAIR = 'MO2_U351'
const FRONT_PILE = 'MO2_U350'
/** The front elevation's pair insert (SUB-010). */
const FRONT_PAIR_HANDLE = '2111C60'
/** Centre to centre of the two stubs the pair block draws, mm (source). */
const FRONT_PAIR_SPACING = (() => {
  const pair = LAYOUT.blocks.find(
    b => b.name === FRONT_PILE_PAIR
  ) as unknown as { entities: { position: { x: number } }[] } | undefined
  const xs = (pair?.entities ?? []).map(e => e.position.x)
  return xs.length ? Math.round(Math.max(...xs) - Math.min(...xs)) : 5300
})()

/** A stretched sheet: what {@link arrayedPiles} needs of it. */
interface PileStretch {
  map(p: XY, at?: XY): XY
  viewOf(at: XY): number
}

/**
 * The view's content with the piles placed from the model (`model.piles`,
 * P2-M4), in place of the source's flush 2 × 2:
 *
 * - pile plan: one `D1200-1` per pile, `soHangCoc` rows × `soCotCoc`;
 * - front elevation: one `MO2_U350` stub per pile across (the source nests
 *   its pair in `MO2_U351`); sections A–A, B–B, C–C: one `D1m` stub per row;
 * - each axis's dimensions: footing edge → outer pile, and outer pile →
 *   outer pile (`n − 1 × a = <>` for more than two piles; the source's
 *   symbol only where it still measures what it says); the "CỌC KHOAN
 *   NHỒI" leaders start on the outer piles as in the source.
 *
 * Piles keep their true spacing whatever the grid does to the footing:
 * each item is placed at the source point the stretch (and the view's
 * shift) takes to the pile's true place, about the footing centre (the
 * grid maps the source edges to the footing edges). Returned untouched for
 * the source arrangement — 2 × 2 flush with the footing edges, at any
 * footing size the grid follows — so those drawings stay exactly as built
 * (a dossier built before keeps matching its parameters).
 */
function arrayedPiles(
  content: LayoutPrimitive[],
  sheet: string,
  model: DossierModel,
  stretch: PileStretch,
  shifts: XY[]
): LayoutPrimitive[] {
  const n = (k: string) => Number(model.values[k])
  const flush =
    n('soCotCoc') === 2 &&
    n('soHangCoc') === 2 &&
    n('aCocNgang') === n('bBe') - 2 * n('D') &&
    n('aCocDoc') === n('lBe') - 2 * n('D')
  // Flush 2 × 2: every pile item already sits where the grid puts the pile
  // lines — except the front elevation's pair, one block whose two stubs
  // are FRONT_PAIR_SPACING apart whatever the spacing. Since P2-M6 it is
  // drawn as two stubs at the true centres when that spacing differs (L1:
  // 6700, the dimension above it), its dimensions and leaders untouched.
  const pairOnly =
    flush &&
    !acTpLegacyDossierGeometry() &&
    n('aCocNgang') !== FRONT_PAIR_SPACING
  const views =
    flush && !pairOnly
      ? undefined
      : PILE_VIEWS[sheet]?.filter(
          v => !pairOnly || v.piles[0] === FRONT_PAIR_HANDLE
        )
  if (!views?.length) return content
  const byHandle = new Map(content.map(p => [p.handle, p]))
  const get = (h: string) => byHandle.get(h)
  // Where a source point ends up (stretch, then the view's shift), and the
  // source coordinate on axis k that ends up at `target` (bisection: the
  // stretch is monotonic on each axis, and extends past its last lines).
  const final = (q: XY, at: XY): XY => {
    const [x, y] = stretch.map(q, at)
    const [sx, sy] = shifts[stretch.viewOf(at)] ?? [0, 0]
    return [x + sx, y + sy]
  }
  const on = (q: XY, k: number, value: number): XY =>
    k ? [q[0], value] : [value, q[1]]
  const source = (target: number, k: number, q: XY, at: XY) => {
    let lo = -1e6,
      hi = 1e6
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2
      if (final(on(q, k, mid), at)[k] < target) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }
  const offsets = (across: boolean) =>
    [...new Set(model.piles.map(p => (across ? p.x : p.y)))].sort(
      (a, b) => a - b
    )
  const replaced = new Set<LayoutPrimitive>()
  const placed: ArrayedPrimitive[] = []
  const pairDef = LAYOUT.blocks.find(
    b => b.name === FRONT_PILE_PAIR
  ) as unknown as { entities: { position: { x: number; y: number } }[] }
  const stubDef = LAYOUT.blocks.find(b => b.name === FRONT_PILE) as unknown as {
    entities: { position: { x: number; y: number } }[]
  }
  for (const view of views) {
    const piles = view.piles.map(get)
    if (piles.some(p => !p)) continue
    const first = piles[0]!
    const at = centreOf(first)
    // The front pair nests one stub per pile, off the stub block's origin.
    const pair = first.block === FRONT_PILE_PAIR
    const template: LayoutPrimitive = pair
      ? { ...first, block: FRONT_PILE }
      : first
    const ref: XY = pair ? [stubDef.entities[0].position.x, 0] : [0, 0]
    const drawn = centreOf(template)
    const offset: XY = [drawn[0] - template.at![0], drawn[1] - template.at![1]]
    const axes = view.axes.map(a => {
      const f = a.edges.map(e => final(on(at, a.k, e), at)[a.k])
      const lo = Math.min(...f),
        hi = Math.max(...f)
      const count = n(a.across ? 'soCotCoc' : 'soHangCoc')
      const spacing = n(a.across ? 'aCocNgang' : 'aCocDoc')
      const width = n(a.across ? 'bBe' : 'lBe')
      // Source pile positions on this axis, low to high.
      const was = pair
        ? pairDef.entities
            .map(e => first.at![a.k] + (a.k ? e.position.y : e.position.x))
            .map(x => x + ref[a.k])
        : piles.map(p => p!.at![a.k] + ref[a.k])
      return {
        ...a,
        lo,
        hi,
        count,
        spacing,
        edge: (width - (count - 1) * spacing) / 2,
        flush: (count - 1) * spacing === width - 2 * n('D'),
        targets: offsets(a.across).map(o => (lo + hi) / 2 + o),
        was: [...new Set(was)].sort((x, y) => x - y)
      }
    })
    piles.forEach(p => replaced.add(p!))
    // Every combination of the axes' targets (one axis in elevations).
    const combos = axes.reduce<number[][]>(
      (all, a) => all.flatMap(c => a.targets.map(t => [...c, t])),
      [[]]
    )
    combos.forEach((t, i) => {
      const centre: XY = [...drawn]
      axes.forEach((a, j) => {
        centre[a.k] = source(t[j] + offset[a.k] - ref[a.k], a.k, centre, at)
      })
      placed.push({
        ...template,
        handle: `${first.handle}#P${i + 1}`,
        at: [centre[0] - offset[0], centre[1] - offset[1]],
        viewAt: at
      } as ArrayedPrimitive)
    })
    for (const a of pairOnly ? [] : axes) {
      const lowPile = a.targets[0],
        highPile = a.targets[a.targets.length - 1]
      const sourceLow = Math.min(...a.edges),
        sourceHigh = Math.max(...a.edges)
      // A dimension's two points moved to their new places on this axis
      // (`ends`, for start and end); the other axis stays.
      const dim = (
        t: LayoutPrimitive,
        ends: [number, number],
        text: string | undefined
      ) => {
        const tat = centreOf(t)
        const s = [t.start!, t.end!].map((q, i) => source(ends[i], a.k, q, tat))
        const nearStart =
          Math.abs(t.dimLine![a.k] - t.start![a.k]) <=
          Math.abs(t.dimLine![a.k] - t.end![a.k])
        const { text: _symbol, ...rest } = t
        placed.push({
          ...rest,
          ...(text === undefined ? {} : { text }),
          handle: `${t.handle}#P`,
          start: on(t.start!, a.k, s[0]),
          end: on(t.end!, a.k, s[1]),
          dimLine: on(t.dimLine!, a.k, nearStart ? s[0] : s[1]),
          ...(t.textAt
            ? {
                textAt: on(
                  t.textAt,
                  a.k,
                  source((ends[0] + ends[1]) / 2, a.k, t.textAt, tat)
                )
              }
            : {}),
          viewAt: tat
        } as ArrayedPrimitive)
        replaced.add(t)
      }
      // Footing edge → outer pile: "D Cọc" only while it is still D.
      for (const h of a.dims.edge) {
        const t = get(h)
        if (!t?.start || !t.end) continue
        const toEdge = (q: XY) =>
          Math.min(Math.abs(q[a.k] - sourceLow), Math.abs(q[a.k] - sourceHigh))
        const startOnEdge = toEdge(t.start) <= toEdge(t.end)
        const edgePoint = startOnEdge ? t.start : t.end
        const low =
          Math.abs(edgePoint[a.k] - sourceLow) <
          Math.abs(edgePoint[a.k] - sourceHigh)
        const [e, p] = low ? [a.lo, lowPile] : [a.hi, highPile]
        dim(
          t,
          startOnEdge ? [e, p] : [p, e],
          a.count > 1 && a.edge === n('D') ? t.text : undefined
        )
      }
      // Outer pile → outer pile: the source symbol while flush 2, else
      // the count and spacing (the CAD writes the total for <>).
      const middle = get(a.dims.middle)
      if (middle?.start && middle.end) {
        if (a.count > 1)
          dim(
            middle,
            middle.start[a.k] <= middle.end[a.k]
              ? [lowPile, highPile]
              : [highPile, lowPile],
            a.count === 2
              ? a.flush
                ? middle.text
                : undefined
              : `${a.count - 1}x${Math.round(a.spacing * 10) / 10}=<>`
          )
        else replaced.add(middle)
      }
      // Leaders: the first point on the outer pile it pointed at.
      for (const h of a.leaders ?? []) {
        const t = get(h)
        if (!t?.points?.length) continue
        const p0 = t.points[0]
        const nearest = a.was.reduce((b, x) =>
          Math.abs(x - p0[a.k]) < Math.abs(b - p0[a.k]) ? x : b
        )
        const target =
          (nearest === a.was[0] ? lowPile : highPile) + (p0[a.k] - nearest)
        const tat = centreOf(t)
        placed.push({
          ...t,
          handle: `${t.handle}#P`,
          points: [
            on(p0, a.k, source(target, a.k, p0, tat)),
            ...t.points.slice(1)
          ],
          viewAt: tat
        } as ArrayedPrimitive)
        replaced.add(t)
      }
    }
  }
  if (!replaced.size) return content
  const firstAt = content.findIndex(p => replaced.has(p))
  const rest = content.filter(p => !replaced.has(p))
  return [...rest.slice(0, firstAt), ...placed, ...rest.slice(firstAt)]
}

/** Plan of SUB-010, source y of the footing back (where the wings start). */
const PLAN_FOOTING_BACK = 7445.85
/** Plan of SUB-010, source y of the wing ends. */
const PLAN_WING_END = 10945.511
/**
 * Annotations the source writes inside the plan's U, between the footing
 * back and the wing ends (B4 = 3500 at M1). The grid stretches that band
 * with the wing length, so short wings (lCanh 4000: B4 700) crushed the
 * title onto the dimensions and the dimensions onto each other (UI
 * acceptance 22/11/2026). Each moves as a block instead, by the shift of
 * the line given here:
 *
 * - the width dimensions (B Mố, B Mố − 2 W(t), W(t)) measure off the footing
 *   back: they keep their offset from it, measurement unchanged;
 * - the title and its scale follow the wing ends, but never come lower than
 *   their source place above those dimensions.
 */
const PLAN_BAND: Record<string, (shift: (line: number) => number) => number> =
  (() => {
    const back = (shift: (line: number) => number) => shift(PLAN_FOOTING_BACK)
    const title = (shift: (line: number) => number) =>
      Math.max(shift(PLAN_FOOTING_BACK), shift(PLAN_WING_END))
    return {
      '20F0B54': back,
      '20F0B3A': back,
      '20F0B47': back,
      '211BA89': back,
      '20F0B6B': title,
      '20EF389': title
    }
  })()

/**
 * The cross-fall notes of the front elevation (layer `ddo`, above the road):
 * `IN1%%%` (20EF3B3) and `IN2%%%` (211B630), which AutoCAD shows as «IN1%»
 * and «IN2%». At the source's cross fall (2 %) both stay as drawn; at any
 * other `docNgang` both say it, in the source's form (P2-M5, UI acceptance
 * P2-M4: the elevations moved to 3 % but the note still read IN2%). The
 * source's IN1 beside IN2 on a one-way fall is kept only at 2 %. The wing
 * notes `ID%%%` (20F050D, 2111646) carry no number — a symbol — and stay.
 */
const SLOPE_LABELS = new Set(['20EF3B3', '211B630'])
/** The cross fall the source drawing is drawn at (and the default), %. */
const SOURCE_CROSS_FALL = 2

/**
 * The text of a front-elevation cross-fall note for `docNgang` (%), or
 * undefined for any other text. `2.8` reads `IN2.8%%%`, `-2` `IN-2%%%`,
 * `0` `IN0%%%` — the drawing's own decimal point, as its elevations.
 */
export function acapSlopeLabel(
  handle: string | undefined,
  text: string,
  docNgang: number
): string | undefined {
  if (!SLOPE_LABELS.has(handle ?? '') || !Number.isFinite(docNgang))
    return undefined
  if (docNgang === SOURCE_CROSS_FALL) return text
  const shown = String(Math.round(docNgang * 1000) / 1000).replace(/^-0$/, '0')
  return `IN${shown}%%%`
}

/** `_33_` role of a source entity, by source layer and block (plan §4.2). */
function contentRole(p: LayoutPrimitive): string {
  switch (p.kind) {
    case 'dimension':
    case 'angular':
      return 'kich_thuoc'
    case 'leader':
      return 'ghi_chu'
    case 'text':
      return p.src === 'Tile' ? 'ky_hieu_mat_cat' : 'ghi_chu'
    case 'insert':
      return (
        (
          {
            cd11: 'ghi_chu_cao_do',
            D1m: 'coc_khoan_nhoi',
            'D1200-1': 'coc_khoan_nhoi',
            // A stub of the front elevation's pile pair (MO2_U351), drawn
            // alone by the pile array (P2-M4).
            [FRONT_PILE]: 'coc_khoan_nhoi',
            GA: 'ky_hieu_mat_cat',
            center1: 'duong_tim',
            [BEARING_BLOCK]: 'goi_cau',
            center: 'duong_tim',
            mcnthep: 'cot_thep'
          } as Record<string, string>
        )[p.block ?? ''] ??
        (STEEL_LAYERS.has(p.src ?? '') ? 'cot_thep' : 'mo_cau')
      )
    default:
      return p.src === 'Section'
        ? 'ky_hieu_mat_cat'
        : p.src === 'Center' || p.src === 'Prf-fgpl'
          ? 'duong_tim'
          : STEEL_LAYERS.has(p.src ?? '')
            ? 'cot_thep'
            : 'mo_cau'
  }
}

/** Source layers of reinforcement (plan §4.2). */
const STEEL_LAYERS = new Set([
  'Main1',
  'Main_03',
  'KOZO0',
  '0T_net đứt',
  'Reinforce 1',
  'T_MT_04'
])

/**
 * Text of the source tables that the Excel picture lost: Vietnamese written
 * in an ANSI font came out as `?` in the OLE presentation (AutoCAD shows the
 * `?` too). The generated tables are a deliverable, so they say it right.
 */
/** Colour of every value cell of the SUB-020 tables (as FE, EL3…). */
const VALUE_COLOR = 7

const TABLE_TEXT: Record<string, string> = {
  'TÊN M?': 'TÊN MỐ',
  'CAO Ð?': 'CAO ĐỘ',
  'THI?T K?': 'THIẾT KẾ',
  'TIM C?U': 'TIM CẦU',
  GÐ1: 'GĐ1',
  'CÁC CAO Ð?': 'CÁC CAO ĐỘ',
  'THÔNG S? KÍCH THU?C': 'THÔNG SỐ KÍCH THƯỚC'
}

/**
 * The two tables of SUB-020 for the current values. Each value cell is the
 * source value plus how much the drawn thing it names moved on SUB-010 under
 * the stretch grid — the dimension with that label (H*, HB, A, LC) or the
 * elevation tag (cd11 ELEV = FE, EL3…) — plus the change of `caoDoDayBe`
 * for elevations. At the defaults this is the source table, its own
 * inconsistencies included (Q7); with other values the table cannot disagree
 * with the drawing. H4B (no dimension of its own) follows H4A, EL2.R (no tag)
 * follows EL2.L.
 */
function sub020Tables(
  paper: LayoutPrimitive[],
  v: DossierModel['values'],
  tenMo: string
): {
  paper?: LayoutPrimitive[]
  error?: string
  /** Each table key (EL1.L, H2A…) with its value as written in the table. */
  values: Map<string, string>
} {
  const values = new Map<string, string>()
  const stretch = sheetStretch('SUB-010', v)
  const content = LAYOUT.sheets.find(x => x.id === 'SUB-010')?.content ?? []
  const deltas = new Map<string, number>()
  if (!('error' in stretch)) {
    for (const c of content) {
      if (c.kind === 'dimension' && c.text && !deltas.has(c.text)) {
        const at = centreOf(c)
        const vertical =
          Math.abs(Math.cos(((c.rotation ?? 0) * Math.PI) / 180)) < 0.5
        const len = (a: XY, b: XY) =>
          vertical ? Math.abs(b[1] - a[1]) : Math.abs(b[0] - a[0])
        const before = len(c.start!, c.end!)
        const after = len(stretch.map(c.start!, at), stretch.map(c.end!, at))
        deltas.set(c.text, (after - before) / 1000)
      }
      if (c.kind === 'insert' && c.block === 'cd11') {
        const a = c.attributes?.ELEV
        const tag = typeof a === 'string' ? a : a?.value
        if (!tag || deltas.has(tag)) continue
        const moved = stretch.map(c.at!, c.at)[1] - c.at![1]
        const datum =
          Number(v.caoDoDayBe) - Number(dossierDefaults().caoDoDayBe)
        deltas.set(tag, moved / 1000 + datum)
      }
    }
    // Tags drawn only on SUB-020 (EL2.R, the low wing end of section C–C):
    // their own movement, so a cross fall change lowers them (P2-M3). For
    // every other change C–C moves as B–B does, as the copy of EL2.L did.
    const s20 = sheetStretch('SUB-020', v)
    if (!('error' in s20))
      for (const c of LAYOUT.sheets.find(x => x.id === 'SUB-020')?.content ??
        []) {
        if (c.kind !== 'insert' || c.block !== 'cd11') continue
        const a = c.attributes?.ELEV
        const tag = typeof a === 'string' ? a : a?.value
        if (!tag || deltas.has(tag)) continue
        const moved = s20.map(c.at!, c.at)[1] - c.at![1]
        const datum =
          Number(v.caoDoDayBe) - Number(dossierDefaults().caoDoDayBe)
        deltas.set(tag, moved / 1000 + datum)
      }
    if (deltas.has('H4A')) deltas.set('H4B', deltas.get('H4A')!)
    if (deltas.has('EL2.L') && !deltas.has('EL2.R'))
      deltas.set('EL2.R', deltas.get('EL2.L')!)
    deltas.set('Lc', deltas.get('LC') ?? 0)
  }
  const tables = new Map<string, LayoutPrimitive[]>()
  for (const p of paper)
    if (p.ole) tables.set(p.ole, [...(tables.get(p.ole) ?? []), p])
  // The sheet's own titles ("BẢNG CAO ĐỘ MỐ M1") carry the dossier's name,
  // as every other title does (relabel in buildScene030).
  const name = tenMo.toLocaleUpperCase('vi')
  const out: LayoutPrimitive[] = paper
    .filter(p => !p.ole)
    .map(p =>
      p.kind === 'text' && p.text !== undefined && /\bM1\b/.test(p.text)
        ? { ...p, text: p.text.replace(/\bM1\b/g, name) }
        : p
    )
  for (const [, items] of tables) {
    const headers = items.filter(
      p => p.kind === 'text' && /\(m\)$/.test(p.text ?? '')
    )
    for (const p of items) {
      if (p.kind !== 'text') {
        out.push(p)
        continue
      }
      let text = TABLE_TEXT[p.text ?? ''] ?? p.text ?? ''
      if (/^M\? M1$/.test(p.text ?? '')) {
        // The cell was cut for "M1": a longer name is narrowed (then made
        // smaller) to stay inside it, clear of the FG cell on its right.
        text = `MỐ ${name}`
        out.push({ ...p, text, ...fitInCell(p, text, items) })
        continue
      } else if (/^-?\d+(\.\d+)?$/.test(text) && headers.length) {
        const header = headers.reduce((best, h) =>
          Math.abs(h.at![0] - p.at![0]) < Math.abs(best.at![0] - p.at![0])
            ? h
            : best
        )
        const key = (header.text ?? '').replace(/\s*\(m\)$/, '')
        const decimals = text.split('.')[1]?.length ?? 0
        if ('error' in stretch) text = '–'
        else if (deltas.has(key))
          text = (Number(text) + deltas.get(key)!).toFixed(decimals)
        if (!('error' in stretch) && !values.has(key)) values.set(key, text)
        // The Excel source shaded its input cells (FG, EL6, Lc, HB…) grey,
        // colour 8; in the drawing that only reads as a faded number (QA
        // P1/M5, S7). Every value is written like its neighbours.
        out.push({ ...p, text, color: VALUE_COLOR })
        continue
      }
      out.push({ ...p, text })
    }
  }
  return {
    paper: out,
    values,
    ...('error' in stretch ? { error: stretch.error } : {})
  }
}

/**
 * Estimated width of a one-line text at height `h`, width factor `wf`: one
 * text height a character, as the data model sizes TEXT extents. Generous on
 * purpose — the viewer's font draws this table's capitals at about 0,82 h
 * (UI acceptance P1/M4, «MỐ QA-M4-A1») — so a text estimated to fit does.
 */
export const acapTextWidth = (text: string, h: number, wf = 1) =>
  [...text].length * h * wf

/**
 * Width factor (and, past half width, height) that keeps a left-aligned
 * table text inside its cell: the cell ends at the first vertical rule of
 * the table to the right of the text, across its line.
 */
function fitInCell(
  p: LayoutPrimitive,
  text: string,
  table: LayoutPrimitive[]
): { widthFactor?: number; height?: number } {
  const [x, y] = p.at!
  const h = p.height ?? 1
  const rules = table.flatMap(q => {
    const [a, b] = q.points ?? []
    return q.kind === 'path' &&
      q.points?.length === 2 &&
      Math.abs(a[0] - b[0]) < 0.01 &&
      a[0] > x &&
      Math.min(a[1], b[1]) <= y &&
      Math.max(a[1], b[1]) >= y + h / 2
      ? [a[0]]
      : []
  })
  if (!rules.length) return {}
  // Keep the source's own left margin on the right too, within reason.
  const room = Math.min(...rules) - x - Math.min(0.6, h * 0.4)
  const wf = (p.widthFactor ?? 1) * Math.min(1, room / acapTextWidth(text, h))
  if (wf >= 1) return {}
  if (wf >= 0.5) return { widthFactor: Math.floor(wf * 100) / 100 }
  return {
    widthFactor: 0.5,
    height: Math.floor((h * wf * 1000) / 0.5) / 1000
  }
}

/**
 * Every value cell of the SUB-020 tables (FG, EL6, H1A…) as written for the
 * values, by its column name — to name a cell in a message.
 */
export function acapDossierTableValues(
  values: DossierModel['values']
): Map<string, string> {
  return sub020Tables(
    LAYOUT.sheets.find(x => x.id === 'SUB-020')?.paper ?? [],
    values,
    String(values.tenMo)
  ).values
}

/**
 * The elevations of the SUB-020 table (FG, FE, EL1…EL6, m) for the values —
 * the numbers the sheet and its elevation tags show, so what the tools say
 * is what is drawn (P1/M5). Undefined when the sheet cannot be drawn.
 */
export function acapDossierElevations(
  values: DossierModel['values']
): Record<string, number> | undefined {
  const t = sub020Tables(
    LAYOUT.sheets.find(x => x.id === 'SUB-020')?.paper ?? [],
    values,
    String(values.tenMo)
  )
  if (t.error) return undefined
  return Object.fromEntries(
    [...t.values]
      .filter(([k]) => /^(FG|FE|EL\d)/.test(k))
      .map(([k, x]) => [k, Number(x)])
  )
}

type TagBox = { x0: number; y0: number; x1: number; y1: number }
const hit = (a: TagBox, b: TagBox) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
/** Box of a one-line text (generous width, see acapTextWidth). */
function textBox(
  at: XY,
  text: string,
  h: number,
  align = 0,
  wf = 1,
  rotation = 0
): TagBox {
  const w = acapTextWidth(text.replace(/%%U/g, ''), h, wf)
  const x0 = align === 1 ? -w / 2 : align === 2 ? -w : 0
  if (Math.abs(Math.sin((rotation * Math.PI) / 180)) > 0.7)
    return { x0: at[0] - h, x1: at[0], y0: at[1] + x0, y1: at[1] + x0 + w }
  return { x0: at[0] + x0, x1: at[0] + x0 + w, y0: at[1], y1: at[1] + h }
}
/** Linetypes of dashed and hidden edges. */
const DASHED_LINE = /DASH|HIDDEN/i

/** Whether the segment a–b passes through the box (Liang–Barsky). */
function crosses(a: XY, b: XY, r: TagBox): boolean {
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  for (const [p, q] of [
    [-dx, a[0] - r.x0],
    [dx, r.x1 - a[0]],
    [-dy, a[1] - r.y0],
    [dy, r.y1 - a[1]]
  ]) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return false
  }
  return true
}

/** Small parts (bearings, stops, their bars): what a label must not cover. */
const PART_SIZE = 1500

/**
 * Elevation tags (cd11) whose value text sits on something — the seat strip
 * of the front elevation is crowded with bearings and stops, and "EL3 =
 * 235.554" is far longer than the source's "EL3" (UI acceptance P1/M4) —
 * are moved to the nearest free place — raised and/or slid outward along
 * the way the text runs, or on the other side of the marker (counted one
 * text height further). Obstacles are
 * small parts, texts, dimension texts and other tags; long lines (walls,
 * hidden edges) are not. A tag already clear does not move.
 */
function placeElevationTags(primitives: DossierPrimitive[]) {
  const obstacles: { box: TagBox; owner: DossierPrimitive }[] = []
  // Dashed and hidden lines, however long: drawn through a value they make
  // it unreadable (QA 0.3.1b, V7: Hide_01 across "EL3 = 235.854"). Checked
  // segment by segment, not by their extents. Centre lines are not: the
  // bridge axis runs through the whole view and labels cross it.
  const dashes: [XY, XY][] = []
  for (const p of primitives) {
    if (p.kind === 'path' && DASHED_LINE.test(p.lineType ?? ''))
      for (let i = 1; i < p.points.length; i++)
        dashes.push([p.points[i - 1], p.points[i]])
    if (p.kind === 'path') {
      const xs = p.points.map(q => q[0])
      const ys = p.points.map(q => q[1])
      const box = {
        x0: Math.min(...xs),
        x1: Math.max(...xs),
        y0: Math.min(...ys),
        y1: Math.max(...ys)
      }
      if (box.x1 - box.x0 < PART_SIZE && box.y1 - box.y0 < PART_SIZE)
        obstacles.push({ box, owner: p })
    } else if (p.kind === 'text')
      obstacles.push({
        box: textBox(
          p.at,
          p.text,
          p.height,
          p.align,
          p.widthFactor,
          p.rotation
        ),
        owner: p
      })
    else if (p.kind === 'dimension' && p.textAt) {
      // Text centred on textAt along the dimension, on either side of it
      // (its attachment depends on the style and the readable angle).
      const w = acapTextWidth((p.text ?? '<>').replace('<>', '00000'), 150)
      const h = 150 + 30
      const [x, y] = p.textAt
      obstacles.push({
        box:
          p.direction === 'dung'
            ? { x0: x - h, x1: x + h, y0: y - w / 2, y1: y + w / 2 }
            : { x0: x - w / 2, x1: x + w / 2, y0: y - h, y1: y + h },
        owner: p
      })
    }
  }
  const tags = primitives.filter(
    (p): p is Extract<DossierPrimitive, { kind: 'insert' }> =>
      p.kind === 'insert' && p.block === 'cd11'
  )
  const boxOf = (
    a: Extract<DossierAttribute, { at: XY }>,
    at: XY,
    align: number
  ) => textBox(at, a.value, a.height ?? 150, align, a.widthFactor ?? 1)
  // Every tag's text is an obstacle for the others, where it ends up.
  const placedBoxes = new Map<DossierPrimitive, TagBox>()
  for (const t of tags)
    for (const a of Object.values(t.attributes))
      if (typeof a !== 'string' && a.value)
        placedBoxes.set(t, boxOf(a, a.at, a.align ?? 0))
  for (const t of tags)
    for (const [k, a] of Object.entries(t.attributes)) {
      if (typeof a === 'string' || !a.value) continue
      const h = a.height ?? 150
      const free = (box: TagBox) =>
        !obstacles.some(o => hit(box, o.box)) &&
        !dashes.some(([a, b]) => crosses(a, b, box)) &&
        ![...placedBoxes].some(([o, b]) => o !== t && hit(box, b))
      const side = a.align ?? 0
      // The other side of the marker: a right-aligned text turns left-aligned
      // at the same point, and the reverse.
      const other = side === 2 ? 0 : side === 0 ? 2 : 1
      // Raised, and/or slid outward (the way the text runs from its point);
      // the nearest free place wins, the source side before the other.
      const candidates: { at: XY; align: number; cost: number }[] = []
      for (const [align, penalty] of [
        [side, 0],
        [other, h]
      ] as [number, number][])
        for (let up = 0; up <= 10 * h; up += h / 2)
          for (let out = 0; out <= 15 * h; out += h / 2) {
            if (out && align === 1) break
            const dx = align === 2 ? -out : out
            candidates.push({
              at: [a.at[0] + dx, a.at[1] + up],
              align,
              cost: Math.hypot(out, up) + penalty
            })
          }
      candidates.sort((p, q) => p.cost - q.cost)
      const found = candidates.find(c => free(boxOf(a, c.at, c.align)))
      if (!found || !found.cost) continue
      const { at, align } = found
      t.attributes[k] = { ...a, at, align }
      placedBoxes.set(t, boxOf(a, at, align))
    }
}

/** Every point an extracted primitive draws through (for extents). */
function pointsOf(p: LayoutPrimitive): XY[] {
  if (p.kind === 'insert') return insertDrawnPoints(p)
  return [
    ...(p.points ?? []),
    ...(p.loops?.flat() ?? []),
    ...(p.at ? [p.at] : []),
    ...(p.start ? [p.start] : []),
    ...(p.end ? [p.end] : []),
    ...(p.dimLine ? [p.dimLine] : []),
    ...(p.textAt ? [p.textAt] : [])
  ]
}

type Box = { x0: number; y0: number; x1: number; y1: number }
const grow = (b: Box | undefined, [x, y]: XY): Box =>
  b
    ? {
        x0: Math.min(b.x0, x),
        y0: Math.min(b.y0, y),
        x1: Math.max(b.x1, x),
        y1: Math.max(b.y1, y)
      }
    : { x0: x, y0: y, x1: x, y1: y }

/**
 * Keeps the views of a stretched sheet apart as the source has them. Each
 * view's extents are measured before and after the stretch; where a view
 * grew into the gap below it (same column) or to its right (next column),
 * the views beyond move by just enough to restore the source gap. Moving
 * never pulls views closer. If the result leaves the A3 viewport (or the
 * source's own extents where those already reached past it), the sheet is
 * refused with the view and the overflow named.
 */
function viewShifts(
  ls: Pick<LayoutSheet, 'content' | 'viewport'>,
  stretch: Exclude<ReturnType<typeof sheetStretch>, { error: string }>
): { shifts: XY[]; boxes: Box[]; source: Box[] } | { error: string } {
  if (stretch.identity) return { shifts: [], boxes: [], source: [] }
  const before: (Box | undefined)[] = []
  const after: (Box | undefined)[] = []
  for (const c of ls.content ?? []) {
    const at = centreOf(c)
    const k = stretch.viewOf(at)
    for (const p of pointsOf(c)) {
      before[k] = grow(before[k], p)
      after[k] = grow(after[k], stretch.map(p, at))
    }
  }
  const shifts: XY[] = stretch.views.map(() => [0, 0] as XY)
  // Down each column: a view keeps its source gap to the one above it.
  for (const column of stretch.flow)
    for (let i = 1; i < column.length; i++) {
      const up = column[i - 1],
        down = column[i]
      const bu = before[up],
        bd = before[down],
        au = after[up],
        ad = after[down]
      if (!bu || !bd || !au || !ad) continue
      const gap = bu.y0 - bd.y1
      const now = au.y0 + shifts[up][1] - (ad.y1 + shifts[down][1])
      if (now < gap) for (const k of column.slice(i)) shifts[k][1] -= gap - now
    }
  // Across: each column keeps its source gap to the column on its left.
  const span = (boxes: (Box | undefined)[], column: number[], moved: boolean) =>
    column.reduce<Box | undefined>((b, k) => {
      const v = boxes[k]
      if (!v) return b
      const dx = moved ? shifts[k][0] : 0,
        dy = moved ? shifts[k][1] : 0
      return grow(grow(b, [v.x0 + dx, v.y0 + dy]), [v.x1 + dx, v.y1 + dy])
    }, undefined)
  for (let j = 1; j < stretch.flow.length; j++) {
    const b0 = span(before, stretch.flow[j - 1], false),
      b1 = span(before, stretch.flow[j], false)
    const a0 = span(after, stretch.flow[j - 1], true),
      a1 = span(after, stretch.flow[j], true)
    if (!b0 || !b1 || !a0 || !a1) continue
    const gap = b1.x0 - b0.x1
    const now = a1.x0 - a0.x1
    if (now < gap)
      for (const col of stretch.flow.slice(j))
        for (const k of col) shifts[k][0] += gap - now
  }
  // Stay on the sheet: inside the viewport, or the source's own extents.
  const vp = ls.viewport!
  let allowed: Box = { x0: 0, y0: 0, x1: vp.w * K, y1: vp.h * K }
  for (const b of before)
    if (b) allowed = grow(grow(allowed, [b.x0, b.y0]), [b.x1, b.y1])
  // Then move all views together, by the same amount, back inside if they
  // fit: views side by side stay aligned on their common levels.
  let all: Box | undefined
  stretch.views.forEach((_, k) => {
    const b = after[k]
    if (!b) return
    const [dx, dy] = shifts[k]
    all = grow(grow(all, [b.x0 + dx, b.y0 + dy]), [b.x1 + dx, b.y1 + dy])
  })
  if (all) {
    const fit = (lo: number, hi: number, min: number, max: number) =>
      hi - lo > max - min ? 0 : hi > max ? max - hi : lo < min ? min - lo : 0
    const fx = fit(all.x0, all.x1, allowed.x0, allowed.x1)
    const fy = fit(all.y0, all.y1, allowed.y0, allowed.y1)
    for (const s of shifts) {
      s[0] += fx
      s[1] += fy
    }
  }
  const boxes: Box[] = []
  for (let k = 0; k < stretch.views.length; k++) {
    const b = after[k]
    if (!b) continue
    const [dx, dy] = shifts[k]
    boxes[k] = { x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy }
    const over = Math.max(
      allowed.x0 - boxes[k].x0,
      boxes[k].x1 - allowed.x1,
      allowed.y0 - boxes[k].y0,
      boxes[k].y1 - allowed.y1
    )
    if (over > 1)
      return {
        error: `${stretch.views[k]} vượt khung A3 ${Math.round(over)} mm (tỉ lệ 1:100) sau khi dời các hình chiếu để giữ khoảng hở; cần tờ lớn hơn hoặc bố trí lại.`
      }
  }
  return { shifts, boxes, source: before.map(b => b!) }
}

/**
 * Extents of each view of a sheet after stretching and moving, by name — for
 * checking that views never overlap. Undefined when nothing moves; the
 * error when the sheet is refused.
 */
export function sheetViewBoxes(
  values: DossierModel['values'],
  sheetId: string
):
  | {
      before: Record<string, Box>
      after: Record<string, Box>
      flow: string[][]
    }
  | { error: string }
  | undefined {
  const ls = LAYOUT.sheets.find(x => x.id === sheetId)
  if (!ls?.content) return undefined
  const stretch = sheetStretch(sheetId, values)
  if ('error' in stretch) return { error: stretch.error }
  if (stretch.identity) return undefined
  const layout = viewShifts(ls, stretch)
  if ('error' in layout) return layout
  const named = (boxes: Box[]) =>
    Object.fromEntries(
      stretch.views.flatMap((name, k) => (boxes[k] ? [[name, boxes[k]]] : []))
    )
  return {
    before: named(layout.source),
    after: named(layout.boxes),
    flow: stretch.flow.map(col => col.map(k => stretch.views[k]))
  }
}

/** Liang–Barsky: the part of segment a→b inside the box, if any. */
function clipSegment(
  a: XY,
  b: XY,
  box: { x0: number; y0: number; x1: number; y1: number }
): [XY, XY] | undefined {
  let t0 = 0,
    t1 = 1
  const dx = b[0] - a[0],
    dy = b[1] - a[1]
  const edges: [number, number][] = [
    [-dx, a[0] - box.x0],
    [dx, box.x1 - a[0]],
    [-dy, a[1] - box.y0],
    [dy, box.y1 - a[1]]
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return undefined
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return undefined
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy]
  ]
}

/** Polyline clipped to the box, as the runs that stay inside. */
function clipPath(
  points: XY[],
  closed: boolean,
  box: { x0: number; y0: number; x1: number; y1: number }
): { points: XY[]; closed: boolean }[] {
  const inside = (p: XY) =>
    p[0] >= box.x0 && p[0] <= box.x1 && p[1] >= box.y0 && p[1] <= box.y1
  if (points.every(inside)) return [{ points, closed }]
  const ring = closed ? [...points, points[0]] : points
  const runs: XY[][] = []
  let current: XY[] | undefined
  for (let i = 0; i + 1 < ring.length; i++) {
    const seg = clipSegment(ring[i], ring[i + 1], box)
    if (!seg) {
      current = undefined
      continue
    }
    const [p, q] = seg
    const last = current?.[current.length - 1]
    if (!current || !last || last[0] !== p[0] || last[1] !== p[1]) {
      current = [p]
      runs.push(current)
    }
    current.push(q)
    if (q[0] !== ring[i + 1][0] || q[1] !== ring[i + 1][1]) current = undefined
  }
  return runs.map(r => ({ points: r, closed: false }))
}

/** Sutherland–Hodgman: polygon clipped to the box. */
function clipPolygon(
  loop: XY[],
  box: { x0: number; y0: number; x1: number; y1: number }
): XY[] {
  let out = loop
  const planes: [(p: XY) => boolean, (a: XY, b: XY) => XY][] = [
    [
      p => p[0] >= box.x0,
      (a, b) => [
        box.x0,
        a[1] + ((b[1] - a[1]) * (box.x0 - a[0])) / (b[0] - a[0])
      ]
    ],
    [
      p => p[0] <= box.x1,
      (a, b) => [
        box.x1,
        a[1] + ((b[1] - a[1]) * (box.x1 - a[0])) / (b[0] - a[0])
      ]
    ],
    [
      p => p[1] >= box.y0,
      (a, b) => [
        a[0] + ((b[0] - a[0]) * (box.y0 - a[1])) / (b[1] - a[1]),
        box.y0
      ]
    ],
    [
      p => p[1] <= box.y1,
      (a, b) => [
        a[0] + ((b[0] - a[0]) * (box.y1 - a[1])) / (b[1] - a[1]),
        box.y1
      ]
    ]
  ]
  for (const [inside, cut] of planes) {
    const input = out
    out = []
    for (let i = 0; i < input.length; i++) {
      const a = input[(i + input.length - 1) % input.length],
        b = input[i]
      if (inside(b)) {
        if (!inside(a)) out.push(cut(a, b))
        out.push(b)
      } else if (inside(a)) out.push(cut(a, b))
    }
    if (!out.length) break
  }
  return out
}

/**
 * Builds the 0.3.0 scene. `sourceGeometry` says whether the parameters still
 * describe the source abutment; only then is its drawing shown.
 */
export function buildScene030(
  model: DossierModel,
  version: string,
  sourceGeometry: boolean
): DossierScene {
  const v = model.values
  const n = (k: string) => Number(v[k])
  const tenMo = String(v.tenMo)
  const project =
    String(v.congTrinh) === DEFAULT_PROJECT
      ? SOURCE_PROJECT
      : String(v.congTrinh).toLocaleUpperCase('vi')
  const relabel = (text: string) =>
    text.replace(/\bM1\b/g, tenMo.toLocaleUpperCase('vi'))
  // A changed geometry with the M1 bar layout otherwise intact: the steel
  // sheets and the SUB-100 tables keep the M1 drawing, marked as not updated,
  // instead of going blank (17/11/2026: −71 % of the dossier on hLot +50).
  // A changed bar choice (F3 D25, W16 D14) is new detailing: still refused.
  const steelAsM1 =
    !model.referenceSteelApplicable &&
    v.thep === 'mau' &&
    v.thepF3 !== 'D25' &&
    v.thepW16 !== 'D14'
  const labelMode = (v.nhanKichThuoc ?? 'ky_hieu') as AcTpDimLabelMode
  // Elevation values, as the SUB-020 table computes them (datum included).
  const elevations =
    labelMode === 'ky_hieu'
      ? new Map<string, string>()
      : sub020Tables(
          LAYOUT.sheets.find(x => x.id === 'SUB-020')?.paper ?? [],
          v,
          tenMo
        ).values

  const sheets: DossierSheet[] = LAYOUT.sheets.map((ls, index) => {
    const s: DossierSheet = {
      id: ls.id,
      title: SHEET_TITLES[ls.id] ?? ls.id,
      width: A3W,
      height: A3H,
      scale: K,
      origin: [
        n('x') + (index % 3) * (A3W + GAP),
        n('y') - Math.floor(index / 3) * (A3H + GAP)
      ],
      primitives: []
    }
    const id = (role: string) => ({ role, partId: `${role}_${s.id}` })
    const push = (p: DossierPrimitive) => s.primitives.push(p)

    // ------------------------------------------------ drawing in the viewport
    if (ls.viewport && ls.content) {
      // Real entities of the source, through the sheet's stretch grid.
      const x0 = ls.viewport.x * K,
        y0 = ls.viewport.y * K
      const steel = ls.view !== undefined && ls.view !== 'general'
      // Reinforcement is drawn only for the source abutment: re-laying bars
      // for other dimensions is a design decision, not a stretch (GĐ6).
      const stretch: ReturnType<typeof sheetStretch> = !steel
        ? sheetStretch(ls.id, v)
        : // The model already says when the source steel no longer applies
          // (any geometric change; not the elevation datum or pile length).
          model.referenceSteelApplicable
          ? sheetStretch(ls.id, v)
          : steelAsM1
            ? // Never stretched to the new size: re-laying bars is design.
              sheetStretch(ls.id, dossierDefaults())
            : {
                error:
                  'Không kéo giãn hoặc sao chép cấu tạo thép M1 sang kích thước mới.'
              }
      if (steel && steelAsM1 && !('error' in stretch))
        STEEL_AS_M1.forEach((t, i) =>
          push({
            ...id('ghi_chu'),
            kind: 'text',
            at: [x0 + 2000, y0 + ls.viewport!.h * K - 1200 - i * 500],
            text: t,
            height: i ? 280 : 400,
            color: 1
          })
        )
      if ('error' in stretch)
        [
          steel
            ? 'CHƯA CÓ PHƯƠNG ÁN THÉP CHO HÌNH HỌC NÀY'
            : 'CHƯA DỰNG ĐƯỢC HÌNH CHO BỘ THÔNG SỐ NÀY',
          stretch.error
        ].forEach((t, i) =>
          push({
            ...id('ghi_chu'),
            kind: 'text',
            at: [x0 + 2000, y0 + ls.viewport!.h * K - 3000 - i * 600],
            text: t,
            height: i ? 300 : 450
          })
        )
      else {
        const layout = viewShifts(ls, stretch)
        if ('error' in layout)
          ['CHƯA DỰNG ĐƯỢC HÌNH CHO BỘ THÔNG SỐ NÀY', layout.error].forEach(
            (t, i) =>
              push({
                ...id('ghi_chu'),
                kind: 'text',
                at: [x0 + 2000, y0 + ls.viewport!.h * K - 3000 - i * 600],
                text: t,
                height: i ? 300 : 450
              })
          )
        else
          for (const raw of steel
            ? ls.content
            : arrayedPiles(
                arrayedBearings(ls.content, model, stretch.identity),
                ls.id,
                model,
                stretch,
                layout.shifts
              )) {
            const c = steel ? relabelSteel(raw) : relabelGeneral(raw)
            const at = centreOf(c)
            // The view that maps it: its own centre's, or the one a pile
            // item was placed through (P2-M4).
            const view = (raw as ArrayedPrimitive).viewAt ?? at
            const [sx, sy] = layout.shifts[stretch.viewOf(view)] ?? [0, 0]
            // A block moves as a whole, by how far its drawn centre moves;
            // everything else is stretched point by point.
            const [mx, my] = stretch.map(at, view)
            const move: XY = [mx - at[0], my - at[1]]
            // A re-placed bearing item keeps its true distance from the
            // bearing centre line, whatever the grid does to the width.
            const fc = (raw as ArrayedPrimitive).fromCentre
            const across = (q: XY) =>
              fc === undefined
                ? stretch.map(q, view)[0]
                : stretch.map([fc, q[1]], view)[0] + q[0] - fc
            if (fc !== undefined) move[0] = across(at) - at[0]
            // Annotations of the plan's wing band move as a block (see
            // PLAN_BAND): the band itself shrinks with the wings.
            const band = steel ? undefined : PLAN_BAND[c.handle ?? '']
            const shift = (line: number) =>
              stretch.map([at[0], line], view)[1] - line
            const dy = band?.(shift)
            // …and the cross fall at that true distance (P2-M3), not at the
            // grid's x for its source point.
            const tiltAt = (q: XY) =>
              fc === undefined || !stretch.tilt
                ? 0
                : stretch.tilt(across(q), q[1], view) -
                  stretch.tilt(stretch.map(q, view)[0], q[1], view)
            const down = (q: XY) =>
              dy === undefined ? stretch.map(q, view)[1] + tiltAt(q) : q[1] + dy
            addPaper(
              c,
              contentRole(c),
              c.kind === 'insert'
                ? q => [x0 + q[0] + move[0] + sx, y0 + q[1] + move[1] + sy]
                : q => [x0 + across(q) + sx, y0 + down(q) + sy],
              1,
              {
                sourceHandle: c.handle,
                sourceLayer: c.src,
                sourceType: c.type
              }
            )
          }
      }
      if (!steel && !('error' in stretch)) placeElevationTags(s.primitives)
    } else if (ls.viewport && ls.model && ls.view && ls.offset) {
      const vp = ls.viewport
      const box = {
        x0: vp.x * K,
        y0: vp.y * K,
        x1: (vp.x + vp.w) * K,
        y1: (vp.y + vp.h) * K
      }
      const steel = ls.view !== 'general'
      if (!sourceGeometry || (steel && !model.referenceSteelApplicable)) {
        const lines = steel
          ? [
              'CHƯA CÓ PHƯƠNG ÁN THÉP CHO HÌNH HỌC NÀY',
              'Không kéo giãn hoặc sao chép cấu tạo thép M1 sang kích thước mới.'
            ]
          : [
              'CHƯA DỰNG HÌNH CHO KÍCH THƯỚC KHÁC BẢN GỐC',
              'Bộ sinh 0.3.0 hiện chỉ dựng đúng mố M1 của bản gốc.'
            ]
        lines.forEach((t, i) =>
          push({
            ...id('ghi_chu'),
            kind: 'text',
            at: [box.x0 + 2000, box.y1 - 3000 - i * 600],
            text: t,
            height: i ? 300 : 450
          })
        )
      } else {
        // Source model point → sheet: the viewport shows the model window
        // [x0, x1] × [y0, y1] at 1:100 from its lower-left corner.
        const [ox, oy] = ls.offset
        const map = (p: XY): XY => [
          box.x0 + p[0] + ox - ls.model!.x0,
          box.y0 + p[1] + oy - ls.model!.y0
        ]
        const inside = (p: XY) =>
          p[0] >= box.x0 && p[0] <= box.x1 && p[1] >= box.y0 && p[1] <= box.y1
        for (const raw of reference.views[ls.view].ops) {
          const op = raw as unknown as {
            kind: 'text' | 'path' | 'fill'
            role: string
            color: number
            at?: XY
            text?: string
            height?: number
            rotation?: number
            align?: number
            widthFactor?: number
            points?: XY[]
            closed?: boolean
            loops?: XY[][]
            sourceHandle: string
            sourceLayer: string
            sourceType: string
          }
          const role =
            op.role === 'geometry' ? (steel ? 'cot_thep' : 'mo_cau') : op.role
          const identity = {
            ...id(role),
            color: op.color,
            sourceHandle: op.sourceHandle,
            sourceLayer: op.sourceLayer,
            sourceType: op.sourceType
          }
          if (op.kind === 'text' && op.at && op.text) {
            const at = map(op.at)
            if (!inside(at)) continue
            // Labels the 0.2.0 extract left in TCVN3 are read as Unicode
            // here, by the SDK's own rule (evidence in the text itself).
            let text = acTpDecodeVnText(op.text).text
            if (steel) {
              text = text.replace(/\bM1\b/g, tenMo)
              if (v.thepF3 === 'D22') text = text.replace(/F3-D25/g, 'F3-D22')
              if (v.thepW16 === 'D16')
                text = text.replace(/W16(')?-D14/g, 'W16$1-D16')
            }
            push({
              ...identity,
              kind: 'text',
              at,
              text,
              height: op.height ?? 150,
              rotation: op.rotation,
              align: op.align,
              widthFactor: op.widthFactor
            })
          } else if (op.kind === 'fill' && op.loops) {
            const loops = op.loops
              .map(loop => clipPolygon(loop.map(map), box))
              .filter(loop => loop.length >= 3)
            if (loops.length) push({ ...identity, kind: 'fill', loops })
          } else if (op.points) {
            for (const run of clipPath(op.points.map(map), !!op.closed, box))
              push({
                ...identity,
                kind: 'path',
                ...run,
                ...(op.sourceType === 'LINE' && run.points.length === 2
                  ? { line: true }
                  : {})
              })
          }
        }
      }
    }

    // ------------------------------------------------ paper-space content
    const roleOf = (p: LayoutPrimitive) =>
      p.ole || p.kind === 'text'
        ? 'ghi_chu'
        : p.kind === 'dimension'
          ? 'kich_thuoc'
          : p.kind === 'insert'
            ? 'ky_hieu_mat_cat'
            : s.id === 'SUB-100'
              ? 'cot_thep'
              : 'mo_cau'
    const scaled = (p: XY): XY => [p[0] * K, p[1] * K]
    // The statistics and quantity tables hold the source abutment's numbers:
    // shown only while the parameters are that abutment's, like its steel.
    const tablesApply = model.referenceSteelApplicable || steelAsM1
    // SUB-020: elevation and dimension tables, recomputed (GĐ5).
    const tables =
      s.id === 'SUB-020' ? sub020Tables(ls.paper, v, tenMo) : undefined
    if (tables?.error)
      [
        'BẢNG CAO ĐỘ VÀ THÔNG SỐ CHƯA TÍNH ĐƯỢC CHO THÔNG SỐ NÀY',
        tables.error
      ].forEach((t, i) =>
        push({
          ...id('ghi_chu'),
          kind: 'text',
          at: [6000, 26000 - i * 600],
          text: t,
          height: i ? 300 : 450
        })
      )
    for (const p of tables?.paper ?? ls.paper)
      if (!p.ole || tablesApply || tables) addPaper(p, roleOf(p))
    if (steelAsM1 && !tables && ls.paper.some(p => p.ole))
      quantityTable(v).forEach(push)
    if (!tables && !tablesApply && ls.paper.some(p => p.ole))
      [
        'BẢNG THỐNG KÊ THÉP VÀ KHỐI LƯỢNG CHƯA ÁP DỤNG',
        'Số liệu bảng là của mố M1 gốc; chưa tính lại cho thông số này.'
      ].forEach((t, i) =>
        push({
          ...id('ghi_chu'),
          kind: 'text',
          at: [6000, 26000 - i * 600],
          text: t,
          height: i ? 300 : 450
        })
      )
    for (const p of ls.title)
      addPaper({ ...p, text: relabelTitle(p.text ?? '') }, 'tieu_de_ban_ve')

    /** Bar marks and the abutment name follow the parameters (as 0.2.0). */
    function relabelSteel(p: LayoutPrimitive): LayoutPrimitive {
      const fix = (t: string) => {
        let out = t.replace(/\bM1\b/g, tenMo)
        if (v.thepF3 === 'D22') out = out.replace(/F3-D25/g, 'F3-D22')
        if (v.thepW16 === 'D16') out = out.replace(/W16(')?-D14/g, 'W16$1-D16')
        return out
      }
      if (p.text === undefined && !p.attributes) return p
      return {
        ...p,
        ...(p.text !== undefined ? { text: fix(p.text) } : {}),
        ...(p.attributes
          ? {
              attributes: Object.fromEntries(
                Object.entries(p.attributes).map(([k, a]) => [
                  k,
                  typeof a === 'string' ? fix(a) : { ...a, value: fix(a.value) }
                ])
              )
            }
          : {})
      }
    }

    /**
     * General-arrangement content: the abutment's name follows `tenMo`, and
     * the dimension symbols and elevation tags follow `nhanKichThuoc`.
     */
    function relabelGeneral(p: LayoutPrimitive): LayoutPrimitive {
      if (p.kind === 'dimension') {
        const text = acTpDimensionText(p.text, labelMode)
        if (text === p.text) return p
        const { text: _symbol, ...rest } = p
        return text === undefined ? rest : { ...rest, text }
      }
      if (p.kind === 'text' && p.text !== undefined) {
        const text =
          acapSlopeLabel(p.handle, p.text, n('docNgang')) ?? relabel(p.text)
        return text === p.text ? p : { ...p, text }
      }
      if (p.kind === 'insert' && p.attributes && labelMode !== 'ky_hieu')
        return {
          ...p,
          attributes: Object.fromEntries(
            Object.entries(p.attributes).map(([k, a]) => {
              const tag = typeof a === 'string' ? a : a.value
              const value = elevations.get(tag)
              if (k !== 'ELEV' || value === undefined) return [k, a]
              const shown = labelMode === 'so_do' ? value : `${tag} = ${value}`
              return [k, typeof a === 'string' ? shown : { ...a, value: shown }]
            })
          )
        }
      return p
    }

    function relabelTitle(text: string) {
      return text === SOURCE_PROJECT ? project : relabel(text)
    }

    /**
     * Adds one extracted primitive. Paper content is scaled ×100 from paper
     * millimetres (`k`); model content is already in sheet units and goes
     * through the stretch grid (`place`).
     */
    function addPaper(
      p: LayoutPrimitive,
      role: string,
      place: (q: XY) => XY = scaled,
      k = K,
      source: Partial<DossierPrimitive> = {}
    ) {
      const look = {
        ...id(role),
        color: p.color,
        // Source entities state their linetype even when continuous, so a
        // role's default (CENTER for duong_tim) never replaces the source's.
        ...(p.lineType
          ? { lineType: p.lineType }
          : source.sourceHandle
            ? { lineType: 'Continuous' }
            : {}),
        ...(p.lineWeight !== undefined ? { lineWeight: p.lineWeight } : {}),
        ...(p.linetypeScale !== undefined
          ? { linetypeScale: p.linetypeScale }
          : {}),
        ...(source.sourceHandle
          ? {
              sourceHandle: source.sourceHandle,
              sourceLayer: source.sourceLayer,
              sourceType: source.sourceType
            }
          : {})
      }
      switch (p.kind) {
        case 'path':
          push({
            ...look,
            kind: 'path',
            points: p.points!.map(place),
            closed: p.closed,
            ...(p.bulges ? { bulges: p.bulges } : {}),
            ...(p.line ? { line: true } : {})
          })
          return
        case 'circle':
          push({
            ...look,
            kind: 'circle',
            at: place(p.at!),
            radius: p.radius! * k
          })
          return
        case 'arc':
          push({
            ...look,
            kind: 'arc',
            at: place(p.at!),
            radius: p.radius! * k,
            startAngle: p.startAngle!,
            endAngle: p.endAngle!
          })
          return
        case 'fill':
          push({
            ...look,
            kind: 'fill',
            loops: p.loops!.map(loop => loop.map(place)),
            ...(p.pattern
              ? {
                  pattern: p.pattern,
                  patternScale: p.patternScale,
                  patternAngle: p.patternAngle
                }
              : {})
          })
          return
        case 'text':
          push({
            ...look,
            kind: 'text',
            at: place(p.at!),
            text: p.text!,
            height: p.height! * k,
            rotation: p.rotation,
            align: p.align,
            widthFactor: p.widthFactor,
            style: p.style
          })
          return
        case 'dimension': {
          const start = place(p.start!),
            end = place(p.end!),
            line = place(p.dimLine!)
          const rotation = p.aligned ? undefined : (p.rotation ?? 0)
          const horizontal =
            rotation !== undefined &&
            Math.abs(Math.sin((rotation * Math.PI) / 180)) < 1e-9
          const vertical =
            rotation !== undefined &&
            Math.abs(Math.cos((rotation * Math.PI) / 180)) < 1e-9
          let direction: 'ngang' | 'dung' | 'nghieng'
          let offset: number
          if (horizontal) {
            direction = 'ngang'
            offset = line[1] - Math.max(start[1], end[1])
          } else if (vertical) {
            direction = 'dung'
            offset = line[0] - Math.max(start[0], end[0])
          } else {
            direction = 'nghieng'
            const dx = end[0] - start[0],
              dy = end[1] - start[1]
            const len = Math.hypot(dx, dy)
            offset =
              ((line[0] - start[0]) * -dy + (line[1] - start[1]) * dx) / len
          }
          const dimStyle = p.dimStyle ?? '_33_D100'
          const overrides = dimOverrides(dimStyle, p.vars)
          push({
            ...look,
            kind: 'dimension',
            start,
            end,
            offset,
            direction,
            dimStyle,
            ...(rotation !== undefined ? { rotation } : {}),
            ...(p.textAt ? { textAt: place(p.textAt) } : {}),
            ...(p.text !== undefined ? { text: p.text } : {}),
            ...(overrides ? { overrides } : {})
          })
          return
        }
        case 'angular': {
          const dimStyle = p.dimStyle ?? '_33_D100'
          const overrides = dimOverrides(dimStyle, p.vars)
          push({
            ...look,
            kind: 'angular',
            at: place(p.at!),
            start: place(p.start!),
            end: place(p.end!),
            arcPoint: place(p.dimLine!),
            dimStyle,
            ...(p.textAt ? { textAt: place(p.textAt) } : {}),
            ...(p.text !== undefined ? { text: p.text } : {}),
            ...(overrides ? { overrides } : {})
          })
          return
        }
        case 'point':
          push({ ...look, kind: 'point', at: place(p.at!) })
          return
        case 'leader':
          push({
            ...look,
            kind: 'leader',
            points: p.points!.map(place),
            dimStyle: p.dimStyle ?? '_33_D100',
            arrowHead: p.arrowHead ?? true
          })
          return
        case 'insert':
          push({
            ...look,
            kind: 'insert',
            block: p.block!,
            at: place(p.at!),
            scale: [p.scale![0] * k, p.scale![1] * k],
            rotation: p.rotation,
            attributes: Object.fromEntries(
              Object.entries(p.attributes ?? {}).map(([tag, a]) => [
                tag,
                typeof a === 'string'
                  ? a
                  : {
                      value: a.value,
                      at: place(a.position),
                      height: a.height !== undefined ? a.height * k : undefined,
                      rotation: a.rotationDeg,
                      align: a.align,
                      widthFactor: a.widthFactor,
                      style: a.style
                    }
              ])
            )
          })
          return
      }
    }

    // ------------------------------------------------ A3 frame
    const frame = acTpBuildDrawingFrame({
      khoGiay: 'A3',
      truong: {
        duAn: field('duAn'),
        soTo: `${index + 1}/${LAYOUT.sheets.length}`,
        tiLe: `1:${K}`,
        ngay: field('ngay'),
        giaiDoan: 'TKBVTC',
        donVi: field('donVi'),
        chuTri: field('nguoiChuTri'),
        thietKe: field('nguoiThietKe'),
        kiemTra: field('nguoiKiemTra'),
        duyet: field('nguoiDuyet')
      }
    })
    // The source's own title block (xref `FR A3`) is missing from the file;
    // only its three texts survive, at the right of the strip. They are drawn
    // where they were measured, so cells of our title block that fall in
    // that area are left out rather than drawn through them.
    const titleLeft = Math.min(
      ...ls.title.map(
        t =>
          t.at![0] -
          (t.align === 1 ? 0.5 : t.align === 2 ? 1 : 0) *
            (t.text ?? '').length *
            t.height! *
            0.8
      )
    )
    const inTitleArea = (points: XY[]) =>
      points.every(
        ([x, y]) =>
          x >= titleLeft - 2 &&
          y >= frame.titleStrip.y - 1e-6 &&
          y <= frame.titleStrip.y + frame.titleStrip.h + 1e-6
      )
    for (const p of frame.primitives) {
      if (inTitleArea(p.kind === 'path' ? p.points : [p.at])) continue
      const partId = `${p.role}_${s.id}`
      if (p.kind === 'path')
        push({
          role: p.role,
          partId,
          kind: 'path',
          points: p.points.map(scaled),
          closed: p.closed
        })
      else
        push({
          role: p.role,
          partId,
          kind: 'text',
          at: scaled(p.at),
          text: p.text,
          height: p.height * K,
          align: p.align,
          widthFactor: p.widthFactor
        })
    }
    return s
  })

  function field(key: string) {
    const value = v[key]
    return value === undefined || value === '' ? undefined : String(value)
  }

  return {
    version,
    reference: REFERENCE_ID,
    status: 'draft',
    detailMode: sourceGeometry ? 'source' : 'parametric',
    model,
    sheets,
    blocks: LAYOUT.blocks.map(b => ({
      ...b,
      entities: b.entities.map(
        e =>
          (e.kind === 'polyline'
            ? { ...e, points: e.points.map(p => ({ ...p })) }
            : e) as AcTpBlockEntity
      )
    }))
  }
}

/** Warning over a steel sheet drawn as M1 for a changed geometry. */
const STEEL_AS_M1 = [
  'THÉP THEO M1 GỐC, CHƯA CẬP NHẬT CHO THÔNG SỐ NÀY',
  'Hình thép giữ nguyên kích thước mẫu M1, không kéo giãn. Cần phương án thép mới trước khi phát hành; khối lượng thép trên BTKL là tạm tính theo hàm lượng.'
]

/**
 * SUB-100 for a changed geometry: the M1 tables stay, marked as M1's, and
 * the take-off of the current parameters (item d) is drawn in the free lower
 * left of the sheet (paper x 15–195 mm, y 12–100 mm).
 */
function quantityTable(v: DossierModel['values']): DossierPrimitive[] {
  const out: DossierPrimitive[] = []
  const text = (
    at: XY,
    t: string,
    height: number,
    extra: { align?: number; color?: number } = {}
  ) =>
    out.push({
      role: 'ghi_chu',
      partId: 'ghi_chu_btkl_SUB-100',
      kind: 'text',
      at,
      text: t,
      height,
      style: '_33_Arial',
      ...extra
    })
  text(
    [1500, 28900],
    'BẢNG THỐNG KÊ THÉP VÀ KHỐI LƯỢNG BÊN PHẢI LÀ CỦA M1 GỐC, CHƯA CẬP NHẬT CHO THÔNG SỐ NÀY',
    250,
    { color: 1 }
  )
  const result = acTpBtklMo(v)
  const rows = result.items.filter(
    i =>
      i.nhom !== 'ghi_chu' &&
      !i.key.startsWith('van_khuon_') &&
      !(i.nhom === 'cot_thep' && i.stt.includes('.'))
  )
  const top = 10000
  text(
    [1500, top],
    `BẢNG KHỐI LƯỢNG ${String(v.tenMo).toLocaleUpperCase('vi')} THEO THÔNG SỐ HIỆN TẠI (TẠM TÍNH, xem BTKL)`,
    300
  )
  const row = 380
  rows.forEach((item, k) => {
    const y = top - 600 - k * row
    const color = item.nguon === 'tu_choi' ? 1 : item.flags?.length ? 2 : 7
    text([1500, y], item.stt, 230, { color })
    text([2700, y], item.hangMuc, 230, { color })
    text([14500, y], item.donVi.replace('m3', 'm³').replace('m2', 'm²'), 230, {
      color
    })
    text(
      [19500, y],
      item.khoiLuong === null ? 'không tính' : acTpBtklNumber(item.khoiLuong),
      230,
      { color, align: 2 }
    )
  })
  text(
    [1500, top - 600 - rows.length * row - 200],
    'Đỏ: không tính (thiếu dữ liệu). Vàng: có cờ — xem diễn giải trên tờ BTKL. Không dùng để thi công.',
    200,
    { color: 1 }
  )
  return out
}
