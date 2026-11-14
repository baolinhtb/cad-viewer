import {
  AcCmColor,
  AcCmColorMethod,
  AcDb3PointAngularDimension,
  AcDbArc,
  AcDbAttribute,
  AcDbAttributeDefinition,
  AcDbBlockReference,
  AcDbBlockTableRecord,
  AcDbCircle,
  AcDbDatabase,
  AcDbDimension,
  AcDbDimStyleTableRecord,
  AcDbDimTextVertical,
  AcDbEntity,
  AcDbHatch,
  AcDbHatchPatternType,
  AcDbHatchStyle,
  AcDbLayerTableRecord,
  AcDbLeader,
  AcDbLine,
  AcDbLinetypeTableRecord,
  AcDbMText,
  AcDbPoint,
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
import { acTpRecordAttr } from './AcTpDxfOut'
import {
  acTpAnnotationPresentation,
  acTpAnnotationStyles,
  SEED_LEGACY_LAYERS
} from './AcTpSeed'
import {
  AcTpRunRecord,
  AcTpSemanticTag,
  ensureSemanticTagRegApp,
  writeSemanticTag
} from './AcTpSemanticTag'
import type {
  AcTpDimStyleDef,
  AcTpDimStyleVars,
  AcTpTextStyleDef
} from './AcTpStyles33'
import { ACTP_DIM_STYLES_33, ACTP_TEXT_STYLES_33 } from './AcTpStyles33'

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
  /**
   * Lineweight of this one entity, in hundredths of a millimetre, as AutoCAD
   * stores it (`5` = 0.05 mm, `13` = 0.13 mm); `-1` ByLayer, `-2` ByBlock,
   * `-3` default. Leave unset for ByLayer. Only AutoCAD's own values are
   * accepted — a plot style cannot hold any other.
   */
  lineWeight?: number
  /** Linetype scale of this one entity (DXF 48). Leave unset for 1. */
  linetypeScale?: number
}

/** A polyline vertex; `bulge` = tan(¼ of the arc's included angle), 0 = straight. */
export type AcTpVertex = AcGePoint3dLike & { bulge?: number }

export interface AcTpLineArgs extends AcTpDrawBase {
  start: AcGePoint3dLike
  end: AcGePoint3dLike
}

