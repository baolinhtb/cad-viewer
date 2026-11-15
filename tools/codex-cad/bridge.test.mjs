/* global setImmediate */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { PassThrough, Writable } from 'node:stream'
import { test } from 'node:test'

import {
  anthropicEvents,
  codexMessage,
  createBridge,
  selectBackend
} from './bridge.mjs'
import { claudeMessage } from './claude-step.mjs'

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

// ---- Claude CLI backend ------------------------------------------------------

/**
 * A fake `child_process.spawn`: records each call and answers with the
 * stream-json lines `reply(call)` returns (or never, to test abort/timeout).
 */
function fakeSpawn(replies) {
  const calls = []
  const spawn = (command, args, options) => {
    const child = new EventEmitter()
    const call = { command, args, options, stdin: '', killed: [] }
    calls.push(call)
    child.exitCode = null
    child.signalCode = null
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.stdin = new Writable({
      write(chunk, _encoding, done) {
        call.stdin += chunk.toString()
        done()
      }
    })
    child.kill = signal => {
      call.killed.push(signal)
      child.signalCode = signal
      child.stdout.end()
      setImmediate(() => child.emit('close', null))
      return true
    }
    const reply = replies[calls.length - 1]
    child.stdin.on('finish', () => {
      if (reply === 'hang') return
      const { events, code = 0 } = reply
      for (const event of events)
        child.stdout.write(JSON.stringify(event) + '\n')
      child.stdout.end()
      child.exitCode = code
      setImmediate(() => child.emit('close', code))
    })
    return child
  }
  return { spawn, calls }
}
const resultEvent = (output, extra = {}) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: JSON.stringify(output),
  structured_output: output,
  modelUsage: { 'claude-opus-5-5': { inputTokens: 3, outputTokens: 40 } },
  usage: {
    input_tokens: 3,
    cache_creation_input_tokens: 100,
    cache_read_input_tokens: 0,
    output_tokens: 40
  },
  ...extra
})
const TOOLS = [
  {
    name: 'tao_btkl',
    description: 'Lập BTKL',
    input_schema: { type: 'object', properties: {} }
  },
  { name: 'xuat_btkl', input_schema: { type: 'object' } }
]
const ENV = {
  PATH: '/usr/bin',
  HOME: '/root',
  CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-secret',
  CLAUDE_COMMAND: '/root/.local/bin/claude',
  CAD_AGENT_CLAUDE_MODEL: 'claude-opus-5-5',
  HTTPS_PROXY: 'http://proxy:3128',
  NODE_EXTRA_CA_CERTS: '/etc/ssl/ca.pem',
  SECRET_ELSEWHERE: 'must-not-pass'
}
const firstUserMessage = call => JSON.parse(call.stdin.trim()).message

test('claude: arguments, environment and stdin of one step', async () => {
  const { spawn, calls } = fakeSpawn([
    {
      events: [
        { type: 'system', subtype: 'init' },
        resultEvent({ text: 'Đã xong.', tool: null })
      ]
    }
  ])
  const result = await claudeMessage(
    {
      system: [{ type: 'text', text: 'Company standards' }],
      messages: [{ role: 'user', content: 'Lập BTKL' }],
      tools: TOOLS
    },
    { spawn, env: ENV }
  )
  assert.equal(calls.length, 1)
  const [{ command, args, options }] = calls
  assert.equal(command, '/root/.local/bin/claude')
  assert.deepEqual(args.slice(0, 6), [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose'
  ])
  const flag = name => args[args.indexOf(name) + 1]
  assert.match(flag('--system-prompt'), /Company standards/)
  assert.match(flag('--system-prompt'), /Giao thức cầu nối/)
  assert.equal(flag('--tools'), '')
  assert.equal(flag('--setting-sources'), '')
  assert.ok(args.includes('--no-session-persistence'))
  assert.ok(args.includes('--strict-mcp-config'))
  assert.deepEqual(JSON.parse(flag('--json-schema')).required, ['text', 'tool'])
  assert.equal(flag('--model'), 'claude-opus-5-5')
  // Minimal environment: credentials, PATH/HOME, proxy/CA; no other secrets.
  assert.deepEqual(options.env, {
    PATH: '/usr/bin',
    HOME: '/root',
    CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-secret',
    HTTPS_PROXY: 'http://proxy:3128',
    NODE_EXTRA_CA_CERTS: '/etc/ssl/ca.pem',
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1'
  })
  assert.match(options.cwd, /cad-claude-step-/)
  const message = firstUserMessage(calls[0])
  assert.equal(message.role, 'user')
  assert.match(message.content[0].text, /"name":"tao_btkl"/)
  assert.match(message.content[0].text, /Lập BTKL/)
  // Final text, no tool.
  assert.equal(result.stop_reason, 'end_turn')
  assert.deepEqual(result.content, [{ type: 'text', text: 'Đã xong.' }])
  assert.equal(result.model, 'claude-opus-5-5')
  assert.deepEqual(result.usage, { input_tokens: 103, output_tokens: 40 })
})

