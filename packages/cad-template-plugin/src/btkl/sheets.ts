/**
 * The take-off as A3 drawing sheets: a five-column table drawn with LINE and
 * TEXT in the manner of the source's SUB-100 tables (`_33_Arial`, white grid
 * and values, parts in green, flags in red), inside the office frame and
 * title block. Rows that do not fit go on to the next sheet, which repeats
 * the header.
 *
 * Pure: returns primitives in sheet units (paper mm × {@link BTKL_SCALE});
 * `drawBtklSheets` puts them in a database.
 */
import {
  acTpBuildDrawingFrame,
  type AcTpDrawContext,
  acTpEstimateTextWidth
} from '@mlightcad/cad-template-sdk'

import type { AcTpBtklItem, AcTpBtklResult } from './types'
import { acTpBtklExplain } from './workbook'

/** Sheet units per paper millimetre: A3 is 42 000 × 29 700, as the dossier. */
export const BTKL_SCALE = 100
const K = BTKL_SCALE
/** Gap between sheets laid side by side, sheet units. */
const GAP = 5000

type XY = [number, number]
/** One stroke or text of a BTKL sheet, sheet units from its lower-left. */
export type AcTpBtklPrimitive =
  | { kind: 'line'; role: string; color?: number; a: XY; b: XY }
  | {
      kind: 'path'
      role: string
      color?: number
      points: XY[]
      closed?: boolean
    }
  | {
      kind: 'text'
      role: string
      color?: number
      at: XY
      text: string
      height: number
      align: 0 | 1 | 2
      widthFactor?: number
      style?: string
    }

export interface AcTpBtklSheet {
  /** `BTKL-01`, … */
  id: string
  /** Lower-left corner in the drawing. */
  origin: XY
  width: number
  height: number
  primitives: AcTpBtklPrimitive[]
}

/** Title-block and heading data. */
export interface AcTpBtklSheetMeta {
  duAn?: string
  congTrinh?: string
  ngay?: string
  donVi?: string
  chuTri?: string
  thietKe?: string
  kiemTra?: string
  duyet?: string
  /** Lower-left of the first sheet, drawing units. */
  x?: number
  y?: number
}

// ---- Table geometry, paper mm ------------------------------------------
const TEXT = 1.8
const HEAD_TEXT = 2.0
const LINE = 3.0
const PAD = 1.0
const MIN_ROW = 4.6
const HEAD_ROW = 7
const STYLE = '_33_Arial'
/** STT · Hạng mục · Đơn vị · Khối lượng; Diễn giải takes the rest. */
const FIXED = [12, 88, 14, 28]
const HEADERS = [
  'STT',
  'Hạng mục',
  'Đơn vị',
  'Khối lượng',
  'Diễn giải công thức'
]
const NOTES = [
  'Ghi chú:',
  '- Khối lượng làm tròn 3 chữ số thập phân; diễn giải ghi trị số của chính hồ sơ (m).',
  '- "Bảng SUB-100 bản gốc": dòng lấy nguyên số của bản vẽ gốc khi hình học còn là mẫu M1; hình học đổi thì không tính.',
  '- Thép: kg/m theo bảng thống kê của bản gốc; thanh không có trong bảng gốc dùng d² × 0,00617. Thống kê từng thanh: tờ SUB-100 của hồ sơ và sheet "Thép chi tiết" của tệp xlsx.',
  '- [!]: cờ cần kỹ sư xem (lệch bảng gốc, mâu thuẫn hình/bảng chưa chốt).'
]
const UNIT: Record<AcTpBtklItem['donVi'], string> = {
  m3: 'm³',
  m2: 'm²',
  m: 'm',
  kg: 'kg',
  cái: 'cái',
  hộp: 'hộp'
}

/** Colours, as the SUB-100 tables: white grid, text and values; parts green. */
const C = { grid: 7, text: 7, value: 7, part: 3, flag: 1, note: 8 }

/** Splits `text` into lines no wider than `width` at `height`. */
export function acTpBtklWrap(
  text: string,
  width: number,
  height = TEXT
): string[] {
  const fits = (s: string) => acTpEstimateTextWidth(s, height) <= width
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (fits(next)) {
      line = next
      continue
    }
    if (line) out.push(line)
    // A word wider than the column is cut by characters.
    let rest = word
    while (!fits(rest)) {
      let k = rest.length - 1
      while (k > 1 && !fits(rest.slice(0, k))) k--
      out.push(rest.slice(0, k))
      rest = rest.slice(k)
    }
    line = rest
  }
  if (line || !out.length) out.push(line)
  return out
}

