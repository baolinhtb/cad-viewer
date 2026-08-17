import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

import {
  buildStandardsBlock,
  ERRORS,
  estimateCost,
  monthlyUsage,
  recordCall,
  recordOutcome,
  sendToProvider
} from './ai.mjs'
import { migrate } from './schema.mjs'
import { createTerm } from './standards.mjs'

function freshDb() {
  const db = new DatabaseSync(':memory:')
  migrate(db)
  db.prepare(
    `INSERT INTO users (id, email, name, pass_hash, salt, role)
     VALUES (1, 'a@x.vn', 'Kỹ sư', 'h', 's', 'member')`
  ).run()
  return db
}

const USER = { id: 1 }

/** Captures the request the proxy would send, and replies with a canned body. */
function fakeProvider(reply, capture = {}) {
  return async (url, init) => {
    capture.url = url
    capture.headers = init.headers
    capture.body = JSON.parse(init.body)
    return {
      ok: reply.ok ?? true,
      status: reply.status ?? 200,
      json: async () => reply.body ?? {}
    }
  }
}

const OK_REPLY = {
  body: {
    content: [{ type: 'text', text: 'xong' }],
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 1200,
      output_tokens: 300,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 0
    }
  }
}

async function codeOf(fn) {
  try {
    await fn()
    return undefined
  } catch (error) {
    return error.code
  }
}

test('the standards block is byte-identical across builds', () => {
  // Prompt caching keys on an exact prefix. A block that reorders itself is a
  // block that is never cached and always paid for.
  const db = freshDb()
  const first = buildStandardsBlock(db)
  const second = buildStandardsBlock(db)
  assert.equal(first.text, second.text)
  assert.equal(first.hash, second.hash)
})

test('the block carries terms, aliases, layers and templates', () => {
  const db = freshDb()
  const { text } = buildStandardsBlock(db)
  assert.match(text, /lan_can: Lan can/)
  assert.match(text, /còn gọi là .*tay vịn/)
  assert.match(text, /layer KC-LANCAN/)
  assert.match(text, /Danh mục layer:/)
  assert.match(text, /Template đã công bố:/)
})

test('editing the dictionary changes the hash', () => {
  // The client checks this to know it is reasoning about the same standards
  // the server assembled.
  const db = freshDb()
  const before = buildStandardsBlock(db).hash
  createTerm(db, 1, { role: 'dam_chu', label: 'Dầm chủ', layer: 'KC-BAN' })
  assert.notEqual(buildStandardsBlock(db).hash, before)
})

test('the key never leaves the server, and the block is marked for caching', async () => {
  const db = freshDb()
  process.env.ANTHROPIC_API_KEY = 'sk-test'
  const capture = {}
  const result = await sendToProvider(
    db,
    USER,
    { messages: [{ role: 'user', content: 'nâng lan can lên 1.27m' }] },
    fakeProvider(OK_REPLY, capture)
  )

  assert.equal(capture.headers['x-api-key'], 'sk-test')
  assert.equal(capture.body.system[0].cache_control.type, 'ephemeral')
  assert.match(capture.body.system[0].text, /NỀN CHUẨN HÓA/)
  // Nothing in what comes back can be used to reconstruct the key.
  assert.equal(JSON.stringify(result).includes('sk-test'), false)
  assert.ok(result.standardsHash)
  // Passed through in the provider's own shape, so an SDK client can point at
  // this route and work unchanged.
  assert.deepEqual(result.body.content, [{ type: 'text', text: 'xong' }])
})

test('system blocks from an SDK client are appended, their cache hints dropped', async () => {
  // A second breakpoint on a prompt that changes per request costs a cache
  // write and buys nothing.
  const db = freshDb()
  process.env.ANTHROPIC_API_KEY = 'sk-test'
  const capture = {}
  await sendToProvider(
    db,
    USER,
    {
      messages: [{ role: 'user', content: 'x' }],
      system: [
        { type: 'text', text: 'từ SDK', cache_control: { type: 'ephemeral' } }
      ]
    },
    fakeProvider(OK_REPLY, capture)
  )
  assert.equal(capture.body.system.length, 2)
  assert.equal(capture.body.system[1].text, 'từ SDK')
  assert.equal(capture.body.system[1].cache_control, undefined)
})

test('a caller-supplied system prompt goes after the cached block', async () => {
  // Putting it first would change the cached prefix and lose the cache on
  // every call that customises anything.
  const db = freshDb()
  process.env.ANTHROPIC_API_KEY = 'sk-test'
  const capture = {}
  await sendToProvider(
    db,
    USER,
    { messages: [{ role: 'user', content: 'x' }], system: 'thêm ngữ cảnh' },
    fakeProvider(OK_REPLY, capture)
  )
  assert.equal(capture.body.system.length, 2)
  assert.match(capture.body.system[0].text, /NỀN CHUẨN HÓA/)
  assert.equal(capture.body.system[1].text, 'thêm ngữ cảnh')
  assert.equal(capture.body.system[1].cache_control, undefined)
})