test('claude: a tool request becomes one tool_use for the browser', async () => {
  const { spawn } = fakeSpawn([
    {
      events: [
        resultEvent({
          text: 'Tôi lập bảng khối lượng.',
          tool: { name: 'tao_btkl', input: { vi_tri: { x: 1, y: 2 } } }
        })
      ]
    }
  ])
  const result = await claudeMessage(
    { messages: [{ role: 'user', content: 'Lập BTKL' }], tools: TOOLS },
    { spawn, env: ENV }
  )
  assert.equal(result.stop_reason, 'tool_use')
  assert.equal(result.content[0].text, 'Tôi lập bảng khối lượng.')
  assert.equal(result.content[1].type, 'tool_use')
  assert.equal(result.content[1].name, 'tao_btkl')
  assert.deepEqual(result.content[1].input, { vi_tri: { x: 1, y: 2 } })
  assert.match(result.content[1].id, /^toolu_/)
  assert.match(anthropicEvents(result), /"partial_json":"{\\"vi_tri\\"/)
})

test('claude: JSON in a code fence is read when structured output is missing', async () => {
  const { spawn } = fakeSpawn([
    {
      events: [
        {
          type: 'result',
          is_error: false,
          result: '```json\n{"text":"Xong.","tool":null}\n```'
        }
      ]
    }
  ])
  const result = await claudeMessage(
    { messages: [{ role: 'user', content: 'hi' }], tools: TOOLS },
    { spawn, env: ENV }
  )
  assert.deepEqual(result.content, [{ type: 'text', text: 'Xong.' }])
  assert.equal(result.model, 'claude-cli')
})

test('claude: an unknown tool is retried once with the reason, then refused', async () => {
  const bad = resultEvent({ text: '', tool: { name: 'xoa_ban_ve', input: {} } })
  const good = resultEvent({ text: '', tool: { name: 'xuat_btkl', input: {} } })
  const once = fakeSpawn([{ events: [bad] }, { events: [good] }])
  const result = await claudeMessage(
    { messages: [{ role: 'user', content: 'Xuất' }], tools: TOOLS },
    { spawn: once.spawn, env: ENV }
  )
  assert.equal(once.calls.length, 2)
  assert.match(
    firstUserMessage(once.calls[1]).content[0].text,
    /Lần trả lời trước không hợp lệ: công cụ "xoa_ban_ve" không có trong danh sách/
  )
  assert.equal(result.content[0].name, 'xuat_btkl')
  assert.equal(result.usage.output_tokens, 80)

  const twice = fakeSpawn([{ events: [bad] }, { events: [bad] }])
  await assert.rejects(
    claudeMessage(
      { messages: [{ role: 'user', content: 'Xuất' }], tools: TOOLS },
      { spawn: twice.spawn, env: ENV }
    ),
    /không hợp lệ sau 2 lần: công cụ "xoa_ban_ve"/
  )
  // A non-object input is refused too.
  const array = fakeSpawn([
    {
      events: [resultEvent({ text: '', tool: { name: 'tao_btkl', input: [] } })]
    },
    { events: [resultEvent({ text: 'Thôi.', tool: null })] }
  ])
  const after = await claudeMessage(
    { messages: [{ role: 'user', content: 'x' }], tools: TOOLS },
    { spawn: array.spawn, env: ENV }
  )
  assert.equal(array.calls.length, 2)
  assert.equal(after.stop_reason, 'end_turn')
})

test('claude: CLI errors become Vietnamese messages without the token', async () => {
  const notLoggedIn = fakeSpawn([
    {
      code: 1,
      events: [
        {
          type: 'result',
          is_error: true,
          result: 'Not logged in · Please run /login'
        }
      ]
    }
  ])
  await assert.rejects(
    claudeMessage(
      { messages: [{ role: 'user', content: 'x' }], tools: TOOLS },
      { spawn: notLoggedIn.spawn, env: ENV }
    ),
    error => {
      assert.match(error.message, /chưa đăng nhập hoặc token đã hết hạn/)
      assert.doesNotMatch(error.message, /sk-ant/)
      return true
    }
  )
  const crashed = fakeSpawn([{ code: 2, events: [] }])
  await assert.rejects(
    claudeMessage(
      { messages: [{ role: 'user', content: 'x' }], tools: TOOLS },
      { spawn: crashed.spawn, env: ENV }
    ),
    /Claude CLI dừng \(mã thoát 2\) mà không trả kết quả/
  )
  const other = fakeSpawn([
    {
      code: 1,
      events: [
        { type: 'result', is_error: true, result: 'boom sk-ant-abc-123 here' }
      ]
    }
  ])
  await assert.rejects(
    claudeMessage(
      { messages: [{ role: 'user', content: 'x' }], tools: TOOLS },
      { spawn: other.spawn, env: ENV }
    ),
    error => {
      assert.equal(
        error.message,
        'Claude CLI báo lỗi (mã thoát 1): boom [đã ẩn] here'
      )
      return true
    }
  )
})

test('claude: abort and timeout kill the child process', async () => {
  const aborted = fakeSpawn(['hang'])
  const controller = new AbortController()
  const pending = claudeMessage(
    { messages: [{ role: 'user', content: 'x' }], tools: TOOLS },
    { spawn: aborted.spawn, env: ENV, signal: controller.signal }
  )
  setTimeout(() => controller.abort(), 20)
  await assert.rejects(pending, /Yêu cầu đã bị hủy/)
  assert.deepEqual(aborted.calls[0].killed, ['SIGTERM'])

  const slow = fakeSpawn(['hang'])
  await assert.rejects(
    claudeMessage(
      { messages: [{ role: 'user', content: 'x' }], tools: TOOLS },
      {
        spawn: slow.spawn,
        env: { ...ENV, CAD_AGENT_CLAUDE_TIMEOUT_MS: '30' }
      }
    ),
    /Hết thời gian chờ Claude CLI/
  )
  assert.deepEqual(slow.calls[0].killed, ['SIGTERM'])
})

test('claude: base64 images travel as Anthropic image blocks', async () => {
  const { spawn, calls } = fakeSpawn([
    { events: [resultEvent({ text: 'Ảnh màu đỏ.', tool: null })] }
  ])
  const source = {
    type: 'base64',
    media_type: 'image/png',
    data: 'iVBORw0KGgo='
  }
  await claudeMessage(
    {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Ảnh này?' },
            { type: 'image', source }
          ]
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 't1', content: 'r1: success' }
          ]
        }
      ],
      tools: TOOLS
    },
    { spawn, env: ENV }
  )
  const content = firstUserMessage(calls[0]).content
  assert.deepEqual(content[1], { type: 'image', source })
  assert.match(content[0].text, /\[Ảnh đính kèm 1\]/)
  assert.match(content[0].text, /r1: success/)
  assert.doesNotMatch(content[0].text, /iVBORw0KGgo/)
  await assert.rejects(
    claudeMessage(
      {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'url', url: 'http://x' } }
            ]
          }
        ],
        tools: TOOLS
      },
      { spawn, env: ENV }
    ),
    /chỉ nhận ảnh đính kèm dạng base64/
  )
})

