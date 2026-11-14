#!/usr/bin/env node
/* global process */
/**
 * Extracts the sheet layout of `assets/02. BTC- mo_2.dwg` for the dossier
 * generator 0.3.0: per A3 sheet, its viewport rectangle and model window,
 * its title texts, and everything drawn in paper space (the section key plan
 * of SUB-070, the bar-shape legend of SUB-100) as plain primitives.
 *
 *   node tools/fidelity/extract-layout.mjs [--work /workspace/cadview-shots/mo2/work]
 *
 * Reads the normalized copy made by `extract-orig.mjs` (texts already decoded
 * from TCVN3, paper content of each sheet in block `FIDELITY_<sheet>` whose
 * base point is the sheet's lower-left corner) and writes
 * `packages/cad-template-plugin/src/dossier/reference/layout-mo2.json`.
 *
 * Coordinates: paper millimetres from the sheet's lower-left corner.
 * Appearance is the effective one (ByLayer/ByBlock resolved). Nested inserts
 * are exploded, except the section-cut symbols (`*U…` with attribute `CS`),
 * which stay block inserts with their attribute values. Dimension sizes are
 * stored as drawn on the generated sheet (paper × 100, DIMSCALE applied).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { get, num, points, readPairs, records, walk } from './dxf.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const argWork = process.argv.indexOf('--work')
const WORK =
  argWork > 0 ? process.argv[argWork + 1] : '/workspace/cadview-shots/mo2/work'
const OUT = join(
  ROOT,
  'packages/cad-template-plugin/src/dossier/reference/layout-mo2.json'
)
const INVENTORY = join(
  ROOT,
  'packages/cad-template-plugin/__tests__/fidelity/mo2-inventory.json'
)
/** Paper → generated sheet units (1:100 sheets drawn in model space). */
const K = 100

const pairs = readPairs(join(WORK, 'mo2.normalized.dxf'))
const items = [...walk(records(pairs))]
const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'))

// ---------------------------------------------------------------- tables
const layers = new Map()
const dimstyles = new Map()
const DIMVAR_CODES = {
  40: 'dimscale',
  41: 'dimasz',
  42: 'dimexo',
  44: 'dimexe',
  140: 'dimtxt',
  147: 'dimgap',
  77: 'dimtad',
  176: 'dimclrd',
  177: 'dimclre',
  178: 'dimclrt',
  144: 'dimlfac',
  271: 'dimdec'
}
const dimVar = (name, value) => {
  const v = Number(value)
  if (!name.startsWith('dimclr') || (v >= 0 && v <= 256)) return v
  return (v >>> 0) & 0xff
}
for (const { table, rec } of items.filter(i => i.table)) {
  const name = get(rec, 2)?.trim()
  if (table === 'LAYER')
    layers.set(name.toLowerCase(), {
      color: Math.abs(num(rec, 62, 7)),
      lt: (get(rec, 6) ?? 'CONTINUOUS').trim().toUpperCase(),
      lw: num(rec, 370, -3)
    })
  else if (table === 'DIMSTYLE') {
    const vars = {}
    for (const p of rec.pairs) {
      if (p.code >= 1000) break
      const k = DIMVAR_CODES[p.code]
      if (k) vars[k] = dimVar(k, p.value)
    }
    dimstyles.set(name.toLowerCase(), vars)
  }
}

const blocks = new Map()
for (const { block, rec } of items) {
  if (!block) continue
  if (!blocks.has(block.name)) blocks.set(block.name, [])
  blocks.get(block.name).push(rec)
}
const blockBase = new Map(
  items
    .filter(i => i.section === 'BLOCKS' && i.rec.type === 'BLOCK')
    .map(i => [get(i.rec, 2)?.trim(), points(i.rec, 10, 20)[0] ?? [0, 0]])
)
// walk() swallows BLOCK records; read base points straight from the pairs.
{
  let name
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 0 && pairs[i].value.trim() === 'BLOCK') {
      name = undefined
      let x = 0,
        y = 0
      for (let k = i + 1; k < pairs.length && pairs[k].code !== 0; k++) {
        if (pairs[k].code === 2 && name === undefined)
          name = pairs[k].value.trim()
        if (pairs[k].code === 10) x = Number(pairs[k].value)
        if (pairs[k].code === 20) y = Number(pairs[k].value)
      }
      if (name) blockBase.set(name, [x, y])
    }
  }
}

