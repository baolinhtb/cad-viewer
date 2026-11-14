import type {
  AcTpBlockDef,
  AcTpLayerStyleMap,
  AcTpRoleLayerMap
} from '@mlightcad/cad-template-sdk'
import {
  acTpAnnotationPresentation,
  acTpDxfOut,
  acTpWithWorkingDatabaseSync,
  createDrawContext,
  LINETYPE_PLOT_SCALE,
  SEED_ROLE_LAYERS,
  TEMPLATE_LINETYPES
} from '@mlightcad/cad-template-sdk'
import { AcCmColor, AcCmColorMethod, AcDbDatabase } from '@mlightcad/data-model'

import { DOSSIER_ID } from './model'
import type { DossierScene, DossierSheet, XY } from './scene'
import { drawDossierScene } from './scene'

const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** All output consumes exactly the same prepared scene as CAD. */
export function dossierSheetSvg(
  sheet: DossierSheet,
  layers: AcTpRoleLayerMap = SEED_ROLE_LAYERS,
  styles: AcTpLayerStyleMap = {},
  blocks: readonly AcTpBlockDef[] = []
): string {
  const lookup = new Map(
    Object.entries(styles).map(([name, value]) => [name.toLowerCase(), value])
  )
  // Dark equivalents preserve annotation hues while remaining readable on white paper.
  const ink: Record<number, string> = {
    1: '#b91c1c',
    2: '#854d0e',
    3: '#166534',
    4: '#0e7490',
    7: '#111111'
  }

  const point = (p: XY) => `${p[0]},${sheet.height - p[1]}`
  const lines: string[] = []
  const path = (pts: XY[]) =>
    `<polyline points="${pts.map(point).join(' ')}" fill="none" stroke="currentColor" stroke-width="16"/>`
  const text = (p: XY, content: string, height: number) =>
    `<text x="${p[0]}" y="${sheet.height - p[1]}" font-size="${height}" font-family="Arial,DejaVu Sans,sans-serif" fill="currentColor" stroke="none" stroke-dasharray="none">${escape(content)}</text>`
  for (const op of sheet.primitives) {
    const custom = lookup.get((layers[op.role] ?? '').toLowerCase())
    const presentation = acTpAnnotationPresentation(op.role, custom)
    const color = op.color ?? presentation.color ?? 7
    const value =
      ink[color] ??
      new AcCmColor(AcCmColorMethod.ByACI, color).cssColor ??
      '#111111'
    const lineType = presentation.lineType
    const pattern = lineType ? TEMPLATE_LINETYPES[lineType]?.pattern : undefined
    const dash = pattern
      ? ` stroke-dasharray="${pattern.map(n => Math.abs(n) * LINETYPE_PLOT_SCALE).join(' ')}"`
      : ''
    lines.push(`<g color="${value}"${dash}>`)

    if (op.kind === 'fill') {
      const d = op.loops
        .map(loop => 'M' + loop.map(point).join(' L') + ' Z')
        .join(' ')
      lines.push(
        `<path d="${d}" fill="currentColor" fill-rule="evenodd" stroke="none"/>`
      )
    } else if (op.kind === 'path')
      lines.push(path(op.closed ? [...op.points, op.points[0]] : op.points))
    else if (op.kind === 'circle')
      lines.push(
        `<circle cx="${op.at[0]}" cy="${sheet.height - op.at[1]}" r="${op.radius}" fill="none" stroke="currentColor" stroke-width="16"/>`
      )
    else if (op.kind === 'arc') {
      const at = (deg: number): XY => [
        op.at[0] + op.radius * Math.cos((deg * Math.PI) / 180),
        op.at[1] + op.radius * Math.sin((deg * Math.PI) / 180)
      ]
      const sweep = (((op.endAngle - op.startAngle) % 360) + 360) % 360
      const [p0, p1] = [at(op.startAngle), at(op.endAngle)]
      // SVG y grows downwards: a counter-clockwise CAD arc is sweep-flag 0.
      lines.push(
        `<path d="M${point(p0)} A${op.radius} ${op.radius} 0 ${sweep > 180 ? 1 : 0} 0 ${point(p1)}" fill="none" stroke="currentColor" stroke-width="16"/>`
      )
    } else if (op.kind === 'point') {
      lines.push(
        `<circle cx="${op.at[0]}" cy="${sheet.height - op.at[1]}" r="16" fill="currentColor" stroke="none"/>`
      )
    } else if (op.kind === 'angular') {
      lines.push(path([op.start, op.at, op.end]))
    } else if (op.kind === 'leader') {
      lines.push(path(op.points))
    } else if (op.kind === 'insert') {
      const def = blocks.find(b => b.name === op.block)
      const k = `translate(${op.at[0]} ${sheet.height - op.at[1]}) rotate(${-(op.rotation ?? 0)}) scale(${op.scale[0]} ${-op.scale[1]})`
      const parts: string[] = []
      for (const e of def?.entities ?? []) {
        if (e.kind === 'polyline') {
          const pts = e.points.map(p => `${p.x},${p.y}`)
          if (e.closed) pts.push(pts[0])
          parts.push(
            `<polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="${16 / Math.abs(op.scale[0])}"/>`
          )
        } else if (e.kind === 'attribute') {
          const own = op.attributes[e.tag]
          const value =
            (typeof own === 'string' ? own : own?.value) ?? e.defaultValue ?? ''
          // Text stays upright and unmirrored, as AutoCAD draws ATTRIB.
          const sx = Math.sign(op.scale[0])
          const anchor =
            e.align === 1 ? 'middle' : e.align === 2 ? 'end' : 'start'
          parts.push(
            `<g transform="translate(${e.position.x} ${e.position.y}) scale(${sx} -1)" text-anchor="${anchor}"><text font-size="${e.height}" font-family="Arial,DejaVu Sans,sans-serif" fill="currentColor">${escape(value)}</text></g>`
          )
        }
      }
      lines.push(`<g transform="${k}">${parts.join('')}</g>`)
    } else if (op.kind === 'text') {
      const anchor =
        op.align === 1 ? 'middle' : op.align === 2 ? 'end' : 'start'
      lines.push(
        `<g transform="translate(${op.at[0]} ${sheet.height - op.at[1]}) rotate(${-(op.rotation ?? 0)}) scale(${op.widthFactor ?? 1} 1)" text-anchor="${anchor}">${text([0, sheet.height], op.text, op.height)}</g>`
      )
    } else if (op.direction === 'nghieng') {
      const dx = op.end[0] - op.start[0],
        dy = op.end[1] - op.start[1]
      const len = Math.hypot(dx, dy) || 1
      const nx = (-dy / len) * op.offset,
        ny = (dx / len) * op.offset
      const a: XY = [op.start[0] + nx, op.start[1] + ny]
      const b: XY = [op.end[0] + nx, op.end[1] + ny]
      lines.push(path([op.start, a]), path([op.end, b]), path([a, b]))
      const value = len.toFixed(0)
      lines.push(
        text(
          [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 100],
          op.text === undefined ? value : op.text.replace(/<>/g, value),
          200
        )
      )
    } else {
      const horizontal = op.direction === 'ngang'
      const a: XY = horizontal
        ? [op.start[0], op.start[1] + op.offset]
        : [op.start[0] + op.offset, op.start[1]]
      const b: XY = horizontal ? [op.end[0], a[1]] : [a[0], op.end[1]]
      lines.push(path([op.start, a]), path([op.end, b]), path([a, b]))
      for (const p of [a, b])
        lines.push(
          path([
            [p[0] - 70, p[1] - 70],
            [p[0] + 70, p[1] + 70]
          ])
        )
      const measured = Math.abs(
        horizontal ? op.end[0] - op.start[0] : op.end[1] - op.start[1]
      )
      lines.push(
        text(
          [(a[0] + b[0]) / 2 + 60, (a[1] + b[1]) / 2 + 100],
          op.text === undefined
            ? measured.toFixed(0)
            : op.text.replace(/<>/g, measured.toFixed(0)),
          200
        )
      )
    }
    lines.push('</g>')
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheet.width} ${sheet.height}" width="${paperMm(sheet)[0]}mm" height="${paperMm(sheet)[1]}mm"><rect width="100%" height="100%" fill="white"/>${lines.join('')}</svg>`
}

