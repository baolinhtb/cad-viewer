/**
 * Fidelity harness — the parts that need no renderer.
 *
 * Builds, from a generated `AcDbDatabase`, the same compact per-sheet
 * inventory `tools/fidelity/extract-orig.mjs` builds from the original DWG,
 * and scores one against the other:
 *
 * - S_kiem: entity histogram by (type, effective colour, linetype,
 *   lineweight) — layer names deliberately not part of the key, so moving to
 *   `_33_` layers costs nothing as long as the look is kept;
 * - S_chu: texts matched one-to-one (same string, ≤ 1 mm, height ±5 %, same
 *   font family);
 * - S_dim: dimensions matched one-to-one on their two measured points
 *   (≤ 0.5 mm), scored on displayed text and style variables.
 *
 * Coordinates: paper millimetres from the sheet's lower-left corner.
 * See tools/fidelity/README.md for the definitions and the pixel part.
 */
import { acTpMTextPlain, acTpTextStyleFont } from '@mlightcad/cad-template-sdk'
import {
  AcDbAlignedDimension,
  AcDbBlockReference,
  AcDbDatabase,
  AcDbEntity,
  AcDbMText,
  AcDbText
} from '@mlightcad/data-model'

export interface InvText {
  t: string
  x: number
  y: number
  h: number
  r?: number
  a?: number
  f: string
}
export interface InvDim {
  a: [number, number]
  b: [number, number]
  tp?: [number, number]
  t: string
  r?: number
  style: string
  vars: Record<string, number>
}
export interface InvSheet {
  id: string
  gen: string
  frame: { w: number; h: number }
  viewport: { x: number; y: number; w: number; h: number } | null
  model: { x0: number; y0: number; x1: number; y1: number } | null
  hist: Record<string, number>
  texts: InvText[]
  dims: InvDim[]
  counts?: Record<string, number>
}
export interface Inventory {
  version: number
  sheets: InvSheet[]
}

/** A generated sheet: where it sits in model space and at what scale. */
export interface GenSheetPlacement {
  id: string
  origin: [number, number]
  scale: number
  width: number
  height: number
}

const round = (v: number) => Math.round(v * 100) / 100

/** Effective colour / linetype / lineweight, resolving ByLayer/ByBlock. */
function appearance(db: AcDbDatabase, e: AcDbEntity) {
  const layer = db.tables.layerTable.getAt(e.layer || '0')
  let color = e.color.colorIndex ?? 256
  if (color === 256) color = layer?.color.colorIndex ?? 7
  else if (color === 0) color = 7
  let lt = String(e.lineType || 'ByLayer').toUpperCase()
  if (lt === 'BYLAYER')
    lt = String(layer?.linetype || 'Continuous').toUpperCase()
  if (lt === 'BYBLOCK') lt = 'CONTINUOUS'
  let lw = Number(e.lineWeight ?? -1)
  if (lw === -1) lw = Number(layer?.lineWeight ?? -3)
  if (lw === -2) lw = -3
  return { color: Math.abs(color), lt, lw }
}

function centreOf(e: AcDbEntity): [number, number] | undefined {
  if (e instanceof AcDbText) {
    const p = e.horizontalMode ? e.alignmentPoint : e.position
    return [p.x, p.y]
  }
  if (e instanceof AcDbMText) return [e.location.x, e.location.y]
  try {
    const b = e.geometricExtents
    if (!Number.isFinite(b.min.x)) return undefined
    return [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2]
  } catch {
    return undefined
  }
}

function fontFamily(db: AcDbDatabase, style: string | undefined): string {
  const font = String(acTpTextStyleFont(db, style) ?? '').toLowerCase()
  if (font === '' || font.includes('arial')) return 'arial'
  return font.replace(/\.(ttf|shx)$/, '')
}

function dimVars(
  db: AcDbDatabase,
  name: string | null
): Record<string, number> {
  const r = name ? db.tables.dimStyleTable.getAt(name) : undefined
  if (!r) return {}
  const pick: Record<string, number | undefined> = {
    DIMSCALE: r.dimscale,
    DIMASZ: r.dimasz,
    DIMEXO: r.dimexo,
    DIMEXE: r.dimexe,
    DIMTXT: r.dimtxt,
    DIMGAP: r.dimgap,
    DIMTAD: Number(r.dimtad),
    DIMCLRD: r.dimclrd,
    DIMCLRE: r.dimclre,
    DIMCLRT: r.dimclrt
  }
  return Object.fromEntries(
    Object.entries(pick).filter(
      ([, v]) => typeof v === 'number' && Number.isFinite(v)
    )
  ) as Record<string, number>
}

/**
 * Inventory of the generated drawing, one entry per placement, everything
 * the sheet holds (a sheet larger than A3 keeps its content: whatever falls
 * outside the A3 frame is a layout difference and is scored as one).
 */
