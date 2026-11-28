import type {
  AcTpDimStyleVars,
  AcTpDrawContext,
  AcTpNoteBox
} from '@mlightcad/cad-template-sdk'
import {
  ACTP_DIM_STYLES_33,
  acTpBuildDrawingFrame,
  acTpGhiChuLineBox,
  acTpGhiChuTextWidth,
  acTpLayoutGhiChuBlock
} from '@mlightcad/cad-template-sdk'

import type { RoadModel } from './model'
import { ROAD_ID, ROAD_VERSION, roadMm, roadSurfaceLevel } from './model'

/**
 * Road cross-section — the sheet. One A3 sheet in sheet units (1 paper mm =
 * {@link K}), the way the abutment dossier lays its sheets out (scene030):
 * the section drawn at 1:n, the pavement build-up beside it at 1:m, both
 * shrunk into the sheet with the text kept at paper size and the dimensions
 * reading true lengths through DIMLFAC (P3-M2b). Pure: tests read the
 * primitives, the template draws them.
 */

export type XY = [number, number]

interface Base {
  role: string
  partId: string
  lineType?: string
}
export type RoadPrimitive = Base &
  (
    | { kind: 'path'; points: XY[]; closed?: boolean }
    | {
        kind: 'fill'
        loop: XY[]
        pattern: string
        patternScale: number
        patternAngle?: number
      }
    | {
        kind: 'text'
        at: XY
        text: string
        height: number
        rotation?: number
        align?: 0 | 1 | 2
        widthFactor?: number
      }
    | {
        kind: 'dimension'
        start: XY
        end: XY
        offset: number
        direction: 'ngang' | 'dung'
        dimStyle: string
        overrides: AcTpDimStyleVars
        /** The length the dimension reads, mm (for tests and the summary). */
        value: number
        textAt?: XY
      }
  )

export interface RoadScene {
  id: typeof ROAD_ID
  version: string
  /** Sheet size in sheet units and its lower-left corner in the drawing. */
  width: number
  height: number
  origin: XY
  /** Scale denominator of the section and of the pavement detail. */
  tiLe: number
  tiLeChiTiet: number
  primitives: RoadPrimitive[]
  /** True when the GHI CHÚ block found no room inside the drawing area. */
  ghiChuNgoaiKhung: boolean
}

/** Paper millimetres → sheet units (as the dossier's A3 sheets). */
const K = 100
/** Scales tried for the section, largest first (the dossier's series). */
export const ROAD_SCALES = [20, 25, 50, 100, 125, 150, 200, 250, 500] as const
/** Scales tried for the pavement build-up detail. */
export const ROAD_DETAIL_SCALES = [5, 10, 20, 25, 50] as const
const DIM_STYLE = '_33_D100'
const DIM_TEXT = 150
/** Heights in sheet units (paper mm × K). */
const H_TITLE = 400,
  H_SCALE = 250,
  H_LABEL = 200,
  H_NOTE = 200
/** Room kept for the pavement detail at the right of the drawing area. */
const DETAIL_W = 95 * K
/** Ground drawn past each slope toe / top, mm real. */
const GROUND_EXT = 2000
/** Curb embedded below the edge of the carriageway, mm (drawing value). */
const CURB_DEPTH = 300

const pct = (v: number) => `${v.toFixed(1).replace('.', ',')} %`
const num = (v: number, d = 2) => String(Number(v.toFixed(d))).replace('.', ',')

/** DIMLFAC of a drawing shrunk by f, over the style's own (P3-M2b). */
function scaledDim(f: number): AcTpDimStyleVars {
  const own =
    (ACTP_DIM_STYLES_33[DIM_STYLE] as { dimlfac?: number } | undefined)
      ?.dimlfac ?? 1
  return { dimlfac: own / f } as AcTpDimStyleVars
}

/** Hatch of a pavement layer, by what its name says it is. */
export function roadLayerPattern(ten: string): {
  pattern: string
  angle: number
} {
  const t = ten.toLowerCase()
  if (/btxm|bê tông xi măng|xi măng/.test(t))
    return { pattern: 'AR-CONC', angle: 0 }
  if (/btn|nhựa|bê tông nhựa|asphalt|lnn|láng/.test(t))
    return { pattern: 'ANSI31', angle: 0 }
  if (/cp|cấp phối|đá dăm|đá|sỏi|cuội|gia cố/.test(t))
    return { pattern: 'ANSI37', angle: 0 }
  return { pattern: 'ANSI31', angle: 90 }
}

