/* global Buffer */
/**
 * OLE tables of the source drawing → CAD lines and texts.
 *
 * The statistics tables of `02. BTC- mo_2.dwg` are Excel ranges pasted as
 * linked OLE objects. The DWG keeps only their presentation picture (stream
 * `\x02OlePres000` in the OLE compound file): a Windows metafile with the
 * cell borders (MoveTo/LineTo and border strips drawn by DIBBITBLT without
 * bitmap) and every cell text (ExtTextOut). This reads that picture into
 * lines and texts in paper millimetres, placed in the OLE2FRAME rectangle —
 * what AutoCAD shows on the sheet.
 *
 * Used on both sides of the harness: by `extract-orig.mjs` so the reference
 * contains the tables (the app's renderer does not draw OLE), and by
 * `extract-layout.mjs` so the generator redraws them as CAD entities.
 * TCVN3/VNI texts are decoded by the SDK's own decoder.
 */
import { acTpDecodeVnText } from './vntext.mjs'

const CFB_MAGIC = Buffer.from('D0CF11E0A1B11AE1', 'hex')

/** Streams of an OLE compound file, by name. */
function readCfb(data) {
  const u16 = o => data.readUInt16LE(o)
  const u32 = o => data.readUInt32LE(o)
  const ss = 1 << u16(0x1e)
  const mss = 1 << u16(0x20)
  const nfat = u32(0x2c)
  const dir0 = u32(0x30)
  const cutoff = u32(0x38)
  const mfat0 = u32(0x3c)
  let difatNext = u32(0x44)
  const ndifat = u32(0x48)
  const sec = n => data.subarray(512 + n * ss, 512 + (n + 1) * ss)
  const ints = buf => {
    const out = []
    for (let o = 0; o + 4 <= buf.length; o += 4) out.push(buf.readUInt32LE(o))
    return out
  }
  const difat = ints(data.subarray(0x4c, 0x4c + 436))
  for (let k = 0; k < ndifat; k++) {
    const vals = ints(sec(difatNext))
    difat.push(...vals.slice(0, -1))
    difatNext = vals[vals.length - 1]
  }
  const fat = []
  for (const f of difat.slice(0, nfat)) fat.push(...ints(sec(f)))
  const chain = start => {
    const out = []
    for (let n = start; n < 0xfffffffa && out.length < 1e5; n = fat[n])
      out.push(n)
    return out
  }
  const stream = start => Buffer.concat(chain(start).map(sec))
  const dir = stream(dir0)
  const entries = []
  for (let k = 0; k + 128 <= dir.length; k += 128) {
    const e = dir.subarray(k, k + 128)
    const nameLen = e.readUInt16LE(64)
    entries.push({
      name: e.subarray(0, Math.max(0, nameLen - 2)).toString('utf16le'),
      type: e[66],
      start: e.readUInt32LE(116),
      size: e.readUInt32LE(120)
    })
  }
  const mini = stream(entries[0].start)
  const minifat =
    mfat0 < 0xfffffffa ? chain(mfat0).flatMap(n => ints(sec(n))) : []
  const miniRead = (start, size) => {
    const parts = []
    for (let n = start, got = 0; n < 0xfffffffa && got < size; n = minifat[n]) {
      parts.push(mini.subarray(n * mss, (n + 1) * mss))
      got += mss
    }
    return Buffer.concat(parts).subarray(0, size)
  }
  const out = {}
  for (const e of entries.slice(1))
    if (e.type === 2)
      out[e.name] =
        e.size < cutoff
          ? miniRead(e.start, e.size)
          : stream(e.start).subarray(0, e.size)
  return out
}

/** The presentation metafile of an OLE2FRAME's binary data (group 310). */
export function oleMetafile(binary) {
  const at = binary.indexOf(CFB_MAGIC)
  if (at < 0) return undefined
  const pres = readCfb(binary.subarray(at))['\u0002OlePres000']
  if (!pres) return undefined
  // OLEPRESENTATIONSTREAM: clipboard format, then 7 fields, then the data.
  const size = pres.readUInt32LE(36)
  const data = pres.subarray(40, 40 + size)
  // A placeable-less WMF starts with type 1 / header size 9.
  return data.readUInt16LE(0) === 1 && data.readUInt16LE(2) === 9
    ? data
    : undefined
}

