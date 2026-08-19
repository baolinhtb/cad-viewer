/**
 * Every AI call has to say which drawing it was for.
 *
 * `ai_calls.drawing_id` has existed since the table was created and the server
 * has always accepted it — but the client never sent one. On the deployment
 * that is 338 calls, every one of them null: the cost of a drawing could not be
 * answered, and neither could "what did the assistant do to this drawing".
 * Those are the two questions the column exists for.
 */
import {
  createProxyFetch,
  currentDrawingId,
  setDrawingIdProvider
} from '../src/agent/drawingIdentity'

/** Captures what the wrapped fetch would have sent. */
function recorder() {
  const sent: { url: string; body: unknown }[] = []
  const impl = (async (input: unknown, init?: RequestInit) => {
    sent.push({
      url: String(input),
      // Parsed when it is JSON, kept verbatim when it is not — the recorder
      // must not be stricter than the thing it is watching.
      body: (() => {
        if (typeof init?.body !== 'string') return init?.body
        try {
          return JSON.parse(init.body)
        } catch {
          return init.body
        }
      })()
    })
    return new Response('{}', { status: 200 })
  }) as unknown as typeof fetch
  return { sent, impl }
}

afterEach(() => setDrawingIdProvider(undefined))

describe('currentDrawingId', () => {
  test('is undefined until a host installs a provider', () => {
    expect(currentDrawingId()).toBeUndefined()
  })

  test('an unsaved drawing reports nothing, which is normal', () => {
    // A file opened and never saved has no server id, and the assistant works
    // on it just the same.
    setDrawingIdProvider(() => undefined)
    expect(currentDrawingId()).toBeUndefined()
  })

  test('a blank id is treated as no id', () => {
    setDrawingIdProvider(() => '   ')
    expect(currentDrawingId()).toBeUndefined()
  })

  test('a provider that throws costs a label, not the turn', () => {
    setDrawingIdProvider(() => {
      throw new Error('storage plugin exploded')
    })
    expect(() => currentDrawingId()).not.toThrow()
    expect(currentDrawingId()).toBeUndefined()
  })
})

describe('createProxyFetch', () => {
  test('labels the request with the open drawing', async () => {
    setDrawingIdProvider(() => 'dwg_123')
    const { sent, impl } = recorder()
    await createProxyFetch(impl)('/api/ai/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'claude-opus-5', messages: [] })
    })
    expect((sent[0].body as { drawingId?: string }).drawingId).toBe('dwg_123')
  })

  test('leaves the rest of the body alone', async () => {
    setDrawingIdProvider(() => 'dwg_123')
    const { sent, impl } = recorder()
    const original = { model: 'claude-opus-5', messages: [{ role: 'user' }] }
    await createProxyFetch(impl)('/api/ai/messages', {
      method: 'POST',
      body: JSON.stringify(original)
    })
    expect(sent[0].body).toMatchObject(original)
  })

  test('never overwrites an id the caller set deliberately', async () => {
    setDrawingIdProvider(() => 'dwg_123')
    const { sent, impl } = recorder()
    await createProxyFetch(impl)('/api/ai/messages', {
      method: 'POST',
      body: JSON.stringify({ drawingId: 'dwg_chosen', messages: [] })
    })
    expect((sent[0].body as { drawingId?: string }).drawingId).toBe('dwg_chosen')
  })

  test('adds nothing when there is no drawing to name', async () => {
    const { sent, impl } = recorder()
    await createProxyFetch(impl)('/api/ai/messages', {
      method: 'POST',
      body: JSON.stringify({ messages: [] })
    })
    expect(sent[0].body).not.toHaveProperty('drawingId')
  })

  test('forwards an unparseable body untouched', async () => {
    // A labelling feature must never be able to break a turn.
    setDrawingIdProvider(() => 'dwg_123')
    const { sent, impl } = recorder()
    await expect(
      createProxyFetch(impl)('/api/ai/messages', {
        method: 'POST',
        body: 'không-phải-json'
      })
    ).resolves.toBeDefined()
    expect(sent[0].body).toBe('không-phải-json')
  })
})