/** Box of a primitive's text (TEXT or dimension text), sheet units. */
export function roadTextBox(p: RoadPrimitive): AcTpNoteBox | undefined {
  if (p.kind === 'text') {
    const w = acTpGhiChuTextWidth(p.text, p.height, p.widthFactor ?? 1)
    if (p.rotation && Math.abs(p.rotation) > 1e-6) {
      // Rotated about its insertion point (centred texts about their middle).
      const a = (p.rotation * Math.PI) / 180
      const x0 = p.align === 1 ? -w / 2 : p.align === 2 ? -w : 0
      const corners: XY[] = [
        [x0, -0.3 * p.height],
        [x0 + w, -0.3 * p.height],
        [x0 + w, 1.25 * p.height],
        [x0, 1.25 * p.height]
      ].map(([u, v]) => [
        p.at[0] + u * Math.cos(a) - v * Math.sin(a),
        p.at[1] + u * Math.sin(a) + v * Math.cos(a)
      ])
      return boxOf(corners)
    }
    const x =
      p.align === 1 ? p.at[0] - w / 2 : p.align === 2 ? p.at[0] - w : p.at[0]
    return acTpGhiChuLineBox(x, p.at[1], p.text, p.height, p.widthFactor ?? 1)
  }
  if (p.kind === 'dimension') {
    const text = roadMm(p.value).replace(/\s/g, '')
    const w = acTpGhiChuTextWidth(text, DIM_TEXT)
    const c = dimTextCentre(p)
    return p.direction === 'ngang'
      ? {
          x0: c[0] - w / 2,
          y0: c[1] - DIM_TEXT / 2,
          x1: c[0] + w / 2,
          y1: c[1] + DIM_TEXT / 2
        }
      : {
          x0: c[0] - DIM_TEXT / 2,
          y0: c[1] - w / 2,
          x1: c[0] + DIM_TEXT / 2,
          y1: c[1] + w / 2
        }
  }
  return undefined
}

/** Middle of a dimension's text: where it was put, else above the line. */
function dimTextCentre(p: Extract<RoadPrimitive, { kind: 'dimension' }>): XY {
  if (p.textAt) return p.textAt
  const above = 60 + DIM_TEXT / 2
  return p.direction === 'ngang'
    ? [(p.start[0] + p.end[0]) / 2, p.start[1] + p.offset + above]
    : [p.start[0] + p.offset - above, (p.start[1] + p.end[1]) / 2]
}

function boxOf(points: readonly XY[]): AcTpNoteBox {
  return {
    x0: Math.min(...points.map(p => p[0])),
    y0: Math.min(...points.map(p => p[1])),
    x1: Math.max(...points.map(p => p[0])),
    y1: Math.max(...points.map(p => p[1]))
  }
}

/** Box of anything drawn, for the GHI CHÚ placement. */
function primitiveBox(p: RoadPrimitive): AcTpNoteBox | undefined {
  if (p.kind === 'path') return boxOf(p.points)
  if (p.kind === 'fill') return boxOf(p.loop)
  if (p.kind === 'text') return roadTextBox(p)
  const line =
    p.direction === 'ngang'
      ? boxOf([
          [p.start[0], p.start[1]],
          [p.end[0], p.end[1] + p.offset]
        ])
      : boxOf([
          [p.start[0], p.start[1]],
          [p.end[0] + p.offset, p.end[1]]
        ])
  const t = roadTextBox(p)!
  return {
    x0: Math.min(line.x0, t.x0),
    y0: Math.min(line.y0, t.y0),
    x1: Math.max(line.x1, t.x1),
    y1: Math.max(line.y1, t.y1)
  }
}

