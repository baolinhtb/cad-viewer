import type { AcTpTemplate } from '@mlightcad/cad-template-sdk'
import { createDrawContext } from '@mlightcad/cad-template-sdk'
import {
  AcDbArc,
  AcDbCircle,
  AcDbDatabase,
  AcDbEntity,
  AcDbLine,
  AcDbPolyline
} from '@mlightcad/data-model'

import { defaultValues } from './templateValues'
import { roleLayers } from './templateRegistry'

/**
 * Thumbnails for the template picker.
 *
 * DESIGN.md asks each template card to show a small cross-section, and there
 * is no image to show: a template is code, and nobody uploads a picture with
 * it. So the picture is made the only way it can be trusted to match — by
 * running the template with its own default values and drawing what comes
 * out. A thumbnail that was uploaded separately would drift from the geometry
 * the moment the template changed, and a card that lies about the shape is
 * worse than a card with no shape at all.
 *
 * The run happens in a scratch database with no view attached, so it touches
 * neither the open drawing nor the undo stack.
 *
 * Only the shapes {@link createDrawContext} can produce are drawn. Text is
 * skipped: at thumbnail size a label is an illegible smudge that reads as
 * dirt on the drawing.
 */

/**
 * Rendered thumbnail, or the reason there is none.
 *
 * Both fields optional rather than a discriminated union: every consumer reads
 * it the same way — show the picture if there is one, otherwise show why — and
 * a union would make them narrow the type for no safety they actually use.
 */
export interface AcApTemplatePreview {
  /** Inline SVG markup, when the template could be drawn. */
  svg?: string
  /** Why there is no thumbnail, when there is none. */
  reason?: string
}

interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function grow(box: Box | undefined, entity: AcDbEntity): Box | undefined {
  let extents
  try {
    extents = entity.geometricExtents
  } catch {
    return box
  }
  if (!extents?.min || !extents?.max) return box
  const next: Box = {
    minX: extents.min.x,
    minY: extents.min.y,
    maxX: extents.max.x,
    maxY: extents.max.y
  }
  if (!box) return next
  return {
    minX: Math.min(box.minX, next.minX),
    minY: Math.min(box.minY, next.minY),
    maxX: Math.max(box.maxX, next.maxX),
    maxY: Math.max(box.maxY, next.maxY)
  }
}

/** Rounds to a tenth of a unit: thumbnail coordinates need no more. */
const r = (value: number) => Math.round(value * 10) / 10

function shapeOf(entity: AcDbEntity): string | undefined {
  if (entity instanceof AcDbLine) {
    const { startPoint: a, endPoint: b } = entity
    return `<line x1="${r(a.x)}" y1="${r(a.y)}" x2="${r(b.x)}" y2="${r(b.y)}"/>`
  }

  if (entity instanceof AcDbPolyline) {
    const points: string[] = []
    for (let i = 0; i < entity.numberOfVertices; i++) {
      const point = entity.getPoint2dAt(i)
      points.push(`${r(point.x)},${r(point.y)}`)
    }
    if (points.length < 2) return undefined
    const tag = entity.closed ? 'polygon' : 'polyline'
    return `<${tag} points="${points.join(' ')}"/>`
  }

  // Arc extends Circle, so it has to be checked first or every arc renders as
  // a full circle — which on a cross-section reads as a hole that is not there.
  if (entity instanceof AcDbArc) {
    const { center, radius, startAngle, endAngle } = entity
    const sx = center.x + radius * Math.cos(startAngle)
    const sy = center.y + radius * Math.sin(startAngle)
    const ex = center.x + radius * Math.cos(endAngle)
    const ey = center.y + radius * Math.sin(endAngle)
    const sweep = (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2)
    const large = sweep > Math.PI ? 1 : 0
    return `<path d="M ${r(sx)} ${r(sy)} A ${r(radius)} ${r(radius)} 0 ${large} 1 ${r(ex)} ${r(ey)}"/>`
  }

  if (entity instanceof AcDbCircle) {
    const { center, radius } = entity
    return `<circle cx="${r(center.x)}" cy="${r(center.y)}" r="${r(radius)}"/>`
  }

  return undefined
}

/**
 * Draws a template's default output as an inline SVG.
 *
 * @param template - Template to preview.
 * @param size - Square side of the rendered thumbnail, in pixels.
 */
export function renderTemplatePreview(
  template: AcTpTemplate,
  size = 96
): AcApTemplatePreview {
  let entities: readonly AcDbEntity[]
  try {
    const db = new AcDbDatabase()
    db.createDefaultData()
    const ctx = createDrawContext(db, template.meta.id, roleLayers())
    const result = template.generate(ctx, defaultValues(template))
    if (result && typeof (result as Promise<void>).then === 'function') {
      // A template that draws asynchronously cannot be previewed synchronously,
      // and a card must not wait on one. Saying so beats showing an empty box.
      return { reason: 'Template vẽ bất đồng bộ, chưa xem trước được.' }
    }
    entities = ctx.drawn
  } catch (error) {
    // A template whose defaults throw is a broken template, but the picker is
    // the wrong place to fail: the engineer still has to see the card in order
    // to understand which one is broken.
    return {
      reason:
        error instanceof Error
          ? error.message
          : 'Không dựng được hình xem trước.'
    }
  }

  let box: Box | undefined
  const shapes: string[] = []
  for (const entity of entities) {
    const shape = shapeOf(entity)
    if (!shape) continue
    shapes.push(shape)
    box = grow(box, entity)
  }

  if (!box || shapes.length === 0) {
    return { reason: 'Template không vẽ hình nào với giá trị mặc định.' }
  }

  const width = Math.max(box.maxX - box.minX, 1)
  const height = Math.max(box.maxY - box.minY, 1)
  const pad = Math.max(width, height) * 0.06

  // The Y axis points up in the drawing and down in SVG; flipping in the
  // transform keeps every coordinate above written the way the template wrote
  // it, so a mistake here cannot be mistaken for a mistake in the geometry.
  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
      `viewBox="${r(box.minX - pad)} ${r(-box.maxY - pad)} ${r(width + pad * 2)} ${r(height + pad * 2)}" ` +
      `fill="none" stroke="currentColor" stroke-width="${r(Math.max(width, height) / 90)}" ` +
      `stroke-linejoin="round" vector-effect="non-scaling-stroke">` +
      `<g transform="scale(1,-1)">${shapes.join('')}</g>` +
      `</svg>`
  }
}