/** Paper size of a sheet in millimetres (A1 841 × 594, A3 420 × 297). */
const paperMm = (sheet: DossierSheet): [number, number] => [
  Math.round(sheet.width / sheet.scale),
  Math.round(sheet.height / sheet.scale)
]

/** Self-contained, printable packet. No CDN, external fonts, scripts, or
 * hidden approval state is needed to open it. Print to PDF creates one page
 * per sheet, at the sheets' paper size (A1 up to 0.2.0, A3 from 0.3.0). */
export function dossierHtml(
  scene: DossierScene,
  layers: AcTpRoleLayerMap = SEED_ROLE_LAYERS,
  styles: AcTpLayerStyleMap = {}
): string {
  const [pw, ph] = scene.sheets.length ? paperMm(scene.sheets[0]) : [841, 594]
  const size = pw === 420 ? 'A3' : 'A1'
  return `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Hồ sơ ${escape(String(scene.model.values.tenMo))} — bản nháp</title>
<style>@page{size:${pw}mm ${ph}mm;margin:0}*{box-sizing:border-box}body{margin:0;background:#e5e7eb;font-family:Arial,sans-serif}header{padding:24px;max-width:1100px}h1{font-size:24px}article{background:white;margin:20px;width:${pw}mm;height:${ph}mm;overflow:hidden;break-after:page}article:last-child{break-after:auto}svg{display:block;width:100%;height:100%}@media print{header{display:none}body{background:white}article{margin:0}}</style>
<header><h1>Hồ sơ ${escape(String(scene.model.values.tenMo))} — 6 tờ bản nháp</h1><p>In trang này hoặc lưu thành PDF; khổ ${size} ngang, tỷ lệ 100%, tắt đầu/chân trang của trình duyệt. DXF và JSON được xuất từ cùng mô hình, không bao gồm sửa tay trên canvas.</p><ul>${scene.model.issues.map(i => `<li>${escape(i.message)}</li>`).join('')}</ul></header>
${scene.sheets.map(s => `<article aria-label="${escape(s.title)}">${dossierSheetSvg(s, layers, styles, scene.blocks)}</article>`).join('')}</html>`
}

/** A separate database prevents exporting unrelated drawings or mutating the
 * active document. This is explicitly a regeneration from recorded parameters. */
export function dossierDxf(
  scene: DossierScene,
  layers: AcTpRoleLayerMap = SEED_ROLE_LAYERS,
  styles: AcTpLayerStyleMap = {}
): string | Uint8Array {
  const db = new AcDbDatabase()
  db.createDefaultData()
  acTpWithWorkingDatabaseSync(db, () =>
    drawDossierScene(
      createDrawContext(
        db,
        DOSSIER_ID,
        layers,
        { id: 'r1', version: scene.version, values: scene.model.values },
        styles
      ),
      scene
    )
  )
  return acTpDxfOut(db, 6)
}

export interface DossierDownload {
  name: string
  mime: string
  content: string | Uint8Array
}
export function downloadDossierFile(file: DossierDownload): void {
  const content =
    typeof file.content === 'string'
      ? file.content
      : new Uint8Array(file.content)
  const url = URL.createObjectURL(new Blob([content], { type: file.mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}