export function generatedInventory(
  db: AcDbDatabase,
  placements: readonly (GenSheetPlacement & { orig: string })[]
): Inventory {
  const sheets: InvSheet[] = placements.map(p => ({
    id: p.orig,
    gen: p.id,
    frame: { w: p.width / p.scale, h: p.height / p.scale },
    viewport: null,
    model: null,
    hist: {},
    texts: [],
    dims: []
  }))
  const toPaper = (
    p: GenSheetPlacement,
    [x, y]: [number, number]
  ): [number, number] => [
    round((x - p.origin[0]) / p.scale),
    round((y - p.origin[1]) / p.scale)
  ]
  for (const e of db.tables.blockTable.modelSpace.newIterator()) {
    const c = centreOf(e)
    if (!c) continue
    const index = placements.findIndex(
      p =>
        c[0] >= p.origin[0] &&
        c[0] <= p.origin[0] + p.width &&
        c[1] >= p.origin[1] &&
        c[1] <= p.origin[1] + p.height
    )
    if (index < 0) continue
    const p = placements[index]
    const sheet = sheets[index]
    const type = e.dxfTypeName
    const look = appearance(db, e)
    const key = `${type}|${look.color}|${look.lt}|${look.lw}`
    sheet.hist[key] = (sheet.hist[key] ?? 0) + 1

    if (e instanceof AcDbBlockReference) {
      // ATTRIB texts belong to the insert; the original inventory lists them
      // as texts (and, like here, not in the histogram).
      for (const a of e.attributeIterator()) {
        const t = String(a.textString ?? '').trim()
        if (!t || a.isInvisible) continue
        const at = a.horizontalMode ? a.alignmentPoint : a.position
        const [x, y] = toPaper(p, [at.x, at.y])
        sheet.texts.push({
          t,
          x,
          y,
          h: round(a.height / p.scale),
          f: fontFamily(db, a.styleName)
        })
      }
    } else if (e instanceof AcDbText || e instanceof AcDbMText) {
      const raw =
        e instanceof AcDbMText ? acTpMTextPlain(e.contents) : e.textString
      const t = String(raw ?? '').trim()
      if (!t) continue
      const [x, y] = toPaper(p, c)
      sheet.texts.push({
        t,
        x,
        y,
        h: round(e.height / p.scale),
        f: fontFamily(db, e.styleName)
      })
    } else if (e instanceof AcDbAlignedDimension) {
      // Linear dimensions only (rotated derives from aligned), as the
      // original inventory lists DIMENSION types 0 and 1.
      const d = e as AcDbAlignedDimension & {
        xLine1Point?: { x: number; y: number }
        xLine2Point?: { x: number; y: number }
      }
      if (!d.xLine1Point || !d.xLine2Point) continue
      const vars = dimVars(db, d.dimensionStyleName)
      const measured = String(
        Number((d.measurement ?? 0).toFixed(vars.DIMDEC ?? 2))
      )
      const text = String(d.dimensionText ?? '').trim()
      sheet.dims.push({
        a: toPaper(p, [d.xLine1Point.x, d.xLine1Point.y]),
        b: toPaper(p, [d.xLine2Point.x, d.xLine2Point.y]),
        t:
          text === '' || text === '<>'
            ? measured
            : acTpMTextPlain(text.replace('<>', measured)),
        style: String(d.dimensionStyleName ?? ''),
        vars
      })
    }
  }
  return { version: 1, sheets }
}

// ---------------------------------------------------------------- scoring

/** Text as compared: decoded, codes stripped, case-folded (H fonts draw capitals). */
export function textKey(t: string): string {
  return t
    .replace(/%%[uUoOdDpPcC]/g, '')
    .replace(/%%%/g, '%')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('vi')
}

export function scoreHistogram(orig: InvSheet, gen: InvSheet): number {
  const keys = new Set([...Object.keys(orig.hist), ...Object.keys(gen.hist)])
  let diff = 0
  let total = 0
  for (const k of keys) {
    diff += Math.abs((orig.hist[k] ?? 0) - (gen.hist[k] ?? 0))
    total += orig.hist[k] ?? 0
  }
  if (total === 0) return Object.keys(gen.hist).length ? 0 : 1
  return Math.max(0, 1 - diff / (2 * total))
}

export function scoreTexts(
  orig: InvSheet,
  gen: InvSheet
): { score: number; matched: number } {
  const used = new Set<number>()
  let matched = 0
  for (const o of orig.texts) {
    const key = textKey(o.t)
    let best = -1
    let bestDist = Infinity
    gen.texts.forEach((g, i) => {
      if (used.has(i) || textKey(g.t) !== key) return
      const dist = Math.hypot(g.x - o.x, g.y - o.y)
      if (dist > 1) return
      if (o.h > 0 && Math.abs(g.h - o.h) / o.h > 0.05) return
      if (g.f !== o.f) return
      if (dist < bestDist) {
        best = i
        bestDist = dist
      }
    })
    if (best >= 0) {
      used.add(best)
      matched += 1
    }
  }
  const n = Math.max(orig.texts.length, gen.texts.length)
  return { score: n === 0 ? 1 : matched / n, matched }
}

