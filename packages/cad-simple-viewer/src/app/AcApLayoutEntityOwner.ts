import { AcDbBlockTableRecord, type AcDbDatabase, type AcDbEntity } from '@mlightcad/data-model'

/** Whether an entity belongs to a top-level drawing layout, not a block
 * definition or a dimension's anonymous preview block. */
export function acapIsLayoutEntity(
  database: AcDbDatabase,
  entity: Pick<AcDbEntity, 'ownerId'>
): boolean {
  if (!entity.ownerId) return false
  const table = database.tables.blockTable
  const owner = table.getIdAt(entity.ownerId)
  if (owner) return owner.isModelSapce || owner.isPaperSapce

  // Imported/default records can retain a canonical objectId while their
  // handle index still names the pre-import ID. The name index and record
  // iterator remain correct. Do not discard every model entity in that case.
  const model = table.getAt(AcDbBlockTableRecord.MODEL_SPACE_NAME)
  if (model?.objectId === entity.ownerId) return true
  for (const record of table.newIterator()) {
    if (record.objectId === entity.ownerId) return record.isPaperSapce
  }
  return false
}
