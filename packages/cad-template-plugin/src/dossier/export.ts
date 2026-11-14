import type {
  AcTpLayerStyleMap,
  AcTpRoleLayerMap
} from '@mlightcad/cad-template-sdk'
import {
  acTpAnnotationPresentation,
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
  styles: AcTpLayerStyleMap = {}
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
    else if (op.kind === 'text') {
      const anchor =
        op.align === 1 ? 'middle' : op.align === 2 ? 'end' : 'start'
      lines.push(
        `<g transform="translate(${op.at[0]} ${sheet.height - op.at[1]}) rotate(${-(op.rotation ?? 0)}) scale(${op.widthFactor ?? 1} 1)" text-anchor="${anchor}">${text([0, sheet.height], op.text, op.height)}</g>`
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
          measured.toFixed(0),
          200
        )
      )
    }
    lines.push('</g>')
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheet.width} ${sheet.height}" width="841mm" height="594mm"><rect width="100%" height="100%" fill="white"/>${lines.join('')}</svg>`
}

/** Self-contained, printable packet. No CDN, external fonts, scripts, or
 * hidden approval state is needed to open it. Print to PDF creates six A1 pages. */
export function dossierHtml(
  scene: DossierScene,
  layers: AcTpRoleLayerMap = SEED_ROLE_LAYERS,
  styles: AcTpLayerStyleMap = {}
): string {
  return `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Hồ sơ ${escape(String(scene.model.values.tenMo))} — bản nháp</title>
<style>@page{size:841mm 594mm;margin:0}*{box-sizing:border-box}body{margin:0;background:#e5e7eb;font-family:Arial,sans-serif}header{padding:24px;max-width:1100px}h1{font-size:24px}article{background:white;margin:20px;width:841mm;height:594mm;overflow:hidden;break-after:page}article:last-child{break-after:auto}svg{display:block;width:100%;height:100%}@media print{header{display:none}body{background:white}article{margin:0}}</style>
<header><h1>Hồ sơ ${escape(String(scene.model.values.tenMo))} — 6 tờ bản nháp</h1><p>In trang này hoặc lưu thành PDF; khổ A1 ngang, tỷ lệ 100%, tắt đầu/chân trang của trình duyệt. DXF và JSON được xuất từ cùng mô hình, không bao gồm sửa tay trên canvas.</p><ul>${scene.model.issues.map(i => `<li>${escape(i.message)}</li>`).join('')}</ul></header>
${scene.sheets.map(s => `<article aria-label="${escape(s.title)}">${dossierSheetSvg(s, layers, styles)}</article>`).join('')}</html>`
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
  const ctx = createDrawContext(
    db,
    DOSSIER_ID,
    layers,
    {
      id: 'r1',
      version: scene.version,
      values: scene.model.values
    },
    styles
  )
  drawDossierScene(ctx, scene)
  return db.dxfOut(undefined, 6)
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
