import assert from 'node:assert/strict'
import { test } from 'node:test'
import { anthropicEvents, codexMessage, createBridge } from './bridge.mjs'

test('a CAD tool request is returned to the browser without server execution', async () => {
  let closed = false
  let rejectPrompt
  class Session {
    constructor(options) {
      this.options = options
    }
    async initialize() {
      return { model: 'test-model' }
    }
    prompt() {
      this.options.execute('tao_ho_so_mo', { thong_so: { bBe: 8500 } })
      return new Promise((resolve, reject) => {
        rejectPrompt = reject
      })
    }
    async close() {
      closed = true
      rejectPrompt?.(new Error('closed'))
    }
  }
  const result = await codexMessage(
    {
      messages: [{ role: 'user', content: 'Dựng M1' }],
      tools: [{ name: 'tao_ho_so_mo', input_schema: { type: 'object' } }]
    },
    { Session }
  )
  assert.equal(result.stop_reason, 'tool_use')
  assert.equal(result.content[0].name, 'tao_ho_so_mo')
  assert.equal(result.content[0].input.thong_so.bBe, 8500)
  assert.equal(closed, true)
  const events = anthropicEvents(result)
  assert.match(events, /input_json_delta/)
  assert.match(events, /"stop_reason":"tool_use"/)
})

test('history, tool results, and image attachments reach the separate Codex step', async () => {
  let received, instructions
  class Session {
    constructor(options) {
      this.options = options
      instructions = options.instructions
    }
    async initialize() {
      return { model: 'test-model' }
    }
    async prompt(text, images) {
      received = { text, images }
      this.options.onText('Đã kiểm tra.')
      return {}
    }
    async close() {}
  }
  const result = await codexMessage(
    {
      system: [{ type: 'text', text: 'Company standards' }],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool1',
              content: 'r1: success'
            },
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'abc' }
            }
          ]
        }
      ]
    },
    { Session }
  )
  assert.equal(result.stop_reason, 'end_turn')
  assert.equal(result.content[0].text, 'Đã kiểm tra.')
  assert.match(received.text, /r1: success/)
  assert.deepEqual(received.images, ['data:image/png;base64,abc'])
  assert.match(instructions, /Company standards/)
})

test('bridge rejects callers outside the configured private peer list', async () => {
  const server = createBridge({
    allowedPeers: [],
    infer: () => assert.fail('must not infer')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/health`
    )
    assert.equal(response.status, 403)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