test('claude: a long system prompt goes through a file, not argv', async () => {
  const { spawn, calls } = fakeSpawn([
    { events: [resultEvent({ text: 'ok', tool: null })] }
  ])
  let seen
  await claudeMessage(
    {
      system: 'x'.repeat(150 * 1024),
      messages: [{ role: 'user', content: 'x' }],
      tools: TOOLS
    },
    {
      spawn: (...a) => {
        const child = spawn(...a)
        const file = a[1][a[1].indexOf('--system-prompt-file') + 1]
        seen = readFileSync(file, 'utf8').length
        return child
      },
      env: ENV
    }
  )
  assert.ok(!calls[0].args.includes('--system-prompt'))
  assert.ok(seen > 150 * 1024)
})

test('backend selection and /health provider', async () => {
  assert.equal(selectBackend(undefined).provider, 'claude-cli')
  assert.equal(selectBackend('codex').provider, 'codex-cli')
  assert.throws(() => selectBackend('gpt'), /không hợp lệ/)
  for (const [backend, provider] of [
    ['claude', 'claude-cli'],
    ['codex', 'codex-cli']
  ]) {
    const server = createBridge({ backend: selectBackend(backend) })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const health = await (
        await fetch(`http://127.0.0.1:${server.address().port}/health`)
      ).json()
      assert.equal(health.provider, provider)
    } finally {
      await new Promise(resolve => server.close(resolve))
    }
  }
})

test('busy message names the backend, not Codex', async () => {
  let release
  const server = createBridge({
    backend: selectBackend('claude'),
    maxConcurrent: 1,
    infer: () => new Promise(resolve => (release = resolve))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/messages`
  const body = JSON.stringify({ messages: [{ role: 'user', content: 'x' }] })
  try {
    const first = fetch(url, { method: 'POST', body })
    await new Promise(resolve => setTimeout(resolve, 50))
    const busy = await fetch(url, { method: 'POST', body })
    assert.equal(busy.status, 429)
    assert.equal(
      (await busy.json()).error.message,
      'Claude CLI đang bận. Vui lòng thử lại sau.'
    )
    release({
      id: 'm',
      type: 'message',
      role: 'assistant',
      model: 'm',
      content: [],
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 }
    })
    assert.equal((await first).status, 200)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