/** Real-mm geometry of the section: outlines, keyed points, extents. */
interface Section {
  /** Paved surface breakpoints, left to right (x, y) mm. */
  hardEdge: number
  layers: { ten: string; poly: XY[] }[]
  nen: Record<-1 | 1, XY[]>
  groundDashed: XY[] | undefined
  curbs: { partId: string; poly: XY[] }[]
  sidewalks: { partId: string; poly: XY[] }[]
  dividerTop: XY[] | undefined
  slopes: { side: -1 | 1; from: XY; to: XY }[]
  /** Outer edge of the roadbed at the surface, per side. */
  edge: Record<-1 | 1, XY>
  groundY: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

function buildSection(model: RoadModel): Section {
  const v = model.values
  const n = (k: string) => Number(v[k])
  const ys = (x: number) => roadSurfaceLevel(model, x)
  const xh = model.bAoDuong / 2
  const oneWay = String(v.kieuDoc) === 'mot_mai'
  const half = n('bPhanCach') > 0 ? n('bPhanCach') / 2 : 0
  const curb = v.coBoVia === true
  const bCurb = n('bBoVia')
  // Breakpoints of the paved surface.
  const xs = [-xh, xh]
  if (!oneWay) xs.push(half > 0 ? -half : 0, ...(half > 0 ? [half] : []))
  const B = [...new Set(xs)].sort((a, b) => a - b)
  let depth = 0
  const layers = model.layers.map(l => {
    const top = B.map((x): XY => [x, ys(x) - depth])
    depth += l.day
    const bottom = B.map((x): XY => [x, ys(x) - depth]).reverse()
    return { ten: l.ten, poly: [...top, ...bottom] }
  })
  const curbs: Section['curbs'] = []
  const sidewalks: Section['sidewalks'] = []
  const edge = {} as Record<-1 | 1, XY>
  const shoulder: Record<-1 | 1, XY[]> = { [-1]: [], [1]: [] }
  for (const s of [-1, 1] as const) {
    const yh = ys(s * xh)
    const name = s < 0 ? 'trai' : 'phai'
    if (curb) {
      const top = yh + n('hBoVia')
      const a = s * xh,
        b = s * (xh + bCurb)
      curbs.push({
        partId: `bo_via_${name}`,
        poly: [
          [a, yh - CURB_DEPTH],
          [b, yh - CURB_DEPTH],
          [b, top],
          [a, top]
        ]
      })
      const bHe = n('bHe')
      if (bHe > bCurb) {
        const xe = s * (xh + bHe)
        const yt = (x: number) => top + (n('iHe') / 100) * Math.abs(x - b)
        sidewalks.push({
          partId: `he_${name}`,
          poly: [
            [b, top],
            [xe, yt(xe)],
            [xe, yt(xe) - n('tHe')],
            [b, top - n('tHe')]
          ]
        })
        edge[s] = [xe, yt(xe)]
      } else edge[s] = [b, top]
    } else {
      const xe = s * (xh + n('bLeDat'))
      edge[s] = [xe, ys(xe)]
      if (n('bLeDat') > 0) shoulder[s] = [[s * xh, yh]]
    }
  }
  const hNen = n('hNen')
  const m = n('mMai')
  // Natural ground at the lower roadbed edge minus hNen: one level for
  // both sides (flat ground; a sloping ground line is not drawn).
  const groundY = Math.min(edge[-1][1], edge[1][1]) - hNen
  const slopes: Section['slopes'] = []
  const toe: Record<-1 | 1, XY> = { [-1]: edge[-1], [1]: edge[1] }
  if (hNen !== 0)
    for (const s of [-1, 1] as const) {
      const dy = groundY - edge[s][1]
      const to: XY = [edge[s][0] + s * Math.abs(dy) * m, groundY]
      slopes.push({ side: s, from: edge[s], to })
      toe[s] = to
    }
  const xMin = toe[-1][0] - GROUND_EXT,
    xMax = toe[1][0] + GROUND_EXT
  // Roadbed outline: ground, slope, edge, earth shoulder back to the
  // paved edge; the pavement and curbs close it.
  const nen: XY[] = [
    [xMin, groundY],
    toe[-1],
    ...(toe[-1] !== edge[-1] ? [edge[-1]] : []),
    ...shoulder[-1]
  ]
  const nenRight: XY[] = [
    ...shoulder[1],
    ...(toe[1] !== edge[1] ? [edge[1]] : []),
    toe[1],
    [xMax, groundY]
  ]
  const groundDashed = hNen !== 0 ? ([toe[-1], toe[1]] as XY[]) : undefined
  let dividerTop: XY[] | undefined
  if (half > 0) {
    const h = n('hBoViaPhanCach')
    for (const s of [-1, 1] as const) {
      const a = s * half,
        b = s * (half - bCurb)
      curbs.push({
        partId: `bo_via_phan_cach_${s < 0 ? 'trai' : 'phai'}`,
        poly: [
          [a, -CURB_DEPTH],
          [b, -CURB_DEPTH],
          [b, h],
          [a, h]
        ]
      })
    }
    dividerTop = [
      [-(half - bCurb), h],
      [half - bCurb, h]
    ]
  }
  const all: XY[] = [
    ...layers.flatMap(l => l.poly),
    ...curbs.flatMap(c => c.poly),
    ...sidewalks.flatMap(c => c.poly),
    [xMin, groundY],
    [xMax, groundY],
    edge[-1],
    edge[1]
  ]
  return {
    hardEdge: xh,
    layers,
    nen: { [-1]: nen, [1]: nenRight },
    groundDashed,
    curbs,
    sidewalks,
    dividerTop,
    slopes,
    edge,
    groundY,
    xMin,
    xMax,
    yMin: Math.min(...all.map(p => p[1])),
    yMax: Math.max(...all.map(p => p[1]))
  }
}

/** Builds the sheet; throws a Vietnamese message when nothing fits. */
export function buildRoadScene(model: RoadModel): RoadScene {
  if (model.errors.length) throw new Error(model.errors.join('\n'))
  const v = model.values
  const n = (k: string) => Number(v[k])
  const field = (k: string) => String(v[k] ?? '').trim() || undefined
  const sec = buildSection(model)
  const prims: RoadPrimitive[] = []
  const push = (p: RoadPrimitive) => prims.push(p)

  // ------------------------------------------------------------- frame
  const frameFor = (tiLe: number) =>
    acTpBuildDrawingFrame({
      khoGiay: 'A3',
      truong: {
        duAn: field('duAn'),
        congTrinh: field('congTrinh'),
        tenBanVe: String(v.tenHinh),
        soTo: '1/1',
        tiLe: `1:${tiLe}`,
        ngay: field('ngay'),
        giaiDoan: 'TKBVTC',
        donVi: field('donVi'),
        trangThai: 'BẢN NHÁP — CHƯA PHÁT HÀNH THI CÔNG'
      }
    })
  const area = frameFor(100).drawArea
  const A = {
    x0: area.x * K,
    y0: area.y * K,
    x1: (area.x + area.w) * K,
    y1: (area.y + area.h) * K
  }
  const top = A.y1 - 1000
  // Section region: left of the detail; room above for title, labels and
  // three dimension rows, below for the GHI CHÚ block.
  const mainX0 = A.x0 + 1000,
    mainX1 = A.x1 - DETAIL_W - 1000
  const above = 1700 + 3 * 800 + 900 + 500
  const notesRoom = 6000
  const realW = sec.xMax - sec.xMin,
    realH = sec.yMax - sec.yMin
  const tiLe = ROAD_SCALES.find(
    s =>
      (realW * K) / s <= mainX1 - mainX0 &&
      (realH * K) / s <= top - above - (A.y0 + notesRoom)
  )
  if (!tiLe)
    throw new Error(
      `Mặt cắt rộng ${roadMm(realW)} mm, cao ${roadMm(realH)} mm (kể cả mái ta luy và ${roadMm(GROUND_EXT)} mm mặt đất mỗi bên) không vừa khung A3 ở tỉ lệ 1:${ROAD_SCALES[ROAD_SCALES.length - 1]}: giảm chiều cao nền, hệ số mái hoặc bề rộng.`
    )
  const f = K / tiLe
  const cx = (mainX0 + mainX1) / 2
  const yTopSec = top - above
  const P = ([x, y]: XY): XY => [cx + x * f, yTopSec + (y - sec.yMax) * f]
  const dimOv = scaledDim(f)

  // ------------------------------------------------------------- section
  sec.layers.forEach((l, i) =>
    push({
      kind: 'path',
      role: 'lop_phu',
      partId: `lop_ao_duong_${i + 1}`,
      points: l.poly.map(P),
      closed: true
    })
  )
  for (const c of sec.curbs)
    push({
      kind: 'path',
      role: 'bo_via',
      partId: c.partId,
      points: c.poly.map(P),
      closed: true
    })
  for (const c of sec.sidewalks)
    push({
      kind: 'path',
      role: 'lop_phu',
      partId: c.partId,
      points: c.poly.map(P),
      closed: true
    })
  if (sec.dividerTop)
    push({
      kind: 'path',
      role: 'ghi_chu',
      partId: 'dai_phan_cach',
      points: sec.dividerTop.map(P)
    })
  // Earth shoulder pieces and slopes are one outline per side.
  push({
    kind: 'path',
    role: 'ghi_chu',
    partId: 'nen_duong_trai',
    points: sec.nen[-1].map(P)
  })
  push({
    kind: 'path',
    role: 'ghi_chu',
    partId: 'nen_duong_phai',
    points: sec.nen[1].map(P)
  })
  if (sec.groundDashed)
    push({
      kind: 'path',
      role: 'ghi_chu',
      partId: 'mat_dat_tu_nhien',
      points: sec.groundDashed.map(P),
      lineType: 'DASHED'
    })
  // Centreline through the section, stopping under the first dimension row.
  const yBottom = P([0, sec.yMin])[1]
  push({
    kind: 'path',
    role: 'duong_tim',
    partId: 'tim_duong',
    points: [
      [cx, yBottom - 500],
      [cx, yTopSec + 600]
    ],
    lineType: 'CENTER'
  })
  push({
    kind: 'text',
    role: 'duong_tim',
    partId: 'tim_duong',
    at: [cx, yBottom - 500 - 1.25 * H_LABEL],
    text: 'TIM ĐƯỜNG',
    height: H_LABEL,
    align: 1
  })
  // Design level at the centreline, left of it.
  const cd = n('caoDoTim')
  const cdTop = Math.max(0, sec.dividerTop ? n('hBoViaPhanCach') : 0)
  push({
    kind: 'text',
    role: 'ghi_chu_cao_do',
    partId: 'cao_do_tim',
    // Above the slope labels (which sit 250 over the surface).
    at: [cx - 150, P([0, cdTop])[1] + 650],
    text: `CĐTK ${cd > 0 ? '+' : cd < 0 ? '−' : '±'}${Math.abs(cd).toFixed(3).replace('.', ',')}`,
    height: H_LABEL,
    align: 2
  })

  // Slope labels over each falling part of the carriageway, with an arrow
  // pointing downhill.
  const oneWay = String(v.kieuDoc) === 'mot_mai'
  const half = n('bPhanCach') > 0 ? n('bPhanCach') / 2 : 0
  const xh = sec.hardEdge
  const slopeLabel = (
    x: number,
    dir: -1 | 1,
    text: string,
    id: string,
    align: 0 | 1 | 2 = 1
  ) => {
    const [sx, sy] = P([x, roadSurfaceLevel(model, x)])
    const y = sy + 250
    push({
      kind: 'text',
      role: 'ghi_chu',
      partId: id,
      at: [sx, y],
      text,
      height: H_LABEL,
      align
    })
    const w = acTpGhiChuTextWidth(text, H_LABEL)
    const mid = align === 1 ? sx : align === 0 ? sx + w / 2 : sx - w / 2
    const ya = y - 120
    const a0 = mid - (dir * w) / 2,
      a1 = mid + (dir * w) / 2
    push({
      kind: 'path',
      role: 'ghi_chu',
      partId: id,
      points: [
        [a0, ya],
        [a1, ya]
      ]
    })
    push({
      kind: 'path',
      role: 'ghi_chu',
      partId: id,
      points: [
        [a1 - dir * 150, ya + 50],
        [a1, ya],
        [a1 - dir * 150, ya - 50]
      ]
    })
  }
  const iMat = `i = ${pct(n('iMat'))}`
  if (oneWay) slopeLabel(xh / 2, 1, iMat, 'doc_ngang_mat')
  else {
    slopeLabel(-(half + xh) / 2, -1, iMat, 'doc_ngang_mat_trai')
    slopeLabel((half + xh) / 2, 1, iMat, 'doc_ngang_mat_phai')
  }
  // Earth shoulders / sidewalks: labelled just outside the roadbed edge,
  // clear of the extension lines over the bands.
  for (const s of [-1, 1] as const) {
    const name = s < 0 ? 'trai' : 'phai'
    const e = P(sec.edge[s])
    let text: string | undefined
    let dir: -1 | 1 = s
    if (v.coBoVia === true && n('bHe') > n('bBoVia')) {
      text = `i = ${pct(n('iHe'))}`
      dir = s === 1 ? -1 : 1
    } else if (v.coBoVia !== true && n('bLeDat') > 0)
      text = `i = ${pct(n('iLeDat'))}`
    if (!text) continue
    const w = acTpGhiChuTextWidth(text, H_LABEL)
    // A sidewalk carries its label over itself; an earth shoulder, being
    // narrow, just outside the roadbed edge.
    const walk = sec.sidewalks.find(c => c.partId === `he_${name}`)
    let x = e[0] + s * (300 + w / 2)
    let y = e[1]
    if (walk) {
      const [a, b] = [P(walk.poly[0]), P(walk.poly[1])]
      x = (a[0] + b[0]) / 2
      y = Math.max(a[1], b[1])
    }
    push({
      kind: 'text',
      role: 'ghi_chu',
      partId: `doc_ngang_le_${name}`,
      at: [x, y + 250],
      text,
      height: H_LABEL,
      align: 1
    })
    const ya = y + 130
    push({
      kind: 'path',
      role: 'ghi_chu',
      partId: `doc_ngang_le_${name}`,
      points: [
        [x - (dir * w) / 2, ya],
        [x + (dir * w) / 2, ya]
      ]
    })
    push({
      kind: 'path',
      role: 'ghi_chu',
      partId: `doc_ngang_le_${name}`,
      points: [
        [x + (dir * w) / 2 - dir * 150, ya + 50],
        [x + (dir * w) / 2, ya],
        [x + (dir * w) / 2 - dir * 150, ya - 50]
      ]
    })
  }
  // Slope ratio along each batter, outside it.
  for (const sl of sec.slopes) {
    const a = P(sl.from),
      b = P(sl.to)
    let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
    if (ang > 90) ang -= 180
    if (ang <= -90) ang += 180
    const mx = (a[0] + b[0]) / 2,
      my = (a[1] + b[1]) / 2
    // Normal pointing away from the roadbed (outwards and up for a fill).
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    let nx = -(b[1] - a[1]) / len,
      ny = (b[0] - a[0]) / len
    if (nx * sl.side < 0) {
      nx = -nx
      ny = -ny
    }
    const ratio = `1:${num(n('mMai'))}`
    const wr = acTpGhiChuTextWidth(ratio, H_LABEL)
    const partId = `mai_ta_luy_${sl.side < 0 ? 'trai' : 'phai'}`
    // A batter shorter than its label (low fill, small scale) would push it
    // into the shoulder label: it goes flat on the ground past the toe.
    if (len < wr + 600)
      push({
        kind: 'text',
        role: 'ghi_chu',
        partId,
        at: [b[0] + sl.side * (300 + wr / 2), b[1] + 100],
        text: ratio,
        height: H_LABEL,
        align: 1
      })
    else
      push({
        kind: 'text',
        role: 'ghi_chu',
        partId,
        at: [mx + nx * 200, my + ny * 200],
        text: ratio,
        height: H_LABEL,
        rotation: ang,
        align: 1
      })
  }

  // ------------------------------------------------------- dimension rows
  const dimY = yTopSec + 100
  const rows: { offset: number; segs: { x0: number; x1: number }[] }[] = []
  rows.push({
    offset: 900,
    segs: model.bands.map(b => ({ x0: b.x0, x1: b.x1 }))
  })
  const carriage = model.bands.filter(
    b => b.kind === 'lan' || b.kind === 'phan_cach'
  )
  const outerL = model.bands.filter(b => b.x1 <= carriage[0].x0 + 1e-6)
  const outerR = model.bands.filter(
    b => b.x0 >= carriage[carriage.length - 1].x1 - 1e-6
  )
  const row2: { x0: number; x1: number }[] = []
  if (outerL.length)
    row2.push({ x0: outerL[0].x0, x1: outerL[outerL.length - 1].x1 })
  if (carriage.length)
    row2.push({ x0: carriage[0].x0, x1: carriage[carriage.length - 1].x1 })
  if (outerR.length)
    row2.push({ x0: outerR[0].x0, x1: outerR[outerR.length - 1].x1 })
  if (row2.length > 1 && row2.length < rows[0].segs.length)
    rows.push({ offset: 1700, segs: row2 })
  const bandsX0 = model.bands[0].x0,
    bandsX1 = model.bands[model.bands.length - 1].x1
  rows.push({
    offset: 900 + rows.length * 800,
    segs: [{ x0: bandsX0, x1: bandsX1 }]
  })
  rows.forEach((row, r) => {
    let raised = 0
    row.segs.forEach((seg, i) => {
      const x0 = cx + seg.x0 * f,
        x1 = cx + seg.x1 * f
      const value = Math.round(seg.x1 - seg.x0)
      const w = acTpGhiChuTextWidth(roadMm(value).replace(/\s/g, ''), DIM_TEXT)
      // Too narrow for its number: lifted over the line, alternately.
      const textAt: XY | undefined =
        x1 - x0 < w + 100
          ? [
              (x0 + x1) / 2,
              dimY + row.offset + 60 + DIM_TEXT / 2 + 250 * (1 + (raised++ % 2))
            ]
          : undefined
      push({
        kind: 'dimension',
        role: 'kich_thuoc',
        partId: `kich_thuoc_hang${r + 1}_${i + 1}`,
        start: [x0, dimY],
        end: [x1, dimY],
        offset: row.offset,
        direction: 'ngang',
        dimStyle: DIM_STYLE,
        overrides: dimOv,
        value,
        ...(textAt ? { textAt } : {})
      })
    })
  })
  const lastRowTop = dimY + rows[rows.length - 1].offset + 900
  // Title and scale above the dimensions.
  push({
    kind: 'text',
    role: 'tieu_de_ban_ve',
    partId: 'tieu_de_mat_cat',
    at: [cx, Math.max(lastRowTop, top - 1000) + 500],
    text: String(v.tenHinh),
    height: H_TITLE,
    align: 1
  })
  push({
    kind: 'text',
    role: 'tieu_de_ban_ve',
    partId: 'tieu_de_mat_cat',
    at: [cx, Math.max(lastRowTop, top - 1000) + 500 - 550],
    text: `(TL: 1/${tiLe})`,
    height: H_SCALE,
    align: 1
  })

  // ---------------------------------------------- pavement build-up detail
  const dX0 = A.x1 - DETAIL_W
  const colTop = top - 2000
  const maxH = 110 * K
  const tiLeChiTiet =
    ROAD_DETAIL_SCALES.find(s => (model.tAoDuong * K) / s <= maxH) ??
    ROAD_DETAIL_SCALES[ROAD_DETAIL_SCALES.length - 1]
  const fd = K / tiLeChiTiet
  const colX0 = dX0 + 2200,
    colX1 = colX0 + 2200
  push({
    kind: 'text',
    role: 'tieu_de_ban_ve',
    partId: 'tieu_de_ket_cau',
    at: [dX0 + DETAIL_W / 2, top + 500],
    text: 'KẾT CẤU ÁO ĐƯỜNG',
    height: H_TITLE * 0.8,
    align: 1
  })
  push({
    kind: 'text',
    role: 'tieu_de_ban_ve',
    partId: 'tieu_de_ket_cau',
    at: [dX0 + DETAIL_W / 2, top - 50],
    text: `(TL: 1/${tiLeChiTiet})`,
    height: H_SCALE,
    align: 1
  })
  let yCur = colTop
  const mids: number[] = []
  const dimOvD = scaledDim(fd)
  let raisedV = 0
  model.layers.forEach((l, i) => {
    const h = l.day * fd
    const loop: XY[] = [
      [colX0, yCur],
      [colX1, yCur],
      [colX1, yCur - h],
      [colX0, yCur - h]
    ]
    push({
      kind: 'path',
      role: 'lop_phu',
      partId: `lop_ao_duong_${i + 1}`,
      points: loop,
      closed: true
    })
    const pat = roadLayerPattern(l.ten)
    push({
      kind: 'fill',
      role: 'lop_phu',
      partId: `lop_ao_duong_${i + 1}`,
      loop,
      pattern: pat.pattern,
      patternScale: 40,
      patternAngle: pat.angle
    })
    const w = acTpGhiChuTextWidth(roadMm(l.day).replace(/\s/g, ''), DIM_TEXT)
    push({
      kind: 'dimension',
      role: 'kich_thuoc',
      partId: `kich_thuoc_lop_${i + 1}`,
      start: [colX0, yCur],
      end: [colX0, yCur - h],
      offset: -500,
      direction: 'dung',
      dimStyle: DIM_STYLE,
      overrides: dimOvD,
      value: Math.round(l.day),
      ...(h < w + 100
        ? {
            textAt: [
              colX0 - 500 - 60 - DIM_TEXT / 2 - 300 * (1 + (raisedV++ % 2)),
              yCur - h / 2
            ] as XY
          }
        : {})
    })
    mids.push(yCur - h / 2)
    yCur -= h
  })
  push({
    kind: 'dimension',
    role: 'kich_thuoc',
    partId: 'kich_thuoc_tong_ao_duong',
    start: [colX0, colTop],
    end: [colX0, yCur],
    offset: -1700,
    direction: 'dung',
    dimStyle: DIM_STYLE,
    overrides: dimOvD,
    value: Math.round(model.tAoDuong)
  })
  // Labels right of the column, spread at least 1.75 × height apart, each
  // with a leader to its layer.
  const gapY = 1.75 * H_LABEL
  const ys: number[] = []
  mids.forEach((m, i) => ys.push(i ? Math.min(m, ys[i - 1] - gapY) : m))
  const labelX = colX1 + 600
  const avail = A.x1 - 200 - labelX
  model.layers.forEach((l, i) => {
    const text = `${i + 1}. ${l.ten} — ${num(l.day / 10, 1)} cm`
    const w = acTpGhiChuTextWidth(text, H_LABEL)
    const wf = w > avail ? Math.max(0.4, avail / w) : undefined
    const y = ys[i]
    push({
      kind: 'path',
      role: 'ghi_chu',
      partId: `nhan_lop_${i + 1}`,
      points: [
        [colX1 - 300, mids[i]],
        [colX1 + 300, y],
        [labelX - 100, y]
      ]
    })
    push({
      kind: 'text',
      role: 'ghi_chu',
      partId: `nhan_lop_${i + 1}`,
      at: [labelX, y - 0.4 * H_LABEL],
      text,
      height: H_LABEL,
      ...(wf ? { widthFactor: wf } : {})
    })
  })
  const below = Math.min(yCur, ys[ys.length - 1] - H_LABEL) - 700
  push({
    kind: 'text',
    role: 'ghi_chu',
    partId: 'tong_ao_duong',
    at: [dX0 + 600, below],
    text: `Tổng bề dày áo đường: ${num(model.tAoDuong / 10, 1)} cm`,
    height: H_LABEL
  })

  // --------------------------------------------------------------- frame
  const frame = frameFor(tiLe)
  for (const p of frame.primitives) {
    const partId = p.partId
    if (p.kind === 'path')
      push({
        kind: 'path',
        role: p.role,
        partId,
        points: p.points.map(([x, y]) => [x * K, y * K] as XY),
        closed: p.closed
      })
    else
      push({
        kind: 'text',
        role: p.role,
        partId,
        at: [p.at[0] * K, p.at[1] * K],
        text: p.text,
        height: p.height * K,
        align: p.align,
        widthFactor: p.widthFactor
      })
  }

  // ---------------------------------------------------------------- notes
  const notes = [
    'Kích thước ghi bằng mm, cao độ bằng m.',
    'Bản vẽ cấu tạo mặt cắt ngang theo thông số kỹ sư nhập; không kiểm cường độ kết cấu áo đường, không tính khối lượng đào đắp.',
    `Dốc ngang mặt đường và lề gia cố ${pct(n('iMat'))}${String(v.loaiDuong) === 'do_thi' ? ' (TCVN 13592:2022 đ.9.2.5 Bảng 12)' : ' (TCVN 4054:2005 đ.4.9 Bảng 9)'}.`,
    'Tầng móng vẽ cùng bề rộng tầng mặt (chưa mở rộng 20 cm mỗi bên theo TCVN 4054 đ.8.3.6); rãnh dọc, gia cố mái chưa vẽ.',
    'Mặt đất tự nhiên vẽ nằm ngang; tim đường ghi cao độ thiết kế.'
  ]
  const obstacles = prims
    .map(primitiveBox)
    .filter(
      (b): b is AcTpNoteBox => !!b && !(b.x0 <= A.x0 + 1 && b.x1 >= A.x1 - 1)
    )
  const layout = acTpLayoutGhiChuBlock(notes, {
    obstacles,
    textHeight: H_NOTE,
    width: 140 * K,
    at: { x: A.x0 + 500, y: A.y0 + 500 },
    corner: 'bottom-left',
    bounds: A
  })
  for (const line of layout?.lines ?? [])
    push({
      kind: 'text',
      role: 'ghi_chu',
      partId:
        line.note < 0
          ? 'ghi_chu_tieu_de'
          : `ghi_chu_${String(line.note + 1).padStart(2, '0')}`,
      at: [line.x, line.y],
      text: line.text,
      height: line.height
    })

  return {
    id: ROAD_ID,
    version: ROAD_VERSION,
    width: 420 * K,
    height: 297 * K,
    origin: [n('x'), n('y')],
    tiLe,
    tiLeChiTiet,
    primitives: prims,
    ghiChuNgoaiKhung: !!layout?.outside
  }
}

/** Draws the sheet through the template context. */
export function drawRoadScene(ctx: AcTpDrawContext, scene: RoadScene): void {
  const at = ([x, y]: XY) => ({
    x: scene.origin[0] + x,
    y: scene.origin[1] + y,
    z: 0
  })
  for (const p of scene.primitives) {
    const tag = {
      role: p.role,
      partId: p.partId,
      ...(p.lineType ? { lineType: p.lineType } : {}),
      params: { template: ROAD_ID, tiLe: scene.tiLe }
    }
    if (p.kind === 'path')
      ctx.polyline({ ...tag, points: p.points.map(at), closed: p.closed })
    else if (p.kind === 'fill')
      ctx.hatch({
        ...tag,
        boundary: p.loop.map(at),
        patternName: p.pattern,
        patternScale: p.patternScale,
        patternAngleDeg: p.patternAngle
      })
    else if (p.kind === 'text')
      ctx.text({
        ...tag,
        position: at(p.at),
        text: p.text,
        height: p.height,
        rotationDeg: p.rotation,
        align: p.align ?? 0,
        widthFactor: p.widthFactor
      })
    else
      ctx.dimension({
        ...tag,
        start: at(p.start),
        end: at(p.end),
        offset: p.offset,
        huong: p.direction,
        dimStyle: p.dimStyle,
        overrides: p.overrides,
        ...(p.textAt ? { textPosition: at(p.textAt) } : {})
      })
  }
}
