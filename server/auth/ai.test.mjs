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
