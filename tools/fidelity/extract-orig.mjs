#!/usr/bin/env node
/* global process */
/**
 * Extracts the reference side of the fidelity harness from
 * `assets/02. BTC- mo_2.dwg`.
 *
 *   node tools/fidelity/extract-orig.mjs [--work <dir>]
 *
 * Writes:
 * - <work>/mo2.dxf             DWG → DXF (libredwg-web, already in node_modules)
 * - <work>/mo2.normalized.dxf  the same, with TCVN3/VNI text decoded to
 *                              Unicode and .Vn fonts swapped for Arial, so
 *                              the app's renderer draws readable text.
 *                              A comparison copy only — never committed.
 * - packages/cad-template-plugin/__tests__/fidelity/mo2-inventory.json
 *                              compact per-sheet inventory (committed, small)
 *
 * Coordinates in the inventory are **paper millimetres relative to the lower
 * left corner of each A3 sheet** (the `FR A3` insert). Model-space entities
 * are taken through their viewport (all 1:100).
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  all,
  get,
  num,
  owner,
  points,
  readPairs,
  records,
  walk,
  writePairs
} from './dxf.mjs'
import { oleFrameToCad } from './ole.mjs'
import {
  acTpDecodeVnText,
  acTpLegacyVnFont,
  acTpMTextPlain
} from './vntext.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SOURCE = join(ROOT, 'assets', '02. BTC- mo_2.dwg')
const INVENTORY = join(
  ROOT,
  'packages/cad-template-plugin/__tests__/fidelity/mo2-inventory.json'
)
const argWork = process.argv.indexOf('--work')
const WORK =
  argWork > 0 ? process.argv[argWork + 1] : '/workspace/cadview-shots/mo2/work'
mkdirSync(WORK, { recursive: true })

/** Sheets in drawing order: layout, frame index (by x), id, generated sheet. */
const SHEETS = [
  { id: 'SUB-010', layout: 0, frame: 0, gen: 'BC01' },
  { id: 'SUB-020', layout: 0, frame: 1, gen: 'BC02' },
  { id: 'SUB-070', layout: 1, frame: 0, gen: 'CT01' },
  { id: 'SUB-080', layout: 1, frame: 1, gen: 'CT02' },
  { id: 'SUB-090', layout: 1, frame: 2, gen: 'CT03' },
  { id: 'SUB-100', layout: 1, frame: 3, gen: 'KL01' }
]
const A3 = { w: 420, h: 297 }

// ---------------------------------------------------------------- DWG → DXF
const P = join(
  ROOT,
  'node_modules/.pnpm/@mlightcad+libredwg-web@0.8.3/node_modules/@mlightcad/libredwg-web'
)
const t0 = Date.now()
const { LibreDwg } = await import(join(P, 'dist/libredwg-web.js'))
const lib = await LibreDwg.create(join(P, 'wasm/'))
const bytes = readFileSync(SOURCE)
const sha256 = createHash('sha256').update(bytes).digest('hex')
const dxfText = lib.dwg_write_dxf(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
)
const rawPath = join(WORK, 'mo2.dxf')
writeFileSync(rawPath, dxfText)

const pairs = readPairs(rawPath)
const recs = records(pairs)
const items = [...walk(recs)]

