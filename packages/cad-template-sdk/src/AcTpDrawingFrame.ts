/**
 * Drawing border and title block (khung bản vẽ + khung tên), A3 and A1.
 *
 * A pure layout: paper millimetres in, primitives out. Callers scale by the
 * drawing scale (1:100 → ×100) and draw with whatever they draw with — the
 * template draw context, the dossier scene, an SVG.
 *
 * The layout follows the office's TKBVTC sheets in `02. BTC- mo_2.dwg`. The
 * title block itself could not be extracted (it is an external reference that
 * is not in the file), so this is a clean layout built from what *was*
 * measurable there: an A3 sheet 420 × 297, a drawing area of about 384 × 253
 * starting 26 mm from the left and 36 mm from the bottom, i.e. a binding
 * margin of about 25 mm and a title strip of about 30–35 mm along the bottom,
 * with the project name, sheet title and sheet number at the right.
 * No standard is cited for these numbers: they are the office's convention.
 * Every dimension lives in {@link ACTP_FRAME_LAYOUTS}.
 *
 * Text never overflows its cell: a value that does not fit is wrapped, then
 * condensed (width factor down to 0.7), then made smaller (down to 70 %), and
 * only then cut with "…". How each field was fitted is reported.
 */

/** Paper sizes the frame is laid out for. */
export type AcTpPaperSize = 'A3' | 'A1'

/** What the title block says. Empty fields leave their cell blank. */
export interface AcTpTitleBlockFields {
  /** Dự án. */
  duAn?: string
  /** Công trình / hạng mục. */
  congTrinh?: string
  /** Tên bản vẽ — may wrap to three lines. */
  tenBanVe?: string
  /** Số hiệu tờ, e.g. `M1-01`. */
  soHieuTo?: string
  /** Tờ số, e.g. `1/6`. */
  soTo?: string
  /** Tỉ lệ as shown, e.g. `1:100`. */
  tiLe?: string
  /** Ngày, e.g. `14/11/2026`. */
  ngay?: string
  /** Giai đoạn, e.g. `TKBVTC`. */
  giaiDoan?: string
  /** Đơn vị thiết kế. */
  donVi?: string
  chuTri?: string
  thietKe?: string
  kiemTra?: string
  duyet?: string
  /** Status above the strip, at the right, e.g. a draft warning. */
  trangThai?: string
  /** Small note above the strip, at the left (units, provenance). */
  ghiChu?: string
}

/** Line weight class, for renderers that distinguish them. */
export type AcTpFrameWeight = 'manh' | 'dam'

/** One thing to draw, in paper millimetres from the sheet's lower-left. */
export type AcTpFramePrimitive =
  | {
      kind: 'path'
      role: 'khung_ban_ve' | 'khung_ten'
      partId: string
      points: [number, number][]
      closed?: boolean
      weight: AcTpFrameWeight
    }
  | {
      kind: 'text'
      role: 'khung_ten'
      partId: string
      /** Insertion point: baseline, at the left/centre/right per `align`. */
      at: [number, number]
      text: string
      height: number
      /** Horizontal alignment: left (0), centre (1), right (2). */
      align: 0 | 1 | 2
      widthFactor: number
      /** The field this text shows; absent for fixed captions. */
      field?: keyof AcTpTitleBlockFields
      /** The cell the text was fitted into; it never extends past it. */
      cell: AcTpFrameBox
    }

/** A rectangle, paper millimetres. */
export interface AcTpFrameBox {
  x: number
  y: number
  w: number
  h: number
}

/** How a field's text was made to fit its cell. */
export type AcTpFitMode = 'vua' | 'xuong_dong' | 'nen_ngang' | 'giam_co' | 'cat'

export interface AcTpDrawingFrame {
  khoGiay: AcTpPaperSize
  width: number
  height: number
  /** Inside the border and above the title strip: where drawings go. */
  drawArea: AcTpFrameBox
  /** The title strip. */
  titleStrip: AcTpFrameBox
  primitives: AcTpFramePrimitive[]
  /** Cell of every field, for checking and for renderers. */
  cells: Partial<Record<keyof AcTpTitleBlockFields, AcTpFrameBox>>
  /** Fields that needed more than a plain single line, and how. */
  fit: { field: keyof AcTpTitleBlockFields; mode: AcTpFitMode }[]
}

