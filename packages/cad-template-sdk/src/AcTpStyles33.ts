/**
 * Text and dimension styles of the office, under `_33_` names.
 *
 * Taken from `assets/02. BTC- mo_2.dwg` so a generated drawing looks like the
 * engineer's own. Two deliberate differences from the source:
 *
 * - **Fonts are Unicode.** The source writes Vietnamese in TCVN3 fonts
 *   (.VnArialH, .VnAvantH…); generated text is Unicode, so the styles use the
 *   TrueType fonts those were made from. Capital-only `…H` fonts become plain
 *   fonts with the text itself in capitals.
 * - **Dimension sizes are stored as drawn.** The source styles say
 *   `DIMSCALE 100, DIMTXT 1.5`; the data model's dimension builder reads the
 *   base values without the scale, so these styles store the products with
 *   `dimscale 1` (`dimtxt 150`). What is seen and plotted is identical; the
 *   fidelity harness compares the effective sizes.
 *
 * Each entry's comment names the source style it reproduces.
 * DIMFXL/DIMFXLON (fixed-length extension lines, on in D100) have no
 * counterpart in the data model: they are record attributes here, applied
 * by the SDK when it builds a dimension and written to DXF by acTpDxfOut.
 */
import { AcDbDimTextVertical } from '@mlightcad/data-model'

/** A text style to create on demand. */
export interface AcTpTextStyleDef {
  name: string
  /** Font file as AutoCAD records it in the STYLE table (`arial.ttf`). */
  font: string
  /** Width factor; 1 when unset. */
  widthFactor?: number
}

/**
 * Dimension style variables the SDK can set. Sizes are in drawing units as
 * drawn (see the module note); colours are ACI (0 = ByBlock, 256 = ByLayer).
 */
export interface AcTpDimStyleVars {
  dimscale?: number
  dimtxt?: number
  dimasz?: number
  dimexo?: number
  dimexe?: number
  dimdli?: number
  dimdle?: number
  dimgap?: number
  dimtad?: AcDbDimTextVertical
  dimtih?: number
  dimtoh?: number
  dimdec?: number
  dimrnd?: number
  dimzin?: number
  dimlfac?: number
  dimtfac?: number
  dimclrd?: number
  dimclre?: number
  dimclrt?: number
  /** Text style name; created from the catalogue when missing. */
  dimtxsty?: string
  /**
   * Fixed-length extension lines (DIMFXLON) and their length from the
   * dimension line (DIMFXL). Not in the data model: kept as attributes of the
   * style record, applied by the SDK when it builds the dimension, and
   * written to DXF (groups 290/49) by `acTpDxfOut`.
   */
  dimfxlon?: number
  dimfxl?: number
}

/** A dimension style to create on demand. */
export interface AcTpDimStyleDef extends AcTpDimStyleVars {
  name: string
}

/** Text styles, keyed by name. */
export const ACTP_TEXT_STYLES_33: Readonly<Record<string, AcTpTextStyleDef>> = {
  // .VnArialH / .VnArial / Arial in the source (2_vnarialH, KT, VNARIALH,
  // ARIALH, Ain, 4_vnarial, Btext, Arial).
  _33_Arial: { name: '_33_Arial', font: 'arial.ttf', widthFactor: 1 },
  // Style "2" of the source: Arial at width 0.8.
  _33_Arial08: { name: '_33_Arial08', font: 'arial.ttf', widthFactor: 0.8 },
  // .VnArial Narrow / .VnArial NarrowH (ARIALN, VnArial NarrowH).
  _33_ArialHep: { name: '_33_ArialHep', font: 'arialn.ttf', widthFactor: 1 },
  // .VnAvantH (TEXT, .VNAVANTH_SAGI, style1a). Kept as its own style so the
  // office can point it at the Avant Garde face it uses; Arial until then.
  _33_Avant: { name: '_33_Avant', font: 'arial.ttf', widthFactor: 1 },
  // STANDARD of the source (txt.shx): ATTRIBs stored without a style, such
  // as the elevation tags of cd11, are drawn with it.
  _33_Txt: { name: '_33_Txt', font: 'txt.shx', widthFactor: 1 }
}

