/**
 * The symbols the source dossier writes on its dimensions instead of numbers
 * ("B Mố", "HB", "LC"…), and the parameter each one measures.
 *
 * The 0.3.0 generator stretches a copy of the source drawing, so 72 of the 89
 * dimensions of SUB-010 carry a text override that never shows the measured
 * value — before or after a change of dimensions (phase 1, b). This table says
 * which parameter a symbol stands for (for the agent, and for the tests that
 * check the drawing measures what the parameters say), and
 * {@link acTpDimensionText} turns a symbol into a measured label on request.
 *
 * Every exact entry was measured on the source at the M1 defaults and is
 * checked by test under the stretch grid. Entries marked `xapXi` follow the
 * cross fall: the dimension sits off the axis, so it is the parameter plus or
 * minus the fall over half a width.
 */
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'

/** One symbol written on the source's dimensions. */
export interface AcTpDimSymbol {
  /** Expression in parameters, as shown to people. */
  thamSo: string
  /** Value in mm for the given parameters. */
  giaTri: (v: AcTpParamValues) => number
  /** Follows the cross fall: equal to `giaTri` only on the axis. */
  xapXi?: boolean
}

const n = (v: AcTpParamValues, k: string) => Number(v[k])
/** Head-wall thickness, fixed in the source (BTKL `HEAD_WALL`). */
const T = 500

export const DOSSIER_DIM_SYMBOLS: Readonly<Record<string, AcTpDimSymbol>> = {
  'B Mố': { thamSo: 'bBe', giaTri: v => n(v, 'bBe') },
  'B Bệ': { thamSo: 'lBe', giaTri: v => n(v, 'lBe') },
  HB: { thamSo: 'hBe', giaTri: v => n(v, 'hBe') },
  'D Cọc': { thamSo: 'D', giaTri: v => n(v, 'D') },
  'B Mố - 2D': { thamSo: 'aCocNgang', giaTri: v => n(v, 'aCocNgang') },
  'B Bệ-2D': { thamSo: 'aCocDoc', giaTri: v => n(v, 'aCocDoc') },
  'B (TT)': { thamSo: 'tThan', giaTri: v => n(v, 'tThan') },
  T: { thamSo: '500 (tường đỉnh, cố định)', giaTri: () => T },
  N: { thamSo: 'tThan − 500', giaTri: v => n(v, 'tThan') - T },
  B1: {
    thamSo: 'lBe − muiBe − tThan',
    giaTri: v => n(v, 'lBe') - n(v, 'muiBe') - n(v, 'tThan')
  },
  B2: { thamSo: 'muiBe', giaTri: v => n(v, 'muiBe') },
  B4: {
    thamSo: 'lCanh − 500 − (lBe − muiBe − tThan)',
    giaTri: v =>
      n(v, 'lCanh') - T - (n(v, 'lBe') - n(v, 'muiBe') - n(v, 'tThan'))
  },
  LC: { thamSo: 'lCanh', giaTri: v => n(v, 'lCanh') },
  'W(t)': { thamSo: 'tCanh', giaTri: v => n(v, 'tCanh') },
  'B Mố - 2 W(t)': {
    thamSo: 'bThan − 2·tCanh',
    giaTri: v => n(v, 'bThan') - 2 * n(v, 'tCanh')
  },
  'B Mặt đường': { thamSo: 'bMatDuong', giaTri: v => n(v, 'bMatDuong') },
  H1: { thamSo: 'hThan + hDau', giaTri: v => n(v, 'hThan') + n(v, 'hDau') },
  H1A: { thamSo: 'hThan', giaTri: v => n(v, 'hThan'), xapXi: true },
  H1B: { thamSo: 'hDau', giaTri: v => n(v, 'hDau'), xapXi: true },
  H2: {
    thamSo: 'hThan + hDau',
    giaTri: v => n(v, 'hThan') + n(v, 'hDau'),
    xapXi: true
  },
  H2A: { thamSo: 'hThan', giaTri: v => n(v, 'hThan'), xapXi: true },
  H2B: { thamSo: 'hDau', giaTri: v => n(v, 'hDau'), xapXi: true },
  // At the high road edge of the front elevation, like H3A/H3B: it measured
  // hThan + hDau exactly only while the road was the source's 7000 at 2 %.
  // Since P2-M6 the fall is the stated one on any road width (L1: 6615,
  // the high edge 10 mm higher than the stretched source put it).
  H3: {
    thamSo: 'hThan + hDau',
    giaTri: v => n(v, 'hThan') + n(v, 'hDau'),
    xapXi: true
  },
  H3A: { thamSo: 'hThan', giaTri: v => n(v, 'hThan'), xapXi: true },
  H3B: { thamSo: 'hDau', giaTri: v => n(v, 'hDau'), xapXi: true }
}

/** How the dossier labels its dimensions (`nhanKichThuoc`). */
export type AcTpDimLabelMode = 'ky_hieu' | 'so_do' | 'ca_hai'

/**
 * The text of a source dimension under a label mode.
 *
 * Only symbols are touched: a text already measuring (`<>`) and spacing notes
 * (`@500`) stay as they are, whatever the mode.
 * - `ky_hieu`: the source's symbol (the default — the drawing as delivered);
 * - `so_do`: no override, so the dimension shows what it measures;
 * - `ca_hai`: `symbol = <>`, the CAD substituting the measured value.
 *
 * @returns The override text, or `undefined` for none.
 */
export function acTpDimensionText(
  text: string | undefined,
  mode: AcTpDimLabelMode
): string | undefined {
  if (text === undefined || mode === 'ky_hieu') return text
  if (text.includes('<>') || text.startsWith('@')) return text
  return mode === 'so_do' ? undefined : `${text} = <>`
}