/**
 * The style variables S_dim compares (those set in the original). Sizes are
 * compared as drawn — the variable times DIMSCALE — because the `_33_` styles
 * store the product with `dimscale 1` (the data model's dimension builder
 * ignores DIMSCALE); DIMSCALE itself is therefore not compared.
 */
export const DIM_VARS = [
  'DIMTXT',
  'DIMASZ',
  'DIMEXO',
  'DIMEXE',
  'DIMGAP',
  'DIMTAD',
  'DIMCLRD',
  'DIMCLRE',
  'DIMCLRT'
]

/** Size variables that DIMSCALE multiplies. */
const DIM_SIZE_VARS = new Set([
  'DIMTXT',
  'DIMASZ',
  'DIMEXO',
  'DIMEXE',
  'DIMGAP'
])

/** `vars` with sizes multiplied by DIMSCALE (0 or unset counts as 1). */
export function effectiveDimVars(
  vars: Record<string, number>
): Record<string, number> {
  const scale = vars.DIMSCALE ? vars.DIMSCALE : 1
  return Object.fromEntries(
    Object.entries(vars).map(([k, v]) => [
      k,
      DIM_SIZE_VARS.has(k) ? v * scale : v
    ])
  )
}

export function scoreDims(
  orig: InvSheet,
  gen: InvSheet
): { score: number; matched: number } {
  const near = (p: [number, number], q: [number, number]) =>
    Math.hypot(p[0] - q[0], p[1] - q[1]) <= 0.5
  const used = new Set<number>()
  let total = 0
  let matched = 0
  for (const o of orig.dims) {
    const i = gen.dims.findIndex(
      (g, k) =>
        !used.has(k) &&
        ((near(g.a, o.a) && near(g.b, o.b)) ||
          (near(g.a, o.b) && near(g.b, o.a)))
    )
    if (i < 0) continue
    used.add(i)
    matched += 1
    const ov = effectiveDimVars(o.vars)
    const gv = effectiveDimVars(gen.dims[i].vars)
    const g = gen.dims[i]
    const vars = DIM_VARS.filter(v => ov[v] !== undefined)
    const same = vars.filter(
      v =>
        Math.abs((gv[v] ?? NaN) - ov[v]) <= 1e-6 * Math.max(1, Math.abs(ov[v]))
    ).length
    total +=
      0.4 +
      0.3 * (textKey(g.t) === textKey(o.t) ? 1 : 0) +
      0.3 * (vars.length ? same / vars.length : 1)
  }
  const n = Math.max(orig.dims.length, gen.dims.length)
  return { score: n === 0 ? 1 : total / n, matched }
}

export interface InventoryScore {
  id: string
  gen: string
  S_kiem: number
  S_chu: number
  S_dim: number
  detail: {
    entities: { orig: number; gen: number }
    /** Diagnostics: same strings regardless of position, and how far the
     * matched ones sit from the original (median, paper mm). */
    texts: {
      orig: number
      gen: number
      matched: number
      sameString: number
      medianOffset: [number, number] | null
    }
    dims: { orig: number; gen: number; matched: number }
  }
}

export function scoreInventory(
  orig: Inventory,
  gen: Inventory
): InventoryScore[] {
  return orig.sheets.map(o => {
    const g = gen.sheets.find(s => s.id === o.id) ?? {
      ...o,
      hist: {},
      texts: [],
      dims: []
    }
    const texts = scoreTexts(o, g)
    const pool = new Map<string, InvText[]>()
    for (const t of g.texts)
      pool.set(textKey(t.t), [...(pool.get(textKey(t.t)) ?? []), t])
    const offsets: [number, number][] = []
    for (const t of o.texts) {
      const hit = pool.get(textKey(t.t))?.shift()
      if (hit) offsets.push([hit.x - t.x, hit.y - t.y])
    }
    const median = (v: number[]) =>
      [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]
    const dims = scoreDims(o, g)
    const sum = (h: Record<string, number>) =>
      Object.values(h).reduce((a, b) => a + b, 0)
    return {
      id: o.id,
      gen: g.gen,
      S_kiem: scoreHistogram(o, g),
      S_chu: texts.score,
      S_dim: dims.score,
      detail: {
        entities: { orig: sum(o.hist), gen: sum(g.hist) },
        texts: {
          orig: o.texts.length,
          gen: g.texts.length,
          matched: texts.matched,
          sameString: offsets.length,
          medianOffset: offsets.length
            ? [
                round(median(offsets.map(d => d[0]))),
                round(median(offsets.map(d => d[1])))
              ]
            : null
        },
        dims: { orig: o.dims.length, gen: g.dims.length, matched: dims.matched }
      }
    }
  })
}
