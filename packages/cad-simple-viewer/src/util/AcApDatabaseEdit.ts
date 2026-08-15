import { AcDbDatabase } from '@mlightcad/data-model'

import { eventBus } from '../editor/global/eventBus'

/**
 * Notifies UI listeners that undo/redo availability may have changed.
 */
export function acapNotifyUndoStackChanged(): void {
  eventBus.emit('undo-stack-changed', {})
}

/**
 * Application-layer shortcut for {@link AcDbDatabase.runDatabaseEdit} that also
 * notifies UI listeners when a new undo mark is created.
 */
export function acapRunDatabaseEdit(
  db: AcDbDatabase,
  label: string,
  fn: () => void
): void {
  const wasRecording = db.isUndoRecording?.() ?? false
  db.runDatabaseEdit(label, fn)
  if (!wasRecording) {
    acapNotifyUndoStackChanged()
  }
}

/**
 * Asynchronous counterpart of {@link acapRunDatabaseEdit}: runs a whole
 * sequence of edits under a **single** undo mark, even when the sequence
 * awaits between individual edits.
 *
 * {@link acapRunDatabaseEdit} cannot do this because
 * {@link AcDbDatabase.runDatabaseEdit} is synchronous — it closes its undo
 * mark the moment it returns, so an awaited sequence ends up with one mark per
 * edit instead of one mark per user action.
 *
 * Nested calls join the enclosing mark rather than opening their own, which is
 * what lets callers wrap an arbitrary sequence without knowing whether its
 * individual steps already record undo marks of their own.
 *
 * On failure the whole group is rolled back and no mark is left behind: a
 * half-applied sequence is never undoable as a unit, so it must not be
 * recorded as one.
 *
 * @param db - Database being edited.
 * @param label - Human-readable label shown in the undo history.
 * @param fn - Sequence of edits to run. May be synchronous or asynchronous.
 *
 * @example
 * ```ts
 * await acapRunGroupedEdit(db, 'Thêm lan can', async () => {
 *   for (const side of sides) {
 *     await drawRailing(side) // each step may itself call acapRunDatabaseEdit
 *   }
 * })
 * // → exactly one entry in the undo history
 * ```
 */
export async function acapRunGroupedEdit(
  db: AcDbDatabase,
  label: string,
  fn: () => void | Promise<void>
): Promise<void> {
  // Already inside a group: contribute to the enclosing mark and add none.
  if (db.isUndoRecording?.() ?? false) {
    await fn()
    return
  }

  const tm = db.transactionManager
  tm.startUndoMark(label)
  tm.startTransaction()
  let markOpen = true

  try {
    await fn()
  } catch (error) {
    if (tm.hasTransaction()) {
      tm.abortTransaction()
    }
    tm.cancelUndoMark()
    markOpen = false
    throw error
  } finally {
    if (markOpen) {
      if (tm.hasTransaction()) {
        tm.commitTransaction()
      }
      tm.endUndoMark()
      acapNotifyUndoStackChanged()
    }
  }
}