/** Per paper size: sheet, margins, strip height and text scale. */
export interface AcTpFrameLayout {
  width: number
  height: number
  margin: { left: number; right: number; top: number; bottom: number }
  stripHeight: number
  /** Multiplies every text height and padding of the A3 design. */
  textScale: number
}

/**
 * The office layout. A3 measured from the source sheets; A1 keeps a 20 mm
 * binding margin because the dossier's content is laid out from x ≥ 20 mm.
 */
export const ACTP_FRAME_LAYOUTS: Readonly<
  Record<AcTpPaperSize, AcTpFrameLayout>
> = {
  A3: {
    width: 420,
    height: 297,
    margin: { left: 25, right: 5, top: 5, bottom: 5 },
    stripHeight: 30,
    textScale: 1
  },
  A1: {
    width: 841,
    height: 594,
    margin: { left: 20, right: 10, top: 10, bottom: 10 },
    stripHeight: 45,
    textScale: 1.4
  }
}

/**
 * Title strip columns, left to right, as fractions of the strip width (the
 * A3 design is 390 mm wide: 55 | 105 | 80 | 90 | 60).
 */
const COLUMNS = {
  donVi: 55 / 390,
  ky: 105 / 390,
  congTrinh: 80 / 390,
  tenBanVe: 90 / 390,
  thongTin: 60 / 390
}

/** Text heights of the A3 design, mm. */
const TEXT = {
  nhan: 1.8,
  ky: 2.0,
  giaTri: 2.5,
  lon: 3.5
}

/** Caption band at the top of the tall cells, A3 mm. */
const CAPTION_BAND = 4.5
/** Inner padding of every cell, A3 mm. */
const PAD = 1.0

/** Rough Arial advance widths, as a fraction of the text height. */
function charWidth(ch: string): number {
  const base = ch.normalize('NFD')[0] ?? ch
  if ('ijlI.,:;|!\u0027'.includes(base)) return 0.28
  if (base === ' ') return 0.28
  if ('ftr()[]-'.includes(base)) return 0.34
  if ('mwMW'.includes(base)) return 0.86
  if (base === '—') return 1.0
  if (/[0-9]/.test(base)) return 0.56
  if (/[A-ZĐ]/.test(base)) return 0.7
  if (/[a-zđ]/.test(base)) return 0.56
  return 0.6
}

/**
 * Estimated width of a text, mm. Deliberately generous (5 %): an estimate
 * that errs short is how text ends up across a cell line.
 */
export function acTpEstimateTextWidth(
  text: string,
  height: number,
  widthFactor = 1
): number {
  let em = 0
  for (const ch of text) em += charWidth(ch)
  return em * height * widthFactor * 1.05
}

interface FitResult {
  lines: string[]
  height: number
  widthFactor: number
  mode: AcTpFitMode
}

/** Splits text into at most `maxLines` lines no wider than `width`. */
function wrap(
  text: string,
  width: number,
  height: number,
  widthFactor: number,
  maxLines: number
): string[] | undefined {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (acTpEstimateTextWidth(next, height, widthFactor) <= width) {
      current = next
      continue
    }
    if (!current) return undefined // a single word wider than the cell
    lines.push(current)
    current = word
    if (acTpEstimateTextWidth(word, height, widthFactor) > width)
      return undefined
  }
  if (current) lines.push(current)
  return lines.length <= maxLines ? lines : undefined
}

/** Lines that fit in a cell this tall at this text height. */
function linesThatFit(cellHeight: number, height: number): number {
  return Math.max(1, Math.floor((cellHeight + 0.5 * height) / (1.6 * height)))
}

