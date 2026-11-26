/**
 * The GHI CHÚ block: warnings and notes a generator writes on a drawing,
 * gathered in one place that covers nothing.
 *
 * Templates used to drop each warning at a fixed point — "under the pile
 * tips", "top left of the viewport" — and on a sheet laid out differently the
 * text landed on the dimension chain, the section marks or the bars (user
 * t54u: «chữ đỏ đè lên các thành phần khác»). Here the notes are wrapped to
 * the block's width, given a `GHI CHÚ` heading, and the block is moved until
 * its box clears every box already on the drawing. It never comes back in a
 * place that still overlaps: when nothing near the preferred place is free,
 * it goes outside the drawing's extents.
 *
 * Sizes follow the data model's TEXT extents (one text height per character,
 * baseline to cap height), so a block found clear here is clear in
 * `geometricExtents` too; the descender band is added on top.
 */
import type { AcDbEntity } from '@mlightcad/data-model'

import type { AcTpDrawContext } from './AcTpDrawContext'
import { formatPartId } from './AcTpPartId'

/** An axis-aligned box, drawing units. */
export interface AcTpNoteBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** A point, drawing units. */
export interface AcTpNotePoint {
  x: number
  y: number
}

/** One note of the block: its text, and optionally its own text height. */
export type AcTpGhiChuNote = string | { text: string; height?: number }

/** How to lay out and where to look for room. */
export interface AcTpGhiChuBlockOptions {
  /** Boxes the block must not overlap (texts, dimensions, shapes…). */
  obstacles: readonly AcTpNoteBox[]
  /**
   * Strokes the block must not be crossed by, checked segment by segment —
   * for borders and long lines whose box encloses free space (a sheet frame).
   */
  segments?: readonly (readonly [AcTpNotePoint, AcTpNotePoint])[]
  /** Text height of the notes. Default 200. */
  textHeight?: number
  /** Heading; `null` for none. Default `GHI CHÚ`. */
  title?: string | null
  /** Heading height. Default 1.25 × `textHeight`. */
  titleHeight?: number
  /** Width the notes wrap to. Default 36 × `textHeight`. */
  width?: number
  /** Baseline to baseline, in text heights. Default 1.6. */
  lineSpacing?: number
  /** Prefix each note with `1.`, `2.`… Default true. */
  numbered?: boolean
  /** Preferred place of the block's `corner`. Default: right of the extents. */
  at?: AcTpNotePoint
  /** Which corner of the block `at` names. Default `top-left`. */
  corner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  /** Room the search stays in (a sheet's drawing area); the fallback may leave it. */
  bounds?: AcTpNoteBox
  /** Clearance kept from every obstacle. Default 1 × `textHeight`. */
  gap?: number
  /** Search step. Default 2 × `textHeight`. */
  step?: number
  /** Search reach, in steps each way. Default 60. */
  maxSteps?: number
}

/** One TEXT of the block, left-aligned on its baseline. */
export interface AcTpGhiChuLine {
  text: string
  /** Baseline start. */
  x: number
  y: number
  height: number
  /** Index of the note it belongs to; −1 for the heading. */
  note: number
  /** Box the line occupies (descenders included). */
  box: AcTpNoteBox
}

/** The block as placed. */
export interface AcTpGhiChuLayout {
  lines: AcTpGhiChuLine[]
  /** Box of every line together. */
  box: AcTpNoteBox
  /** True when no room was found near `at` and the block went outside. */
  outside: boolean
}

/** Heading of the block. */
export const ACTP_GHI_CHU_TITLE = 'GHI CHÚ'

// AutoCAD escapes are one glyph: `%%U` (underline), `%%c` (Ø), `%%%`
// (a literal %), `%%nnn` (character code). A line is never cut inside one.
const TOKEN = /%%\d{3}|%%[^\s]|[\s\S]/g

/** Characters as the data model counts them (it does not read escapes). */
const charCount = (text: string) => [...text].length

