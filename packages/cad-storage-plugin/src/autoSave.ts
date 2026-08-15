import type { AcApDrawingPayload, AcApStorageApi } from './storageApi'

/** What the drawing currently open is called and where it lives on the server. */
export interface AcApAutoSaveState {
  /** Server id, once the drawing has been saved at least once. */
  id?: string
  /** Revision held locally; a write carrying a stale one is refused. */
  revision?: number
  name: string
  templateId?: string | null
  templateVersion?: string | null
  params?: Record<string, unknown> | null
  batchId?: string | null
}

/** Outcome of one save attempt, enough to drive UI without inspecting errors. */
export type AcApAutoSaveResult =
  | { status: 'saved'; id: string; revision: number }
  | { status: 'unchanged' }
  | { status: 'conflict'; currentRevision: number }
  | { status: 'failed'; code: string; message: string }

export interface AcApAutoSaverOptions {
  api: AcApStorageApi
  /** Serialises the open drawing. Returning `undefined` means "nothing to save". */
  readDxf: () => string | undefined
  /** Milliseconds of quiet before a save actually goes out. */
  debounceMs?: number
  /** Injected for tests. */
  setTimeoutImpl?: typeof setTimeout
  clearTimeoutImpl?: typeof clearTimeout
}

/**
 * Saves the open drawing after each completed edit.
 *
 * Two properties matter more than the mechanics:
 *
 * The save point is the **end of an undo mark**, not each entity change. A
 * template that draws two hundred entities closes exactly one mark, so it
 * produces exactly one save instead of two hundred uploads.
 *
 * A conflict never overwrites. With version history still to come, the losing
 * write would be unrecoverable, so the auto-saver stops and reports instead —
 * the user decides what happens to their work, not a race.
 */
export function createAutoSaver(options: AcApAutoSaverOptions) {
  const {
    api,
    readDxf,
    debounceMs = 1200,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout
  } = options

  let state: AcApAutoSaveState | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight = false
  let dirty = false
  /** Set after a conflict: no further automatic writes until the user acts. */
  let halted = false
  let lastSaved: string | undefined

  const listeners = new Set<(result: AcApAutoSaveResult) => void>()

  function emit(result: AcApAutoSaveResult) {
    for (const listener of listeners) listener(result)
  }

  async function save(): Promise<AcApAutoSaveResult> {
    if (!state || halted) return { status: 'unchanged' }

    const dxf = readDxf()
    if (dxf === undefined || dxf === lastSaved) return { status: 'unchanged' }

    inFlight = true
    try {
      const payload: AcApDrawingPayload = {
        name: state.name,
        templateId: state.templateId,
        templateVersion: state.templateVersion,
        params: state.params,
        batchId: state.batchId,
        dxf
      }

      if (state.id === undefined) {
        const created = await api.create({ ...payload, id: state.id })
        state.id = created.id
        state.revision = created.revision
        lastSaved = dxf
        const result: AcApAutoSaveResult = {
          status: 'saved',
          id: created.id,
          revision: created.revision
        }
        emit(result)
        return result
      }

      const updated = await api.update(state.id, {
        ...payload,
        revision: state.revision
      })

      if ('conflict' in updated) {
        halted = true
        const result: AcApAutoSaveResult = {
          status: 'conflict',
          currentRevision: updated.currentRevision
        }
        emit(result)
        return result
      }

      state.revision = updated.revision
      lastSaved = dxf
      const result: AcApAutoSaveResult = {
        status: 'saved',
        id: updated.id,
        revision: updated.revision
      }
      emit(result)
      return result
    } catch (error) {
      const failure = error as { code?: string; message?: string }
      const result: AcApAutoSaveResult = {
        status: 'failed',
        code: failure.code ?? 'unknown',
        message: failure.message ?? String(error)
      }
      emit(result)
      return result
    } finally {
      inFlight = false
      if (dirty && !halted) {
        dirty = false
        schedule()
      }
    }
  }

  function schedule() {
    if (halted) return
    if (inFlight) {
      dirty = true
      return
    }
    if (timer !== undefined) clearTimeoutImpl(timer)
    timer = setTimeoutImpl(() => {
      timer = undefined
      void save()
    }, debounceMs)
  }

  return {
    /** Binds the saver to a drawing; call when one is generated or opened. */
    attach(next: AcApAutoSaveState) {
      state = { ...next }
      halted = false
      lastSaved = undefined
      dirty = false
    },

    /** Call when an undo mark closes — the one moment worth saving at. */
    onEditCompleted() {
      schedule()
    },

    /** Saves right now, skipping the debounce (e.g. before leaving the page). */
    flush(): Promise<AcApAutoSaveResult> {
      if (timer !== undefined) {
        clearTimeoutImpl(timer)
        timer = undefined
      }
      return save()
    },

    /** Resumes after the user has dealt with a conflict. */
    resume(revision: number) {
      if (state) state.revision = revision
      halted = false
      lastSaved = undefined
    },

    onResult(listener: (result: AcApAutoSaveResult) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    get current(): Readonly<AcApAutoSaveState> | undefined {
      return state
    },

    get isHalted() {
      return halted
    }
  }
}

export type AcApAutoSaver = ReturnType<typeof createAutoSaver>
