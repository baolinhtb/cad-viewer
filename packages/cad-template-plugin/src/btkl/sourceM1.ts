/**
 * The SUB-100 quantity table of `assets/02. BTC- mo_2.dwg` (OLE `211C24F`,
 * read by `tools/fidelity/ole.mjs`), verbatim. The take-off of the M1
 * dossier is compared with it line by line, and lines the drawing does not
 * show enough to derive are copied from it while the geometry is the
 * source's own (decision Q6).
 */
export const BTKL_M1_SOURCE = {
  beTong: {
    be: 91.721,
    than: 53.667,
    dinh: 7.267,
    canh: 27.71,
    tai: 0.36,
    uChongXo: 0.304,
    lanCan: 5.223,
    tong: 186.253
  },
  lot: 4.446,
  vuaKhongCoNgot: 0.04,
  ongPvcD125: 9.5,
  chenBotXop: 0.049,
  hopChot: 4,
  btNhua: 118.448,
  vanKhuon: 266.6,
  thep: {
    /** Per diameter as the table shows it (rounded cells). */
    theoDuongKinh: {
      12: 284,
      14: 443.2,
      16: 7647,
      18: 3684,
      22: 1975,
      32: 16.406,
      6: 5.452,
      8: 4.029
    } as Record<number, number>,
    coGo: 14048.838,
    tron: 9.481,
    tong: 14058.319
  }
} as const

/** Unit weight of a round bar by formula, kg/m: d² · 0.00617 (d in mm). */
export function acTpSteelKgPerM(diameter: number): number {
  return diameter * diameter * 0.00617
}