/**
 * Width of a one-line TEXT as the data model sizes its extents: one text
 * height a character, never less than one height.
 */
export function acTpGhiChuTextWidth(
  text: string,
  height: number,
  widthFactor = 1
): number {
  return Math.max(height, charCount(text) * height * Math.abs(widthFactor))
}

/** Box of a left-aligned TEXT on baseline `(x, y)`, descenders included. */
export function acTpGhiChuLineBox(
  x: number,
  y: number,
  text: string,
  height: number,
  widthFactor = 1
): AcTpNoteBox {
  return {
    x0: x,
    y0: y - 0.3 * height,
    x1: x + acTpGhiChuTextWidth(text, height, widthFactor),
    y1: y + 1.25 * height
  }
}

/** Whether two boxes share an area (touching edges do not count). */
export function acTpBoxesOverlap(a: AcTpNoteBox, b: AcTpNoteBox): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
}

/** Whether the segment a–b passes through the inside of the box. */
export function acTpSegmentCrossesBox(
  a: AcTpNotePoint,
  b: AcTpNotePoint,
  r: AcTpNoteBox
): boolean {
  // Liang–Barsky on the open box: a stroke along an edge does not cross.
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  for (const [p, q] of [
    [-dx, a.x - r.x0],
    [dx, r.x1 - a.x],
    [-dy, a.y - r.y0],
    [dy, r.y1 - a.y]
  ]) {
    if (p === 0) {
      if (q <= 0) return false
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 >= t1) return false
  }
  return true
}

/**
 * Splits one note into lines no wider than `width` (as
 * {@link acTpGhiChuTextWidth} measures), at spaces. A word wider than the
 * line is cut between characters, never inside an AutoCAD `%%` escape.
 */
export function acTpWrapGhiChu(
  text: string,
  width: number,
  height: number,
  widthFactor = 1
): string[] {
  const fits = (t: string) =>
    acTpGhiChuTextWidth(t, height, widthFactor) <= width
  const lines: string[] = []
  let current = ''
  const pushWord = (word: string) => {
    if (fits(word)) {
      current = word
      return
    }
    let piece = ''
    for (const token of word.match(TOKEN) ?? []) {
      if (piece && !fits(piece + token)) {
        lines.push(piece)
        piece = ''
      }
      piece += token
    }
    current = piece
  }
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word
    if (fits(next)) {
      current = next
      continue
    }
    if (current) lines.push(current)
    current = ''
    pushWord(word)
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

const unionOf = (boxes: readonly AcTpNoteBox[]): AcTpNoteBox | undefined =>
  boxes.length
    ? {
        x0: Math.min(...boxes.map(b => b.x0)),
        y0: Math.min(...boxes.map(b => b.y0)),
        x1: Math.max(...boxes.map(b => b.x1)),
        y1: Math.max(...boxes.map(b => b.y1))
      }
    : undefined

const finite = (b: AcTpNoteBox) =>
  [b.x0, b.y0, b.x1, b.y1].every(Number.isFinite)

const searchOrders = new Map<number, [number, number][]>()
/**
 * Grid offsets within `reach` steps, nearest first; on a tie, the one lower
 * and further right (towards the title block) — a stable order, so the same
 * drawing always gives the same block.
 */
function searchOrder(reach: number): [number, number][] {
  const cached = searchOrders.get(reach)
  if (cached) return cached
  const offsets: [number, number][] = []
  for (let i = -reach; i <= reach; i++)
    for (let j = -reach; j <= reach; j++) offsets.push([i, j])
  offsets.sort(
    (p, q) =>
      Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]) ||
      p[1] - q[1] ||
      q[0] - p[0]
  )
  searchOrders.set(reach, offsets)
  return offsets
}

/**
 * Lays out the GHI CHÚ block and finds it a place that overlaps nothing.
 *
 * The block is tried at `at`, then at the nearest free offset on a grid of
 * `step` around it (inside `bounds` when given); when none is free within
 * `maxSteps`, it goes just below everything (outside the extents), which is
 * always free. The result never overlaps an obstacle box (with `gap` kept)
 * nor is crossed by a segment.
 *
 * @returns The lines with their places, or `undefined` for no notes.
 */
