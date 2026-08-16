/**
 * A whole AI turn has to land in the undo history as one entry.
 *
 * Every drawing tool records its own undo mark, so a turn that draws twelve
 * strokes used to cost twelve `Ctrl+Z` and twelve autosaves. The contract this
 * file pins down is the I/O matrix of the story: one turn one mark, a
 * query-only turn no mark at all, a thrown error rolled back whole, and a
 * missing drawing still letting the conversation run.
 *
 * `acapRunMarkedEdits` is stubbed with a faithful miniature of the real thing
 * — it opens a mark, drops an empty one, rolls back on throw — because the
 * real one is proven against a real `AcDbDatabase` in the cad-simple-viewer
 * suite, and pulling the whole viewer in here would prove nothing extra.
 */
jest.mock('@mlightcad/cad-simple-viewer', () => {
  const state = {
    /** Database the doc manager currently reports, if any. */
    database: undefined as unknown,
    /** True once the manager throws instead of answering (no app yet). */
    docManagerUnavailable: false,
    /** Labels of every group opened, in order. */
    groupsOpened: [] as string[],
    /** Committed undo records, newest last. */
    undoStack: [] as string[],
    /** How many times listeners were told the undo stack changed. */
    notifications: 0,
    /** Edits applied since the enclosing group opened. */
    pendingChanges: 0,
    /** Marks discarded because the turn threw. */
    rollbacks: 0,
    recording: false
  }

  return {
    __esModule: true,
    __state: state,
    /** Stands in for a tool call that actually mutates the drawing. */
    __applyEdit: () => {
      state.pendingChanges += 1
    },
    AcApDocManager: {
      get instance() {
        if (state.docManagerUnavailable) {
          throw new Error('AcApDocManager instance is not created yet!')
        }
        return {
          curDocument: state.database ? { database: state.database } : undefined
        }
      }
    },
    acapRunMarkedEdits: async <T>(
      _db: unknown,
      label: string,
      fn: () => T | Promise<T>
    ): Promise<T> => {
      state.groupsOpened.push(label)
      if (state.recording) {
        return await fn()
      }

      state.recording = true
      state.pendingChanges = 0
      let result: T
      try {
        result = await fn()
      } catch (error) {
        state.recording = false
        // Committed edits cannot be aborted, so the real helper closes the
        // mark and undoes the record — and only when something was committed.
        if (state.pendingChanges > 0) {
          state.rollbacks += 1
          state.notifications += 1
        }
        state.pendingChanges = 0
        throw error
      }
      state.recording = false
      // The core drops a mark that collected nothing, which is why a
      // query-only turn leaves the history untouched — and announces nothing,
      // so autosave stays asleep.
      if (state.pendingChanges > 0) {
        state.undoStack.push(label)
        state.notifications += 1
      }
      return result
    }
  }
})

import {
  buildTurnUndoLabel,
  FALLBACK_TURN_UNDO_LABEL,
  MAX_TURN_UNDO_LABEL_LENGTH,
  withTurnUndoMark
} from '../src/agent/agentTurnEdit'

const viewer = jest.requireMock('@mlightcad/cad-simple-viewer') as {
  __state: {
    database: unknown
    docManagerUnavailable: boolean
    groupsOpened: string[]
    undoStack: string[]
    notifications: number
    pendingChanges: number
    rollbacks: number
    recording: boolean
  }
  __applyEdit: () => void
}

const state = viewer.__state
const applyEdit = viewer.__applyEdit

/** An open drawing, as far as the undo mark is concerned. */
function openDrawing() {
  state.database = { name: 'cau-dam-i.dwg' }
}

beforeEach(() => {
  state.database = undefined
  state.docManagerUnavailable = false
  state.groupsOpened = []
  state.undoStack = []
  state.notifications = 0
  state.pendingChanges = 0
  state.rollbacks = 0
  state.recording = false
})

describe('a turn that draws', () => {
  test('many tool calls leave exactly one undo record, labelled with the request', async () => {
    openDrawing()

    await withTurnUndoMark('vẽ lan can hai bên nhịp giữa', async () => {
      for (let stroke = 0; stroke < 12; stroke += 1) {
        await Promise.resolve()
        applyEdit()
      }
    })

    expect(state.undoStack).toEqual(['vẽ lan can hai bên nhịp giữa'])
    expect(state.groupsOpened).toHaveLength(1)
  })

  test('the undo stack is announced once, so autosave runs once', async () => {
    openDrawing()

    await withTurnUndoMark('vẽ dầm', async () => {
      applyEdit()
      applyEdit()
      applyEdit()
    })

    expect(state.notifications).toBe(1)
  })

  test('several verification rounds still share the one mark', async () => {
    openDrawing()

    await withTurnUndoMark('vẽ mặt cắt ngang', async () => {
      for (let round = 0; round < 3; round += 1) {
        applyEdit()
        // The screenshot round-trip the high-inference mode waits on.
        await Promise.resolve()
      }
    })

    expect(state.undoStack).toEqual(['vẽ mặt cắt ngang'])
  })
})