const fixed3 = (v: number) => {
  const [i, f] = (Math.round(v * 1000) / 1000).toFixed(3).split('.')
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${f}`
}

/** One table row before layout: wrapped cell lines and their colours. */
interface Row {
  cells: { lines: string[]; color: number; align: 0 | 1 | 2 }[]
  /** Extra red lines under the explanation (flags, refusals). */
  flags: string[]
  height: number
}

function rowsOf(results: AcTpBtklResult[], widths: number[]): Row[] {
  const w = (k: number) => widths[k] - 2 * PAD
  const make = (
    cells: [string, number, 0 | 1 | 2][],
    flags: string[] = []
  ): Row => {
    const wrapped = cells.map(([text, color, align], k) => ({
      lines: text ? acTpBtklWrap(text, w(k)) : [''],
      color,
      align
    }))
    const flagLines = flags.flatMap(f => acTpBtklWrap(f, w(4)))
    const n = Math.max(
      ...wrapped.map(c => c.lines.length),
      (wrapped[4].lines[0] ? wrapped[4].lines.length : 0) + flagLines.length
    )
    return {
      cells: wrapped,
      flags: flagLines,
      height: Math.max(MIN_ROW, n * LINE + 1.6)
    }
  }
  const rows: Row[] = []
  for (const r of results) {
    rows.push(
      make([
        ['', C.part, 1],
        [r.doiTuong.toUpperCase(), C.part, 0],
        ['', C.text, 1],
        ['', C.text, 2],
        ['', C.text, 0]
      ])
    )
    if (r.errors.length) {
      rows.push(
        make(
          [
            ['', C.text, 1],
            ['Không lập được bảng khối lượng', C.text, 0],
            ['', C.text, 1],
            ['', C.text, 2],
            ['', C.text, 0]
          ],
          r.errors.map(e => `[!] ${e}`)
        )
      )
      continue
    }
    for (const item of r.items) {
      const note = item.nhom === 'ghi_chu'
      const strong = item.laTong || !item.stt.includes('.')
      const base = note ? C.note : C.text
      const refused = item.nguon === 'tu_choi'
      const explain = refused
        ? ''
        : acTpBtklExplain({ ...item, flags: undefined })
      const flags = [
        ...(refused ? [`Không tính: ${item.lyDo ?? ''}`] : []),
        ...(item.flags ?? []).map(f => `[!] ${f.message}`)
      ]
      rows.push(
        make(
          [
            [item.stt, base, 1],
            [item.hangMuc, strong && !note ? C.part : base, 0],
            [UNIT[item.donVi], base, 1],
            [
              item.khoiLuong === null ? '—' : fixed3(item.khoiLuong),
              note ? C.note : item.khoiLuong === null ? C.text : C.value,
              item.khoiLuong === null ? 1 : 2
            ],
            [explain, base, 0]
          ],
          flags
        )
      )
    }
  }
  return rows
}

/**
 * The BTKL sheets for `results`: as many A3 sheets as the rows need, laid
 * side by side from (`meta.x`, `meta.y`).
 */
export function acTpBtklSheets(
  results: AcTpBtklResult[],
  meta: AcTpBtklSheetMeta = {}
): AcTpBtklSheet[] {
  if (!results.length) throw new Error('Chưa có đối tượng nào để lập BTKL.')
  const probe = acTpBuildDrawingFrame({ khoGiay: 'A3', truong: {} })
  const area = probe.drawArea
  const left = area.x + 5
  const right = area.x + area.w - 5
  const widths = [...FIXED, right - left - FIXED.reduce((s, v) => s + v, 0)]
  const xs = widths.reduce<number[]>(
    (a, v) => [...a, a[a.length - 1] + v],
    [left]
  )
  const top = area.y + area.h - 5
  const tableTop = top - 16
  const bottom = area.y + 4
  const rows = rowsOf(results, widths)
  const notesHeight = NOTES.length * LINE + 3

  // Paginate: header on every sheet, the notes after the last row.
  const pages: Row[][] = [[]]
  let y = tableTop - HEAD_ROW
  for (const row of rows) {
    if (y - row.height < bottom && pages[pages.length - 1].length) {
      pages.push([])
      y = tableTop - HEAD_ROW
    }
    pages[pages.length - 1].push(row)
    y -= row.height
  }
  const notesOnNewPage = y - notesHeight < bottom
  if (notesOnNewPage) pages.push([])

  const name = results.map(r => r.doiTuong).join(', ')
  const x0 = meta.x ?? 0
  const y0 = meta.y ?? 0
  return pages.map((page, index) => {
    const id = `BTKL-${String(index + 1).padStart(2, '0')}`
    const prims: AcTpBtklPrimitive[] = []
    const P = (p: XY): XY => [p[0] * K, p[1] * K]
    const text = (
      at: XY,
      s: string,
      height: number,
      align: 0 | 1 | 2,
      color: number,
      role = 'ghi_chu'
    ) =>
      prims.push({
        kind: 'text',
        role,
        color,
        at: P(at),
        text: s,
        height: height * K,
        align,
        style: STYLE
      })
    const line = (a: XY, b: XY) =>
      prims.push({
        kind: 'line',
        role: 'ghi_chu',
        color: C.grid,
        a: P(a),
        b: P(b)
      })

    // Heading.
    const mid = (left + right) / 2
    text(
      [mid, top - 4],
      `%%UBẢNG TỔNG HỢP KHỐI LƯỢNG KẾT CẤU${index ? ' (TIẾP THEO)' : ''}`,
      3.5,
      1,
      C.text,
      'tieu_de_ban_ve'
    )
    text(
      [mid, top - 9],
      [
        meta.congTrinh ? `Công trình: ${meta.congTrinh}` : '',
        `Đối tượng: ${name}`
      ]
        .filter(Boolean)
        .join(' · '),
      2.2,
      1,
      C.text,
      'tieu_de_ban_ve'
    )

    // Header row.
    let yy = tableTop
    line([left, yy], [right, yy])
    HEADERS.forEach((h, k) =>
      text(
        [(xs[k] + xs[k + 1]) / 2, yy - HEAD_ROW / 2 - HEAD_TEXT / 2],
        h,
        HEAD_TEXT,
        1,
        C.text
      )
    )
    yy -= HEAD_ROW
    line([left, yy], [right, yy])

    // Body.
    for (const row of page) {
      const rowTop = yy
      row.cells.forEach((cell, k) => {
        const lines =
          k === 4 ? [...cell.lines.filter(Boolean), ...row.flags] : cell.lines
        const block = lines.length * LINE - (LINE - TEXT)
        let base = rowTop - (row.height - block) / 2 - TEXT
        const plain = k === 4 ? cell.lines.filter(Boolean).length : lines.length
        lines.forEach((s, i) => {
          const at: XY = [
            cell.align === 0
              ? xs[k] + PAD
              : cell.align === 1
                ? (xs[k] + xs[k + 1]) / 2
                : xs[k + 1] - PAD,
            base
          ]
          if (s) text(at, s, TEXT, cell.align, i < plain ? cell.color : C.flag)
          base -= LINE
        })
      })
      yy -= row.height
      line([left, yy], [right, yy])
    }
    for (const x of xs) line([x, tableTop], [x, yy])

    // Notes after the last row.
    if (index === pages.length - 1) {
      let ny = (notesOnNewPage ? tableTop - HEAD_ROW : yy) - 4
      for (const s of NOTES) {
        text([left, ny], s, TEXT, 0, C.text)
        ny -= LINE
      }
    }

    // Frame and title block.
    const frame = acTpBuildDrawingFrame({
      khoGiay: 'A3',
      truong: {
        duAn: meta.duAn,
        congTrinh: meta.congTrinh,
        tenBanVe: 'BẢNG KHỐI LƯỢNG KẾT CẤU',
        soHieuTo: id,
        soTo: `${index + 1}/${pages.length}`,
        ngay: meta.ngay,
        giaiDoan: 'TKBVTC',
        donVi: meta.donVi,
        chuTri: meta.chuTri,
        thietKe: meta.thietKe,
        kiemTra: meta.kiemTra,
        duyet: meta.duyet,
        trangThai: 'BẢN NHÁP — CHƯA PHÁT HÀNH THI CÔNG'
      }
    })
    for (const p of frame.primitives)
      if (p.kind === 'path')
        prims.push({
          kind: 'path',
          role: p.role,
          points: p.points.map(P),
          closed: p.closed
        })
      else
        prims.push({
          kind: 'text',
          role: p.role,
          at: P(p.at),
          text: p.text,
          height: p.height * K,
          align: p.align,
          widthFactor: p.widthFactor
        })
    return {
      id,
      origin: [x0 + index * (frame.width * K + GAP), y0],
      width: frame.width * K,
      height: frame.height * K,
      primitives: prims
    }
  })
}

/** Draws BTKL sheets: one part per role and sheet, tagged with the sheet. */
export function drawBtklSheets(
  ctx: AcTpDrawContext,
  sheets: AcTpBtklSheet[]
): void {
  for (const s of sheets) {
    const at = (p: XY) => ({
      x: s.origin[0] + p[0],
      y: s.origin[1] + p[1],
      z: 0
    })
    for (const p of s.primitives) {
      const tag = {
        role: p.role,
        partId: `${p.role}_${s.id}`,
        ...(p.color !== undefined ? { color: p.color } : {}),
        params: { sheet: s.id }
      }
      if (p.kind === 'line') ctx.line({ ...tag, start: at(p.a), end: at(p.b) })
      else if (p.kind === 'path')
        ctx.polyline({ ...tag, points: p.points.map(at), closed: p.closed })
      else
        ctx.text({
          ...tag,
          position: at(p.at),
          text: p.text,
          height: p.height,
          align: p.align,
          widthFactor: p.widthFactor,
          ...(p.style ? { style: p.style } : {})
        })
    }
  }
}
