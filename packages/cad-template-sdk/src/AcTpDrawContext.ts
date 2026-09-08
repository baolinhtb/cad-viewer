import {
  AcCmColor,
  AcCmColorMethod,
  AcDbArc,
  AcDbCircle,
  AcDbDatabase,
  AcDbDimStyleTableRecord,
  AcDbDimTextVertical,
  AcDbEntity,
  AcDbHatch,
  AcDbHatchPatternType,
  AcDbHatchStyle,
  AcDbLayerTableRecord,
  AcDbLine,
  AcDbLinetypeTableRecord,
  AcDbPolyline,
  AcDbRotatedDimension,
  AcDbText,
  AcDbTextStyleTableRecord,
  AcGeLine2d,
  AcGeLoop2d,
  AcGePoint2d,
  AcGePoint3d,
  AcGePoint3dLike,
  HATCH_PATTERN_SOLID
} from '@mlightcad/data-model'

import { buildDimensionBlock, formatDimensionText } from './AcTpDimensionBlock'
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
  /**
   * Colour of this one entity, as an ACI index 1–255.
   *
   * Leave unset for ByLayer, which is right for almost every stroke: colour
   * belongs to the layer, and the standardisation layer decides it (see
   * {@link AcTpLayerStyleMap}). Set it only where the source drawing deliberately
   * gives a stroke a colour other than its layer's — the centreline drawn red
   * on a grey layer, note text drawn green — so the template reproduces what
   * the engineer drew rather than flattening it.
   */
  color?: number
  /**
   * Linetype by name — `CENTER`, `DASHED`, `DASHDOT`, `HIDDEN`, or one the
   * drawing already defines. Leave unset for ByLayer (continuous).
   *
   * A name the drawing lacks is created from {@link TEMPLATE_LINETYPES}, the
   * AutoCAD definitions the engineer's drawings carry, sized for the drawing's
   * `LTSCALE` so a centreline dashes the same whether it lands in the office's
   * file (`LTSCALE 300`) or in a fresh one (`LTSCALE 1`).
   */
  lineType?: string
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
  /**
   * Text style, by name. Defaults to {@link TEMPLATE_TEXT_STYLE}.
   *
   * Must already exist in the drawing, or be one of the styles the context
   * knows how to create ({@link TEMPLATE_TEXT_STYLES}). The default is a
   * TrueType style, because the SHX-era `Standard` style has no glyphs for
   * Vietnamese letters with stacked diacritics — every "ố" and "đ" a template
   * wrote through it rendered as "?".
   */
  style?: string
}

/**
 * Text styles a template may ask for without the drawing already having them.
 *
 * Keyed by style name, valued by the font file exactly as AutoCAD records it
 * in the STYLE table (group 3), so an exported DWG opens in AutoCAD with the
 * same TrueType font. The engineer's own drawings define `Arial` this way.
 */
export const TEMPLATE_TEXT_STYLES: Readonly<Record<string, { font: string }>> = {
  Arial: { font: 'arial.ttf' }
}

/** Style every template text gets unless it asks for another. */
export const TEMPLATE_TEXT_STYLE = 'Arial'

/**
 * Dimension styles a template may ask for without the drawing having them.
 *
 * `D100` is the engineer's own: their file defines it as `DIMSCALE 100` over
 * base values (`DIMTXT 1.5`, `DIMASZ 1.3`, `DIMEXO 1`, `DIMEXE 0.7`,
 * `DIMGAP 0.6`, text above the line, green text, rounded to 1). The data
 * model's block builder reads the base values without the scale, so the SDK
 * stores the products with `dimscale 1` — the same drawing, no hidden
 * multiplication.
 */
type AcTpDimStyleAttrs = NonNullable<
  ConstructorParameters<typeof AcDbDimStyleTableRecord>[0]
>

export const TEMPLATE_DIM_STYLES: Readonly<Record<string, AcTpDimStyleAttrs>> = {
  D100: {
    dimscale: 1,
    dimtxt: 150,
    dimasz: 130,
    dimexo: 100,
    dimexe: 70,
    dimgap: 60,
    dimtad: AcDbDimTextVertical.Above,
    dimtih: 0,
    dimtoh: 0,
    dimdec: 2,
    dimrnd: 1,
    dimzin: 8,
    dimlfac: 1,
    dimclrt: 3,
    dimtxsty: TEMPLATE_TEXT_STYLE
  }
}

/** Dimension style every template dimension gets unless it asks for another. */
export const TEMPLATE_DIM_STYLE = 'D100'

