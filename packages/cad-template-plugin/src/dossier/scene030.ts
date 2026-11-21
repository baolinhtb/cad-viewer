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
import { sheetStretch } from './grid030'
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
import type { DossierPrimitive, DossierScene, DossierSheet, XY } from './scene'

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
/** Bearing labels of the plan, G1 on the right. */
const BEARING_LABEL = /^G\d+$/
/**
 * A primitive placed at a true distance across the bridge from the bearing
 * centre line (source x `fromCentre`): the grid moves that line, not the
 * distances, so a bearing array keeps its spacing whatever the width does.
 */
type ArrayedPrimitive = LayoutPrimitive & { fromCentre?: number }

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
  if (keepSource) return content
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
  const replaced = new Set<LayoutPrimitive>([
    ...plan,
    ...frontBearings.flat(),
    ...frontStops.flat(),
    ...planStops,
    ...labels,
    ...dims
  ])
  // The seat falls across the bridge: its bearings step up with x.
  const bottom = (cluster: LayoutPrimitive[]) =>
    Math.min(...cluster.flatMap(p => p.points!.map(q => q[1])))
  const slope =
    (bottom(frontBearings[X.length - 1]) - bottom(frontBearings[0])) /
    (X[X.length - 1] - X[0])
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
    if (deltas.has('H4A')) deltas.set('H4B', deltas.get('H4A')!)
    if (deltas.has('EL2.L')) deltas.set('EL2.R', deltas.get('EL2.L')!)
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
            : arrayedBearings(ls.content, model, stretch.identity)) {
            const c = steel ? relabelSteel(raw) : relabelGeneral(raw)
            const at = centreOf(c)
            const [sx, sy] = layout.shifts[stretch.viewOf(at)] ?? [0, 0]
            // A block moves as a whole, by how far its drawn centre moves;
            // everything else is stretched point by point.
            const [mx, my] = stretch.map(at, at)
            const move: XY = [mx - at[0], my - at[1]]
            // A re-placed bearing item keeps its true distance from the
            // bearing centre line, whatever the grid does to the width.
            const fc = (raw as ArrayedPrimitive).fromCentre
            const across = (q: XY) =>
              fc === undefined
                ? stretch.map(q, at)[0]
                : stretch.map([fc, q[1]], at)[0] + q[0] - fc
            if (fc !== undefined) move[0] = across(at) - at[0]
            // Annotations of the plan's wing band move as a block (see
            // PLAN_BAND): the band itself shrinks with the wings.
            const band = steel ? undefined : PLAN_BAND[c.handle ?? '']
            const shift = (line: number) =>
              stretch.map([at[0], line], at)[1] - line
            const dy = band?.(shift)
            const down = (q: XY) =>
              dy === undefined ? stretch.map(q, at)[1] : q[1] + dy
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
        const text = relabel(p.text)
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
