import {
  AcCmColor,
  AcCmColorMethod,
  AcDbArc,
  AcDbCircle,
  AcDbDatabase,
  AcDbEntity,
  AcDbHatch,
  AcDbHatchPatternType,
  AcDbHatchStyle,
  AcDbLayerTableRecord,
  AcDbLine,
  AcDbPolyline,
  AcDbRotatedDimension,
  AcDbText,
  AcGeLine2d,
  AcGeLoop2d,
  AcGePoint2d,
  AcGePoint3d,
  AcGePoint3dLike,
  HATCH_PATTERN_SOLID
} from '@mlightcad/data-model'

import { buildDimensionBlock } from './AcTpDimensionBlock'
import {
  AcTpRunRecord,
  AcTpSemanticTag,
  ensureSemanticTagRegApp,
  writeSemanticTag
} from './AcTpSemanticTag'

/** Identity every drawn entity must carry. */
interface AcTpDrawBase {
  /** Dictionary key for what this is — see {@link AcTpSemanticTag.role}. */
  role: string
  /** Unique id for this part within the drawing. */
  partId: string
  /** Layer to place it on. Defaults to the layer mapped to `role`. */
  layer?: string
  /**
   * Values that define this part — see {@link AcTpSemanticTag.params}.
   *
   * Set it on the call that establishes the part's dimensions; the digest
   * merges the records of every entity sharing a `partId`, so repeating them
   * on each stroke of the same part is allowed but pointless.
   */
  params?: Readonly<Record<string, number | string | boolean>>
}

export interface AcTpLineArgs extends AcTpDrawBase {
  start: AcGePoint3dLike
  end: AcGePoint3dLike
}

export interface AcTpPolylineArgs extends AcTpDrawBase {
  points: readonly AcGePoint3dLike[]
  closed?: boolean
}

export interface AcTpCircleArgs extends AcTpDrawBase {
  center: AcGePoint3dLike
  radius: number
}

export interface AcTpArcArgs extends AcTpCircleArgs {
  startAngle: number
  endAngle: number
}

export interface AcTpTextArgs extends AcTpDrawBase {
  position: AcGePoint3dLike
  text: string
  height?: number
}

/**
 * A linear dimension between two points.
 *
 * `huong` is the axis the dimension measures along, not the direction of the
 * line between the points: a bridge elevation is dimensioned in horizontal and
 * vertical chains, and asking for "the distance between these two corners" when
 * what the sheet needs is "the height of this wall" produces a number that is
 * right and a drawing that is wrong. `'nghieng'` measures the true distance for
 * the cases that genuinely are skew.
 */
export interface AcTpDimensionArgs extends AcTpDrawBase {
  /** First extension line origin. */
  start: AcGePoint3dLike
  /** Second extension line origin. */
  end: AcGePoint3dLike
  /**
   * How far the dimension line sits from the measured points, in drawing
   * units. Positive is above a horizontal chain and to the right of a vertical
   * one; negative puts it on the other side.
   */
  offset: number
  /** Axis measured. Defaults to `'ngang'`. */
  huong?: 'ngang' | 'dung' | 'nghieng'
  /**
   * Overrides the measured value. Leave unset — the entity computes and
   * formats the real distance, and a hand-written number is a number that
   * stops matching the geometry the first time a parameter changes.
   */
  text?: string
}

/**
 * A filled region — the material symbol on a part cut in section.
 *
 * The boundary is a single closed outline of straight segments; the last point
 * joins back to the first, so do not repeat it. Islands and curved edges are
 * deliberately absent: the reference drawings fill plain polygons, and an
 * option that exists but has never been drawn is an option nobody can trust.
 */
export interface AcTpHatchArgs extends AcTpDrawBase {
  /** Outline of the filled region, in order. Not closed by the caller. */
  boundary: readonly AcGePoint3dLike[]
  /**
   * Pattern name. Defaults to a solid fill.
   *
   * Solid is the default because that is what a thin element cut in section
   * carries on the drawings this library is built from — the wing walls in
   * the abutment assembly are filled `_SOLID` with zero pattern lines.
   */
  patternName?: string
  /** Pattern spacing multiplier. Ignored by a solid fill. Defaults to 1. */
  patternScale?: number
  /** Pattern rotation in degrees. Ignored by a solid fill. Defaults to 0. */
  patternAngleDeg?: number
}

