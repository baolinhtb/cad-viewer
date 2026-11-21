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
 * Fills in the values the source arrangement ties to the ones the user gave,
 * before the dossier is built:
 *
 * - only `bMatDuong` given (no `bBe`/`bThan`): `bBe = bThan = bMatDuong +
 *   2 × DOSSIER_ROAD_MARGIN`, whatever margin the dossier had;
 * - `aCocNgang = bBe − 2D` when the footing width or pile diameter changes
 *   and `aCocNgang` is not given;
 * - `aCocDoc = lBe − 2D` likewise for the footing length.
 *
 * Bearing spacing and count are left alone. Keys the user gave are never
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
      `bBe = bMatDuong + 2 × ${DOSSIER_ROAD_MARGIN} (lề mép đường cố định như M1)`
    )
    set('bThan', width, 'bản gốc vẽ thân rộng bằng bệ (bThan = bBe)')
  }
  // Only when a driver moved: an unrelated edit must not rewrite pile
  // spacing a stored dossier already has.
  if (!has('aCocNgang') && (moved('bBe') || moved('D')))
    set('aCocNgang', n('bBe') - 2 * n('D'), 'cọc sát mép bệ: bBe − 2D')
  if (!has('aCocDoc') && (moved('lBe') || moved('D')))
    set('aCocDoc', n('lBe') - 2 * n('D'), 'cọc sát mép bệ: lBe − 2D')
  return { values, suyRa }
}