function fitText(
  text: string,
  width: number,
  cellHeight: number,
  height: number,
  maxLines: number
): FitResult {
  const single = (h: number, wf: number) =>
    acTpEstimateTextWidth(text, h, wf) <= width
  if (single(height, 1))
    return { lines: [text], height, widthFactor: 1, mode: 'vua' }

  const tryWrap = (h: number, wf: number) =>
    wrap(text, width, h, wf, Math.min(maxLines, linesThatFit(cellHeight, h)))
  const wrapped = maxLines > 1 ? tryWrap(height, 1) : undefined
  if (wrapped)
    return { lines: wrapped, height, widthFactor: 1, mode: 'xuong_dong' }

  for (const wf of [0.9, 0.8, 0.7]) {
    if (single(height, wf))
      return { lines: [text], height, widthFactor: wf, mode: 'nen_ngang' }
    const w = maxLines > 1 ? tryWrap(height, wf) : undefined
    if (w) return { lines: w, height, widthFactor: wf, mode: 'nen_ngang' }
  }
  for (const k of [0.9, 0.8, 0.7]) {
    const h = height * k
    if (single(h, 0.7))
      return { lines: [text], height: h, widthFactor: 0.7, mode: 'giam_co' }
    const w = maxLines > 1 ? tryWrap(h, 0.7) : undefined
    if (w) return { lines: w, height: h, widthFactor: 0.7, mode: 'giam_co' }
  }
  const h = height * 0.7
  let cut = [...text]
  while (
    cut.length > 1 &&
    acTpEstimateTextWidth(`${cut.join('')}…`, h, 0.7) > width
  )
    cut = cut.slice(0, -1)
  return {
    lines: [`${cut.join('').trimEnd()}…`],
    height: h,
    widthFactor: 0.7,
    mode: 'cat'
  }
}

/**
 * Lays out the border and title block of one sheet.
 *
 * @param options.khoGiay - Paper size.
 * @param options.truong - What the title block says.
 * @returns Primitives in paper millimetres, plus the drawing area.
 */
