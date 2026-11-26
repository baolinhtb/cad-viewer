import { readSemanticTag } from '@mlightcad/cad-template-sdk'
import { AcDbEntity, AcDbText } from '@mlightcad/data-model'

/**
 * The GHI CHÚ block of one sheet as drawn (FIX-NOTE): its lines in drawing
 * order, the heading left out, joined by a space — so a warning wrapped over
 * several lines reads whole (`toContain` the full sentence).
 */
export function ghiChuText(entities: AcDbEntity[], sheet: string): string {
  return entities
    .filter((e): e is AcDbText => {
      const tag = readSemanticTag(e)
      return (
        e instanceof AcDbText &&
        tag?.params?.khoi === 'GHI CHÚ' &&
        tag.params.sheet === sheet &&
        e.textString !== 'GHI CHÚ'
      )
    })
    .map(e => e.textString)
    .join(' ')
}