// ---------------------------------------------------------------- tables
/** The dimension variables the score compares, from DIMSTYLE group codes. */
const DIMVAR_CODES = {
  40: 'DIMSCALE',
  41: 'DIMASZ',
  42: 'DIMEXO',
  44: 'DIMEXE',
  140: 'DIMTXT',
  147: 'DIMGAP',
  77: 'DIMTAD',
  176: 'DIMCLRD',
  177: 'DIMCLRE',
  178: 'DIMCLRT',
  144: 'DIMLFAC',
  271: 'DIMDEC'
}
const layers = new Map()
const styles = new Map() // name(lower) → { name, font, handle }
const styleByHandle = new Map()
const dimstyles = new Map()
const blockRecordName = new Map()
const blockRecordTable = get(
  recs.find(r => r.type === 'TABLE' && get(r, 2)?.trim() === 'BLOCK_RECORD'),
  5
)?.trim()
for (const { table, rec } of items.filter(i => i.table)) {
  const name = get(rec, 2)?.trim()
  if (table === 'LAYER') {
    layers.set(name.toLowerCase(), {
      color: Math.abs(num(rec, 62, 7)),
      lt: (get(rec, 6) ?? 'CONTINUOUS').trim().toUpperCase(),
      lw: num(rec, 370, -3)
    })
  } else if (table === 'STYLE') {
    const xfont = acadXdata(rec)[0]?.value
    const font = (xfont || get(rec, 3) || '').trim()
    const s = { name, font, handle: get(rec, 5)?.trim() }
    styles.set(name.toLowerCase(), s)
    styleByHandle.set(s.handle, s)
  } else if (table === 'DIMSTYLE') {
    dimstyles.set(name.toLowerCase(), {
      name,
      vars: dimVarsFromPairs(rec.pairs.filter(p => p.code < 1000)),
      txsty: get(rec, 340)?.trim()
    })
  } else if (table === 'BLOCK_RECORD') {
    blockRecordName.set(get(rec, 5)?.trim(), name)
  }
}

/** ACAD xdata of a record as [{code, value}] after `1001 ACAD`. */
function acadXdata(rec) {
  const out = []
  let inAcad = false
  for (const p of rec.pairs) {
    if (p.code === 1001) inAcad = p.value.trim() === 'ACAD'
    else if (inAcad && p.code >= 1000)
      out.push({ code: p.code, value: p.value })
  }
  return out
}

/** DIMCLR* arrive packed (0xC3 flag + ACI in the low byte); 0 = ByBlock. */
function dimVar(name, value) {
  const v = Number(value)
  if (!['DIMCLRD', 'DIMCLRE', 'DIMCLRT'].includes(name)) return v
  if (v >= 0 && v <= 256) return v
  return (v >>> 0) & 0xff
}
function dimVarsFromPairs(list) {
  const vars = {}
  for (const p of list) {
    const name = DIMVAR_CODES[p.code]
    if (name) vars[name] = dimVar(name, p.value)
  }
  return vars
}
/** DSTYLE overrides stored as 1070 code / value pairs in ACAD xdata. */
function dimOverrides(rec) {
  const x = acadXdata(rec)
  const out = {}
  const start = x.findIndex(p => p.code === 1000 && p.value.trim() === 'DSTYLE')
  if (start < 0) return out
  for (let i = start + 2; i + 1 < x.length && x[i].code !== 1002; i += 2) {
    const name = DIMVAR_CODES[Number(x[i].value)]
    if (name) out[name] = dimVar(name, x[i + 1].value)
  }
  return out
}

const fontOfStyle = name =>
  styles.get(
    String(name ?? 'STANDARD')
      .trim()
      .toLowerCase()
  )?.font
const legacyStyle = name => !!acTpLegacyVnFont(fontOfStyle(name))

// ---------------------------------------------------------------- normalized copy
/** Decodes one text record in place; returns the decoded plain string. */
function decodeTextRecord(rec, styleName) {
  const isMText = rec.type === 'MTEXT'
  const parts = rec.pairs.filter(p => p.code === 3 || p.code === 1)
  if (!parts.length) return ''
  const raw = parts.map(p => p.value).join('')
  const decoded = acTpDecodeVnText(raw, {
    font: fontOfStyle(styleName),
    styleName,
    mtext: isMText
  }).text
  // Write back as a single code 1 (drop code 3 continuation chunks).
  const first = rec.pairs.indexOf(parts[0])
  for (const p of parts) p.value = '\u0000drop'
  rec.pairs[first].value = decoded
  return isMText ? acTpMTextPlain(decoded) : decoded
}