// ---------------------------------------------------------------- styles
/** Source text style → `_33_` text style (see AcTpStyles33). */
const TEXT_STYLE = name => {
  const n = String(name ?? '').toLowerCase()
  if (n === '2') return '_33_Arial08'
  if (n.includes('narrow') || n === 'arialn') return '_33_ArialHep'
  if (n.includes('avant') || n === 'text' || n === 'style1a') return '_33_Avant'
  return '_33_Arial'
}
const DIM_STYLE = {
  d100: '_33_D100',
  150: '_33_D150',
  dim100: '_33_Dim100',
  d125: '_33_D125',
  1: '_33_D1',
  d1_sagi: '_33_D1Sagi'
}

// ---------------------------------------------------------------- geometry
const r3 = v => Math.round(v * 1000) / 1000
const P = ([x, y]) => [r3(x), r3(y)]

/** Affine transform of an insert: block point → parent point. */
function insertTransform(rec, parent) {
  const [ix, iy] = points(rec, 10, 20)[0]
  const sx = num(rec, 41, 1),
    sy = num(rec, 42, 1)
  const a = (num(rec, 50, 0) * Math.PI) / 180
  const [bx, by] = blockBase.get(get(rec, 2)?.trim()) ?? [0, 0]
  const local = ([x, y]) => {
    const lx = (x - bx) * sx,
      ly = (y - by) * sy
    return [
      ix + lx * Math.cos(a) - ly * Math.sin(a),
      iy + lx * Math.sin(a) + ly * Math.cos(a)
    ]
  }
  return {
    apply: p => parent.apply(local(p)),
    scale: parent.scale * Math.abs(sy),
    rotation: parent.rotation + num(rec, 50, 0) * (parent.mirror ? -1 : 1),
    mirror: parent.mirror !== sx * sy < 0
  }
}

function look(rec, parent) {
  const layer = layers.get((get(rec, 8) ?? '0').trim().toLowerCase()) ?? {
    color: 7,
    lt: 'CONTINUOUS',
    lw: -3
  }
  let color = num(rec, 62, 256)
  if (color === 256) color = layer.color
  else if (color === 0) color = parent?.color ?? 7
  let lt = (get(rec, 6) ?? 'BYLAYER').trim().toUpperCase()
  if (lt === 'BYLAYER') lt = layer.lt
  if (lt === 'BYBLOCK') lt = parent?.lt ?? 'CONTINUOUS'
  let lw = num(rec, 370, -1)
  if (lw === -1) lw = layer.lw
  if (lw === -2) lw = parent?.lw ?? -3
  return { color: Math.abs(color), lt, lw }
}
const lookOut = l => ({
  color: l.color,
  ...(l.lt !== 'CONTINUOUS' ? { lineType: l.lt } : {}),
  ...(l.lw >= 0 ? { lineWeight: l.lw } : {})
})

const TEXT_ALIGN = h => (h === 1 || h === 4 ? 1 : h === 2 ? 2 : 0)

/** HATCH boundary loops as point lists (arc edges tessellated). */
function hatchLoops(rec) {
  const ps = rec.pairs
  const loops = []
  let i = ps.findIndex(p => p.code === 91)
  const nLoops = Number(ps[i].value)
  i += 1
  for (let l = 0; l < nLoops; l++) {
    while (ps[i].code !== 92) i++
    const flags = Number(ps[i].value)
    i++
    const loop = []
    if (flags & 2) {
      const hasBulge = Number(ps[i].value) // 72
      i += 2 // 72, 73
      const n = Number(ps[i].value) // 93
      i++
      for (let v = 0; v < n; v++) {
        const x = Number(ps[i].value),
          y = Number(ps[i + 1].value)
        i += 2
        if (hasBulge && ps[i].code === 42) i++
        loop.push([x, y])
      }
    } else {
      const n = Number(ps[i].value) // 93
      i++
      for (let e = 0; e < n; e++) {
        const type = Number(ps[i].value) // 72
        i++
        if (type === 1) {
          loop.push([Number(ps[i].value), Number(ps[i + 1].value)])
          i += 4
        } else if (type === 2) {
          const cx = Number(ps[i].value),
            cy = Number(ps[i + 1].value),
            r = Number(ps[i + 2].value)
          let a0 = Number(ps[i + 3].value),
            a1 = Number(ps[i + 4].value)
          const ccw = Number(ps[i + 5].value)
          i += 6
          if (!ccw) [a0, a1] = [-a0, -a1]
          if (a1 < a0) a1 += 360
          const steps = Math.max(4, Math.ceil((a1 - a0) / 10))
          for (let s = 0; s < steps; s++) {
            const t = ((a0 + ((a1 - a0) * s) / steps) * Math.PI) / 180
            loop.push([cx + r * Math.cos(t), cy + r * Math.sin(t)])
          }
        } else throw new Error(`HATCH: cạnh loại ${type} chưa hỗ trợ`)
      }
    }
    // Source boundary object references.
    while (i < ps.length && ps[i].code !== 97) i++
    const refs = Number(ps[i].value)
    i += 1 + refs
    loops.push(loop)
  }
  return loops
}

