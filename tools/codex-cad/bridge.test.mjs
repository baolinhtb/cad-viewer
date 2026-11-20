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
import {
  claudeArgs,
  claudeMessage,
  normalizeToolName,
  readStepAnswer,
  renderHistory
} from './claude-step.mjs'

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

/** One CLI run in which the model reached for `name` and the CLI refused it. */
const refusedRun = (name, said, answer, extra = {}) => ({
  events: [
    {
      type: 'assistant',
      message: {
        content: [
          name === 'StructuredOutput'
            ? {
                type: 'tool_use',
                id: 'call_1',
                name: 'StructuredOutput',
                input: { text: '', tool: { name: extra.meant, input: 'x' } }
              }
            : { type: 'tool_use', id: 'call_1', name, input: {} }
        ]
      }
    },
    {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call_1',
            is_error: true,
            content: said
          }
        ]
      }
    },
    resultEvent(answer, { num_turns: 4 })
  ]
})

test('claude: a decorated tool name and a stringified input are read, not refused', () => {
  assert.equal(normalizeToolName(' functions.tao_btkl '), 'tao_btkl')
  assert.equal(normalizeToolName('`default_api.xuat_btkl`'), 'xuat_btkl')
  const names = ['tao_btkl', 'xuat_btkl']
  assert.deepEqual(
    readStepAnswer(
      {
        structured_output: {
          text: 'ok',
          tool: {
            name: 'functions.tao_btkl',
            input: '{"vi_tri":{"x":1,"y":2}}'
          }
        }
      },
      names
    ),
    {
      text: 'ok',
      tool: { name: 'tao_btkl', input: { vi_tri: { x: 1, y: 2 } } }
    }
  )
  // A missing input is an empty one; a string that is not JSON still refuses,
  // and the refusal carries a code for the log.
  assert.deepEqual(
    readStepAnswer(
      { structured_output: { text: '', tool: { name: 'tao_btkl' } } },
      names
    ),
    { text: '', tool: { name: 'tao_btkl', input: {} } }
  )
  const bad = readStepAnswer(
    {
      structured_output: {
        text: '',
        tool: { name: 'tao_btkl', input: 'xin chào' }
      }
    },
    names
  )
  assert.equal(bad.code, 'sai_input')
  assert.equal(bad.name, 'tao_btkl')
  // The turn cap travels with every run.
  assert.equal(
    claudeArgs({ system: 's' })[
      claudeArgs({ system: 's' }).indexOf('--max-turns') + 1
    ],
    '4'
  )
})

test('claude: a tool the CLI refused mid-run is not allowed to look banned', async () => {
  // The 17/11/2026 incident: the CLI answers "No such tool available" to a
  // tool the browser does offer, and the model quietly switches to another one.
  const { spawn, calls } = fakeSpawn([
    refusedRun(
      'tao_btkl',
      '<tool_use_error>Error: No such tool available: tao_btkl</tool_use_error>',
      {
        text: 'Công cụ tao_btkl không dùng được trong phiên này, tôi dùng xuat_btkl.',
        tool: { name: 'xuat_btkl', input: {} }
      }
    ),
    {
      events: [resultEvent({ text: '', tool: { name: 'tao_btkl', input: {} } })]
    }
  ])
  const lines = []
  const result = await claudeMessage(
    { messages: [{ role: 'user', content: 'Lập BTKL' }], tools: TOOLS },
    { spawn, env: ENV, log: line => lines.push(line) }
  )
  assert.equal(calls.length, 2)
  const note = firstUserMessage(calls[1]).content[0].text
  assert.match(note, /"tao_btkl" CÓ trong danh sách và dùng được/)
  assert.match(note, /KHÔNG phải công cụ bị cấm/)
  assert.equal(result.content[0].name, 'tao_btkl')
  const entry = JSON.parse(lines.at(-1))
  assert.equal(entry.tag, 'cad-agent-step')
  assert.equal(entry.cong_cu, 'tao_btkl')
  assert.deepEqual(entry.buoc[0].tu_choi, [
    { ten: 'tao_btkl', goc: true, ly_do: 'cong_cu_khong_co' }
  ])
  assert.deepEqual(entry.buoc[0].bo_cong_cu, ['tao_btkl'])
  assert.equal(entry.buoc[0].turns, 4)
})