const decodedText = new Map() // record → decoded plain string
const textTypes = new Set(['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'])
for (const { rec } of items) {
  if (textTypes.has(rec.type)) {
    decodedText.set(rec, decodeTextRecord(rec, get(rec, 7)?.trim()))
  } else if (rec.type === 'DIMENSION') {
    const style = dimstyles.get((get(rec, 3) ?? '').trim().toLowerCase())
    const txFont = styleByHandle.get(style?.txsty)?.name
    const override = rec.pairs.find(p => p.code === 1)
    if (override && override.value)
      override.value = acTpDecodeVnText(override.value, {
        font: fontOfStyle(txFont),
        styleName: txFont,
        mtext: true
      }).text
  }
}
// Fonts: .Vn styles now hold Unicode text → draw them with Arial.
for (const { table, rec } of items.filter(i => i.table === 'STYLE')) {
  if (!legacyStyle(get(rec, 2))) continue
  for (const p of rec.pairs) {
    if (p.code === 3) p.value = 'arial.ttf'
  }
  let inAcad = false
  for (const p of rec.pairs) {
    if (p.code === 1001) inAcad = p.value.trim() === 'ACAD'
    else if (inAcad && p.code === 1000) {
      p.value = 'Arial'
      break
    }
  }
  void table
}
const normalizedPath = join(WORK, 'mo2.normalized.dxf')

// ---------------------------------------------------------------- spaces, frames, viewports
const MODEL = [...blockRecordName].find(([, n]) => n === '*Model_Space')?.[0]
const PAPERS = [...blockRecordName]
  .filter(([, n]) => /^\*Paper_Space/i.test(n))
  .sort((a, b) => a[1].length - b[1].length || a[1].localeCompare(b[1]))
  .map(([h]) => h)

/** Owner block record handle of an entity (model, a paper space, or a block).
 * An ATTRIB belongs to its INSERT; it lives wherever the INSERT lives. */
const insertOwner = new Map(
  items
    .filter(i => i.rec.type === 'INSERT')
    .map(i => [get(i.rec, 5)?.trim(), owner(i.rec)])
)
const ownerOf = item => {
  const own = owner(item.rec)
  if (item.rec.type === 'ATTRIB' && insertOwner.has(own))
    return insertOwner.get(own)
  return own ?? item.block?.handle
}

const entities = items.filter(
  i =>
    (i.section === 'ENTITIES' || i.section === 'BLOCKS') &&
    i.rec.type !== 'SEQEND'
)
const inSpace = (item, handle) =>
  (item.section === 'ENTITIES' && ownerOf(item) === handle) ||
  (item.section === 'BLOCKS' &&
    item.block?.owner === handle &&
    /^\*Paper_Space/i.test(item.block.name))

const frames = PAPERS.map(paper =>
  entities
    .filter(
      i =>
        inSpace(i, paper) &&
        i.rec.type === 'INSERT' &&
        get(i.rec, 2)?.trim() === 'FR A3'
    )
    .map(i => points(i.rec, 10, 20)[0])
    .sort((a, b) => a[0] - b[0])
)

const viewports = PAPERS.map(paper =>
  entities
    // The overall paper viewport (id 1) is wider than a sheet; the drawing
    // viewports are not. Ids are not reliable here (0 on one layout).
    .filter(
      i =>
        inSpace(i, paper) &&
        i.rec.type === 'VIEWPORT' &&
        num(i.rec, 40, 0) <= A3.w
    )
    .map(i => {
      const [c] = points(i.rec, 10, 20)
      // View centre (12/22) is in display coordinates, relative to the
      // view target (17/27).
      const [d] = points(i.rec, 12, 22)
      const t = points(i.rec, 17, 27)[0] ?? [0, 0]
      const v = [d[0] + t[0], d[1] + t[1]]
      const w = num(i.rec, 40),
        h = num(i.rec, 41),
        vh = num(i.rec, 45)
      const scale = vh / h
      return {
        handle: get(i.rec, 5)?.trim(),
        paper: { cx: c[0], cy: c[1], w, h },
        scale,
        model: {
          x0: v[0] - (w * scale) / 2,
          y0: v[1] - vh / 2,
          x1: v[0] + (w * scale) / 2,
          y1: v[1] + vh / 2
        }
      }
    })
)

