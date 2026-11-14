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

import type { DossierModel } from './model'
import { REFERENCE_ID } from './model'
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
  aligned?: boolean
  dimStyle?: string
  vars?: Record<string, number>
  block?: string
  scale?: XY
  attributes?: Record<string, string>
}
interface LayoutSheet {
  id: string
  viewport: { x: number; y: number; w: number; h: number } | null
  model: { x0: number; y0: number; x1: number; y1: number } | null
  view?: keyof typeof reference.views
  offset?: XY
  title: LayoutPrimitive[]
  paper: LayoutPrimitive[]
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
    if (ls.viewport && ls.model && ls.view && ls.offset) {
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
      p.kind === 'text'
        ? 'ghi_chu'
        : p.kind === 'dimension'
          ? 'kich_thuoc'
          : p.kind === 'insert'
            ? 'ky_hieu_mat_cat'
            : s.id === 'SUB-100'
              ? 'cot_thep'
              : 'mo_cau'
    const scaled = (p: XY): XY => [p[0] * K, p[1] * K]
    for (const p of ls.paper) addPaper(p, roleOf(p))
    for (const p of ls.title)
      addPaper({ ...p, text: relabelTitle(p.text ?? '') }, 'tieu_de_ban_ve')

    function relabelTitle(text: string) {
      return text === SOURCE_PROJECT ? project : relabel(text)
    }

    function addPaper(p: LayoutPrimitive, role: string) {
      const look = {
        ...id(role),
        color: p.color,
        ...(p.lineType ? { lineType: p.lineType } : {}),
        ...(p.lineWeight !== undefined ? { lineWeight: p.lineWeight } : {})
      }
      switch (p.kind) {
        case 'path':
          push({
            ...look,
            kind: 'path',
            points: p.points!.map(scaled),
            closed: p.closed,
            ...(p.bulges ? { bulges: p.bulges } : {}),
            ...(p.line ? { line: true } : {})
          })
          return
        case 'circle':
          push({
            ...look,
            kind: 'circle',
            at: scaled(p.at!),
            radius: p.radius! * K
          })
          return
        case 'arc':
          push({
            ...look,
            kind: 'arc',
            at: scaled(p.at!),
            radius: p.radius! * K,
            startAngle: p.startAngle!,
            endAngle: p.endAngle!
          })
          return
        case 'fill':
          push({
            ...look,
            kind: 'fill',
            loops: p.loops!.map(loop => loop.map(scaled)),
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
            at: scaled(p.at!),
            text: p.text!,
            height: p.height! * K,
            rotation: p.rotation,
            align: p.align,
            widthFactor: p.widthFactor,
            style: p.style
          })
          return
        case 'dimension': {
          const start = scaled(p.start!),
            end = scaled(p.end!),
            line = scaled(p.dimLine!)
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
            ...(p.text !== undefined ? { text: p.text } : {}),
            ...(overrides ? { overrides } : {})
          })
          return
        }
        case 'insert':
          push({
            ...look,
            kind: 'insert',
            block: p.block!,
            at: scaled(p.at!),
            scale: [p.scale![0] * K, p.scale![1] * K],
            rotation: p.rotation,
            attributes: p.attributes ?? {}
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