/** Dimension styles, keyed by name (sizes as drawn, `dimscale 1`). */
export const ACTP_DIM_STYLES_33: Readonly<Record<string, AcTpDimStyleDef>> = {
  // D100: DIMSCALE 100 · DIMTXT 1.5 · DIMASZ 1.3 · DIMEXO 1 · DIMEXE 0.7 ·
  // DIMDLI 4.5 · DIMDLE 1 · DIMGAP 0.6 · DIMTAD 1 · DIMDEC 2 · DIMZIN 8 ·
  // dim/ext lines ACI 8, text ACI 3, text style 2_vnarialH.
  _33_D100: {
    name: '_33_D100',
    dimscale: 1,
    dimtxt: 150,
    dimasz: 130,
    dimexo: 100,
    dimexe: 70,
    dimdli: 450,
    dimdle: 100,
    dimgap: 60,
    dimtad: AcDbDimTextVertical.Above,
    dimtih: 0,
    dimtoh: 0,
    dimdec: 2,
    // DIMRND 1: the source prints 1139.98 as 1140.
    dimrnd: 1,
    dimzin: 8,
    dimlfac: 1,
    dimclrd: 8,
    dimclre: 8,
    dimclrt: 3,
    // DIMFXLON on, DIMFXL 4.5: extension lines 4.5 mm from the dim line.
    dimfxlon: 1,
    dimfxl: 450,
    dimtxsty: '_33_Arial'
  },
  // "150": every instance overrides to DIMSCALE 100 · DIMASZ 1.3 · DIMEXO 0 ·
  // DIMEXE 2 (some 1, pass as an override) · DIMDLI 3 · DIMTXT 1.5 ·
  // DIMGAP 0.5 · text ACI 4, text style VNARIALH.
  _33_D150: {
    name: '_33_D150',
    dimscale: 1,
    dimtxt: 150,
    dimasz: 130,
    dimexo: 0,
    dimexe: 200,
    dimdli: 300,
    dimgap: 50,
    dimtad: AcDbDimTextVertical.Above,
    dimtih: 0,
    dimtoh: 0,
    dimdec: 2,
    dimzin: 8,
    dimlfac: 1,
    dimclrt: 4,
    dimtxsty: '_33_Arial'
  },
  // Dim100 (rebar leaders): DIMSCALE 100 · DIMTXT 1.5 · DIMASZ 1.25 ·
  // DIMEXO 0.5 · DIMEXE 0.5 · DIMGAP 0.5 · DIMTFAC 0.6 · text ACI 7, Arial.
  _33_Dim100: {
    name: '_33_Dim100',
    dimscale: 1,
    dimtxt: 150,
    dimasz: 125,
    dimexo: 50,
    dimexe: 50,
    dimgap: 50,
    dimtad: AcDbDimTextVertical.Above,
    dimtih: 0,
    dimtoh: 0,
    dimdec: 2,
    dimzin: 8,
    dimlfac: 1,
    dimtfac: 0.6,
    dimclrt: 7,
    dimtxsty: '_33_Arial'
  },
  // D125: DIMSCALE 125 · DIMTXT 1.6 · DIMASZ 1.1.
  _33_D125: {
    name: '_33_D125',
    dimscale: 1,
    dimtxt: 200,
    dimasz: 137.5,
    dimtad: AcDbDimTextVertical.Above,
    dimtih: 0,
    dimtoh: 0,
    dimdec: 2,
    dimzin: 8,
    dimlfac: 1,
    dimtxsty: '_33_Arial'
  },
  // "1" — the bar-shape legend drawn on paper (DIMLFAC 1000, DIMTXT 1.5,
  // DIMASZ 1.25). Generated sheets put paper content in model space ×100, so
  // sizes ×100 and DIMLFAC 1000/100.
  _33_D1: {
    name: '_33_D1',
    dimscale: 1,
    dimtxt: 150,
    dimasz: 125,
    dimtad: AcDbDimTextVertical.Above,
    dimtih: 0,
    dimtoh: 0,
    dimdec: 0,
    dimzin: 8,
    dimlfac: 10,
    dimtxsty: '_33_Avant'
  },
  // D1_Sagi — aligned dims of the same legend; text style .VNAVANTH_SAGI.
  _33_D1Sagi: {
    name: '_33_D1Sagi',
    dimscale: 1,
    dimtxt: 150,
    dimasz: 120,
    dimtad: AcDbDimTextVertical.Above,
    dimtih: 0,
    dimtoh: 0,
    dimdec: 0,
    dimzin: 8,
    dimlfac: 10,
    dimtxsty: '_33_Avant'
  }
}