const sheets = SHEETS.map(s => {
  const origin = frames[s.layout][s.frame]
  const vp = viewports[s.layout].find(
    v => v.paper.cx > origin[0] && v.paper.cx < origin[0] + A3.w
  )
  return { ...s, origin, vp }
})

// ---------------------------------------------------------------- appearance + geometry
function effective(rec) {
  const layer = layers.get((get(rec, 8) ?? '0').trim().toLowerCase()) ?? {
    color: 7,
    lt: 'CONTINUOUS',
    lw: -3
  }
  let color = num(rec, 62, 256)
  if (color === 256) color = layer.color
  else if (color === 0) color = 7
  color = Math.abs(color)
  let lt = (get(rec, 6) ?? 'BYLAYER').trim().toUpperCase()
  if (lt === 'BYLAYER') lt = layer.lt
  if (lt === 'BYBLOCK') lt = 'CONTINUOUS'
  let lw = num(rec, 370, -1)
  if (lw === -1) lw = layer.lw
  if (lw === -2) lw = -3
  return { color, lt, lw }
}

function geometryPoints(rec) {
  switch (rec.type) {
    case 'HATCH':
      return points(rec, 10, 20).slice(1)
    case 'CIRCLE':
    case 'ARC': {
      const [c] = points(rec, 10, 20)
      const r = num(rec, 40, 0)
      return [
        [c[0] - r, c[1] - r],
        [c[0] + r, c[1] + r]
      ]
    }
    case 'DIMENSION':
      return [
        ...points(rec, 13, 23),
        ...points(rec, 14, 24),
        ...points(rec, 10, 20)
      ]
    // 11/21 is an alignment point (0,0 when unused) on TEXT and a direction
    // vector on MTEXT: never geometry for the bounding box.
    case 'TEXT':
    case 'ATTRIB':
    case 'ATTDEF':
    case 'MTEXT':
      return [textAnchor(rec)].filter(Boolean)
    case 'INSERT':
    case 'POINT':
    case 'LWPOLYLINE':
    case 'LEADER':
      return points(rec, 10, 20)
    case 'LINE':
      return [...points(rec, 10, 20), ...points(rec, 11, 21)]
    case 'SOLID':
      return [
        ...points(rec, 10, 20),
        ...points(rec, 11, 21),
        ...points(rec, 12, 22),
        ...points(rec, 13, 23)
      ]
    default:
      return points(rec, 10, 20)
  }
}
const centre = pts => {
  if (!pts.length) return undefined
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2]
}

/** Text anchor: alignment point when aligned, else insertion. */
function textAnchor(rec) {
  const aligned =
    num(rec, 72, 0) !== 0 || num(rec, 73, 0) !== 0 || num(rec, 74, 0) !== 0
  const p = aligned ? points(rec, 11, 21)[0] : undefined
  return p ?? points(rec, 10, 20)[0]
}
function textAlign(rec) {
  if (rec.type === 'MTEXT') {
    const a = num(rec, 71, 1)
    return [0, 0, 1, 2][((a - 1) % 3) + 1]
  }
  const h = num(rec, 72, 0)
  return h === 1 || h === 4 ? 1 : h === 2 ? 2 : 0
}

const round = v => Math.round(v * 100) / 100
const fontFamily = font => {
  const f = String(font ?? '').toLowerCase()
  if (acTpLegacyVnFont(font)) return 'arial' // decoded and drawn as Arial
  if (f.includes('arial') || f === '') return 'arial'
  return f.replace(/\.(ttf|shx)$/, '')
}

function formatMeasure(value, vars) {
  const dec = vars.DIMDEC ?? 2
  return String(Number((value * (vars.DIMLFAC ?? 1)).toFixed(dec)))
}

