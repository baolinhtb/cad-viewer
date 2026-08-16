/**
 * `withTurnUndoMark` is the seam between the chat turn and the undo history.
 *
 * What it owes the caller is narrow: resolve the drawing, build the label,
 * hand the turn to `acapRunMarkedEdits`, and give the result back. This file
 * checks exactly that, against a spy.
 *
 * It deliberately does **not** re-implement the helper. An earlier version did
 * — seventy lines of miniature that decided "something changed" from a counter
 * while the real helper decided it from database events — and every assertion
 * about marks and rollbacks was really an assertion about the miniature. Two
 * genuine bugs lived underneath it with the suite green. The helper's own
 * behaviour is pinned against a real `AcDbDatabase` in
 * `packages/cad-simple-viewer/__tests__/AcApDatabaseEdit.spec.ts`; here that
 * would only prove the mock agrees with itself.
 */
const runMarkedEdits = jest.fn(
  async <T>(_db: unknown, _label: string, fn: () => T | Promise<T>) =>
    await fn()
)

jest.mock('@mlightcad/cad-simple-viewer', () => {
  const state = {
    /** Database the doc manager currently reports, if any. */
    database: undefined as unknown,
    /** True once the manager throws instead of answering (no app yet). */
    docManagerUnavailable: false
  }

  return {
    __esModule: true,
    __state: state,
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
    acapRunMarkedEdits: (...args: unknown[]) =>
      (runMarkedEdits as unknown as (...a: unknown[]) => unknown)(...args),
    // `agentT` resolves through the viewer's i18n; echoing the fallback keeps
    // the assertions about *which* key is used rather than about a translation.
    AcApI18n: {
      t: (_key: string, options: { fallback: string }) => options.fallback
    }
  }
})

import {
  buildTurnUndoLabel,
  MAX_TURN_UNDO_LABEL_LENGTH,
  withTurnUndoMark
} from '../src/agent/agentTurnEdit'
import { agentT } from '../src/i18n'

const viewer = jest.requireMock('@mlightcad/cad-simple-viewer') as {
  __state: { database: unknown; docManagerUnavailable: boolean }
}
const state = viewer.__state

/** The database the mark is expected to be opened against. */
const drawing = { name: 'cau-dam-i.dwg' }

function openDrawing() {
  state.database = drawing
}

/** Arguments of the single expected `acapRunMarkedEdits` call. */
function markCall() {
  expect(runMarkedEdits).toHaveBeenCalledTimes(1)
  const [db, label] = runMarkedEdits.mock.calls[0] as [unknown, string, unknown]
  return { db, label }
}

beforeEach(() => {
  state.database = undefined
  state.docManagerUnavailable = false
  runMarkedEdits.mockClear()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('a turn with a drawing open', () => {
  test('runs inside one mark, on the open drawing, labelled with the request', async () => {
    openDrawing()

    await withTurnUndoMark('vẽ lan can hai bên nhịp giữa', async () => {})

    expect(markCall()).toEqual({
      db: drawing,
      label: 'vẽ lan can hai bên nhịp giữa'
    })
  })

  test('hands the turn through and gives its value back', async () => {
    openDrawing()
    const turn = jest.fn(async () => 42)

    await expect(withTurnUndoMark('vẽ', turn)).resolves.toBe(42)
    expect(turn).toHaveBeenCalledTimes(1)
  })

  test('lets the error of a failing turn travel on unchanged', async () => {
    openDrawing()
    const boom = new Error('tool call thứ ba hỏng')

    await expect(
      withTurnUndoMark('vẽ trụ cầu', async () => {
        throw boom
      })
    ).rejects.toThrow(boom)
  })
})

describe('a turn without a drawing', () => {
  test('no document means no mark, and the turn still runs', async () => {
    const ran = jest.fn()

    await withTurnUndoMark('vẽ gì đó', ran)

    expect(ran).toHaveBeenCalledTimes(1)
    expect(runMarkedEdits).not.toHaveBeenCalled()
  })

  test('a document manager that is not up yet is not an error', async () => {
    // The getter throws before the app boots; chat must not die with it.
    state.docManagerUnavailable = true

    await expect(
      withTurnUndoMark('xin chào', async () => 'trả lời')
    ).resolves.toBe('trả lời')
    expect(runMarkedEdits).not.toHaveBeenCalled()
    // And it says so, rather than costing the turn its grouping in silence.
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('the label', () => {
  test('an empty request falls back to a localized label', async () => {
    openDrawing()

    await withTurnUndoMark('   \n  ', async () => {})

    // Asserted through the mark, not just the builder: the fallback is only
    // worth anything if it is what the history actually receives.
    expect(markCall().label).toBe(agentT('turnUndoLabelFallback'))
    expect(buildTurnUndoLabel(undefined)).toBe(agentT('turnUndoLabelFallback'))
  })

  test('a long request is cut, and says that it was', () => {
    const request = `${'nâng cao lan can bên phải '.repeat(8)}lên 1.27 mét`

    const label = buildTurnUndoLabel(request)

    expect([...label]).toHaveLength(MAX_TURN_UNDO_LABEL_LENGTH + 1)
    expect(label.endsWith('…')).toBe(true)
    expect(request.startsWith(label.slice(0, -1))).toBe(true)
  })

  test('a short request is left exactly as typed', () => {
    expect(buildTurnUndoLabel('  vẽ lan can  ')).toBe('vẽ lan can')
  })

  test('a multi-line request becomes one line', () => {
    // `extractConversationContext` joins a message's text parts with newlines,
    // and a history entry is one line.
    expect(buildTurnUndoLabel('vẽ lan can\nbên phải\n\ncao 1.1m')).toBe(
      'vẽ lan can bên phải cao 1.1m'
    )
  })

  test('the cut never splits a character in half', () => {
    // Sixty-one code points, each of which is two UTF-16 units: a slice by
    // units would land inside one and produce a lone surrogate.
    const label = buildTurnUndoLabel('🌉'.repeat(61))

    expect([...label]).toHaveLength(MAX_TURN_UNDO_LABEL_LENGTH + 1)
    const loneSurrogate =
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
    expect(label).not.toMatch(loneSurrogate)
  })
})