export function acTpLayoutGhiChuBlock(
  notes: readonly AcTpGhiChuNote[],
  options: AcTpGhiChuBlockOptions
): AcTpGhiChuLayout | undefined {
  const items = notes
    .map(n => (typeof n === 'string' ? { text: n } : n))
    .filter(n => n.text.trim())
  if (!items.length) return undefined
  const h = options.textHeight ?? 200
  const width = options.width ?? 36 * h
  const spacing = options.lineSpacing ?? 1.6
  const numbered = options.numbered ?? true
  const gap = options.gap ?? h
  const step = options.step ?? 2 * h
  const maxSteps = options.maxSteps ?? 60
  const title = options.title === undefined ? ACTP_GHI_CHU_TITLE : options.title

  // Lines relative to the block's top-left corner.
  const rel: Omit<AcTpGhiChuLine, 'box'>[] = []
  let y = 0
  if (title) {
    const th = options.titleHeight ?? 1.25 * h
    y -= th
    rel.push({ text: title, x: 0, y, height: th, note: -1 })
    y -= (spacing - 1) * th
  }
  items.forEach((item, index) => {
    const nh = item.height ?? h
    const prefix = numbered ? `${index + 1}. ` : ''
    const indent = prefix ? acTpGhiChuTextWidth(prefix, nh) : 0
    acTpWrapGhiChu(item.text, width - indent, nh).forEach((line, k) => {
      y -= k || rel.length ? spacing * nh : nh
      rel.push({
        text: k ? line : prefix + line,
        x: k ? indent : 0,
        y,
        height: nh,
        note: index
      })
    })
  })
  const boxAt = (x: number, top: number) => {
    const lines = rel.map(l => ({
      ...l,
      x: x + l.x,
      y: top + l.y,
      box: acTpGhiChuLineBox(x + l.x, top + l.y, l.text, l.height)
    }))
    return { lines, box: unionOf(lines.map(l => l.box))! }
  }
  const size = boxAt(0, 0).box
  // Box of the block whose top-left line origin is (x, top), without laying
  // out its lines: the search tries thousands of places.
  const shifted = (x: number, top: number): AcTpNoteBox => ({
    x0: x + size.x0,
    y0: top + size.y0,
    x1: x + size.x1,
    y1: top + size.y1
  })

  const obstacles = options.obstacles.filter(finite)
  const segments = options.segments ?? []
  const segmentBoxes = segments.map(([a, b]) => ({
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y)
  }))
  const extents = unionOf([...obstacles, ...segmentBoxes])

  // Obstacles bucketed on a coarse grid, so a place is checked against its
  // neighbours only (a sheet carries thousands of primitives).
  const cell = Math.max(step * 4, size.x1 - size.x0, size.y1 - size.y0, 1)
  const buckets = new Map<string, number[]>()
  const cellsOf = (b: AcTpNoteBox, visit: (key: string) => void) => {
    for (let i = Math.floor(b.x0 / cell); i <= Math.floor(b.x1 / cell); i++)
      for (let j = Math.floor(b.y0 / cell); j <= Math.floor(b.y1 / cell); j++)
        visit(`${i},${j}`)
  }
  const huge: number[] = []
  obstacles.forEach((o, k) => {
    // A box spanning many cells is cheaper checked every time.
    if ((o.x1 - o.x0) / cell + (o.y1 - o.y0) / cell > 16) huge.push(k)
    else
      cellsOf(o, key => {
        const list = buckets.get(key)
        if (list) list.push(k)
        else buckets.set(key, [k])
      })
  })
  const free = (box: AcTpNoteBox) => {
    const grown = {
      x0: box.x0 - gap,
      y0: box.y0 - gap,
      x1: box.x1 + gap,
      y1: box.y1 + gap
    }
    if (huge.some(k => acTpBoxesOverlap(grown, obstacles[k]))) return false
    let hit = false
    cellsOf(grown, key => {
      if (!hit)
        hit = !!buckets
          .get(key)
          ?.some(k => acTpBoxesOverlap(grown, obstacles[k]))
    })
    return (
      !hit && !segments.some(([a, b]) => acTpSegmentCrossesBox(a, b, grown))
    )
  }

  // Line origin of the block's top-left line for the preferred place.
  const corner = options.corner ?? 'top-left'
  const at = options.at ?? {
    x: (extents?.x1 ?? 0) + 2 * gap,
    y: extents?.y1 ?? 0
  }
  const left = corner.endsWith('right') ? at.x - size.x1 : at.x - size.x0
  const top = corner.startsWith('bottom') ? at.y - size.y0 : at.y - size.y1
  const bounds = options.bounds
  const inside = (box: AcTpNoteBox) =>
    !bounds ||
    (box.x0 >= bounds.x0 &&
      box.x1 <= bounds.x1 &&
      box.y0 >= bounds.y0 &&
      box.y1 <= bounds.y1)

  for (const [i, j] of searchOrder(maxSteps)) {
    const x = left + i * step
    const y = top + j * step
    const box = shifted(x, y)
    if (inside(box) && free(box)) return { ...boxAt(x, y), outside: false }
  }
  // Outside the extents: below everything, left-aligned with them.
  const below = boxAt(
    (extents ? extents.x0 : left) - size.x0,
    (extents ? extents.y0 : top + size.y0) - 2 * gap - size.y1
  )
  return { ...below, outside: true }
}