const SKIP = new Set([
  'VIEWPORT',
  'OLE2FRAME',
  'SEQEND',
  'VERTEX',
  'ATTRIB',
  'ATTDEF'
])

const out = {
  version: 1,
  source: { file: 'assets/02. BTC- mo_2.dwg', sha256 },
  note:
    'Kiểm kê rút gọn cho harness độ giống. Toạ độ: mm giấy, gốc = góc dưới trái tờ A3 (FR A3). ' +
    'Sinh bởi tools/fidelity/extract-orig.mjs; không sửa tay.',
  sheets: []
}

// ---------------------------------------------------------------- OLE tables
/**
 * Sheets whose OLE tables (Excel pictures) are part of the reference: the
 * app's renderer does not draw OLE, so their lines and texts are taken from
 * the presentation metafile (ole.mjs) and added as LINE/TEXT. The generator
 * draws the same tables with real entities.
 */
const OLE_SHEETS = new Set(['SUB-100'])
/** Text style of the normalized copy drawn with Arial (any .Vn style is). */
const OLE_STYLE = (() => {
  const s = items.find(i => i.table === 'STYLE' && legacyStyle(get(i.rec, 2)))
  return get(s?.rec ?? { pairs: [] }, 2)?.trim() ?? 'Standard'
})()
function oleTables(s) {
  if (!OLE_SHEETS.has(s.id)) return []
  return entities
    .filter(i => inSpace(i, PAPERS[s.layout]) && i.rec.type === 'OLE2FRAME')
    .filter(i => {
      const [c] = points(i.rec, 10, 20)
      const px = c[0] - s.origin[0],
        py = c[1] - s.origin[1]
      return px >= 0 && px <= A3.w && py >= 0 && py <= A3.h
    })
    .map(i => oleFrameToCad(i.rec))
    .filter(Boolean)
}