/**
 * Emits primitives for one record, in parent coordinates.
 * @param out list to push into
 */
function emit(rec, tf, parentLook, out, attribsOf) {
  // Hidden by a dynamic block's visibility state (group 60 = 1).
  if (num(rec, 60, 0) === 1) return
  const l = look(rec, parentLook)
  const base = lookOut(l)
  const T = p => P(tf.apply(p))
  switch (rec.type) {
    case 'LINE':
      out.push({
        kind: 'path',
        line: true,
        ...base,
        points: [T(points(rec, 10, 20)[0]), T(points(rec, 11, 21)[0])]
      })
      return
    case 'LWPOLYLINE': {
      const pts = []
      const bulges = []
      for (const p of rec.pairs) {
        if (p.code === 10) {
          pts.push([Number(p.value)])
          bulges.push(0)
        } else if (p.code === 20) pts[pts.length - 1].push(Number(p.value))
        else if (p.code === 42)
          bulges[bulges.length - 1] = Number(p.value) * (tf.mirror ? -1 : 1)
      }
      out.push({
        kind: 'path',
        ...base,
        points: pts.map(T),
        ...(bulges.some(b => b) ? { bulges: bulges.map(r3) } : {}),
        ...(num(rec, 70, 0) & 1 ? { closed: true } : {})
      })
      return
    }
    case 'CIRCLE':
      out.push({
        kind: 'circle',
        ...base,
        at: T(points(rec, 10, 20)[0]),
        radius: r3(num(rec, 40) * tf.scale)
      })
      return
    case 'ARC': {
      const [cx, cy] = points(rec, 10, 20)[0]
      const r = num(rec, 40)
      const at = a => [
        cx + r * Math.cos((a * Math.PI) / 180),
        cy + r * Math.sin((a * Math.PI) / 180)
      ]
      const c = tf.apply([cx, cy])
      let [p0, p1] = [tf.apply(at(num(rec, 50))), tf.apply(at(num(rec, 51)))]
      if (tf.mirror) [p0, p1] = [p1, p0]
      const ang = p =>
        r3((Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI)
      out.push({
        kind: 'arc',
        ...base,
        at: P(c),
        radius: r3(r * tf.scale),
        startAngle: ang(p0),
        endAngle: ang(p1)
      })
      return
    }
    case 'SOLID': {
      const q = [
        points(rec, 10, 20)[0],
        points(rec, 11, 21)[0],
        points(rec, 13, 23)[0],
        points(rec, 12, 22)[0]
      ].map(T)
      const loop = q.filter(
        (p, k) => k === 0 || p[0] !== q[k - 1][0] || p[1] !== q[k - 1][1]
      )
      out.push({ kind: 'fill', ...base, loops: [loop] })
      return
    }
    case 'HATCH': {
      const solid = num(rec, 70, 0) === 1
      out.push({
        kind: 'fill',
        ...base,
        loops: hatchLoops(rec).map(loop => loop.map(T)),
        ...(solid
          ? {}
          : {
              pattern: get(rec, 2)?.trim(),
              patternScale: r3(num(rec, 41, 1) * tf.scale * K),
              patternAngle: r3(num(rec, 52, 0))
            })
      })
      return
    }
    case 'TEXT':
    case 'ATTRIB': {
      const text = (get(rec, 1) ?? '').trim()
      if (!text) return
      const h = num(rec, 72, 0)
      const aligned = h !== 0 || num(rec, 74, num(rec, 73, 0)) !== 0
      const anchor = aligned ? points(rec, 11, 21)[0] : points(rec, 10, 20)[0]
      out.push({
        kind: 'text',
        ...base,
        at: T(anchor),
        text,
        height: r3(num(rec, 40) * tf.scale),
        ...(num(rec, 50, 0) || tf.rotation
          ? { rotation: r3(num(rec, 50, 0) + tf.rotation) }
          : {}),
        ...(TEXT_ALIGN(h) ? { align: TEXT_ALIGN(h) } : {}),
        ...(num(rec, 41, 1) !== 1 ? { widthFactor: r3(num(rec, 41, 1)) } : {}),
        style: TEXT_STYLE(get(rec, 7)?.trim())
      })
      return
    }
    case 'DIMENSION': {
      const type = num(rec, 70, 0) & 7
      if (type > 1) throw new Error(`DIMENSION loại ${type} chưa hỗ trợ`)
      const styleName = (get(rec, 3) ?? 'Standard').trim()
      const vars = { ...(dimstyles.get(styleName.toLowerCase()) ?? {}) }
      // DSTYLE overrides from ACAD xdata.
      const x = []
      let inAcad = false
      for (const p of rec.pairs) {
        if (p.code === 1001) inAcad = p.value.trim() === 'ACAD'
        else if (inAcad && p.code >= 1000) x.push(p)
      }
      const s = x.findIndex(p => p.code === 1000 && p.value.trim() === 'DSTYLE')
      if (s >= 0)
        for (let k = s + 2; k + 1 < x.length && x[k].code !== 1002; k += 2) {
          const name = DIMVAR_CODES[Number(x[k].value)]
          if (name) vars[name] = dimVar(name, x[k + 1].value)
        }
      // As drawn on the generated sheet: sizes × DIMSCALE × paper factor.
      const scale = (vars.dimscale || 1) * K * tf.scale
      const eff = {}
      for (const [k, v] of Object.entries(vars)) {
        if (k === 'dimscale') continue
        eff[k] = ['dimasz', 'dimexo', 'dimexe', 'dimtxt', 'dimgap'].includes(k)
          ? r3(v * scale)
          : k === 'dimlfac'
            ? r3(v / K / tf.scale)
            : v
      }
      const override = (get(rec, 1) ?? '').trim()
      out.push({
        kind: 'dimension',
        ...base,
        start: T(points(rec, 13, 23)[0]),
        end: T(points(rec, 14, 24)[0]),
        dimLine: T(points(rec, 10, 20)[0]),
        ...(type === 1
          ? { aligned: true }
          : { rotation: r3(num(rec, 50, 0) + tf.rotation) }),
        dimStyle: DIM_STYLE[styleName.toLowerCase()] ?? '_33_D100',
        vars: eff,
        ...(override && override !== '<>' ? { text: override } : {})
      })
      return
    }
    case 'INSERT': {
      const name = get(rec, 2)?.trim()
      const attribs = attribsOf(rec)
      const body = blocks.get(name)
      if (!body) {
        console.warn(`[layout] block ${name} không có trong DXF — bỏ qua`)
        return
      }
      if (body.some(r => r.type === 'ATTDEF' && get(r, 2)?.trim() === 'CS')) {
        const [ix, iy] = tf.apply(points(rec, 10, 20)[0])
        out.push({
          kind: 'insert',
          ...base,
          block: symbol(name),
          at: P([ix, iy]),
          scale: [
            r3(num(rec, 41, 1) * tf.scale),
            r3(num(rec, 42, 1) * tf.scale)
          ],
          ...(num(rec, 50, 0) ? { rotation: r3(num(rec, 50, 0)) } : {}),
          attributes: Object.fromEntries(
            attribs.map(a => [get(a, 2)?.trim(), (get(a, 1) ?? '').trim()])
          )
        })
        return
      }
      const child = insertTransform(rec, tf)
      for (const r of body) {
        if (['ATTDEF', 'SEQEND', 'ATTRIB', 'VIEWPORT'].includes(r.type))
          continue
        emit(r, child, l, out, () => [])
      }
      for (const a of attribs) emit(a, tf, l, out, () => [])
      return
    }
    case 'MTEXT':
    case 'VIEWPORT':
    case 'OLE2FRAME':
    case 'SEQEND':
      return
    default:
      throw new Error(`Loại ${rec.type} chưa hỗ trợ trong nội dung paper`)
  }
}

// ---------------------------------------------------------------- symbols
/** Section-cut symbols: one shared block per distinct geometry. */
const symbolBlocks = []
const symbolOf = new Map()
function symbol(name) {
  if (symbolOf.has(name)) return symbolOf.get(name)
  const base = blockBase.get(name) ?? [0, 0]
  const entities = []
  const T = p => P([p[0] - base[0], p[1] - base[1]])
  for (const r of blocks.get(name)) {
    if (r.type === 'LWPOLYLINE') {
      const pts = []
      for (const p of r.pairs) {
        if (p.code === 10) pts.push([Number(p.value)])
        else if (p.code === 20) pts[pts.length - 1].push(Number(p.value))
      }
      entities.push({
        kind: 'polyline',
        points: pts.map(T).map(([x, y]) => ({ x, y, z: 0 })),
        ...(num(r, 70, 0) & 1 ? { closed: true } : {})
      })
    } else if (r.type === 'ATTDEF') {
      const h = num(r, 72, 0)
      const aligned = h !== 0 || num(r, 74, 0) !== 0
      const [x, y] = T(aligned ? points(r, 11, 21)[0] : points(r, 10, 20)[0])
      entities.push({
        kind: 'attribute',
        tag: get(r, 2)?.trim(),
        prompt: (get(r, 3) ?? '').trim() || get(r, 2)?.trim(),
        defaultValue: (get(r, 1) ?? '').trim(),
        position: { x, y, z: 0 },
        height: r3(num(r, 40)),
        ...(TEXT_ALIGN(h) ? { align: TEXT_ALIGN(h) } : {}),
        style: TEXT_STYLE(get(r, 7)?.trim())
      })
    } else throw new Error(`Ký hiệu ${name}: loại ${r.type} chưa hỗ trợ`)
  }
  const key = JSON.stringify(entities)
  let found = symbolBlocks.find(b => JSON.stringify(b.entities) === key)
  if (!found) {
    found = {
      name: `_33_KH_MAT_CAT${symbolBlocks.length ? `_${symbolBlocks.length + 1}` : ''}`,
      entities
    }
    symbolBlocks.push(found)
  }
  symbolOf.set(name, found.name)
  return found.name
}

// ---------------------------------------------------------------- sheets
const VIEW = {
  'SUB-010': { view: 'general', offset: [337000, -13000] },
  'SUB-020': { view: 'general', offset: [337000, -13000] },
  'SUB-070': { view: 'main', offset: [349000, -71500] },
  'SUB-080': { view: 'left', offset: [388000, -71000] },
  'SUB-090': { view: 'right', offset: [311000, -71000] },
  'SUB-100': null
}
const TITLE = /^(SUB-\d+|CẦU KM|BỐ TRÍ (CHUNG|CỐT THÉP) MỐ|TỔNG HỢP KHỐI LƯỢNG)/

const sheets = inventory.sheets.map(inv => {
  const name = `FIDELITY_${inv.id}`
  const base = blockBase.get(name)
  const body = blocks.get(name) ?? []
  const tf = {
    apply: ([x, y]) => [x - base[0], y - base[1]],
    scale: 1,
    rotation: 0,
    mirror: false
  }
  const attribsOf = rec => {
    const at = body.indexOf(rec)
    const out = []
    for (let k = at + 1; k < body.length && body[k].type === 'ATTRIB'; k++)
      out.push(body[k])
    return out
  }
  const paper = []
  const title = []
  for (const rec of body) {
    if (rec.type === 'ATTRIB' || rec.type === 'SEQEND') continue
    const list = []
    emit(rec, tf, undefined, list, attribsOf)
    for (const p of list)
      (p.kind === 'text' && TITLE.test(p.text) ? title : paper).push(p)
  }
  return {
    id: inv.id,
    viewport: inv.viewport,
    model: inv.model,
    ...(VIEW[inv.id] ?? {}),
    title,
    paper
  }
})

const out = {
  source: '02. BTC- mo_2.dwg',
  note:
    'Bố cục 6 tờ A3 của bản gốc cho bộ sinh 0.3.0. Toạ độ mm giấy từ góc dưới trái tờ. ' +
    'Sinh bởi tools/fidelity/extract-layout.mjs; không sửa tay.',
  blocks: symbolBlocks,
  sheets
}
writeFileSync(OUT, JSON.stringify(out) + '\n')
console.log(
  `[layout] ${OUT}: ${sheets.map(s => `${s.id} ${s.title.length}+${s.paper.length}`).join(', ')}; ký hiệu ${symbolBlocks.length}; ${JSON.stringify(out).length} B`
)