test('an unconfigured deployment says so instead of failing obscurely', async () => {
  const db = freshDb()
  delete process.env.ANTHROPIC_API_KEY
  const code = await codeOf(() =>
    sendToProvider(db, USER, { messages: [{ role: 'user', content: 'x' }] })
  )
  assert.equal(code, ERRORS.NOT_CONFIGURED)
})

test('a malformed request is refused before any provider call', async () => {
  const db = freshDb()
  process.env.ANTHROPIC_API_KEY = 'sk-test'
  let called = false
  const code = await codeOf(() =>
    sendToProvider(db, USER, { messages: [] }, async () => {
      called = true
      return { ok: true, status: 200, json: async () => ({}) }
    })
  )
  assert.equal(code, ERRORS.INVALID)
  assert.equal(called, false, 'must not spend a call on a request it rejects')
})

test('every call is logged, including failed ones', async () => {
  // A month's bill that omits the failures understates what was spent trying.
  const db = freshDb()
  process.env.ANTHROPIC_API_KEY = 'sk-test'

  await sendToProvider(
    db,
    USER,
    { messages: [{ role: 'user', content: 'x' }], command: 'nâng lan can' },
    fakeProvider(OK_REPLY)
  )
  await codeOf(() =>
    sendToProvider(
      db,
      USER,
      { messages: [{ role: 'user', content: 'y' }] },
      fakeProvider({ ok: false, status: 429, body: { error: { type: 'rate_limit' } } })
    )
  )

  const rows = db.prepare('SELECT command, error_code FROM ai_calls ORDER BY id').all()
  assert.equal(rows.length, 2)
  assert.equal(rows[0].command, 'nâng lan can')
  assert.equal(rows[0].error_code, null)
  assert.equal(rows[1].error_code, 'rate_limit')
})

test('token counts are recorded per call, cache reads separately', async () => {
  const db = freshDb()
  process.env.ANTHROPIC_API_KEY = 'sk-test'
  await sendToProvider(
    db,
    USER,
    { messages: [{ role: 'user', content: 'x' }] },
    fakeProvider(OK_REPLY)
  )
  const row = db.prepare('SELECT * FROM ai_calls').get()
  assert.equal(row.input_tokens, 1200)
  assert.equal(row.output_tokens, 300)
  assert.equal(row.cache_read_tokens, 900)
})

test('the outcome of a call can be filled in afterwards', () => {
  // Neither number exists when the response is written: how much changed is
  // known after the tools run, and whether it was undone 30 seconds later.
  const db = freshDb()
  const id = recordCall(db, { userId: 1, command: 'x', model: 'm', usage: {} })
  assert.equal(recordOutcome(db, 1, id, { entitiesTouched: 12 }), true)
  assert.equal(recordOutcome(db, 1, id, { undone: true }), true)

  const row = db.prepare('SELECT * FROM ai_calls WHERE id = ?').get(id)
  assert.equal(row.entities_touched, 12)
  assert.equal(row.undone_within_30s, 1)
})

test('one user cannot amend another user’s call record', () => {
  const db = freshDb()
  const id = recordCall(db, { userId: 1, command: 'x', model: 'm', usage: {} })
  assert.equal(recordOutcome(db, 2, id, { undone: true }), false)
})

test('the monthly figure reports spend and the undo rate together', () => {
  // Spend alone says how much the assistant was used, not whether it was
  // worth using.
  const db = freshDb()
  const a = recordCall(db, {
    userId: 1,
    command: 'x',
    model: 'm',
    usage: { input_tokens: 1_000_000, output_tokens: 100_000 }
  })
  recordOutcome(db, 1, a, { undone: true })
  recordCall(db, { userId: 1, command: 'y', model: 'm', usage: {} })

  const [month] = monthlyUsage(db)
  assert.equal(month.calls, 2)
  assert.equal(month.undone, 1)
  // 1M input at $5 + 100k output at $25 = $5 + $2.50
  assert.equal(month.estimatedCostUsd, 7.5)
})

test('cost counts cache reads at their own rate', () => {
  assert.equal(
    estimateCost({ cache_read_input_tokens: 1_000_000 }),
    0.5
  )
})

// --- streaming --------------------------------------------------------------