export function acTpBuildDrawingFrame(options: {
  khoGiay: AcTpPaperSize
  truong: AcTpTitleBlockFields
}): AcTpDrawingFrame {
  const layout = ACTP_FRAME_LAYOUTS[options.khoGiay]
  const f = options.truong
  const k = layout.textScale
  const pad = PAD * k
  const captionBand = CAPTION_BAND * k
  const primitives: AcTpFramePrimitive[] = []
  const cells: AcTpDrawingFrame['cells'] = {}
  const fit: AcTpDrawingFrame['fit'] = []

  const { width: W, height: H, margin: m } = layout
  const inner: AcTpFrameBox = {
    x: m.left,
    y: m.bottom,
    w: W - m.left - m.right,
    h: H - m.top - m.bottom
  }
  const strip: AcTpFrameBox = {
    x: inner.x,
    y: inner.y,
    w: inner.w,
    h: layout.stripHeight
  }

  const rect = (
    b: AcTpFrameBox,
    role: 'khung_ban_ve' | 'khung_ten',
    partId: string,
    weight: AcTpFrameWeight
  ) =>
    primitives.push({
      kind: 'path',
      role,
      partId,
      points: [
        [b.x, b.y],
        [b.x + b.w, b.y],
        [b.x + b.w, b.y + b.h],
        [b.x, b.y + b.h]
      ],
      closed: true,
      weight
    })
  const line = (a: [number, number], b: [number, number], partId: string) =>
    primitives.push({
      kind: 'path',
      role: 'khung_ten',
      partId,
      points: [a, b],
      weight: 'manh'
    })

  rect({ x: 0, y: 0, w: W, h: H }, 'khung_ban_ve', 'khung_ban_ve_ngoai', 'manh')
  rect(inner, 'khung_ban_ve', 'khung_ban_ve_trong', 'dam')
  rect(strip, 'khung_ten', 'khung_ten_vien', 'dam')

  /** Text into a cell: fitted, vertically centred, never past the cell. */
  const put = (
    cell: AcTpFrameBox,
    text: string | undefined,
    height: number,
    options: {
      align?: 0 | 1 | 2
      maxLines?: number
      field?: keyof AcTpTitleBlockFields
      partId: string
    }
  ) => {
    if (options.field) cells[options.field] = cell
    if (!text || !text.trim()) return
    const align = options.align ?? 0
    const available = cell.w - 2 * pad
    const result = fitText(
      text.trim(),
      available,
      cell.h - pad,
      height,
      options.maxLines ?? 1
    )
    if (options.field && result.mode !== 'vua')
      fit.push({ field: options.field, mode: result.mode })
    const step = 1.6 * result.height
    const block = (result.lines.length - 1) * step
    const cy = cell.y + cell.h / 2
    // Baseline of the first line, so the block's cap height sits centred.
    let baseline = cy + block / 2 - 0.36 * result.height
    const x =
      align === 1
        ? cell.x + cell.w / 2
        : align === 2
          ? cell.x + cell.w - pad
          : cell.x + pad
    for (const value of result.lines) {
      primitives.push({
        kind: 'text',
        role: 'khung_ten',
        partId: options.field ? `khung_ten_${options.field}` : options.partId,
        at: [x, baseline],
        text: value,
        height: result.height,
        align,
        widthFactor: result.widthFactor,
        cell,
        ...(options.field ? { field: options.field } : {})
      })
      baseline -= step
    }
  }

  /** A tall cell with a caption band on top and a value below. */
  const captioned = (
    box: AcTpFrameBox,
    caption: string,
    field: keyof AcTpTitleBlockFields,
    height: number,
    maxLines: number,
    align: 0 | 1 | 2 = 1
  ) => {
    const top: AcTpFrameBox = {
      x: box.x,
      y: box.y + box.h - captionBand,
      w: box.w,
      h: captionBand
    }
    put(top, caption, TEXT.nhan * k, { partId: `khung_ten_nhan_${field}` })
    put(
      { x: box.x, y: box.y, w: box.w, h: box.h - captionBand },
      f[field],
      height,
      {
        align,
        maxLines,
        field,
        partId: `khung_ten_${field}`
      }
    )
  }

  // Columns.
  let x = strip.x
  const col = (fraction: number): AcTpFrameBox => {
    const box = { x, y: strip.y, w: strip.w * fraction, h: strip.h }
    x += box.w
    if (x < strip.x + strip.w - 1e-6)
      line([x, strip.y], [x, strip.y + strip.h], 'khung_ten_luoi')
    return box
  }
  const cDonVi = col(COLUMNS.donVi)
  const cKy = col(COLUMNS.ky)
  const cCongTrinh = col(COLUMNS.congTrinh)
  const cTen = col(COLUMNS.tenBanVe)
  const cThongTin = col(COLUMNS.thongTin)

  // 1. Đơn vị thiết kế.
  captioned(cDonVi, 'ĐƠN VỊ THIẾT KẾ', 'donVi', TEXT.giaTri * k, 3)

  // 2. Signatures: four rows of caption | name | signature.
  const kyRows: [string, keyof AcTpTitleBlockFields][] = [
    ['CHỦ TRÌ', 'chuTri'],
    ['THIẾT KẾ', 'thietKe'],
    ['KIỂM TRA', 'kiemTra'],
    ['DUYỆT', 'duyet']
  ]
  const kyRow = strip.h / kyRows.length
  const kyCaptionW = cKy.w * (25 / 105)
  const kyNameW = cKy.w * (50 / 105)
  line(
    [cKy.x + kyCaptionW, strip.y],
    [cKy.x + kyCaptionW, strip.y + strip.h],
    'khung_ten_luoi'
  )
  line(
    [cKy.x + kyCaptionW + kyNameW, strip.y],
    [cKy.x + kyCaptionW + kyNameW, strip.y + strip.h],
    'khung_ten_luoi'
  )
  kyRows.forEach(([caption, field], i) => {
    const y = strip.y + strip.h - (i + 1) * kyRow
    if (i < kyRows.length - 1)
      line([cKy.x, y], [cKy.x + cKy.w, y], 'khung_ten_luoi')
    put({ x: cKy.x, y, w: kyCaptionW, h: kyRow }, caption, TEXT.ky * k, {
      partId: `khung_ten_nhan_${field}`
    })
    put(
      { x: cKy.x + kyCaptionW, y, w: kyNameW, h: kyRow },
      f[field],
      TEXT.ky * k,
      {
        field,
        partId: `khung_ten_${field}`
      }
    )
  })

  // 3. Dự án above công trình.
  const half = strip.h / 2
  line(
    [cCongTrinh.x, strip.y + half],
    [cCongTrinh.x + cCongTrinh.w, strip.y + half],
    'khung_ten_luoi'
  )
  captioned(
    { ...cCongTrinh, y: strip.y + half, h: half },
    'DỰ ÁN',
    'duAn',
    TEXT.giaTri * k,
    2
  )
  captioned(
    { ...cCongTrinh, h: half },
    'CÔNG TRÌNH',
    'congTrinh',
    TEXT.giaTri * k,
    2
  )

  // 4. Tên bản vẽ.
  captioned(cTen, 'TÊN BẢN VẼ', 'tenBanVe', TEXT.lon * k, 3)

  // 5. Caption | value rows.
  const infoRows: [string, keyof AcTpTitleBlockFields][] = [
    ['TỈ LỆ', 'tiLe'],
    ['NGÀY', 'ngay'],
    ['GIAI ĐOẠN', 'giaiDoan'],
    ['SỐ HIỆU', 'soHieuTo'],
    ['TỜ SỐ', 'soTo']
  ]
  const infoRow = strip.h / infoRows.length
  const infoCaptionW = cThongTin.w * (22 / 60)
  line(
    [cThongTin.x + infoCaptionW, strip.y],
    [cThongTin.x + infoCaptionW, strip.y + strip.h],
    'khung_ten_luoi'
  )
  infoRows.forEach(([caption, field], i) => {
    const y = strip.y + strip.h - (i + 1) * infoRow
    if (i < infoRows.length - 1)
      line([cThongTin.x, y], [cThongTin.x + cThongTin.w, y], 'khung_ten_luoi')
    put(
      { x: cThongTin.x, y, w: infoCaptionW, h: infoRow },
      caption,
      TEXT.nhan * k,
      {
        partId: `khung_ten_nhan_${field}`
      }
    )
    put(
      {
        x: cThongTin.x + infoCaptionW,
        y,
        w: cThongTin.w - infoCaptionW,
        h: infoRow
      },
      f[field],
      TEXT.giaTri * k,
      { align: 1, field, partId: `khung_ten_${field}` }
    )
  })

  // Above the strip: note at the left, status at the right.
  const aboveH = 6 * k
  const aboveY = strip.y + strip.h + 0.5 * k
  put(
    { x: inner.x, y: aboveY, w: inner.w * 0.6, h: aboveH },
    f.ghiChu,
    TEXT.nhan * k,
    {
      field: 'ghiChu',
      partId: 'khung_ten_ghiChu'
    }
  )
  put(
    { x: inner.x + inner.w * 0.6, y: aboveY, w: inner.w * 0.4, h: aboveH },
    f.trangThai,
    TEXT.giaTri * k,
    {
      align: 2,
      field: 'trangThai',
      partId: 'khung_ten_trangThai'
    }
  )

  return {
    khoGiay: options.khoGiay,
    width: W,
    height: H,
    drawArea: {
      x: inner.x,
      y: aboveY + aboveH,
      w: inner.w,
      h: inner.y + inner.h - (aboveY + aboveH)
    },
    titleStrip: strip,
    primitives,
    cells,
    fit
  }
}

/**
 * Extent a text primitive occupies, mm — the same estimate the layout fits
 * with, plus room for Vietnamese stacked marks above capitals.
 */
export function acTpFrameTextBounds(
  p: Extract<AcTpFramePrimitive, { kind: 'text' }>
): AcTpFrameBox {
  const w = acTpEstimateTextWidth(p.text, p.height, p.widthFactor)
  const x0 =
    p.align === 1 ? p.at[0] - w / 2 : p.align === 2 ? p.at[0] - w : p.at[0]
  return { x: x0, y: p.at[1] - 0.25 * p.height, w, h: 1.25 * p.height }
}