/**
 * The one and only way a template touches the drawing.
 *
 * Every method takes a `role` and a `partId` and cannot be called without
 * them, which is the whole point: an entity that reaches the drawing without a
 * semantic tag is invisible to natural-language editing, and "remember to tag
 * it" is not a rule that survives contact with a real template. The type
 * system enforces it instead.
 *
 * The context also owns layer placement and entity creation, so a template
 * never reaches for `appendEntity` — going around the context is how an edit
 * escapes both the undo group and the tagging rule at the same time.
 */
export interface AcTpDrawContext {
  line(args: AcTpLineArgs): AcDbEntity
  polyline(args: AcTpPolylineArgs): AcDbEntity
  circle(args: AcTpCircleArgs): AcDbEntity
  arc(args: AcTpArcArgs): AcDbEntity
  text(args: AcTpTextArgs): AcDbEntity
  dimension(args: AcTpDimensionArgs): AcDbEntity
  hatch(args: AcTpHatchArgs): AcDbEntity
  /** Everything drawn so far in this run, in drawing order. */
  readonly drawn: readonly AcDbEntity[]
}

/** Maps a semantic role to the layer its entities belong on. */
export type AcTpRoleLayerMap = Readonly<Record<string, string>>

/**
 * Builds the draw context handed to a template's `generate`.
 *
 * Callers are expected to run this inside `acapRunGroupedEdit` so the whole
 * run collapses into one undo mark.
 *
 * @param db - Target database.
 * @param templateId - Written into every tag, so a drawing always knows which
 * template produced which part of it.
 * @param roleLayers - Role → layer mapping from the standardisation layer.
 */