for (const s of sheets) {
  const sheet = {
    id: s.id,
    gen: s.gen,
    frame: { ...A3 },
    viewport: s.vp
      ? {
          x: round(s.vp.paper.cx - s.vp.paper.w / 2 - s.origin[0]),
          y: round(s.vp.paper.cy - s.vp.paper.h / 2 - s.origin[1]),
          w: round(s.vp.paper.w),
          h: round(s.vp.paper.h)
        }
      : null,
    model: s.vp
      ? Object.fromEntries(
          Object.entries(s.vp.model).map(([k, v]) => [k, round(v)])
        )
      : null,
    hist: {},
    texts: [],
    dims: [],
    counts: { model: 0, paper: 0 }
  }
  const toPaperModel = ([x, y]) => [
    s.vp.paper.cx +
      (x - (s.vp.model.x0 + s.vp.model.x1) / 2) / s.vp.scale -
      s.origin[0],
    s.vp.paper.cy +
      (y - (s.vp.model.y0 + s.vp.model.y1) / 2) / s.vp.scale -
      s.origin[1]
  ]
  const toPaperPaper = ([x, y]) => [x - s.origin[0], y - s.origin[1]]
  const paperHandle = PAPERS[s.layout]

  for (const item of entities) {
    const rec = item.rec
    const isModel = item.section === 'ENTITIES' && ownerOf(item) === MODEL
    const isPaper = inSpace(item, paperHandle)
    if (!isModel && !isPaper) continue
    if (rec.type === 'INSERT' && get(rec, 2)?.trim() === 'FR A3') continue
    const c = centre(geometryPoints(rec))
    if (!c) continue
    let map
    if (isModel) {
      if (!s.vp) continue
      const m = s.vp.model
      if (c[0] < m.x0 || c[0] > m.x1 || c[1] < m.y0 || c[1] > m.y1) continue
      map = toPaperModel
    } else {
      const p = toPaperPaper(c)
      if (p[0] < 0 || p[0] > A3.w || p[1] < 0 || p[1] > A3.h) continue
      map = toPaperPaper
    }
    const scale = isModel ? s.vp.scale : 1
    sheet.counts[isModel ? 'model' : 'paper'] += 1

    if (!SKIP.has(rec.type)) {
      const e = effective(rec)
      const key = `${rec.type}|${e.color}|${e.lt}|${e.lw}`
      sheet.hist[key] = (sheet.hist[key] ?? 0) + 1
    }
    if (textTypes.has(rec.type) && rec.type !== 'ATTDEF') {
      const text = (decodedText.get(rec) ?? '').trim()
      if (!text) continue
      const [x, y] = map(textAnchor(rec))
      sheet.texts.push({
        t: text,
        x: round(x),
        y: round(y),
        h: round(num(rec, 40, 0) / scale),
        r: round(num(rec, 50, 0)),
        a: textAlign(rec),
        f: fontFamily(fontOfStyle(get(rec, 7)?.trim()))
      })
    }
    if (rec.type === 'DIMENSION' && (num(rec, 70, 0) & 7) <= 1) {
      const style = dimstyles.get((get(rec, 3) ?? '').trim().toLowerCase())
      const vars = { ...(style?.vars ?? {}), ...dimOverrides(rec) }
      const measured = formatMeasure(num(rec, 42, 0), vars)
      const override = (get(rec, 1) ?? '').trim()
      const shown =
        override === '' || override === '<>'
          ? measured
          : acTpMTextPlain(override.replace('<>', measured)).trim()
      const [a] = points(rec, 13, 23)
      const [b] = points(rec, 14, 24)
      const [tp] = points(rec, 11, 21)
      sheet.dims.push({
        a: map(a).map(round),
        b: map(b).map(round),
        tp: tp ? map(tp).map(round) : undefined,
        t: shown,
        r: round(num(rec, 50, 0)),
        style: (get(rec, 3) ?? '').trim(),
        vars,
        // Drawing units per paper millimetre: model dims are seen at 1:100.
        k: isModel ? s.vp.scale : 1
      })
    }
  }
  for (const table of oleTables(s)) {
    for (const l of table.lines) {
      const key = `LINE|${l.color}|CONTINUOUS|-3`
      sheet.hist[key] = (sheet.hist[key] ?? 0) + 1
      sheet.counts.paper += 1
    }
    for (const t of table.texts) {
      const key = `TEXT|${t.color}|CONTINUOUS|-3`
      sheet.hist[key] = (sheet.hist[key] ?? 0) + 1
      sheet.counts.paper += 1
      sheet.texts.push({
        t: t.text,
        x: round(t.at[0] - s.origin[0]),
        y: round(t.at[1] - s.origin[1]),
        h: round(t.height),
        r: round(t.rotation ?? 0),
        a: t.align,
        f: 'arial'
      })
    }
  }
  out.sheets.push(sheet)
}

// ---------------------------------------------------------------- paper → model copies
// The app's renderer draws model space only through `pngout`. So that both
// sides of the comparison go through the same renderer, each sheet's paper
// content (titles, key plan, bar-shape legend…) is copied into a new block
// and inserted in model space ×100 far from the drawing. Viewport content is
// rendered separately from its model window and pasted into its paper rect.
const FLAT = { x: 5_000_000, y: 5_000_000, step: 100_000, scale: 100 }
let seed = 0
for (const p of pairs)
  if (p.code === 5) seed = Math.max(seed, parseInt(p.value.trim(), 16) || 0)
const newHandle = () => (++seed).toString(16).toUpperCase()
const STRIP_GROUPS = ['{ACAD_XDICTIONARY', '{ACAD_REACTORS']