const rgb = c => [c & 255, (c >> 8) & 255, (c >> 16) & 255]
/** Nearest of the plain ACI colours; black (ink on paper) is 7. */
function aci(colorref) {
  const [r, g, b] = rgb(colorref)
  const plain = [
    [1, 255, 0, 0],
    [2, 255, 255, 0],
    [3, 0, 255, 0],
    [4, 0, 255, 255],
    [5, 0, 0, 255],
    [6, 255, 0, 255],
    [7, 0, 0, 0],
    [8, 128, 128, 128],
    [9, 192, 192, 192]
  ]
  let best = 7,
    dist = Infinity
  for (const [n, pr, pg, pb] of plain) {
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
    if (d < dist) [best, dist] = [n, d]
  }
  return best
}

/**
 * Lines and texts of a WMF, in the frame `[x0, yTop] → [x1, yBottom]`
 * (paper millimetres, y up).
 */
export function wmfToCad(wmf, frame) {
  const hs = wmf.readUInt16LE(2) * 2
  let org = [0, 0],
    ext = [1, 1]
  const objects = []
  let state = {
    pen: undefined,
    brush: undefined,
    font: undefined,
    align: 0,
    textColor: 0,
    pos: [0, 0]
  }
  const stack = []
  const raw = { lines: [], texts: [] }
  const addObject = o => {
    let k = objects.indexOf(null)
    if (k < 0) k = objects.length
    objects[k] = o
  }
  for (let i = hs; i + 6 <= wmf.length; ) {
    const size = wmf.readUInt32LE(i) * 2
    const fn = wmf.readUInt16LE(i + 4)
    if (!size) break
    const p = wmf.subarray(i + 6, i + size)
    const s16 = k => p.readInt16LE(k * 2)
    const u16 = k => p.readUInt16LE(k * 2)
    switch (fn) {
      case 0x020b:
        org = [s16(1), s16(0)]
        break
      case 0x020c:
        ext = [s16(1), s16(0)]
        break
      case 0x02fa: // CreatePenIndirect
        addObject({ kind: 'pen', style: u16(0), color: p.readUInt32LE(6) })
        break
      case 0x02fc: // CreateBrushIndirect
        addObject({ kind: 'brush', style: u16(0), color: p.readUInt32LE(2) })
        break
      case 0x02fb: {
        // CreateFontIndirect
        const faceEnd = p.indexOf(0, 18)
        addObject({
          kind: 'font',
          height: s16(0),
          escapement: s16(2),
          weight: s16(4),
          charset: p[13],
          face: p
            .subarray(18, faceEnd < 0 ? p.length : faceEnd)
            .toString('latin1')
        })
        break
      }
      case 0x00f7:
      case 0x01f9:
      case 0x0142:
      case 0x06ff:
        addObject({ kind: 'other' })
        break
      case 0x01f0: // DeleteObject
        objects[u16(0)] = null
        break
      case 0x012d: {
        // SelectObject
        const o = objects[u16(0)]
        if (o && o.kind !== 'other') state = { ...state, [o.kind]: o }
        break
      }
      case 0x012e:
        state = { ...state, align: u16(0) }
        break
      case 0x0209:
        state = { ...state, textColor: p.readUInt32LE(0) }
        break
      case 0x001e:
        stack.push(state)
        break
      case 0x0127:
        state = stack.pop() ?? state
        break
      case 0x0214: // MoveTo (y, x)
        state = { ...state, pos: [s16(1), s16(0)] }
        break
      case 0x0213: {
        // LineTo (y, x)
        const to = [s16(1), s16(0)]
        if (!state.pen || state.pen.style !== 5)
          raw.lines.push([...state.pos, ...to, state.pen?.color ?? 0])
        state = { ...state, pos: to }
        break
      }
      case 0x0940: {
        // DIBBITBLT without bitmap: a filled strip (a cell border).
        if (p.length !== 18) break
        const h = s16(4),
          w = s16(5),
          y = s16(6),
          x = s16(7)
        const color = state.brush?.color ?? 0
        if ((color & 0xffffff) === 0xffffff) break // background
        if (Math.abs(h) <= Math.abs(w) && Math.abs(h) <= 3)
          raw.lines.push([x, y + h / 2, x + w, y + h / 2, color])
        else if (Math.abs(w) <= 3)
          raw.lines.push([x + w / 2, y, x + w / 2, y + h, color])
        break
      }
      case 0x0a32: {
        // ExtTextOut
        const y = s16(0),
          x = s16(1),
          count = s16(2),
          opts = u16(3)
        const at = 8 + (opts & 6 ? 8 : 0)
        const bytes = p.subarray(at, at + count)
        const font = state.font
        let text = bytes.toString('latin1')
        if (font?.charset === 163)
          text = new TextDecoder('windows-1258').decode(bytes)
        else text = acTpDecodeVnText(text, { font: font?.face }).text
        if (text.trim())
          raw.texts.push({
            x,
            y,
            text: text.trim(),
            em: Math.abs(font?.height ?? 10),
            cell: (font?.height ?? -10) > 0,
            align: state.align,
            rotation: (font?.escapement ?? 0) / 10,
            color: state.textColor,
            bold: (font?.weight ?? 400) >= 600
          })
        break
      }
      default:
        break
    }
    i += size
  }

  const [fx0, fyTop, fx1, fyBottom] = frame
  const sx = (fx1 - fx0) / ext[0],
    sy = (fyTop - fyBottom) / ext[1]
  const X = x => fx0 + (x - org[0]) * sx
  const Y = y => fyTop - (y - org[1]) * sy
  const r3 = v => Math.round(v * 1000) / 1000

  // Join touching collinear border pieces into whole grid lines.
  const segs = raw.lines.map(([x1, y1, x2, y2, c]) => ({
    a: [X(Math.min(x1, x2)), Y(y1 === y2 ? y1 : Math.min(y1, y2))],
    b: [X(Math.max(x1, x2)), Y(y1 === y2 ? y2 : Math.max(y1, y2))],
    h: y1 === y2,
    v: x1 === x2,
    c: aci(c)
  }))
  const tol = 0.05
  const merged = []
  for (const dir of ['h', 'v']) {
    const list = segs
      .filter(s => s[dir])
      .map(s =>
        dir === 'h'
          ? { k: s.a[1], lo: s.a[0], hi: s.b[0], c: s.c }
          : {
              k: s.a[0],
              lo: Math.min(s.a[1], s.b[1]),
              hi: Math.max(s.a[1], s.b[1]),
              c: s.c
            }
      )
      .sort((p, q) => p.k - q.k || p.lo - q.lo)
    for (const s of list) {
      const last = merged.find(
        m =>
          m.dir === dir &&
          Math.abs(m.k - s.k) < tol &&
          s.lo <= m.hi + tol &&
          m.c === s.c
      )
      if (last) last.hi = Math.max(last.hi, s.hi)
      else merged.push({ dir, ...s })
    }
  }
  const lines = merged.map(m => ({
    a: m.dir === 'h' ? [r3(m.lo), r3(m.k)] : [r3(m.k), r3(m.lo)],
    b: m.dir === 'h' ? [r3(m.hi), r3(m.k)] : [r3(m.k), r3(m.hi)],
    color: m.c
  }))
  for (const s of segs)
    if (!s.h && !s.v) lines.push({ a: s.a.map(r3), b: s.b.map(r3), color: s.c })

  // Texts: CAD height is the capital height, ~0.72 of the em for Arial.
  const texts = raw.texts.map(t => {
    const em = (t.cell ? t.em * 0.86 : t.em) * sy
    const h = t.align & 6
    const v = t.align & 24
    // Baseline from the reference point: top → down by the ascent, along
    // the text's own "down" when the font is rotated (escapement).
    const a = (t.rotation * Math.PI) / 180
    const down = v === 24 ? 0 : v === 8 ? -0.21 * em : 0.905 * em
    return {
      at: [r3(X(t.x) + down * Math.sin(a)), r3(Y(t.y) - down * Math.cos(a))],
      ...(t.rotation ? { rotation: r3(t.rotation) } : {}),
      text: t.text,
      height: r3(0.716 * em),
      align: h === 6 ? 1 : h === 2 ? 2 : 0,
      color: aci(t.color)
    }
  })
  return { lines, texts }
}

/**
 * Lines and texts of an OLE2FRAME record (its picture placed in its frame:
 * 10/20 upper-left, 11/21 lower-right), or undefined if it has none.
 */
export function oleFrameToCad(rec) {
  const hex = rec.pairs
    .filter(p => p.code === 310)
    .map(p => p.value.trim())
    .join('')
  const wmf = oleMetafile(Buffer.from(hex, 'hex'))
  if (!wmf) return undefined
  const v = code => Number(rec.pairs.find(p => p.code === code)?.value)
  return wmfToCad(wmf, [v(10), v(20), v(11), v(21)])
}