/** Extra options when the block is drawn through a draw context. */
export interface AcTpPlaceGhiChuOptions extends Omit<
  AcTpGhiChuBlockOptions,
  'obstacles'
> {
  /** Further boxes to avoid, beyond what the run has drawn. */
  obstacles?: readonly AcTpNoteBox[]
  /** Role of the texts. Default `ghi_chu`. */
  role?: string
  /** ACI colour of the texts. Default 1 (red), as warnings are drawn. */
  color?: number
  /**
   * First ordinal of the block's partIds: the heading takes it, note `i`
   * takes `firstOrdinal + 1 + i` (its wrapped lines share it). Default 1.
   */
  firstOrdinal?: number
}

/** Box of an entity, or undefined when it has none worth counting. */
function extentsOf(e: AcDbEntity): AcTpNoteBox | undefined {
  try {
    const b = e.geometricExtents
    const box = { x0: b.min.x, y0: b.min.y, x1: b.max.x, y1: b.max.y }
    return finite(box) ? box : undefined
  } catch {
    return undefined
  }
}

/**
 * Draws the GHI CHÚ block through `ctx`, clear of everything the run has
 * drawn so far — call it last, after shapes, dimensions, labels and section
 * marks. Each note is one part (`ghi_chu_NN`), whatever its line count.
 *
 * @returns The layout drawn, or `undefined` when there were no notes.
 */
export function acTpPlaceGhiChuBlock(
  ctx: AcTpDrawContext,
  notes: readonly AcTpGhiChuNote[],
  options: AcTpPlaceGhiChuOptions = {}
): AcTpGhiChuLayout | undefined {
  const drawn = ctx.drawn.map(extentsOf).filter((b): b is AcTpNoteBox => !!b)
  const layout = acTpLayoutGhiChuBlock(notes, {
    ...options,
    obstacles: [...drawn, ...(options.obstacles ?? [])]
  })
  if (!layout) return undefined
  const role = options.role ?? 'ghi_chu'
  const first = options.firstOrdinal ?? 1
  for (const line of layout.lines)
    ctx.text({
      role,
      partId: formatPartId({ role, ordinal: first + 1 + line.note }),
      params: { khoi: ACTP_GHI_CHU_TITLE },
      color: options.color ?? 1,
      position: { x: line.x, y: line.y, z: 0 },
      text: line.text,
      height: line.height
    })
  return layout
}
