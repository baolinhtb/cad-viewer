/**
 * The story's contract lives at the transport, not in the helper.
 *
 * `withTurnUndoMark` can be perfect and the promise still lost: wrapping only
 * the high-inference branch, or dropping the wrapper entirely, leaves every
 * other suite green while a turn goes back to one mark per tool call. Pressing
 * Stop must also stay an ordinary ending rather than a failure, and a genuine
 * failure must still reach the chat.
 *
 * So this drives `sendMessages` itself, with the model stubbed.
 */
const turnCalls: { label: string | undefined }[] = []
let turnOutcome: 'ok' | 'abort' | 'error' = 'ok'
let roundStarts = 0

jest.mock('../src/agent/agentTurnEdit', () => ({
  __esModule: true,
  withTurnUndoMark: async <T>(
    userRequest: string | undefined,
    fn: () => T | Promise<T>
  ) => {
    turnCalls.push({ label: userRequest })
    return await fn()
  }
}))

// The viewer package reaches three's ESM-only bundles, and the tool set drags
// in the whole template plugin. Neither is what this file is about: the agent
// is injected as a stub.
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  __esModule: true,
  AcApI18n: {
    t: (_key: string, options: { fallback: string }) => options.fallback
  }
}))

jest.mock('../src/tools/cadTools', () => ({
  __esModule: true,
  createCadTools: () => ({})
}))

jest.mock('../src/agent/createModel', () => ({
  __esModule: true,
  createModelFromSettings: () => ({ modelId: 'stub' })
}))

jest.mock('../src/agent/drawingPreviewCapture', () => ({
  __esModule: true,
  captureDrawingPreview: async () => ({
    ok: false as const,
    reason: 'scene-not-ready' as const
  })
}))

jest.mock('../src/agent/drawingVerifier', () => ({
  __esModule: true,
  MAX_VERIFICATION_ATTEMPTS: 5,
  verifyDrawing: async () => ({ passed: true, feedback: '' }),
  buildVerificationFeedbackMessage: () => 'feedback'
}))

jest.mock('ai', () => {
  class StubAgent {
    tools = {}
    stream() {
      return {
        toUIMessageStream: () => stubStream()
      }
    }
  }
  async function* stubStream() {
    roundStarts += 1
    yield { type: 'text-delta', delta: 'đang vẽ' }
    if (turnOutcome === 'abort') {
      const abort = new Error('The operation was aborted.')
      abort.name = 'AbortError'
      throw abort
    }
    if (turnOutcome === 'error') {
      throw new Error('nhà cung cấp trả 500')
    }
  }
  return {
    __esModule: true,
    // `formatChatError` reaches for this inside the transport's catch; without
    // it the catch throws and the error chunk never gets enqueued.
    APICallError: { isInstance: () => false },
    Experimental_Agent: StubAgent,
    convertToModelMessages: async (messages: unknown) => messages,
    validateUIMessages: async ({ messages }: { messages: unknown }) => messages,
    stepCountIs: () => undefined,
    generateId: () => 'id'
  }
})

import { Experimental_Agent } from 'ai'

import {
  type AgentChatOptions,
  createAgentChatTransport
} from '../src/agent/createCadAgent'

/** Drains the transport's stream and reports what reached the UI. */
async function runTurn(
  agentMode: AgentChatOptions['agentMode'],
  text: string,
  abortSignal?: AbortSignal
) {
  const agent = new (Experimental_Agent as unknown as new () => unknown)()
  const transport = createAgentChatTransport(
    () => agent as never,
    () => ({}) as never,
    () => ({ agentMode })
  )

  const stream = await transport.sendMessages({
    messages: [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text }] }
    ] as never,
    abortSignal
  } as never)

  // Read through the reader rather than `for await`: async iteration over a
  // web ReadableStream is not available on every runtime this suite runs on,
  // and a silently empty loop would make these assertions pass vacuously.
  const reader = (stream as ReadableStream<{ type: string }>).getReader()
  const chunks: { type: string }[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return chunks
}

beforeEach(() => {
  turnCalls.length = 0
  turnOutcome = 'ok'
  roundStarts = 0
})

describe('every turn opens exactly one mark', () => {
  test('in simple mode', async () => {
    await runTurn('simple', 'vẽ lan can hai bên')

    expect(turnCalls).toEqual([{ label: 'vẽ lan can hai bên' }])
  })

  test('in high-inference mode, across its verification rounds', async () => {
    await runTurn('high-inference', 'vẽ mặt cắt ngang')

    // The label used to be read inside this branch only; simple mode returned
    // before reaching it.
    expect(turnCalls).toEqual([{ label: 'vẽ mặt cắt ngang' }])
    expect(roundStarts).toBeGreaterThanOrEqual(1)
  })
})

describe('when the user presses Stop', () => {
  test('the turn ends normally, so the mark keeps what was drawn', async () => {
    turnOutcome = 'abort'
    const controller = new AbortController()
    controller.abort()

    const chunks = await runTurn('simple', 'vẽ toàn bộ cầu', controller.signal)

    // Stop is not a failure: the mark still closes over what was drawn, and
    // the user is shown no error for something they asked for.
    expect(turnCalls).toHaveLength(1)
    expect(chunks.some(chunk => chunk.type === 'error')).toBe(false)
  })
})

describe('when the turn genuinely fails', () => {
  test('the error still reaches the UI as an error chunk', async () => {
    turnOutcome = 'error'

    const chunks = await runTurn('simple', 'vẽ trụ cầu')

    expect(chunks.some(chunk => chunk.type === 'error')).toBe(true)
  })
})