/** A provider that answers with a real SSE body, as Anthropic does. */
function fakeStreamingProvider(events, capture = {}) {
  return async (url, init) => {
    capture.url = url
    capture.body = JSON.parse(init.body)
    return {
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          for (const event of events) {
            controller.enqueue(
              encoder.encode(
                `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
              )
            )
          }
          controller.close()
        }
      })
    }
  }
}

const STREAM_EVENTS = [
  {
    type: 'message_start',
    message: {
      id: 'msg_1',
      usage: {
        input_tokens: 1200,
        cache_read_input_tokens: 900,
        cache_creation_input_tokens: 64
      }
    }
  },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'Đã vẽ xong.' }
  },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn' },
    usage: { output_tokens: 321 }
  },
  { type: 'message_stop' }
]

async function collect(stream) {
  const decoder = new TextDecoder()
  let out = ''
  for await (const chunk of stream) out += decoder.decode(chunk, { stream: true })
  return out
}

test('a client asking for a stream gets one, not a single JSON blob', async () => {
  // The failure this guards: the proxy built its own payload and dropped
  // `stream`, so a browser SDK parsing an event stream received one JSON
  // object, produced no text and no tool calls, and the assistant looked like
  // it had thought for a while and done nothing.
  const db = freshDb()
  const capture = {}
  const result = await sendToProvider(
    db,
    USER,
    { messages: [{ role: 'user', content: 'vẽ cây cầu' }], stream: true },
    fakeStreamingProvider(STREAM_EVENTS, capture)
  )

  assert.equal(capture.body.stream, true, 'phải chuyển tiếp stream lên nhà cung cấp')
  assert.ok(result.stream, 'phải trả về luồng, không phải body')
  assert.equal(result.body, undefined)
})

test('the provider’s own events are forwarded byte for byte', async () => {
  // The client is an SDK parsing the provider's format. Re-encoding here would
  // make this proxy a second thing that can be wrong about it.
  const db = freshDb()
  const result = await sendToProvider(
    db,
    USER,
    { messages: [{ role: 'user', content: 'x' }], stream: true },
    fakeStreamingProvider(STREAM_EVENTS)
  )

  const text = await collect(result.stream)
  assert.match(text, /^event: message_start\ndata: \{/)
  assert.match(text, /"text_delta"/)
  assert.match(text, /event: message_stop/)
})

test('a streamed call is logged before the first byte, and its usage filled in after', async () => {
  // The call id travels on a response header, so the row has to exist before
  // the body starts; the token counts only exist once the stream ends.
  const db = freshDb()
  const result = await sendToProvider(
    db,
    USER,
    { messages: [{ role: 'user', content: 'x' }], stream: true },
    fakeStreamingProvider(STREAM_EVENTS)
  )

  const before = db
    .prepare('SELECT input_tokens, output_tokens FROM ai_calls WHERE id = ?')
    .get(result.callId)
  assert.equal(before.output_tokens, 0, 'chưa chạy luồng thì chưa biết token')

  await collect(result.stream)

  const after = db
    .prepare(
      `SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
         FROM ai_calls WHERE id = ?`
    )
    .get(result.callId)
  assert.equal(after.input_tokens, 1200)
  assert.equal(after.output_tokens, 321)
  assert.equal(after.cache_read_tokens, 900)
  assert.equal(after.cache_write_tokens, 64)
})

test('usage is read correctly when events straddle chunk boundaries', async () => {
  // A network hands over whatever it hands over; a parser that assumes one
  // event per chunk loses the counts on a busy connection.
  const db = freshDb()
  const encoder = new TextEncoder()
  const whole = STREAM_EVENTS.map(
    event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
  ).join('')

  const provider = async () => ({
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        for (let i = 0; i < whole.length; i += 7) {
          controller.enqueue(encoder.encode(whole.slice(i, i + 7)))
        }
        controller.close()
      }
    })
  })

  const result = await sendToProvider(
    db,
    USER,
    { messages: [{ role: 'user', content: 'x' }], stream: true },
    provider
  )
  const text = await collect(result.stream)
  assert.equal(text, whole, 'luồng ra phải giống hệt luồng vào')

  const row = db
    .prepare('SELECT output_tokens FROM ai_calls WHERE id = ?')
    .get(result.callId)
  assert.equal(row.output_tokens, 321)
})

test('a request without stream still gets the plain JSON answer', async () => {
  // The route is a drop-in for the provider's own, and non-streaming callers
  // must keep working exactly as before.
  const db = freshDb()
  const capture = {}
  const result = await sendToProvider(
    db,
    USER,
    { messages: [{ role: 'user', content: 'x' }] },
    fakeProvider(OK_REPLY, capture)
  )

  assert.equal(capture.body.stream, undefined)
  assert.equal(result.stream, undefined)
  assert.equal(result.body.stop_reason, 'end_turn')
})

test('an upstream error is still reported as an error when a stream was asked for', async () => {
  const db = freshDb()
  const code = await codeOf(() =>
    sendToProvider(
      db,
      USER,
      { messages: [{ role: 'user', content: 'x' }], stream: true },
      async () => ({
        ok: false,
        status: 429,
        json: async () => ({ error: { type: 'rate_limit_error', message: 'chậm lại' } })
      })
    )
  )
  assert.equal(code, ERRORS.UPSTREAM)
})

/** One step of an agent turn: the assistant's tool calls, then their results. */
function step(n) {
  return [
    {
      role: 'assistant',
      content: [
        { type: 'tool_use', id: `t${n}`, name: 'draw_line', input: {} }
      ]
    },
    {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: `t${n}`, content: 'ok' }]
    }
  ]
}

/** Every breakpoint in a request, wherever it was placed. */
function breakpoints(payload) {
  const inSystem = (payload.system ?? []).filter(b => b.cache_control).length
  const inMessages = (payload.messages ?? []).reduce(
    (total, message) =>
      total +
      (Array.isArray(message.content)
        ? message.content.filter(b => b?.cache_control).length
        : 0),
    0
  )
  return inSystem + inMessages
}

test('the conversation carries a breakpoint at its end', async () => {
  // Without it the history is re-sent at full price on every step of the turn.
  const db = freshDb()
  const capture = {}
  await sendToProvider(
    db,
    USER,
    { messages: [{ role: 'user', content: 'vẽ lan can' }] },
    fakeProvider(OK_REPLY, capture)
  )
  const last = capture.body.messages.at(-1)
  assert.equal(last.content.at(-1).cache_control.type, 'ephemeral')
})

test('the anchor lands where the previous request ended', async () => {
  // A breakpoint reaches back at most twenty blocks to find a cache entry, and
  // one drawing step can emit more than twenty. Anchoring at distance zero —
  // the message the previous request ended on — is what survives that.
  const db = freshDb()
  const capture = {}
  const messages = [
    { role: 'user', content: 'vẽ mặt cắt' },
    ...step(1),
    ...step(2)
  ]
  await sendToProvider(db, USER, { messages }, fakeProvider(OK_REPLY, capture))

  const sent = capture.body.messages
  const anchor = sent[sent.length - 3]
  assert.equal(anchor.content.at(-1).cache_control.type, 'ephemeral')
  // That message is exactly what the previous request would have ended on.
  assert.equal(anchor.role, 'user')
  assert.equal(anchor.content.at(-1).tool_use_id, 't1')
})

test('cache hints from the client are dropped, never honoured', async () => {
  // Four breakpoints per request is the budget and system already spends two.
  // A client marking its own blocks pushes the request over and the API
  // rejects it outright.
  const db = freshDb()
  const capture = {}
  await sendToProvider(
    db,
    USER,
    {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'a', cache_control: { type: 'ephemeral' } },
            { type: 'text', text: 'b', cache_control: { type: 'ephemeral' } }
          ]
        }
      ]
    },
    fakeProvider(OK_REPLY, capture)
  )
  const content = capture.body.messages[0].content
  assert.equal(content[0].cache_control, undefined)
  // Only the deployment's own marker survives, on the last block.
  assert.equal(content[1].cache_control.type, 'ephemeral')
})

test('a request never carries more than four breakpoints', async () => {
  const db = freshDb()
  const capture = {}
  const messages = [
    { role: 'user', content: 'vẽ' },
    ...step(1),
    ...step(2),
    ...step(3)
  ]
  await sendToProvider(
    db,
    USER,
    { messages, system: 'x'.repeat(2500) },
    fakeProvider(OK_REPLY, capture)
  )
  assert.equal(breakpoints(capture.body), 4)
})

test('a one-message conversation spends only one breakpoint', async () => {
  // The anchor and the end marker would land on the same block; doubling it
  // would waste half the budget for nothing.
  const db = freshDb()
  const capture = {}
  await sendToProvider(
    db,
    USER,
    { messages: [{ role: 'user', content: 'vẽ' }] },
    fakeProvider(OK_REPLY, capture)
  )
  const inMessages = capture.body.messages[0].content.filter(
    b => b.cache_control
  ).length
  assert.equal(inMessages, 1)
})

test('string content becomes a block so it can carry the marker', async () => {
  const db = freshDb()
  const capture = {}
  await sendToProvider(
    db,
    USER,
    { messages: [{ role: 'user', content: 'vẽ lan can' }] },
    fakeProvider(OK_REPLY, capture)
  )
  assert.deepEqual(capture.body.messages[0].content, [
    { type: 'text', text: 'vẽ lan can', cache_control: { type: 'ephemeral' } }
  ])
})

test("the caller's messages are left as they were", async () => {
  // The proxy is handed the client's own array; marking it in place would
  // leak this deployment's caching decisions back into the caller.
  const db = freshDb()
  const messages = [
    { role: 'user', content: [{ type: 'text', text: 'vẽ' }] },
    ...step(1)
  ]
  const before = JSON.stringify(messages)
  await sendToProvider(db, USER, { messages }, fakeProvider(OK_REPLY, {}))
  assert.equal(JSON.stringify(messages), before)
})