test('claude: a schema refusal does not move the model off its tool either', async () => {
  const { spawn, calls } = fakeSpawn([
    refusedRun(
      'StructuredOutput',
      'Output does not match required schema: /tool/input: must be object',
      { text: 'Không dùng được, tôi dừng.', tool: null },
      { meant: 'tao_btkl' }
    ),
    {
      events: [resultEvent({ text: '', tool: { name: 'tao_btkl', input: {} } })]
    }
  ])
  const result = await claudeMessage(
    { messages: [{ role: 'user', content: 'Lập BTKL' }], tools: TOOLS },
    { spawn, env: ENV, log: null }
  )
  assert.equal(calls.length, 2)
  assert.match(
    firstUserMessage(calls[1]).content[0].text,
    /lỗi kênh gọi\/định dạng/
  )
  assert.equal(result.content[0].name, 'tao_btkl')
})

test('claude: keeping the refused tool is not retried, and an unknown name is not logged', async () => {
  // The model stood its ground: one run, no second model call.
  const kept = fakeSpawn([
    refusedRun(
      'tao_btkl',
      '<tool_use_error>Error: No such tool available: tao_btkl</tool_use_error>',
      { text: '', tool: { name: 'tao_btkl', input: {} } }
    )
  ])
  const lines = []
  await claudeMessage(
    { messages: [{ role: 'user', content: 'Lập BTKL' }], tools: TOOLS },
    { spawn: kept.spawn, env: ENV, log: line => lines.push(line) }
  )
  assert.equal(kept.calls.length, 1)
  assert.equal(JSON.parse(lines.at(-1)).ket_qua, 'ok')

  // A name the model invented is counted, never printed.
  const invented = fakeSpawn([
    refusedRun(
      'rm_rf_everything',
      '<tool_use_error>Error: No such tool available: rm_rf_everything</tool_use_error>',
      { text: '', tool: { name: 'tao_btkl', input: {} } }
    )
  ])
  const quiet = []
  await claudeMessage(
    { messages: [{ role: 'user', content: 'Lập BTKL' }], tools: TOOLS },
    { spawn: invented.spawn, env: ENV, log: line => quiet.push(line) }
  )
  assert.equal(invented.calls.length, 1)
  assert.doesNotMatch(quiet.at(-1), /rm_rf_everything/)
  assert.match(quiet.at(-1), /<lạ>/)
})

test('claude: the turn cap ends a run that is retried, not the whole step', async () => {
  const { spawn, calls } = fakeSpawn([
    {
      events: [
        {
          type: 'result',
          subtype: 'error_max_turns',
          is_error: true,
          result: 'Reached max turns',
          num_turns: 4,
          usage: { input_tokens: 7, output_tokens: 3 }
        }
      ],
      code: 1
    },
    { events: [resultEvent({ text: 'Xong.', tool: null })] }
  ])
  const lines = []
  const result = await claudeMessage(
    { messages: [{ role: 'user', content: 'Lập BTKL' }], tools: TOOLS },
    { spawn, env: ENV, log: line => lines.push(line) }
  )
  assert.equal(calls.length, 2)
  assert.match(
    firstUserMessage(calls[1]).content[0].text,
    /chạm giới hạn số lượt/
  )
  assert.deepEqual(result.content, [{ type: 'text', text: 'Xong.' }])
  assert.equal(JSON.parse(lines.at(-1)).buoc[0].het_luot, true)
})

test('claude: the diagnostic line carries no prompt, no drawing and no token', async () => {
  const { spawn } = fakeSpawn([
    {
      events: [
        resultEvent({
          text: 'Mố M1 nằm ở lý trình bí mật.',
          tool: { name: 'tao_btkl', input: { vi_tri: { x: 123456, y: 7 } } }
        })
      ]
    }
  ])
  const lines = []
  await claudeMessage(
    {
      system: [{ type: 'text', text: 'NỀN CHUẨN HÓA CỦA CÔNG TY' }],
      messages: [{ role: 'user', content: 'Dựng mố cho cầu BÍ MẬT' }],
      tools: TOOLS
    },
    { spawn, env: ENV, log: line => lines.push(line) }
  )
  assert.equal(lines.length, 1)
  const line = lines[0]
  for (const leak of [
    'BÍ MẬT',
    'NỀN CHUẨN HÓA',
    'sk-ant',
    '123456',
    'lý trình'
  ])
    assert.doesNotMatch(line, new RegExp(leak))
  const entry = JSON.parse(line)
  assert.deepEqual(Object.keys(entry).sort(), [
    'buoc',
    'cong_cu',
    'ket_qua',
    'luot',
    'tag',
    'tong'
  ])
  assert.equal(entry.cong_cu, 'tao_btkl')
  assert.deepEqual(entry.tong, { input_tokens: 103, output_tokens: 40 })
})

