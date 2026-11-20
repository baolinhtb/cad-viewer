import {
  AcApDocManager,
  acapRunMarkedEdits,
  acapRunOwnUndoMark
} from '@mlightcad/cad-simple-viewer'
import type { AcDbDatabase } from '@mlightcad/data-model'

import { agentT } from '../i18n'

/**
 * Longest undo label kept from the user's request.
 *
 * The undo history is a single line of short entries; a whole paragraph typed
 * into the chat box would push everything else out of view.
 */
export const MAX_TURN_UNDO_LABEL_LENGTH = 60

/**
 * Builds the undo-history label for one AI turn from the user's own words.
 *
 * Whitespace is collapsed before cutting: `extractConversationContext` joins a
 * message's text parts with newlines, and a history entry is one line.
 *
 * The cut counts characters rather than UTF-16 units, so a request ending on
 * an emoji or a stacked Vietnamese diacritic cannot be sliced through the
 * middle of one.
 *
 * @param userRequest - Text of the last user message, if any.
 * @returns The request collapsed and trimmed to
 *   {@link MAX_TURN_UNDO_LABEL_LENGTH}, with an ellipsis when it was cut, or
 *   the localized fallback when there is nothing to show.
 */
export function buildTurnUndoLabel(userRequest: string | undefined): string {
  const collapsed = (userRequest ?? '').replace(/\s+/g, ' ').trim()
  if (!collapsed) {
    return agentT('turnUndoLabelFallback')
  }

  const characters = [...collapsed]
  if (characters.length <= MAX_TURN_UNDO_LABEL_LENGTH) {
    return collapsed
  }
  return `${characters.slice(0, MAX_TURN_UNDO_LABEL_LENGTH).join('').trimEnd()}…`
}

/**
 * Resolves the database of the open drawing, or `undefined` when there is none.
 *
 * `AcApDocManager.instance` throws before the manager is created, and a chat
 * turn that never touches the drawing must survive that.
 */
function resolveActiveDatabase(): AcDbDatabase | undefined {
  try {
    return AcApDocManager.instance?.curDocument?.database
  } catch (error) {
    // Logged rather than swallowed silently: "the manager is not up yet" is
    // the expected reason, and any other one quietly costs the turn its undo
    // grouping — a symptom nobody would connect back to this line.
    console.warn(
      '[withTurnUndoMark] no drawing to group edits under; the turn runs ungrouped',
      error
    )
    return undefined
  }
}

/**
 * Runs one whole AI turn under a single undo mark.
 *
 * Every drawing tool the agent calls goes through
 * {@link acapRunDatabaseEdit}, which opens its own mark when nothing else is
 * recording — so a turn that draws twelve strokes leaves twelve marks and
 * twelve autosaves. Opening one mark around the turn makes each of those calls
 * join the enclosing mark instead: one turn, one `Ctrl+Z`, one save.
 *
 * The mark stays inside the same history as hand-drawn commands; there is no
 * separate "AI undo stack".
 *
 * {@link acapRunMarkedEdits} rather than `acapRunGroupedEdit`: a turn runs for
 * tens of seconds, and holding one transaction open across it would keep every
 * stroke off the canvas until the turn ended — and would hide the new geometry
 * from the screenshot the high-inference mode verifies against. The mark-only
 * group lets each tool call commit, so the drawing appears as it is drawn, and
 * still leaves exactly one record.
 *
 * A turn that changes nothing leaves no mark behind (the core drops an empty
 * one). A turn that throws keeps whatever it managed to draw, gathered under
 * the same single mark — see {@link acapRunMarkedEdits} for why unwinding it
 * automatically is the more dangerous option.
 *
 * @param userRequest - Text of the user message that started the turn; becomes
 *   the label shown in the undo history.
 * @param fn - The turn itself. May await freely — the mark spans the waits.
 * @returns Whatever `fn` returns.
 */
export async function withTurnUndoMark<T>(
  userRequest: string | undefined,
  fn: () => T | Promise<T>
): Promise<T> {
  const db = resolveActiveDatabase()
  if (!db) {
    // No drawing open: nothing to record, but the conversation still runs.
    return await fn()
  }

  return await acapRunMarkedEdits(db, buildTurnUndoLabel(userRequest), fn)
}

/**
 * Runs one script of a turn as its own undo step, named after its intent.
 *
 * The turn mark above gathers everything else; a script is split out of it
 * (see `acapRunOwnUndoMark`) so a turn of many scripts can be taken back one
 * script at a time — the case of 17/11/2026, where only "undo the whole turn"
 * could bring back the lan can a late script had erased.
 *
 * @param intent - The script's `intent`, if it gave one.
 * @param run - The script.
 * @returns Whatever `run` returns.
 */
export async function withScriptUndoStep<T>(
  intent: string | undefined,
  run: () => Promise<T>
): Promise<T> {
  const db = resolveActiveDatabase()
  if (!db) return await run()
  const label = buildTurnUndoLabel(
    intent
      ? `${agentT('scriptUndoLabel')}: ${intent}`
      : agentT('scriptUndoLabel')
  )
  return await acapRunOwnUndoMark(db, label, run)
}