/** Deep copy of an entity record with new identity and owner. */
function copyRecord(rec, owner, handleMap) {
  const out = []
  let skipping = false
  let ownerDone = false
  for (const p of rec.pairs) {
    if (p.value === '\u0000drop') continue
    if (p.code === 102) {
      const v = p.value.trim()
      if (STRIP_GROUPS.includes(v)) skipping = true
      else if (v === '}' && skipping) {
        skipping = false
        continue
      }
    }
    if (skipping || p.code === 102 || p.code === 360) continue
    if (p.code === 5) {
      const h = newHandle()
      handleMap.set(p.value.trim(), h)
      out.push({ code: 5, value: h })
    } else if (p.code === 330 && !ownerDone) {
      ownerDone = true
      out.push({ code: 330, value: owner })
    } else out.push({ ...p })
  }
  return out
}

const flatBlocks = []
const flatInserts = []
const flatRecords = []
sheets.forEach((s, index) => {
  const paperHandle = PAPERS[s.layout]
  const brHandle = newHandle()
  const name = `FIDELITY_${s.id}`
  const body = []
  const handleMap = new Map()
  let i = 0
  const list = entities.filter(item => inSpace(item, paperHandle))
  while (i < list.length) {
    const item = list[i]
    const rec = item.rec
    i += 1
    if (rec.type === 'ATTRIB') continue // copied with its INSERT
    if (['VIEWPORT', 'OLE2FRAME'].includes(rec.type)) continue
    if (rec.type === 'INSERT' && get(rec, 2)?.trim() === 'FR A3') continue
    const c = centre(geometryPoints(rec))
    if (!c) continue
    const px = c[0] - s.origin[0],
      py = c[1] - s.origin[1]
    if (px < 0 || px > A3.w || py < 0 || py > A3.h) continue
    body.push(...copyRecord(rec, brHandle, handleMap))
    if (rec.type === 'INSERT' && num(rec, 66, 0) === 1) {
      const insertHandle = handleMap.get(get(rec, 5)?.trim())
      const at = recs.indexOf(rec)
      for (let k = at + 1; k < recs.length; k++) {
        const next = recs[k]
        if (next.type !== 'ATTRIB' && next.type !== 'SEQEND') break
        body.push(...copyRecord(next, insertHandle, handleMap))
        if (next.type === 'SEQEND') break
      }
    }
  }
  for (const table of oleTables(s)) {
    for (const l of table.lines)
      body.push(
        { code: 0, value: 'LINE' },
        { code: 5, value: newHandle() },
        { code: 330, value: brHandle },
        { code: 100, value: 'AcDbEntity' },
        { code: 8, value: '0' },
        { code: 62, value: String(l.color) },
        { code: 100, value: 'AcDbLine' },
        { code: 10, value: String(l.a[0]) },
        { code: 20, value: String(l.a[1]) },
        { code: 30, value: '0.0' },
        { code: 11, value: String(l.b[0]) },
        { code: 21, value: String(l.b[1]) },
        { code: 31, value: '0.0' }
      )
    for (const t of table.texts)
      body.push(
        { code: 0, value: 'TEXT' },
        { code: 5, value: newHandle() },
        { code: 330, value: brHandle },
        { code: 100, value: 'AcDbEntity' },
        { code: 8, value: '0' },
        { code: 62, value: String(t.color) },
        { code: 100, value: 'AcDbText' },
        { code: 10, value: String(t.at[0]) },
        { code: 20, value: String(t.at[1]) },
        { code: 30, value: '0.0' },
        { code: 40, value: String(t.height) },
        { code: 1, value: t.text },
        { code: 50, value: String(t.rotation ?? 0) },
        { code: 7, value: OLE_STYLE },
        { code: 72, value: String(t.align) },
        { code: 11, value: String(t.at[0]) },
        { code: 21, value: String(t.at[1]) },
        { code: 31, value: '0.0' },
        { code: 100, value: 'AcDbText' }
      )
  }
  const endHandle = newHandle()
  flatRecords.push(
    { code: 0, value: 'BLOCK_RECORD' },
    { code: 5, value: brHandle },
    { code: 330, value: blockRecordTable },
    { code: 100, value: 'AcDbSymbolTableRecord' },
    { code: 100, value: 'AcDbBlockTableRecord' },
    { code: 2, value: name },
    { code: 340, value: '0' },
    { code: 70, value: '0' },
    { code: 280, value: '1' },
    { code: 281, value: '0' }
  )
  flatBlocks.push(
    { code: 0, value: 'BLOCK' },
    { code: 5, value: newHandle() },
    { code: 330, value: brHandle },
    { code: 100, value: 'AcDbEntity' },
    { code: 8, value: '0' },
    { code: 100, value: 'AcDbBlockBegin' },
    { code: 2, value: name },
    { code: 70, value: '0' },
    { code: 10, value: String(s.origin[0]) },
    { code: 20, value: String(s.origin[1]) },
    { code: 30, value: '0.0' },
    { code: 3, value: name },
    { code: 1, value: '' },
    ...body,
    { code: 0, value: 'ENDBLK' },
    { code: 5, value: endHandle },
    { code: 330, value: brHandle },
    { code: 100, value: 'AcDbEntity' },
    { code: 8, value: '0' },
    { code: 100, value: 'AcDbBlockEnd' }
  )
  const x = FLAT.x + index * FLAT.step,
    y = FLAT.y
  flatInserts.push(
    { code: 0, value: 'INSERT' },
    { code: 5, value: newHandle() },
    { code: 330, value: MODEL },
    { code: 100, value: 'AcDbEntity' },
    { code: 8, value: '0' },
    { code: 100, value: 'AcDbBlockReference' },
    { code: 2, value: name },
    { code: 10, value: String(x) },
    { code: 20, value: String(y) },
    { code: 30, value: '0.0' },
    { code: 41, value: String(FLAT.scale) },
    { code: 42, value: String(FLAT.scale) },
    { code: 43, value: String(FLAT.scale) }
  )
  s.paperWindow = {
    x0: x,
    y0: y,
    x1: x + A3.w * FLAT.scale,
    y1: y + A3.h * FLAT.scale
  }
})