export interface AcTpPolylineArgs extends AcTpDrawBase {
  /** Vertices; a `bulge` on a vertex makes the segment that starts there an arc. */
  points: readonly AcTpVertex[]
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
  /** Rotation in degrees, preserving source annotation orientation. */
  rotationDeg?: number
  /** Horizontal alignment: left (0), center (1), right (2). */
  align?: 0 | 1 | 2
  /** Text width multiplier from the reference drawing. */
  widthFactor?: number
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
export const TEMPLATE_TEXT_STYLES: Readonly<Record<string, { font: string }>> =
  {
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

export const TEMPLATE_DIM_STYLES: Readonly<Record<string, AcTpDimStyleAttrs>> =
  {
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
  },
  // As the engineer's drawing defines it (millimetre CENTER2).
  CENTER2: {
    description: 'Center (.5x) ___ _ ___ _ ___ _ ___ _ ___ _ ___',
    pattern: [19.05, -3.175, 3.175, -3.175]
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
   *
   * `<>` inside the text stands for the measured value, as in AutoCAD:
   * `'H1A = <>'` keeps the number live. Text without `<>` replaces it — the
   * engineer's sheets label dimensions by parameter name (`H1A`, `B bệ-2D`).
   */
  text?: string
  /**
   * Per-dimension overrides of the style's variables (AutoCAD's DIMSTYLE
   * overrides). Stored as a derived style `<style>$<hash>` carrying the
   * overridden values, since a dimension in the data model can only name a
   * style; dimensions with the same overrides share it.
   */
  overrides?: AcTpDimStyleVars
  /**
   * Rotation of the dimension, degrees, as the source stored it (DXF 50).
   * A horizontal dimension measured right-to-left is at 180°; arrows and
   * text follow from it. Defaults to 0 (`ngang`) or 90 (`dung`).
   */
  rotationDeg?: number
  /**
   * Middle of the dimension text, where AutoCAD stored it (DXF 11/21). The
   * data model always centres the text on the dimension line; a drawing
   * copied from a source places it where the engineer's was.
   */
  textPosition?: AcGePoint3dLike
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
/** A POINT entity (drawn per the drawing's PDMODE). */
export interface AcTpPointArgs extends AcTpDrawBase {
  position: AcGePoint3dLike
}

/**
 * An angular dimension between two lines meeting at `center` — how the
 * data model reads AutoCAD's 2-line and 3-point angular dimensions alike.
 */
export interface AcTpAngularDimensionArgs extends AcTpDrawBase {
  /** Vertex of the angle. */
  center: AcGePoint3dLike
  /** A point on the first leg. */
  start: AcGePoint3dLike
  /** A point on the second leg. */
  end: AcGePoint3dLike
  /** A point the dimension arc passes through. */
  arcPoint: AcGePoint3dLike
  /** Dimension text; `<>` stands for the measured angle. */
  text?: string
  dimStyle?: string
  overrides?: AcTpDimStyleVars
  /** Middle of the text, as the source stored it. */
  textPosition?: AcGePoint3dLike
}

export interface AcTpLeaderArgs extends AcTpDrawBase {
  /** Vertices in order; the arrow sits at the first one. At least two. */
  points: readonly AcGePoint3dLike[]
  /** Arrow length in drawing units. Defaults to the default dimension style's `dimasz`. */
  arrowSize?: number
  /**
   * Draw an AutoCAD LEADER entity (styled by `dimStyle`) instead of a
   * polyline plus a filled arrow. The engineer's drawings carry real
   * leaders; the default stays the polyline so existing templates draw
   * exactly what they drew.
   */
  native?: boolean
  /** Dimension style of a native leader. Defaults to {@link TEMPLATE_DIM_STYLE}. */
  dimStyle?: string
  /**
   * Whether a native leader draws its arrowhead. Defaults to true; source
   * drawings often have leaders without one.
   */
  arrowHead?: boolean
}

/** Appearance of an entity inside a block definition. */
export interface AcTpBlockLook {
  /** Layer inside the block; `0` (the default) takes the insert's layer. */
  layer?: string
  /** ACI 1–255, `0` ByBlock (default), `256` ByLayer. */
  color?: number
  /** Linetype name, `ByBlock` (default) or `ByLayer`. */
  lineType?: string
  /** Lineweight, as in {@link AcTpDrawBase.lineWeight}; default ByBlock. */
  lineWeight?: number
  linetypeScale?: number
}

/**
 * One entity of a block definition, as plain data — so a library template
 * can carry a symbol (an elevation tag, a pile mark) as JSON taken from the
 * source drawing.
 */
export type AcTpBlockEntity = AcTpBlockLook &
  (
    | { kind: 'line'; start: AcGePoint3dLike; end: AcGePoint3dLike }
    | { kind: 'polyline'; points: readonly AcTpVertex[]; closed?: boolean }
    | { kind: 'circle'; center: AcGePoint3dLike; radius: number }
    | {
        kind: 'arc'
        center: AcGePoint3dLike
        radius: number
        startAngle: number
        endAngle: number
      }
    | {
        kind: 'text'
        position: AcGePoint3dLike
        text: string
        height: number
        rotationDeg?: number
        align?: 0 | 1 | 2
        widthFactor?: number
        style?: string
      }
    | {
        kind: 'hatch'
        boundary: readonly AcGePoint3dLike[]
        patternName?: string
        patternScale?: number
        patternAngleDeg?: number
      }
    | {
        /**
         * A block inside the block (a nested INSERT). The block must already
         * be defined — define the inner one first.
         */
        kind: 'insert'
        block: string
        position: AcGePoint3dLike
        /** Uniform scale, or per axis (negative mirrors). */
        scale?: number | { x: number; y: number }
        rotationDeg?: number
      }
    | {
        /** An attribute definition (ATTDEF): a field filled per insert. */
        kind: 'attribute'
        tag: string
        prompt?: string
        /** Value used when an insert does not supply one. */
        defaultValue?: string
        position: AcGePoint3dLike
        height: number
        rotationDeg?: number
        align?: 0 | 1 | 2
        widthFactor?: number
        style?: string
        invisible?: boolean
      }
  )

/** A block definition (symbol) to create once per drawing. */
export interface AcTpBlockDef {
  name: string
  /** Base point; inserts place this point. Defaults to the origin. */
  basePoint?: AcGePoint3dLike
  entities: readonly AcTpBlockEntity[]
}

/** An insert of a block defined with {@link AcTpDrawContext.defineBlock}. */
export interface AcTpInsertArgs extends AcTpDrawBase {
  block: string
  position: AcGePoint3dLike
  /** Uniform scale, or per axis (negative mirrors, as in the source). */
  scale?: number | { x: number; y: number }
  rotationDeg?: number
  /**
   * Attribute values by tag; missing tags take the definition's default.
   * A value may also carry its own placement, as AutoCAD stores each ATTRIB
   * independently of its definition (moved by grips, or drawn in another
   * style) — what a drawing copied from a source needs.
   */
  attributes?: Readonly<Record<string, string | AcTpAttributeValue>>
}

/** An attribute value with the placement the source gave it. */
export interface AcTpAttributeValue {
  value: string
  /** Insertion point (alignment point when aligned), world coordinates. */
  position?: AcGePoint3dLike
  height?: number
  rotationDeg?: number
  /** Horizontal alignment: left (0), centre (1), right (2). */
  align?: 0 | 1 | 2
  widthFactor?: number
  /** Text style; created from the catalogues when missing. */
  style?: string
}

/**
 * A filled region — the material symbol on a part cut in section.
 *
 * Boundaries use straight segments and close back to the first point.
 * Additional loops preserve islands in source fills; curved source boundaries
 * can be tessellated before being passed to this context.
 */
export interface AcTpHatchArgs extends AcTpDrawBase {
  /** Outline of the filled region, in order. Not closed by the caller. */
  boundary: readonly AcGePoint3dLike[]
  /** Additional boundary loops, including islands, for source solid fills. */
  additionalLoops?: readonly (readonly AcGePoint3dLike[])[]
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
  /** A POINT entity. */
  point(args: AcTpPointArgs): AcDbEntity
  /** An angular dimension (the angle between two legs). */
  angularDimension(args: AcTpAngularDimensionArgs): AcDbEntity
  hatch(args: AcTpHatchArgs): AcDbEntity
  /** Draws the leader line and its arrowhead; returns the line (or the LEADER). */
  leader(args: AcTpLeaderArgs): AcDbEntity
  /** Inserts a block, with its attribute values. */
  insert(args: AcTpInsertArgs): AcDbEntity
  /**
   * Defines a block once; later calls with the same name keep the first
   * definition (a drawing's own block wins, as with layers). Returns the name.
   */
  defineBlock(def: AcTpBlockDef): string
  /** Creates a text style once (the drawing's own wins). Returns the name. */
  defineTextStyle(def: AcTpTextStyleDef): string
  /** Creates a dimension style once (the drawing's own wins). Returns the name. */
  defineDimStyle(def: AcTpDimStyleDef): string
  /** Everything drawn so far in this run, in drawing order. */
  readonly drawn: readonly AcDbEntity[]
  /**
   * Things the run did differently from what the template asked, in
   * Vietnamese, one per distinct cause — today only an old layer name
   * redirected to its `_33_` layer. Callers pass these on to the person or
   * the assistant; they are not errors, the drawing is complete.
   */
  readonly warnings: readonly string[]
}

/** Old layer name → role (see `SEED_LEGACY_LAYERS`). */
export type AcTpLegacyLayerMap = Readonly<Record<string, string>>

/** Extra options for {@link createDrawContext}. */
export interface AcTpDrawContextOptions {
  /**
   * Old layer names kept for recognition only. A template that names one of
   * these explicitly (an uploaded template from before `_33_` that hard-codes
   * `'KC-COC'`, say) is redirected to the layer its role is drawn on now.
   * Defaults to the SDK seed.
   */
  legacyLayers?: AcTpLegacyLayerMap
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
   * Linetype name (CENTER, DASHED, …), registered before assigning a new layer.
   * Existing drawing layers retain their presentation.
   */
  lineType?: string | null
}

/** Layer name → presentation, keyed exactly as the catalogue names the layer. */
export type AcTpLayerStyleMap = Readonly<Record<string, AcTpLayerStyle>>

/** Lineweights AutoCAD accepts (hundredths of a mm), plus ByLayer/ByBlock/default. */
const LINE_WEIGHTS: readonly number[] = [
  -3, -2, -1, 0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90,
  100, 106, 120, 140, 158, 200, 211
]

/** Dimension-style properties copied into a derived (overridden) style. */
const DIM_VAR_KEYS: Readonly<Record<string, true>> = {
  dimscale: true,
  dimtxt: true,
  dimasz: true,
  dimexo: true,
  dimexe: true,
  dimdli: true,
  dimdle: true,
  dimgap: true,
  dimtad: true,
  dimtih: true,
  dimtoh: true,
  dimdec: true,
  dimrnd: true,
  dimzin: true,
  dimlfac: true,
  dimtfac: true,
  dimclrd: true,
  dimclre: true,
  dimclrt: true,
  dimtxsty: true,
  dimfxlon: true,
  dimfxl: true
}

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
  layerStyles: AcTpLayerStyleMap = {},
  options: AcTpDrawContextOptions = {}
): AcTpDrawContext {
  // Single place the RegApp is registered. Doing it here rather than leaving it
  // to each caller is what keeps "exactly one definition per file" true — an
  // untagged-because-unregistered drawing fails much later, at query time.
  ensureSemanticTagRegApp(db)

  const drawn: AcDbEntity[] = []
  const warnings: string[] = []

  const legacyRole = new Map<string, string>()
  for (const [name, role] of Object.entries(
    options.legacyLayers ?? SEED_LEGACY_LAYERS
  )) {
    legacyRole.set(name.toLowerCase(), role)
  }

  /**
   * The layer an explicitly named layer really goes on.
   *
   * An old name is redirected rather than refused: uploaded templates in the
   * live library may still hard-code `'KC-COC'`, and refusing would break a
   * drawing an engineer relies on over a naming question. Redirected only
   * when the role has a different current layer — a deployment whose mapping
   * still uses the old name keeps drawing on it, silently, as it asked.
   */
  const resolveExplicit = (layer: string): string => {
    const role = legacyRole.get(layer.toLowerCase())
    const current = role ? roleLayers[role] : undefined
    if (!current || current.toLowerCase() === layer.toLowerCase()) return layer
    const note =
      `Layer '${layer}' là tên cũ (chỉ để nhận dạng bản vẽ cũ); ` +
      `đã vẽ lên '${current}' thay thế.`
    if (!warnings.includes(note)) warnings.push(note)
    return current
  }

  // AutoCAD compares layer names case-insensitively, so the catalogue must be
  // looked up the same way or `_33_CAU_MO_Be` and `_33_CAU_MO_BE` would be
  // two layers with two colours.
  const styleOf = new Map<string, AcTpLayerStyle>()
  for (const [role, style] of Object.entries(acTpAnnotationStyles)) {
    const name = roleLayers[role]
    if (name) styleOf.set(name.toLowerCase(), style)
  }
  for (const [name, style] of Object.entries(layerStyles)) {
    const fallback = styleOf.get(name.toLowerCase())
    styleOf.set(name.toLowerCase(), {
      color: style.color ?? fallback?.color,
      lineType: style.lineType ?? fallback?.lineType
    })
  }

  /**
   * Checks an ACI index. `undefined`/`null` means "not specified" and is
   * returned as `undefined`; anything else outside 1–255 is a bug in the
   * template or the catalogue, and a colour that silently became white would
   * be exactly the kind of wrong nobody notices.
   */
  const aci = (value: unknown, what: string): number | undefined => {
    if (value === undefined || value === null) return undefined
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 255
    ) {
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
   * Office catalogue presentation takes priority over semantic annotation
   * defaults. Geometry without a convention falls back to white. Existing
   * drawing layers retain their colours and linetypes.
   */
  const ensureLayer = (name: string): void => {
    const layerTable = db.tables.layerTable
    if (layerTable.has(name)) return
    const style = styleOf.get(name.toLowerCase())
    const color = aci(style?.color, `Màu của layer '${name}'`) ?? 7
    if (style?.lineType) ensureLinetype(style.lineType)
    layerTable.add(
      new AcDbLayerTableRecord({
        name,
        isOff: false,
        color: new AcCmColor(AcCmColorMethod.ByACI, color),
        isPlottable: true,
        // The data model's default (1) is not an AutoCAD lineweight and is
        // written to DXF as is; -3 is "Default", what AutoCAD gives a layer.
        lineWeight: -3,
        ...(style?.lineType ? { linetype: style.lineType } : {})
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
  // Styles a template defined during this run, on top of the catalogues.
  const definedTextStyles = new Map<string, AcTpTextStyleDef>()
  const definedDimStyles = new Map<string, AcTpDimStyleDef>()

  const ensureTextStyle = (name: string): void => {
    const table = db.tables.textStyleTable
    if (table.has(name)) return
    const known: { font: string; widthFactor?: number } | undefined =
      TEMPLATE_TEXT_STYLES[name] ??
      ACTP_TEXT_STYLES_33[name] ??
      definedTextStyles.get(name)
    if (!known) {
      throw new Error(
        `Kiểu chữ '${name}' chưa có trong bản vẽ. Dùng ${[...Object.keys(TEMPLATE_TEXT_STYLES), ...Object.keys(ACTP_TEXT_STYLES_33)].join(', ')} hoặc một kiểu chữ bản vẽ đã khai.`
      )
    }
    table.add(
      new AcDbTextStyleTableRecord({
        name,
        standardFlag: 0,
        fixedTextHeight: 0,
        widthFactor: known.widthFactor ?? 1,
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
    const known: AcTpDimStyleAttrs | undefined =
      TEMPLATE_DIM_STYLES[name] ??
      (ACTP_DIM_STYLES_33[name] as AcTpDimStyleAttrs | undefined) ??
      (definedDimStyles.get(name) as AcTpDimStyleAttrs | undefined)
    if (!known) {
      throw new Error(
        `Kiểu kích thước '${name}' chưa có trong bản vẽ. Dùng ${[...Object.keys(TEMPLATE_DIM_STYLES), ...Object.keys(ACTP_DIM_STYLES_33)].join(', ')} hoặc một kiểu bản vẽ đã khai.`
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
  /**
   * A style carrying `overrides` on top of `base`, named `<base>$<hash>` so
   * dimensions with identical overrides share one record.
   */
  const derivedDimStyle = (
    base: string,
    overrides: AcTpDimStyleVars
  ): string => {
    const keys = Object.keys(overrides).sort() as (keyof AcTpDimStyleVars)[]
    if (!keys.length) return base
    const source = ensureDimStyle(base)
    const signature = keys.map(k => `${k}=${String(overrides[k])}`).join(';')
    let hash = 5381
    for (const ch of signature) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0
    const name = `${base}$${hash.toString(16).toUpperCase()}`
    if (db.tables.dimStyleTable.has(name)) return name
    if (overrides.dimtxsty) ensureTextStyle(overrides.dimtxsty)
    const attrs: Record<string, unknown> = { name }
    for (const key of Object.keys(DIM_VAR_KEYS)) {
      const value =
        (source as unknown as Record<string, unknown>)[key] ??
        acTpRecordAttr(source, key)
      if (value !== undefined) attrs[key] = value
    }
    Object.assign(attrs, overrides, { name })
    db.tables.dimStyleTable.add(
      new AcDbDimStyleTableRecord(attrs as AcTpDimStyleAttrs)
    )
    return name
  }

  /**
   * DIMFXLON/DIMFXL, which the data model does not know: extension lines
   * reach at most DIMFXL from the dimension line toward their origin, as
   * AutoCAD draws them.
   */
  const fixedLengthExtensions = (
    entity: AcDbRotatedDimension,
    style: AcDbDimStyleTableRecord,
    dimLine: AcGePoint3dLike
  ) => {
    const on = acTpRecordAttr(style, 'dimfxlon')
    const fxl = acTpRecordAttr(style, 'dimfxl')
    if (!on || typeof fxl !== 'number' || !(fxl > 0)) return
    const r = entity.rotation
    const u = [Math.cos(r), Math.sin(r)]
    const n = [-u[1], u[0]]
    const block = db.tables.blockTable.getAt(entity.dimBlockId ?? '')
    for (const e of block?.newIterator() ?? []) {
      if (!(e instanceof AcDbLine)) continue
      const a = e.startPoint,
        b = e.endPoint
      const d = [b.x - a.x, b.y - a.y]
      const len = Math.hypot(d[0], d[1])
      // Extension lines run across the dimension line.
      if (!len || Math.abs(d[0] * u[0] + d[1] * u[1]) > 1e-6 * len) continue
      const side = (p: { x: number; y: number }) =>
        (p.x - dimLine.x) * n[0] + (p.y - dimLine.y) * n[1]
      const [sa, sb] = [side(a), side(b)]
      const farIsStart = Math.abs(sa) > Math.abs(sb)
      const far = farIsStart ? sa : sb
      if (Math.abs(far) <= fxl) continue
      const near = farIsStart ? b : a
      const target = Math.sign(far) * fxl
      const k = (target - side(near)) / ((farIsStart ? sa : sb) - side(near))
      const moved = new AcGePoint3d(
        near.x + ((farIsStart ? a : b).x - near.x) * k,
        near.y + ((farIsStart ? a : b).y - near.y) * k,
        0
      )
      if (farIsStart) e.startPoint = moved
      else e.endPoint = moved
    }
  }

  /** Puts a dimension's text where the source had it (DXF 11/21). */
  const moveDimText = (
    entity: AcDbDimension,
    position: AcGePoint3dLike | undefined
  ) => {
    if (!position) return
    const at = new AcGePoint3d(position.x, position.y, position.z ?? 0)
    entity.textPosition = at
    const block = db.tables.blockTable.getAt(entity.dimBlockId ?? '')
    for (const e of block?.newIterator() ?? [])
      if (e instanceof AcDbMText) e.location = at.clone()
  }

  const lineWeightOf = (value: number, what: string): number => {
    if (!LINE_WEIGHTS.includes(value)) {
      throw new Error(
        `${what}: lineweight ${value} không phải giá trị AutoCAD (${LINE_WEIGHTS.join(', ')}).`
      )
    }
    return value
  }

  /** Appearance for an entity inside a block: ByBlock unless said otherwise. */
  const applyBlockLook = (entity: AcDbEntity, look: AcTpBlockLook) => {
    entity.layer = look.layer ?? '0'
    if (look.layer && !db.tables.layerTable.has(look.layer))
      ensureLayer(look.layer)
    const color = look.color ?? 0
    entity.color =
      color === 0
        ? new AcCmColor(AcCmColorMethod.ByBlock)
        : color === 256
          ? new AcCmColor(AcCmColorMethod.ByLayer)
          : new AcCmColor(AcCmColorMethod.ByACI, aci(color, 'Màu trong block')!)
    const lineType = look.lineType ?? 'ByBlock'
    if (!['BYBLOCK', 'BYLAYER'].includes(lineType.toUpperCase()))
      ensureLinetype(lineType)
    entity.lineType = lineType
    entity.lineWeight = lineWeightOf(look.lineWeight ?? -2, 'Block') as never
    if (look.linetypeScale !== undefined)
      entity.linetypeScale = look.linetypeScale
  }

  const ensureLinetype = (name: string): void => {
    const table = db.tables.linetypeTable
    if (table.has(name)) return
    const known =
      name.toUpperCase() === 'CONTINUOUS'
        ? { description: 'Solid line', pattern: [] as readonly number[] }
        : TEMPLATE_LINETYPES[name]
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
        totalPatternLength: known.pattern.reduce(
          (sum, len) => sum + Math.abs(len) * k,
          0
        ),
        pattern: known.pattern.map(len => ({
          elementLength: len * k,
          elementTypeFlag: 0
        }))
      })
    )
  }

  const place = (entity: AcDbEntity, args: AcTpDrawBase): AcDbEntity => {
    const layer =
      args.layer !== undefined
        ? resolveExplicit(args.layer)
        : roleLayers[args.role]
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
    const annotation = acTpAnnotationStyles[args.role]
      ? acTpAnnotationPresentation(args.role, {
          color: db.tables.layerTable.getAt(layer)?.color.colorIndex,
          lineType: styleOf.get(layer.toLowerCase())?.lineType
        })
      : undefined
    const layerColor = db.tables.layerTable.getAt(layer)?.color.colorIndex
    const accent =
      annotation?.color !== layerColor ? annotation?.color : undefined
    const color = aci(args.color ?? accent, `Màu của '${args.partId}'`)
    if (color !== undefined) {
      entity.color = new AcCmColor(AcCmColorMethod.ByACI, color)
    }
    const lineType = args.lineType ?? annotation?.lineType
    if (lineType) {
      ensureLinetype(lineType)
      entity.lineType = lineType
    }
    if (args.lineWeight !== undefined)
      entity.lineWeight = lineWeightOf(
        args.lineWeight,
        `Lineweight của '${args.partId}'`
      ) as never
    if (args.linetypeScale !== undefined) {
      if (!(args.linetypeScale > 0))
        throw new Error(
          `Tỉ lệ kiểu nét của '${args.partId}' phải dương, nhận ${args.linetypeScale}.`
        )
      entity.linetypeScale = args.linetypeScale
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

  const buildPolyline = (
    points: readonly AcTpVertex[],
    closed: boolean | undefined
  ): AcDbPolyline => {
    const polyline = new AcDbPolyline()
    points.forEach((point, index) =>
      point.bulge
        ? polyline.addVertexAt(
            index,
            new AcGePoint2d(point.x, point.y),
            point.bulge
          )
        : polyline.addVertexAt(index, new AcGePoint2d(point.x, point.y))
    )
    polyline.closed = closed ?? false
    return polyline
  }

  const drawPolyline = (args: AcTpPolylineArgs): AcDbEntity =>
    place(buildPolyline(args.points, args.closed), args)

  const buildText = (
    args: {
      position: AcGePoint3dLike
      text: string
      height?: number
      rotationDeg?: number
      align?: 0 | 1 | 2
      widthFactor?: number
      style?: string
    },
    entity: AcDbText = new AcDbText()
  ): AcDbText => {
    entity.position = new AcGePoint3d(
      args.position.x,
      args.position.y,
      args.position.z ?? 0
    )
    entity.textString = args.text
    entity.height = args.height ?? 2.5
    entity.rotation = ((args.rotationDeg ?? 0) * Math.PI) / 180
    entity.widthFactor = args.widthFactor ?? 1
    if (args.align) {
      entity.horizontalMode = args.align
      entity.alignmentPoint = entity.position.clone()
    }
    const style = args.style ?? TEMPLATE_TEXT_STYLE
    ensureTextStyle(style)
    entity.styleName = style
    return entity
  }

  const buildHatch = (args: {
    partId?: string
    boundary: readonly AcGePoint3dLike[]
    additionalLoops?: readonly (readonly AcGePoint3dLike[])[]
    patternName?: string
    patternScale?: number
    patternAngleDeg?: number
  }): AcDbHatch => {
    if (args.boundary.length < 3) {
      throw new Error(
        `Vùng tô '${args.partId ?? ''}' cần ít nhất 3 điểm biên, đã nhận ${args.boundary.length}.`
      )
    }
    const entity = new AcDbHatch()
    entity.database = db
    const patternName = args.patternName?.trim() || HATCH_PATTERN_SOLID
    entity.patternName = patternName
    entity.patternType = AcDbHatchPatternType.Predefined
    entity.patternScale = args.patternScale ?? 1
    entity.patternAngle = ((args.patternAngleDeg ?? 0) * Math.PI) / 180
    entity.hatchStyle = AcDbHatchStyle.Normal
    entity.isSolidFill = patternName === HATCH_PATTERN_SOLID
    for (const boundary of [args.boundary, ...(args.additionalLoops ?? [])]) {
      if (boundary.length < 3)
        throw new Error('A hatch loop requires at least three points')
      const loop = new AcGeLoop2d()
      for (let i = 0; i < boundary.length; i++) {
        const from = boundary[i]
        const to = boundary[(i + 1) % boundary.length]
        if (from.x !== to.x || from.y !== to.y)
          loop.add(
            new AcGeLine2d(
              new AcGePoint2d(from.x, from.y),
              new AcGePoint2d(to.x, to.y)
            )
          )
      }
      entity.add(loop)
    }
    return entity
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

    text: args => place(buildText(args), args),

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
      const baseStyle = args.dimStyle ?? TEMPLATE_DIM_STYLE
      ensureDimStyle(baseStyle)
      const styleName = args.overrides
        ? derivedDimStyle(baseStyle, args.overrides)
        : baseStyle
      const style = ensureDimStyle(styleName)
      const measured =
        huong === 'ngang'
          ? Math.abs(end.x - start.x)
          : huong === 'dung'
            ? Math.abs(end.y - start.y)
            : Math.hypot(end.x - start.x, end.y - start.y)
      const value = formatDimensionText(measured, style)
      const entity = new AcDbRotatedDimension(
        { x: start.x, y: start.y, z: start.z ?? 0 },
        { x: end.x, y: end.y, z: end.z ?? 0 },
        dimLine,
        args.text === undefined ? value : args.text.replace(/<>/g, value),
        styleName
      )
      // Rotation is what makes a rotated dimension measure an axis rather than
      // the distance between the points. Left at zero for a skew dimension, the
      // entity behaves as a plain aligned one, which is what `'nghieng'` means.
      if (huong === 'ngang') entity.rotation = 0
      else if (huong === 'dung') entity.rotation = Math.PI / 2
      if (args.rotationDeg !== undefined && huong !== 'nghieng')
        entity.rotation = (args.rotationDeg * Math.PI) / 180

      // Without this the dimension is in the drawing and invisible — see
      // {@link buildDimensionBlock}.
      buildDimensionBlock(db, entity)
      fixedLengthExtensions(entity, style, dimLine)
      moveDimText(entity, args.textPosition)
      const { textPosition: _tp, rotationDeg: _rd, ...dimArgs } = args
      return place(entity, dimArgs)
    },

    point: args => {
      const entity = new AcDbPoint()
      entity.position = new AcGePoint3d(
        args.position.x,
        args.position.y,
        args.position.z ?? 0
      )
      const { position: _p, ...identity } = args
      return place(entity, identity)
    },

    angularDimension: args => {
      const baseStyle = args.dimStyle ?? TEMPLATE_DIM_STYLE
      ensureDimStyle(baseStyle)
      const styleName = args.overrides
        ? derivedDimStyle(baseStyle, args.overrides)
        : baseStyle
      ensureDimStyle(styleName)
      const p = (q: AcGePoint3dLike) => ({ x: q.x, y: q.y, z: q.z ?? 0 })
      const entity = new AcDb3PointAngularDimension(
        p(args.center),
        p(args.start),
        p(args.end),
        p(args.arcPoint),
        args.text ?? null,
        styleName
      )
      buildDimensionBlock(db, entity)
      moveDimText(entity, args.textPosition)
      const {
        center: _c,
        start: _s,
        end: _e,
        arcPoint: _a,
        text: _t,
        dimStyle: _d,
        overrides: _o,
        textPosition: _tp,
        ...identity
      } = args
      return place(entity, identity)
    },

    hatch: args => place(buildHatch(args), args),

    leader: args => {
      if (args.points.length < 2) {
        throw new Error(
          `Đường dẫn '${args.partId}' cần ít nhất 2 điểm, đã nhận ${args.points.length}.`
        )
      }
      if (args.native) {
        const styleName = args.dimStyle ?? TEMPLATE_DIM_STYLE
        ensureDimStyle(styleName)
        const leader = new AcDbLeader()
        for (const p of args.points)
          leader.appendVertex(new AcGePoint3d(p.x, p.y, p.z ?? 0))
        leader.hasArrowHead = args.arrowHead ?? true
        leader.dimensionStyle = styleName
        const {
          points: _p,
          arrowSize: _a,
          native: _n,
          dimStyle: _d,
          arrowHead: _h,
          ...identity
        } = args
        return place(leader, identity)
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
      const {
        points: _points,
        arrowSize: _arrow,
        native: _native,
        dimStyle: _dimStyle,
        arrowHead: _arrowHead,
        ...base_
      } = args
      const line = drawPolyline({
        ...base_,
        points: args.points,
        closed: false
      })
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
        loop.add(
          new AcGeLine2d(new AcGePoint2d(a.x, a.y), new AcGePoint2d(b.x, b.y))
        )
      }
      arrow.add(loop)
      place(arrow, base_)
      return line
    },

    defineTextStyle: def => {
      if (!definedTextStyles.has(def.name)) definedTextStyles.set(def.name, def)
      ensureTextStyle(def.name)
      return def.name
    },

    defineDimStyle: def => {
      if (!definedDimStyles.has(def.name)) definedDimStyles.set(def.name, def)
      ensureDimStyle(def.name)
      return def.name
    },

    defineBlock: def => {
      const table = db.tables.blockTable
      if (table.has(def.name)) return def.name
      const base = def.basePoint ?? { x: 0, y: 0, z: 0 }
      const record = new AcDbBlockTableRecord({ name: def.name })
      record.origin = new AcGePoint3d(base.x, base.y, base.z ?? 0)
      table.add(record)
      for (const spec of def.entities) {
        let entity: AcDbEntity
        switch (spec.kind) {
          case 'line':
            entity = new AcDbLine(spec.start, spec.end)
            break
          case 'polyline':
            entity = buildPolyline(spec.points, spec.closed)
            break
          case 'circle':
            entity = new AcDbCircle(spec.center, spec.radius)
            break
          case 'arc':
            entity = new AcDbArc(
              spec.center,
              spec.radius,
              spec.startAngle,
              spec.endAngle
            )
            break
          case 'text':
            entity = buildText(spec)
            break
          case 'hatch':
            entity = buildHatch(spec)
            break
          case 'insert': {
            if (!table.has(spec.block))
              throw new Error(
                `Block '${def.name}' chèn block '${spec.block}' chưa được định nghĩa; định nghĩa block bên trong trước.`
              )
            const inner = new AcDbBlockReference(spec.block)
            inner.position = new AcGePoint3d(
              spec.position.x,
              spec.position.y,
              spec.position.z ?? 0
            )
            const sx =
              typeof spec.scale === 'number' ? spec.scale : (spec.scale?.x ?? 1)
            const sy =
              typeof spec.scale === 'number' ? spec.scale : (spec.scale?.y ?? 1)
            inner.scaleFactors = { x: sx, y: sy, z: 1 }
            inner.rotation = ((spec.rotationDeg ?? 0) * Math.PI) / 180
            entity = inner
            break
          }
          case 'attribute': {
            const attdef = buildText(
              { ...spec, text: spec.defaultValue ?? '' },
              new AcDbAttributeDefinition()
            ) as AcDbAttributeDefinition
            attdef.tag = spec.tag
            attdef.prompt = spec.prompt ?? spec.tag
            attdef.isInvisible = spec.invisible ?? false
            entity = attdef
            break
          }
        }
        applyBlockLook(entity, spec)
        record.appendEntity(entity)
      }
      return def.name
    },

    insert: args => {
      const record = db.tables.blockTable.getAt(args.block)
      if (!record) {
        throw new Error(
          `Block '${args.block}' chưa được định nghĩa; gọi defineBlock trước khi chèn '${args.partId}'.`
        )
      }
      const sx =
        typeof args.scale === 'number' ? args.scale : (args.scale?.x ?? 1)
      const sy =
        typeof args.scale === 'number' ? args.scale : (args.scale?.y ?? 1)
      const angle = ((args.rotationDeg ?? 0) * Math.PI) / 180
      const reference = new AcDbBlockReference(args.block)
      reference.position = new AcGePoint3d(
        args.position.x,
        args.position.y,
        args.position.z ?? 0
      )
      reference.scaleFactors = { x: sx, y: sy, z: 1 }
      reference.rotation = angle
      // Attributes are stored in world coordinates, as AutoCAD writes ATTRIB:
      // the definition's point taken through the insert's scale, rotation and
      // position, measured from the block's base point.
      const origin = record.origin
      const toWorld = (p: { x: number; y: number }) => {
        const lx = (p.x - origin.x) * sx
        const ly = (p.y - origin.y) * sy
        return new AcGePoint3d(
          args.position.x + lx * Math.cos(angle) - ly * Math.sin(angle),
          args.position.y + lx * Math.sin(angle) + ly * Math.cos(angle),
          args.position.z ?? 0
        )
      }
      for (const entity of record.newIterator()) {
        const def = entity as AcDbAttributeDefinition
        if (typeof def.tag !== 'string' || !('prompt' in def)) continue
        const given = args.attributes?.[def.tag]
        const own: AcTpAttributeValue =
          typeof given === 'string'
            ? { value: given }
            : (given ?? { value: def.textString })
        const attribute = new AcDbAttribute()
        attribute.tag = def.tag
        attribute.textString = own.value
        attribute.isInvisible = def.isInvisible
        if (own.position) {
          // Placed as given: insertion and alignment point are the same.
          const style = own.style ?? def.styleName
          ensureTextStyle(style)
          attribute.styleName = style
          attribute.height = own.height ?? def.height * Math.abs(sy)
          attribute.widthFactor = own.widthFactor ?? def.widthFactor
          attribute.rotation =
            own.rotationDeg !== undefined
              ? (own.rotationDeg * Math.PI) / 180
              : def.rotation + angle
          const at = new AcGePoint3d(
            own.position.x,
            own.position.y,
            own.position.z ?? 0
          )
          attribute.position = at
          const align = own.align ?? def.horizontalMode
          if (align) {
            attribute.horizontalMode = align
            attribute.alignmentPoint = at.clone()
          }
        } else {
          if (own.style) ensureTextStyle(own.style)
          attribute.styleName = own.style ?? def.styleName
          attribute.height = def.height * Math.abs(sy)
          attribute.widthFactor = def.widthFactor
          attribute.rotation = def.rotation + angle
          attribute.position = toWorld(def.position)
          if (def.horizontalMode) {
            attribute.horizontalMode = def.horizontalMode
            attribute.alignmentPoint = toWorld(def.alignmentPoint)
          }
        }
        reference.appendAttributes(attribute)
      }
      const {
        block: _b,
        position: _p,
        scale: _s,
        rotationDeg: _r,
        attributes: _a,
        ...identity
      } = args
      const placed = place(reference, identity)
      for (const attribute of reference.attributeIterator()) {
        attribute.layer = placed.layer
      }
      return placed
    },

    get warnings() {
      return warnings
    },

    get drawn() {
      return drawn
    }
  }
}
