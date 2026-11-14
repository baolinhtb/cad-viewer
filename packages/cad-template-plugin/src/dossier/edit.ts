import { acapRunGroupedEdit } from '@mlightcad/cad-simple-viewer'
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'
import { readSemanticTag, writeSemanticTag } from '@mlightcad/cad-template-sdk'
import { AcDbDatabase, AcDbText, AcGeMatrix3d } from '@mlightcad/data-model'

import type { AcApRunEditResult } from '../editRun'
import { entitiesOfRun, listRuns } from '../runIdentity'
import { buildDossierModel } from './model'
import { buildDossierScene } from './scene'

/** Patch dossier labels/placement without regenerating any existing geometry.
 * Geometry parameters require native, scoped edits until a detail-preserving
 * dependency model exists; replacing source linework with a schematic is refused. */
export async function acapEditDossierRun(
  db: AcDbDatabase,
  run: ReturnType<typeof listRuns>[number],
  values: AcTpParamValues
): Promise<AcApRunEditResult> {
  const entities = entitiesOfRun(db, run.id)
  const result = (errors: string[]): AcApRunEditResult => ({
    runId: run.id,
    removed: 0,
    entityCount: entities.length,
    layers: [...new Set(entities.map(e => e.layer))],
    values,
    errors
  })
  const changed = Object.keys(values).filter(k => values[k] !== run.values[k])
  if (!changed.length) return result([])
  if (changed.some(k => !['tenMo', 'congTrinh', 'x', 'y'].includes(k)))
    return result([
      'Giữ nguyên bản vẽ chi tiết: không xóa để dựng lại từ template/sơ đồ. Dùng execute_cad_script, đọc đối tượng hiện tại rồi sửa đúng chữ/điểm grip bằng tx.setText hoặc tx.moveGrips. Thay đổi toàn bộ kích thước hồ sơ cần xác định các hình chiếu, kích thước và cấu tạo liên quan; chưa thay đổi thông số nào.'
    ])

  // Plan label changes before opening the transaction. An edited label must
  // not be silently overwritten by a value reconstructed from the template.
  const before = buildDossierScene(buildDossierModel({ ...run.values }))
  const after = buildDossierScene(buildDossierModel(values))
  const replacements = new Map<
    string,
    { old: string; next: string; expected: number }
  >()
  for (let s = 0; s < before.sheets.length; s++) {
    const old = before.sheets[s],
      next = after.sheets[s]
    if (old.primitives.length !== next.primitives.length)
      return result([
        'Cấu trúc hồ sơ đã khác mẫu; giữ nguyên chi tiết và sửa trực tiếp các đối tượng.'
      ])
    for (let i = 0; i < old.primitives.length; i++) {
      const a = old.primitives[i],
        b = next.primitives[i]
      if (a.kind !== 'text' || b.kind !== 'text' || a.text === b.text) continue
      const key = JSON.stringify([old.id, a.partId, a.text])
      const prior = replacements.get(key)
      if (prior && prior.next !== b.text)
        return result([
          'Nhãn trùng nhưng nội dung mới khác nhau; cần chọn đúng đối tượng để sửa.'
        ])
      replacements.set(key, {
        old: a.text,
        next: b.text,
        expected: (prior?.expected ?? 0) + 1
      })
    }
  }
  const patches = new Map<string, string>()
  for (const [key, replacement] of replacements) {
    const found = entities.filter(e => {
      const tag = readSemanticTag(e)
      return (
        e instanceof AcDbText &&
        JSON.stringify([tag?.params?.sheet, tag?.partId, e.textString]) === key
      )
    })
    if (found.length !== replacement.expected)
      return result([
        'Có ghi chú đã sửa tay hoặc bị xóa; giữ nguyên bản vẽ. Dùng tx.setText với đúng đối tượng hiện tại để tránh ghi đè nội dung đã chỉnh.'
      ])
    found.forEach(e => patches.set(e.objectId, replacement.next))
  }
  if (entities.some(e => db.tables.layerTable.getAt(e.layer)?.isLocked))
    return result(['Hồ sơ có layer bị khóa; chưa sửa đối tượng nào.'])
  const dx = Number(values.x) - Number(run.values.x)
  const dy = Number(values.y) - Number(run.values.y)
  await acapRunGroupedEdit(
    db,
    'Sửa nhãn/vị trí hồ sơ, giữ chi tiết',
    async () => {
      for (const original of entities) {
        const entity = db.openEntityForWrite(original)!
        const text = patches.get(entity.objectId)
        if (text !== undefined && entity instanceof AcDbText)
          entity.textString = text
        if (dx || dy)
          entity.transformBy(new AcGeMatrix3d().makeTranslation(dx, dy, 0))
        const tag = readSemanticTag(entity)!
        writeSemanticTag(entity, {
          ...tag,
          run: {
            ...tag.run!,
            values: values as Record<string, number | string | boolean>
          }
        })
      }
    }
  )
  return result([])
}