// Write the normalized copy with the additions spliced into their sections.
const normalized = []
let sectionName
let tableName
for (const rec of recs) {
  if (rec.type === 'SECTION') sectionName = get(rec, 2)?.trim()
  if (rec.type === 'TABLE') tableName = get(rec, 2)?.trim()
  if (rec.type === 'ENDTAB' && tableName === 'BLOCK_RECORD')
    normalized.push(...flatRecords)
  if (rec.type === 'ENDSEC' && sectionName === 'BLOCKS')
    normalized.push(...flatBlocks)
  if (rec.type === 'ENDSEC' && sectionName === 'ENTITIES')
    normalized.push(...flatInserts)
  normalized.push(...rec.pairs.filter(p => p.value !== '\u0000drop'))
}
const seedAt = normalized.findIndex(
  p => p.code === 9 && p.value.trim() === '$HANDSEED'
)
if (seedAt >= 0)
  normalized[seedAt + 1] = {
    code: 5,
    value: (seed + 1).toString(16).toUpperCase()
  }
writePairs(normalizedPath, normalized)

mkdirSync(dirname(INVENTORY), { recursive: true })
writeFileSync(INVENTORY, JSON.stringify(out, null, 1) + '\n')
writeFileSync(
  join(WORK, 'orig-manifest.json'),
  JSON.stringify(
    {
      normalizedDxf: normalizedPath,
      sheets: out.sheets.map((s, i) => ({
        id: s.id,
        viewport: s.viewport,
        model: s.model,
        paperWindow: sheets[i].paperWindow
      }))
    },
    null,
    2
  )
)
const size = readFileSync(INVENTORY).length
console.log(
  `[fidelity] extract-orig ${((Date.now() - t0) / 1000).toFixed(1)} s — ` +
    out.sheets
      .map(
        s =>
          `${s.id}: ${s.counts.model}+${s.counts.paper} đt, ${s.texts.length} chữ, ${s.dims.length} dim`
      )
      .join('; ') +
    ` — kiểm kê ${(size / 1024).toFixed(0)} KB, DXF chuẩn hoá: ${normalizedPath}`
)
void all
