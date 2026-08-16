import { AcDbDatabase } from '@mlightcad/data-model'

import { eventBus } from '../editor/global/eventBus'

/**
 * Notifies UI listeners that undo/redo availability may have changed.
 */
export function acapNotifyUndoStackChanged(): void {
  eventBus.emit('undo-stack-changed', {})
}

/**
 * State of the {@link acapRunMarkedEdits} group open on each database.
 *
 * Tracked here rather than asked of the database because the state this needs
 * to name does not exist in the core: between two edits of a mark-only group
 * there is no open transaction, so `isUndoRecording()` reads false even though
 * a mark is very much open.
 *
 * `depth` rather than a flag: two sequences can overlap on one database, and a
 * membership cleared by whichever finishes first would drop the other's
 * remaining edits back to one mark each.
 *
 * `edits` counts commits this group made, which is the only signal about the
 * group's own effect that does not depend on guessing. Reading the database's
 * change events instead would miss sysvar and dictionary writes — `db.clayer`,
 * which the `set_current_layer` tool goes through, dispatches neither.
 */
interface AcApMarkedGroupState {
  depth: number
  edits: number
}

const markedGroups = new WeakMap<AcDbDatabase, AcApMarkedGroupState>()

function openGroup(db: AcDbDatabase): AcApMarkedGroupState | undefined {
  const state = markedGroups.get(db)
  return state && state.depth > 0 ? state : undefined
}

/**
 * Application-layer shortcut for {@link AcDbDatabase.runDatabaseEdit} that also
 * notifies UI listeners when a new undo mark is created.
 *
 * Inside an {@link acapRunMarkedEdits} group the behaviour differs: the edit
 * runs in a transaction of its own, opens no mark, and notifies nobody — the
 * enclosing group owns both. `label` is unused on that path, because the label
 * shown in the history is the group's.
 */
export function acapRunDatabaseEdit(
  db: AcDbDatabase,
  label: string,
  fn: () => void
): void {
  const group = openGroup(db)
  if (group) {
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
      group.edits += 1
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
 * A failing sequence is **not** unwound automatically, and that is deliberate.
 * Committed changes can only be reverted by `undo()`, which pops whatever sits
 * on top of the stack — and nothing in the public core says whether the top
 * record is this group's. It usually is; it is not when something opened a
 * mark of its own while this group was awaiting. `AcEdCommand.trigger` does
 * exactly that, so a hand command run mid-sequence takes the changes into its
 * own record, and an automatic `undo()` here would delete the user's work
 * instead of the failed sequence's. Measured, not theorised.
 *
 * So a failure leaves what it managed to commit, gathered under this one mark.
 * The sequence stays a single `Ctrl+Z` — which is the promise that matters —
 * and the undo stack is never reached into blind.
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
  const enclosing = openGroup(db)
  if (enclosing) {
    enclosing.depth += 1
    try {
      return await fn()
    } finally {
      enclosing.depth -= 1
    }
  }

  const tm = db.transactionManager
  const group: AcApMarkedGroupState = { depth: 1, edits: 0 }
  markedGroups.set(db, group)
  tm.startUndoMark(label)

  try {
    return await fn()
  } finally {
    group.depth -= 1
    // Closing runs on both paths and is guarded on both: an unwind that throws
    // must never replace the failure that caused it, or the caller goes
    // looking for "No active undo mark to end" instead of the tool error they
    // actually hit.
    try {
      if (tm.hasTransaction()) {
        tm.abortTransaction()
      }
      tm.endUndoMark()
      // Announced when this group committed anything at all, not when the
      // database happened to dispatch a change event: a turn whose only edit
      // was `db.clayer` dispatches nothing yet still leaves a record, and an
      // unannounced record is a stale Undo button and a skipped autosave.
      // A sequence that edited nothing stays silent, so asking a question
      // never costs an upload.
      if (group.edits > 0) {
        acapNotifyUndoStackChanged()
      }
    } catch (closeError) {
      console.error(
        '[acapRunMarkedEdits] could not close the undo mark',
        closeError
      )
    }
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
  if (openGroup(db) || (db.isUndoRecording?.() ?? false)) {
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