describe('a turn that changes nothing', () => {
  test('a query-only turn leaves no record behind', async () => {
    openDrawing()

    await withTurnUndoMark('lan can bên phải ở đâu', async () => {
      await Promise.resolve()
    })

    expect(state.undoStack).toEqual([])
    // And nothing is announced, so a question does not trigger a save.
    expect(state.notifications).toBe(0)
  })
})

describe('a turn without a drawing', () => {
  test('no document means no mark, and the turn still runs', async () => {
    const ran = jest.fn()

    await withTurnUndoMark('vẽ gì đó', ran)

    expect(ran).toHaveBeenCalledTimes(1)
    expect(state.groupsOpened).toEqual([])
  })

  test('a document manager that is not up yet is not an error', async () => {
    // The getter throws before the app boots; chat must not die with it.
    state.docManagerUnavailable = true

    await expect(
      withTurnUndoMark('xin chào', async () => 'trả lời')
    ).resolves.toBe('trả lời')
    expect(state.groupsOpened).toEqual([])
  })
})

describe('a turn that fails', () => {
  test('an error part-way through rolls the whole turn back before it escapes', async () => {
    openDrawing()
    const boom = new Error('tool call thứ ba hỏng')

    await expect(
      withTurnUndoMark('vẽ trụ cầu', async () => {
        applyEdit()
        applyEdit()
        await Promise.resolve()
        throw boom
      })
    ).rejects.toThrow(boom)

    expect(state.undoStack).toEqual([])
    expect(state.rollbacks).toBe(1)
    // The rollback itself moved the undo stack, so listeners are told once —
    // the button state has to stop showing a turn that no longer exists.
    expect(state.notifications).toBe(1)
  })

  test('a failure before anything was committed rolls nothing back', async () => {
    openDrawing()

    await expect(
      withTurnUndoMark('vẽ trụ cầu', async () => {
        throw new Error('mô hình từ chối ngay')
      })
    ).rejects.toThrow('mô hình từ chối ngay')

    // Nothing was committed, so there is no record to undo. Undoing anyway
    // would pop whatever the user did before the turn.
    expect(state.rollbacks).toBe(0)
    expect(state.notifications).toBe(0)
    expect(state.undoStack).toEqual([])
  })
})

describe('a turn the user stops', () => {
  test('work already drawn is kept as one record', async () => {
    openDrawing()
    const abortController = new AbortController()

    await withTurnUndoMark('vẽ toàn bộ cầu', async () => {
      applyEdit()
      abortController.abort()
      // Stop leaves the turn body normally; it is not a failure.
      if (abortController.signal.aborted) return
      applyEdit()
    })

    expect(state.undoStack).toEqual(['vẽ toàn bộ cầu'])
  })
})

describe('the label', () => {
  test('an empty request falls back rather than labelling nothing', () => {
    expect(buildTurnUndoLabel('')).toBe(FALLBACK_TURN_UNDO_LABEL)
    expect(buildTurnUndoLabel('   \n  ')).toBe(FALLBACK_TURN_UNDO_LABEL)
    expect(buildTurnUndoLabel(undefined)).toBe(FALLBACK_TURN_UNDO_LABEL)
  })

  test('a long request is cut so the history stays readable', async () => {
    openDrawing()
    const request = 'vẽ '.repeat(60).trim()

    await withTurnUndoMark(request, applyEdit)

    expect(state.undoStack[0]).toHaveLength(MAX_TURN_UNDO_LABEL_LENGTH)
    expect(request.startsWith(state.undoStack[0])).toBe(true)
  })

  test('surrounding whitespace never reaches the history', () => {
    expect(buildTurnUndoLabel('  vẽ lan can  ')).toBe('vẽ lan can')
  })
})

describe('the value of the turn', () => {
  test('what the turn returns comes back to the caller', async () => {
    openDrawing()

    await expect(withTurnUndoMark('vẽ', async () => 42)).resolves.toBe(42)
  })
})
