import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'

/** One value the tool worked out from the others, reported to the user. */
export interface DossierDerived {
  thamSo: string
  giaTri: number
  lyDo: string
}

/**
 * Road edge to stem edge on each side, mm: M1 draws a 7000 road on a 7700
 * stem. Fixed (standard assumption 9b) so the kerb / rail-foot strip keeps
 * its size; a wider margin would stretch that strip.
 */
export const DOSSIER_ROAD_MARGIN = 350
/**
 * Outer bearing centre to stem edge less half the 500 symbol, mm: M1 puts
 * 4 bearings at 2000 on a 7700 stem, (7700 − 500 − 3 × 2000) / 2.
 */
export const DOSSIER_BEARING_MARGIN = 600
/** Width the bearing symbol takes across the stem, mm. */
const BEARING_SYMBOL = 500
/** Derived bearing spacing is rounded down to this, mm. */
const BEARING_STEP = 50
/** Smallest bearing spacing the parameter accepts, mm. */
const BEARING_MIN = 500

/**
 * Fills in the values the source arrangement ties to the ones the user gave,
 * before the dossier is built:
 *
 * - only `bMatDuong` given (no `bBe`/`bThan`): `bBe = bThan = bMatDuong +
 *   2 × DOSSIER_ROAD_MARGIN`, whatever margin the dossier had;
 * - `aCocNgang = (bBe − 2D) / (soCotCoc − 1)` (floored to mm) when the
 *   footing width, the pile diameter or the pile count changes and
 *   `aCocNgang` is not given: the outer piles flush with the footing edges
 *   as in the source, the others spread evenly (`bBe − 2D` for two);
 * - `aCocDoc = (lBe − 2D) / (soHangCoc − 1)` likewise along the bridge;
 * - `aGoi`, when not given and the bearings no longer fit the stem
 *   (`(soGoi − 1) · aGoi + 500 > bThan`): spread evenly with
 *   DOSSIER_BEARING_MARGIN at each edge, rounded down to 50 mm. Left as is
 *   (the model then refuses) when that spacing would fall below 500.
 *
 * The bearing count is never changed. Keys the user gave are never
 * overwritten; every derived value is reported in `suyRa`.
 *
 * @param base - Values the dossier has now (the defaults for a new one).
 * @param given - Values the user supplied in this call.
 */
export function acapDeriveDossierValues(
  base: AcTpParamValues,
  given: AcTpParamValues
): { values: AcTpParamValues; suyRa: DossierDerived[] } {
  const values: AcTpParamValues = { ...base, ...given }
  const suyRa: DossierDerived[] = []
  const n = (k: string) => Number(values[k])
  const has = (k: string) => k in given
  const moved = (k: string) => Number(values[k]) !== Number(base[k])
  const set = (thamSo: string, giaTri: number, lyDo: string) => {
    if (!Number.isFinite(giaTri) || Number(values[thamSo]) === giaTri) return
    values[thamSo] = giaTri
    suyRa.push({ thamSo, giaTri, lyDo })
  }
  if (has('bMatDuong') && !has('bBe') && !has('bThan')) {
    const width = n('bMatDuong') + 2 * DOSSIER_ROAD_MARGIN
    set(
      'bBe',
      width,
      `bề rộng bệ = bề rộng mặt đường + 2 × ${DOSSIER_ROAD_MARGIN} (lề mép đường cố định như M1)`
    )
    set(
      'bThan',
      width,
      'bản gốc vẽ thân rộng bằng bệ (bề rộng thân = bề rộng bệ)'
    )
  }
  // Only when a driver moved: an unrelated edit must not rewrite pile
  // spacing a stored dossier already has. The outer piles stay flush with
  // the footing edges, as the source; more piles spread evenly between
  // them (P2-M4). One pile per row needs no spacing.
  const flush = (
    spacing: string,
    count: string,
    width: string,
    words: { width: string; spacing: string; count: string }
  ) => {
    if (has(spacing) || !(moved(width) || moved('D') || moved(count))) return
    const piles = n(count)
    if (!(piles > 1)) return
    const gap = n(width) - 2 * n('D')
    set(
      spacing,
      piles === 2 ? gap : Math.floor(gap / (piles - 1)),
      piles === 2
        ? `cọc sát mép bệ: ${words.spacing} = ${words.width} − 2 × đường kính cọc`
        : `cọc biên sát mép bệ, ${piles} ${words.count} chia đều: ${words.spacing} = (${words.width} − 2 × đường kính cọc) / ${piles - 1}, làm tròn xuống mm`
    )
  }
  flush('aCocNgang', 'soCotCoc', 'bBe', {
    width: 'bề rộng bệ',
    spacing: 'tim cọc ngang',
    count: 'cọc mỗi hàng'
  })
  flush('aCocDoc', 'soHangCoc', 'lBe', {
    width: 'chiều dài bệ',
    spacing: 'tim cọc dọc',
    count: 'hàng cọc'
  })
  const bearings = n('soGoi')
  if (
    !has('aGoi') &&
    bearings > 1 &&
    (bearings - 1) * n('aGoi') + BEARING_SYMBOL > n('bThan')
  ) {
    const fit =
      (n('bThan') - BEARING_SYMBOL - 2 * DOSSIER_BEARING_MARGIN) /
      (bearings - 1)
    const spacing = Math.floor(fit / BEARING_STEP) * BEARING_STEP
    if (spacing >= BEARING_MIN)
      set(
        'aGoi',
        spacing,
        `rải đều ${bearings} gối trong bề rộng thân ${n('bThan')} mm: (bề rộng thân − ${BEARING_SYMBOL} − 2 × ${DOSSIER_BEARING_MARGIN}) / (số gối − 1), lề mép ${DOSSIER_BEARING_MARGIN} mm như M1, làm tròn xuống bội ${BEARING_STEP} mm`
      )
  }
  return { values, suyRa }
}