/**
 * Linetypes a template may ask for, as AutoCAD's `acad.lin` defines them and
 * as the engineer's drawing carries them: lengths in drawing units at
 * `LTSCALE 1`. Negative is a gap, zero is a dot.
 */
export const TEMPLATE_LINETYPES: Readonly<
  Record<string, { description: string; pattern: readonly number[] }>
> = {
  CENTER: {
    description: 'Center ____ _ ____ _ ____ _ ____ _ ____ _ ____',
    pattern: [1.25, -0.25, 0.25, -0.25]
  },
  DASHED: {
    description: 'Dashed __ __ __ __ __ __ __ __ __ __ __ __ __ _',
    pattern: [0.5, -0.25]
  },
  DASHDOT: {
    description: 'Dash dot __ . __ . __ . __ . __ . __ . __ . __',
    pattern: [0.5, -0.25, 0, -0.25]
  },
  HIDDEN: {
    description: 'Hidden __ __ __ __ __ __ __ __ __ __ __ __ __ _',
    pattern: [0.25, -0.125]
  }
}

/**
 * `LTSCALE` the office draws at: their millimetre drawings carry 300, which
 * turns `CENTER`'s 1.25-unit dash into 375 mm — legible at 1:100. A linetype
 * created in a drawing with a different `LTSCALE` is pre-multiplied by the
 * ratio so the dashes come out the same length on paper.
 */
export const LINETYPE_PLOT_SCALE = 300

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
   * Overrides the measured value. Leave unset — the context measures along
   * `huong` and formats the number the way the dimension style says (the
   * engineer's `D100`: rounded to 1, no trailing zeros), and a hand-written
   * number is a number that stops matching the geometry the first time a
   * parameter changes.
   */
  text?: string
  /**
   * Dimension style by name. Defaults to {@link TEMPLATE_DIM_STYLE}; must
   * exist in the drawing or be one of {@link TEMPLATE_DIM_STYLES}.
   */
  dimStyle?: string
}

/**
 * A leader: a line from the thing being noted to the note, with an arrowhead
 * at the first point. The arrow is a solid triangle the size of the dimension
 * style's arrowhead, since that is what AutoCAD draws for a leader too.
 */
export interface AcTpLeaderArgs extends AcTpDrawBase {
  /** Vertices in order; the arrow sits at the first one. At least two. */
  points: readonly AcGePoint3dLike[]
  /** Arrow length in drawing units. Defaults to the default dimension style's `dimasz`. */
  arrowSize?: number
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
  /** Draws the leader line and its arrowhead; returns the line. */
  leader(args: AcTpLeaderArgs): AcDbEntity
  /** Everything drawn so far in this run, in drawing order. */
  readonly drawn: readonly AcDbEntity[]
}

/** Maps a semantic role to the layer its entities belong on. */
export type AcTpRoleLayerMap = Readonly<Record<string, string>>

/**
 * How a layer is presented, as the standardisation layer records it.
 *
 * Colour is an ACI index because that is what the office's own drawings carry
 * in their layer tables and what AutoCAD round-trips; `null` means the office
 * has not decided yet, and the context then falls back to white.
 */
export interface AcTpLayerStyle {
  /** ACI colour index 1–255; `null` or absent when not yet decided. */
  color?: number | null
  /**
   * Linetype name (CENTER, DASHED, …). Recorded for the catalogue; not applied
   * when drawing, because a layer naming a linetype the drawing's table lacks
   * renders nothing — the same failure mode a missing layer has.
   */
  lineType?: string | null
}