export function createDrawContext(
  db: AcDbDatabase,
  templateId: string,
  roleLayers: AcTpRoleLayerMap,
  /**
   * The invocation being drawn, stamped onto every entity produced.
   *
   * Optional because the context is also used for previews and for one-off
   * generation in tests, where there is no run to record. Passing it is what
   * makes the drawing describe how it was made.
   */
  run?: AcTpRunRecord
): AcTpDrawContext {
  // Single place the RegApp is registered. Doing it here rather than leaving it
  // to each caller is what keeps "exactly one definition per file" true — an
  // untagged-because-unregistered drawing fails much later, at query time.
  ensureSemanticTagRegApp(db)

  const drawn: AcDbEntity[] = []

  /**
   * Creates the layer if the drawing does not have it yet.
   *
   * Setting `entity.layer` to a name only records the name; it does not make
   * the layer exist. A drawing referencing a layer with no table record still
   * saves and still round-trips through DXF, so nothing in a unit test
   * notices — but the renderer refuses the entity with "layer 'KC-BAN'
   * doesn't exist" and the drawing comes out blank. The whole generated
   * section was invisible for exactly this reason.
   */
  const ensureLayer = (name: string): void => {
    const layerTable = db.tables.layerTable
    if (layerTable.has(name)) return
    layerTable.add(
      new AcDbLayerTableRecord({
        name,
        isOff: false,
        // Colour is presentation and the standards layer owns it properly;
        // white here just means "visible" until that lands.
        color: new AcCmColor(AcCmColorMethod.ByACI, 7),
        isPlottable: true
      })
    )
  }

  const place = (entity: AcDbEntity, args: AcTpDrawBase): AcDbEntity => {
    const layer = args.layer ?? roleLayers[args.role]
    if (!layer) {
      throw new Error(
        `Vai trò '${args.role}' chưa được khai trong quy ước layer. ` +
          'Bổ sung vào nền chuẩn hóa, hoặc truyền layer tường minh.'
      )
    }
    ensureLayer(layer)
    entity.layer = layer

    const tag: AcTpSemanticTag = {
      role: args.role,
      partId: args.partId,
      templateId,
      ...(args.params ? { params: args.params } : {}),
      ...(run ? { run } : {})
    }
    writeSemanticTag(entity, tag)

    db.tables.blockTable.modelSpace.appendEntity(entity)
    drawn.push(entity)
    return entity
  }

  return {
    line: args => place(new AcDbLine(args.start, args.end), args),

    polyline: args => {
      const polyline = new AcDbPolyline()
      args.points.forEach((point, index) =>
        polyline.addVertexAt(index, new AcGePoint2d(point.x, point.y))
      )
      polyline.closed = args.closed ?? false
      return place(polyline, args)
    },

    circle: args => place(new AcDbCircle(args.center, args.radius), args),

    arc: args =>
      place(
        new AcDbArc(args.center, args.radius, args.startAngle, args.endAngle),
        args
      ),

    text: args => {
      const entity = new AcDbText()
      entity.position = new AcGePoint3d(
        args.position.x,
        args.position.y,
        args.position.z ?? 0
      )
      entity.textString = args.text
      entity.height = args.height ?? 2.5
      return place(entity, args)
    },

    dimension: args => {
      const huong = args.huong ?? 'ngang'
      const start = args.start
      const end = args.end

      // Where the dimension line sits. For a horizontal chain it is offset in
      // Y, for a vertical one in X; for a skew dimension it is offset along the
      // normal of the measured line, which is the only meaning `offset` can
      // have when neither axis is the answer.
      let dimLine: AcGePoint3dLike
      if (huong === 'ngang') {
        dimLine = {
          x: (start.x + end.x) / 2,
          y: Math.max(start.y, end.y) + args.offset,
          z: 0
        }
      } else if (huong === 'dung') {
        dimLine = {
          x: Math.max(start.x, end.x) + args.offset,
          y: (start.y + end.y) / 2,
          z: 0
        }
      } else {
        const dx = end.x - start.x
        const dy = end.y - start.y
        const length = Math.hypot(dx, dy)
        // A zero-length dimension has no normal and no measurement worth
        // drawing; refusing beats emitting a NaN nobody sees until later.
        if (length === 0) {
          throw new Error(
            'Kích thước nghiêng cần hai điểm khác nhau; đã nhận hai điểm trùng nhau.'
          )
        }
        dimLine = {
          x: (start.x + end.x) / 2 - (dy / length) * args.offset,
          y: (start.y + end.y) / 2 + (dx / length) * args.offset,
          z: 0
        }
      }

      const entity = new AcDbRotatedDimension(
        { x: start.x, y: start.y, z: start.z ?? 0 },
        { x: end.x, y: end.y, z: end.z ?? 0 },
        dimLine,
        args.text ?? null,
        'Standard'
      )
      // Rotation is what makes a rotated dimension measure an axis rather than
      // the distance between the points. Left at zero for a skew dimension, the
      // entity behaves as a plain aligned one, which is what `'nghieng'` means.
      if (huong === 'ngang') entity.rotation = 0
      else if (huong === 'dung') entity.rotation = Math.PI / 2

      // Without this the dimension is in the drawing and invisible — see
      // {@link buildDimensionBlock}.
      buildDimensionBlock(db, entity)
      return place(entity, args)
    },

    hatch: args => {
      // A fill needs an area. Two points describe a line, which encloses
      // nothing; the entity would reach the drawing and render as nothing at
      // all, which is the failure mode that is hardest to notice.
      if (args.boundary.length < 3) {
        throw new Error(
          `Vùng tô '${args.partId}' cần ít nhất 3 điểm biên, đã nhận ${args.boundary.length}.`
        )
      }

      const entity = new AcDbHatch()
      // Set before the pattern: the hatch resolves its pattern definition
      // against the database it belongs to, and `appendEntity` only happens
      // later in `place`.
      entity.database = db
      const patternName = args.patternName?.trim() || HATCH_PATTERN_SOLID
      entity.patternName = patternName
      entity.patternType = AcDbHatchPatternType.Predefined
      entity.patternScale = args.patternScale ?? 1
      entity.patternAngle = ((args.patternAngleDeg ?? 0) * Math.PI) / 180
      entity.hatchStyle = AcDbHatchStyle.Normal
      entity.isSolidFill = patternName === HATCH_PATTERN_SOLID

      const loop = new AcGeLoop2d()
      for (let i = 0; i < args.boundary.length; i++) {
        const from = args.boundary[i]
        // Wraps to the first point: the loop has to close or there is no
        // inside to fill.
        const to = args.boundary[(i + 1) % args.boundary.length]
        loop.add(
          new AcGeLine2d(
            new AcGePoint2d(from.x, from.y),
            new AcGePoint2d(to.x, to.y)
          )
        )
      }
      entity.add(loop)

      return place(entity, args)
    },

    get drawn() {
      return drawn
    }
  }
}
