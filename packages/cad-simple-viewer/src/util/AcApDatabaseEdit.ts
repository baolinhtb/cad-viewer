import { AcDbDatabase } from '@mlightcad/data-model'

import { eventBus } from '../editor/global/eventBus'

/**
 * Notifies UI listeners that undo/redo availability may have changed.
 */
export function acapNotifyUndoStackChanged(): void {
  eventBus.emit('undo-stack-changed', {})
}

/**
 * Databases currently inside an {@link acapRunMarkedEdits} group.
 *
 * Tracked here rather than asked of the database because the state this needs
 * to name does not exist in the core: between two edits of a mark-only group
 * there is no open transaction, so `isUndoRecording()` reads false even though
 * a mark is very much open.
 */
const markedGroups = new WeakSet<AcDbDatabase>()

/** Whether `db` is inside a group opened by {@link acapRunMarkedEdits}. */
export function acapIsInMarkedGroup(db: AcDbDatabase): boolean {
  return markedGroups.has(db)
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
  if (markedGroups.has(db)) {
    // Inside a mark-only group: run a transaction of our own so the commit
    // dispatches entity events — that is what puts the new geometry on the
    // canvas and into the renderer scene the preview capture reads — but open
    // no mark, because the group's mark is collecting every commit into one
    // record. No undo-stack notification either: the group emits one at the
    // end, which is what keeps autosave to a single write per turn.
    const tm = db.transactionManager
    tm.startTransaction()
    try {
      fn()
      tm.commitTransaction()
    } catch (error) {
      if (tm.hasTransaction()) {
        tm.abortTransaction()
      }
      throw error
    }
    return
  }

  const wasRecording = db.isUndoRecording?.() ?? false
  db.runDatabaseEdit(label, fn)
  if (!wasRecording) {
    acapNotifyUndoStackChanged()
  }
}

/** Event channel shape this module needs from the database. */
interface AcApEditNotifier {
  addEventListener(listener: () => void): void
  removeEventListener(listener: () => void): void
}

/**
 * Runs a sequence of edits under a single undo mark **without** holding one
 * transaction open across it.
 *
 * The difference from {@link acapRunGroupedEdit} is what the user sees while
 * the sequence runs. A held-open transaction suppresses `entityAppended` —
 * `AcDbBlockTableRecord.appendEntity` only notifies when the manager is not
 * recording, and the batched notification arrives from the outermost commit —
 * so nothing reaches the canvas until the whole sequence ends. For a template
 * that draws in a burst nobody notices; for an AI turn that runs for tens of
 * seconds it means a frozen canvas, and it breaks any step that needs to *see*
 * what was just drawn.
 *
 * So this opens the mark and lets each edit commit its own transaction. The
 * core is built for exactly that: `startUndoMark` documents that commits
 * performed before `endUndoMark` merge into one `AcDbUndoRecord`.
 *
 * The cost is the failure path. Committed changes cannot be aborted, so a
 * throw is rolled back by closing the mark and undoing the record it produced
 * — and only when something was actually committed, because `undo()` pops
 * whatever sits on top and popping an unrelated record would delete work this
 * group never touched.
 *
 * @param db - Database being edited.
 * @param label - Human-readable label shown in the undo history.
 * @param fn - Sequence of edits to run. May await freely.
 * @returns Whatever `fn` returns.
 */
export async function acapRunMarkedEdits<T>(
  db: AcDbDatabase,
  label: string,
  fn: () => T | Promise<T>
): Promise<T> {
  // Already inside a group: contribute to the enclosing mark and open none.
  if (markedGroups.has(db)) {
    return await fn()
  }

  const tm = db.transactionManager

  // Whether any commit inside the group carried real changes. The database
  // dispatches these events only from the commit path, and the very changes
  // that trigger them are what fill the mark — so `changed` being true is a
  // guarantee that `endUndoMark` pushed a record. That guarantee is the whole
  // point: it is what makes the `undo()` below safe.
  let changed = false
  const noteChange = () => {
    changed = true
  }
  const channels: AcApEditNotifier[] = [
    db.events.entityAppended,
    db.events.entityModified,
    db.events.entityErased,
    db.events.layerAppended,
    db.events.layerModified,
    db.events.layerErased
  ]
  channels.forEach(channel => channel.addEventListener(noteChange))

  tm.startUndoMark(label)
  markedGroups.add(db)

  try {
    const result = await fn()
    tm.endUndoMark()
    if (changed) {
      acapNotifyUndoStackChanged()
    }
    return result
  } catch (error) {
    if (tm.hasTransaction()) {
      tm.abortTransaction()
    }
    tm.endUndoMark()
    if (changed) {
      tm.undo()
      acapNotifyUndoStackChanged()
    }
    throw error
  } finally {
    markedGroups.delete(db)
    channels.forEach(channel => channel.removeEventListener(noteChange))
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
  // The mark-only check is separate because between two of that group's edits
  // there is no open transaction, so `isUndoRecording()` would say false and
  // this would open a competing mark.
  if (markedGroups.has(db) || (db.isUndoRecording?.() ?? false)) {
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