/** Layer name → presentation, keyed exactly as the catalogue names the layer. */
export type AcTpLayerStyleMap = Readonly<Record<string, AcTpLayerStyle>>

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
  run?: AcTpRunRecord,
  /**
   * Layer presentation from the standardisation layer's catalogue.
   *
   * Consulted only when this context has to create a layer the drawing does
   * not have. A layer the drawing already carries keeps whatever the drawing
   * says: those properties belong to the drawing, and an engineer's own file
   * outranks the office default.
   */
  layerStyles: AcTpLayerStyleMap = {}
): AcTpDrawContext {
  // Single place the RegApp is registered. Doing it here rather than leaving it
  // to each caller is what keeps "exactly one definition per file" true — an
  // untagged-because-unregistered drawing fails much later, at query time.
  ensureSemanticTagRegApp(db)

  const drawn: AcDbEntity[] = []

  // AutoCAD compares layer names case-insensitively, so the catalogue must be
  // looked up the same way or `_33_CAU_MO_Be` and `_33_CAU_MO_BE` would be
  // two layers with two colours.
  const styleOf = new Map<string, AcTpLayerStyle>()
  for (const [name, style] of Object.entries(layerStyles)) {
    styleOf.set(name.toLowerCase(), style)
  }

  /**
   * Checks an ACI index. `undefined`/`null` means "not specified" and is
   * returned as `undefined`; anything else outside 1–255 is a bug in the
   * template or the catalogue, and a colour that silently became white would
   * be exactly the kind of wrong nobody notices.
   */
  const aci = (value: unknown, what: string): number | undefined => {
    if (value === undefined || value === null) return undefined
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 255) {
      throw new Error(
        `${what} phải là chỉ số màu ACI nguyên từ 1 đến 255. Nhận được: ${String(value)}`
      )
    }
    return value
  }

  /**
   * Creates the layer if the drawing does not have it yet.
   *
   * Setting `entity.layer` to a name only records the name; it does not make
   * the layer exist. A drawing referencing a layer with no table record still
   * saves and still round-trips through DXF, so nothing in a unit test
   * notices — but the renderer refuses the entity with "layer 'KC-BAN'
   * doesn't exist" and the drawing comes out blank. The whole generated
   * section was invisible for exactly this reason.
   *
   * The colour comes from the catalogue, which is where the office keeps its
   * layer convention; white is only the fallback for a layer nobody has
   * coloured yet. A layer the drawing already has is left alone, colour
   * included — see the `layerStyles` parameter.
   */
  const ensureLayer = (name: string): void => {
    const layerTable = db.tables.layerTable
    if (layerTable.has(name)) return
    const color =
      aci(styleOf.get(name.toLowerCase())?.color, `Màu của layer '${name}'`) ?? 7
    layerTable.add(
      new AcDbLayerTableRecord({
        name,
        isOff: false,
        color: new AcCmColor(AcCmColorMethod.ByACI, color),
        isPlottable: true
      })
    )
  }

  /**
   * Creates a text style the drawing lacks, from {@link TEMPLATE_TEXT_STYLES}.
   *
   * A style the drawing already has is kept as is — its font is the
   * engineer's choice. A name the context cannot create is refused rather
   * than silently falling back to `Standard`, which is the failure this
   * exists to end.
   */
  const ensureTextStyle = (name: string): void => {
    const table = db.tables.textStyleTable
    if (table.has(name)) return
    const known = TEMPLATE_TEXT_STYLES[name]
    if (!known) {
      throw new Error(
        `Kiểu chữ '${name}' chưa có trong bản vẽ. Dùng ${Object.keys(TEMPLATE_TEXT_STYLES).join(', ')} hoặc một kiểu chữ bản vẽ đã khai.`
      )
    }
    table.add(
      new AcDbTextStyleTableRecord({
        name,
        standardFlag: 0,
        fixedTextHeight: 0,
        widthFactor: 1,
        obliqueAngle: 0,
        textGenerationFlag: 0,
        lastHeight: 2.5,
        font: known.font,
        bigFont: '',
        extendedFont: known.font
      })
    )
  }

  /** Creates a dimension style the drawing lacks, from {@link TEMPLATE_DIM_STYLES}. */
  const ensureDimStyle = (name: string): AcDbDimStyleTableRecord => {
    const table = db.tables.dimStyleTable
    const existing = table.getAt(name)
    if (existing) return existing
    const known = TEMPLATE_DIM_STYLES[name]
    if (!known) {
      throw new Error(
        `Kiểu kích thước '${name}' chưa có trong bản vẽ. Dùng ${Object.keys(TEMPLATE_DIM_STYLES).join(', ')} hoặc một kiểu bản vẽ đã khai.`
      )
    }
    if (known.dimtxsty) ensureTextStyle(known.dimtxsty)
    const record = new AcDbDimStyleTableRecord({ ...known, name })
    table.add(record)
    return record
  }

  /**
   * Creates a linetype the drawing lacks, from {@link TEMPLATE_LINETYPES},
   * scaled for the drawing's `LTSCALE` — see {@link LINETYPE_PLOT_SCALE}.
   */
  const ensureLinetype = (name: string): void => {
    const table = db.tables.linetypeTable
    if (table.has(name)) return
    const known = TEMPLATE_LINETYPES[name]
    if (!known) {
      throw new Error(
        `Kiểu nét '${name}' chưa có trong bản vẽ. Dùng ${Object.keys(TEMPLATE_LINETYPES).join(', ')} hoặc một kiểu nét bản vẽ đã khai.`
      )
    }
    const ltscale = (db as { ltscale?: number }).ltscale
    const k = LINETYPE_PLOT_SCALE / (ltscale && ltscale > 0 ? ltscale : 1)
    table.add(
      new AcDbLinetypeTableRecord({
        name,
        standardFlag: 0,
        description: known.description,
        totalPatternLength: known.pattern.reduce((sum, len) => sum + Math.abs(len) * k, 0),
        pattern: known.pattern.map(len => ({ elementLength: len * k, elementTypeFlag: 0 }))
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

    // ByLayer unless the template asked for a colour of its own. The default
    // is not set explicitly: a fresh entity is already ByLayer, and writing
    // it would turn "no opinion" into an assertion.
    const color = aci(args.color, `Màu của '${args.partId}'`)
    if (color !== undefined) {
      entity.color = new AcCmColor(AcCmColorMethod.ByACI, color)
    }
    if (args.lineType) {
      ensureLinetype(args.lineType)
      entity.lineType = args.lineType
    }

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

  const drawPolyline = (args: AcTpPolylineArgs): AcDbEntity => {
    const polyline = new AcDbPolyline()
    args.points.forEach((point, index) =>
      polyline.addVertexAt(index, new AcGePoint2d(point.x, point.y))
    )
    polyline.closed = args.closed ?? false
    return place(polyline, args)
  }

  return {
    line: args => place(new AcDbLine(args.start, args.end), args),

    polyline: drawPolyline,

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
      const style = args.style ?? TEMPLATE_TEXT_STYLE
      ensureTextStyle(style)
      entity.styleName = style
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

      // Measured along the axis asked for, not between the points: a
      // vertical chain whose ends sit at different x must still read the
      // height. Formatted by the style so the number matches the sheet's
      // convention (D100: whole millimetres).
      const styleName = args.dimStyle ?? TEMPLATE_DIM_STYLE
      const style = ensureDimStyle(styleName)
      const measured =
        huong === 'ngang'
          ? Math.abs(end.x - start.x)
          : huong === 'dung'
            ? Math.abs(end.y - start.y)
            : Math.hypot(end.x - start.x, end.y - start.y)
      const entity = new AcDbRotatedDimension(
        { x: start.x, y: start.y, z: start.z ?? 0 },
        { x: end.x, y: end.y, z: end.z ?? 0 },
        dimLine,
        args.text ?? formatDimensionText(measured, style),
        styleName
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

    leader: args => {
      if (args.points.length < 2) {
        throw new Error(
          `Đường dẫn '${args.partId}' cần ít nhất 2 điểm, đã nhận ${args.points.length}.`
        )
      }
      const size = args.arrowSize ?? ensureDimStyle(TEMPLATE_DIM_STYLE).dimasz
      const [tip, next] = args.points
      const dx = next.x - tip.x
      const dy = next.y - tip.y
      const length = Math.hypot(dx, dy)
      if (length === 0) {
        throw new Error(
          `Đường dẫn '${args.partId}' có hai điểm đầu trùng nhau nên không có hướng cho mũi tên.`
        )
      }
      // AutoCAD's closed filled arrowhead: length `size`, width a third of it.
      const ux = dx / length
      const uy = dy / length
      const base = { x: tip.x + ux * size, y: tip.y + uy * size }
      const half = size / 6
      const boundary = [
        { x: tip.x, y: tip.y, z: 0 },
        { x: base.x - uy * half, y: base.y + ux * half, z: 0 },
        { x: base.x + uy * half, y: base.y - ux * half, z: 0 }
      ]
      const { points: _points, arrowSize: _arrow, ...base_ } = args
      const line = drawPolyline({ ...base_, points: args.points, closed: false })
      const arrow = new AcDbHatch()
      arrow.database = db
      arrow.patternName = HATCH_PATTERN_SOLID
      arrow.patternType = AcDbHatchPatternType.Predefined
      arrow.hatchStyle = AcDbHatchStyle.Normal
      arrow.isSolidFill = true
      const loop = new AcGeLoop2d()
      for (let i = 0; i < boundary.length; i++) {
        const a = boundary[i]
        const b = boundary[(i + 1) % boundary.length]
        loop.add(new AcGeLine2d(new AcGePoint2d(a.x, a.y), new AcGePoint2d(b.x, b.y)))
      }
      arrow.add(loop)
      place(arrow, base_)
      return line
    },

    get drawn() {
      return drawn
    }
  }
}