test('claude: the history reaches the CLI as a record, not as tool_use blocks', async () => {
  const { spawn, calls } = fakeSpawn([
    { events: [resultEvent({ text: 'Tiếp tục.', tool: null })] }
  ])
  await claudeMessage(
    {
      messages: [
        { role: 'user', content: 'Lập BTKL cho mố M1' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Tôi lập bảng.' },
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'tao_btkl',
              input: { vi_tri: { x: 1 } }
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_1',
              content: [{ type: 'text', text: '{"ok":true}' }]
            }
          ]
        },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'toolu_2', name: 'xuat_btkl', input: {} }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_2',
              is_error: true,
              content: 'không ghi được tệp'
            }
          ]
        }
      ],
      tools: TOOLS
    },
    { spawn, env: ENV }
  )
  const text = firstUserMessage(calls[0]).content[0].text
  const history = text.slice(text.indexOf('Lịch sử hội thoại'))
  // The record says what happened…
  assert.match(history, /NGƯỜI DÙNG: Lập BTKL cho mố M1/)
  assert.match(history, /TRỢ LÝ: Tôi lập bảng\./)
  assert.match(history, /#1 GỌI tao_btkl \{"vi_tri":\{"x":1\}\}/)
  assert.match(history, /#1 KẾT QUẢ: \{"ok":true\}/)
  assert.match(history, /#2 GỌI xuat_btkl \{\}/)
  assert.match(history, /#2 KẾT QUẢ \(LỖI\): không ghi được tệp/)
  // …without showing the model a single native tool call to copy.
  assert.doesNotMatch(history, /"type":"tool_use"/)
  assert.doesNotMatch(history, /"type":"tool_result"/)
  assert.doesNotMatch(history, /tool_use_id/)
  // The tool list is still JSON, above the history.
  assert.match(text, /^Công cụ có sẵn \(JSON\):\n\[\{"name":"tao_btkl"/)
})

test('claude: the browser tool names are the schema enum of legal answers', async () => {
  const { spawn, calls } = fakeSpawn([
    { events: [resultEvent({ text: 'ok', tool: null })] }
  ])
  await claudeMessage(
    { messages: [{ role: 'user', content: 'x' }], tools: TOOLS },
    { spawn, env: ENV }
  )
  const args = calls[0].args
  const schema = JSON.parse(args[args.indexOf('--json-schema') + 1])
  assert.deepEqual(schema.properties.tool.anyOf[1].properties.name.enum, [
    'tao_btkl',
    'xuat_btkl'
  ])
  // No tools: the name stays a free string rather than an empty enum, which
  // no answer could satisfy.
  assert.equal(
    claudeArgs({ system: 's', toolNames: [] })[
      claudeArgs({ system: 's', toolNames: [] }).indexOf('--json-schema') + 1
    ].includes('enum'),
    false
  )
})

test('claude: rendering history keeps images, numbers and unknown blocks', () => {
  const seen = []
  const text = renderHistory(
    [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Xem ảnh' },
          { type: 'image', source: { data: 'x' } }
        ]
      },
      {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'ngẫm' }]
      },
      { role: 'user', content: '' },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'mất', content: 'r' }]
      }
    ],
    block => {
      seen.push(block)
      return seen.length
    }
  )
  assert.equal(
    text,
    [
      'NGƯỜI DÙNG: Xem ảnh',
      'NGƯỜI DÙNG: [Ảnh đính kèm 1]',
      'TRỢ LÝ: {"type":"thinking","thinking":"ngẫm"}',
      // A result whose call is not in the history still says it is one.
      '#? KẾT QUẢ: r'
    ].join('\n')
  )
  assert.equal(seen.length, 1)
})
