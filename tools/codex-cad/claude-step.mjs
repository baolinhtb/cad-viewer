/* global process, Buffer */
/**
 * One CAD Agent step through the Claude Code CLI (`claude -p`).
 *
 * Same contract as `codexMessage` in `bridge.mjs`: the browser owns the tools.
 * The step returns an Anthropic-shaped assistant message with some text and
 * at most ONE `tool_use`; the browser runs it and sends the `tool_result` in
 * the next request. Nothing is executed here.
 *
 * The CLI runs bare: no built-in Claude Code tools (`--tools ""`), no saved
 * session, no user/project settings, no MCP servers, a fresh temporary working
 * directory and a minimal environment. The answer comes back as structured
 * output `{ text, tool }` (`--json-schema`), checked against the tool list;
 * an invalid answer is retried once with the reason, then reported.
 *
 * Checked against claude 2.1.325 (2026-11-15):
 * - `--input-format stream-json` requires `--output-format stream-json`
 *   (`json` exits 1), and stream-json output requires `--verbose`;
 * - the answer is in the `result` event: `structured_output` (object), with
 *   the same JSON as a string in `result`;
 * - `--tools ""` leaves only the internal `StructuredOutput` tool;
 *   `--setting-sources ""` and `--strict-mcp-config` are accepted;
 * - not logged in: exit 1, `is_error: true`, result "Not logged in · …";
 * - base64 image blocks in the stream-json user message are read as images.
 *
 * Credentials (CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY) are passed to the
 * child only; stderr is never logged nor quoted in errors.
 */
import { spawn as nodeSpawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'

/** Structured output of one step. */
export const CLAUDE_STEP_SCHEMA = {
  type: 'object',
  properties: {
    text: {
      type: 'string',
      description: 'Lời nói với người dùng ở bước này; có thể rỗng.'
    },
    tool: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            input: { type: 'object' }
          },
          required: ['name', 'input']
        }
      ]
    }
  },
  required: ['text', 'tool'],
  additionalProperties: false
}

const PROTOCOL = `
# Giao thức cầu nối (bắt buộc)
Bạn là MỘT bước suy luận của trợ lý CAD chạy trong trình duyệt. Bạn không chạy công cụ: trình duyệt chạy công cụ bạn chọn và gửi tool_result ở lượt sau.
- Danh sách công cụ và lịch sử hội thoại nằm trong tin nhắn người dùng, dạng JSON. Tiếp tục từ cuối lịch sử; không lặp lại công cụ đã có tool_result.
- Trả lời đúng structured output { "text": chuỗi, "tool": null | { "name": tên công cụ, "input": đối tượng } }.
- Cần công cụ: chọn đúng MỘT công cụ có trong danh sách, "input" khớp input_schema của nó; "text" là câu ngắn nói việc sắp làm (có thể rỗng).
- Xong việc hoặc cần hỏi người dùng: "tool" = null, "text" là câu trả lời.
- Không tuyên bố thành công nếu chưa có tool_result xác nhận.`

/** Threshold above which the system prompt goes through a file, not argv. */
const MAX_SYSTEM_ARG = 100 * 1024

/**
 * The child's environment: what the CLI needs and nothing else, with
 * auto-update and non-essential traffic off.
 */
export function claudeEnv(source = process.env) {
  const env = {
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1'
  }
  for (const key of [
    'PATH',
    'HOME',
    'LANG',
    'LC_ALL',
    'TMPDIR',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'ANTHROPIC_API_KEY'
  ])
    if (source[key]) env[key] = source[key]
  return env
}

/** CLI arguments of one step. */
export function claudeArgs({ system, systemFile, model }) {
  return [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    ...(systemFile
      ? ['--system-prompt-file', systemFile]
      : ['--system-prompt', system]),
    '--tools',
    '',
    '--no-session-persistence',
    '--setting-sources',
    '',
    '--strict-mcp-config',
    '--json-schema',
    JSON.stringify(CLAUDE_STEP_SCHEMA),
    ...(model ? ['--model', model] : [])
  ]
}

/**
 * The single stream-json user message: tools and history as JSON text,
 * images kept as Anthropic base64 blocks after it (referenced by number).
 */
export function claudeInput(body, retryNote) {
  const images = []
  const messages = body.messages.map(message => ({
    ...message,
    content: Array.isArray(message.content)
      ? message.content.map(block => {
          if (block?.type !== 'image') return block
          const source = block.source
          if (
            source?.type !== 'base64' ||
            !/^image\/(png|jpeg|webp|gif)$/.test(source.media_type)
          )
            throw new Error('Cầu nối Claude chỉ nhận ảnh đính kèm dạng base64.')
          images.push({ type: 'image', source })
          return { type: 'text', text: `[Ảnh đính kèm ${images.length}]` }
        })
      : message.content
  }))
  const tools = (body.tools ?? []).map(t => ({
    name: t.name,
    description: t.description ?? '',
    input_schema: t.input_schema ?? { type: 'object' }
  }))
  const text =
    `Công cụ có sẵn (JSON):\n${JSON.stringify(tools)}\n\n` +
    `Lịch sử hội thoại (JSON${images.length ? `; ${images.length} ảnh đính kèm gửi theo thứ tự ngay sau` : ''}):\n${JSON.stringify(messages)}` +
    (retryNote ? `\n\n${retryNote}` : '')
  return (
    JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text }, ...images] }
    }) + '\n'
  )
}

/** Strips a ```json fence, if any. */
function parseJsonText(text) {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(text)
  return JSON.parse(fenced ? fenced[1] : text)
}

/** The step's answer, or why it is not acceptable. */
export function readStepAnswer(result, toolNames) {
  let answer = result.structured_output
  if (answer === undefined || answer === null) {
    if (typeof result.result !== 'string')
      return { error: 'không có structured output' }
    try {
      answer = parseJsonText(result.result)
    } catch {
      return { error: 'kết quả không phải JSON hợp lệ' }
    }
  }
  if (!answer || typeof answer !== 'object' || Array.isArray(answer))
    return { error: 'kết quả không phải đối tượng { text, tool }' }
  const text = typeof answer.text === 'string' ? answer.text : ''
  const tool = answer.tool ?? null
  if (tool === null) return { text, tool: null }
  if (typeof tool !== 'object' || typeof tool.name !== 'string')
    return { error: '"tool" phải là null hoặc { name, input }' }
  if (!toolNames.includes(tool.name))
    return {
      error: `công cụ "${tool.name}" không có trong danh sách (${toolNames.join(', ') || 'trống'})`
    }
  const input = tool.input ?? {}
  if (typeof input !== 'object' || Array.isArray(input))
    return { error: `"input" của ${tool.name} phải là đối tượng` }
  return { text, tool: { name: tool.name, input } }
}

/** A CLI error in Vietnamese, without stderr or anything credential-like. */
function cliError(result, code) {
  const said = String(result?.result ?? '')
    .replace(/sk-ant-[\w-]+/g, '[đã ẩn]')
    .slice(0, 300)
  if (
    /not logged in|\/login|oauth|token.*expir|expired|401|unauthori[sz]ed|authentication/i.test(
      said
    )
  )
    return new Error(
      'Claude CLI chưa đăng nhập hoặc token đã hết hạn. Quản trị kiểm tra CLAUDE_CODE_OAUTH_TOKEN trong /etc/cad-agent/claude.env rồi khởi động lại dịch vụ.'
    )
  if (/rate.?limit|429|overloaded|529|usage limit/i.test(said))
    return new Error(
      'Claude CLI đang bị giới hạn lượt dùng hoặc quá tải. Vui lòng thử lại sau.'
    )
  return new Error(
    `Claude CLI báo lỗi${code !== undefined && code !== null ? ` (mã thoát ${code})` : ''}${said ? `: ${said}` : '.'}`
  )
}

/** Runs the CLI once and returns its `result` event. */
function runOnce({ spawn, command, args, env, cwd, input, signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let settled = false
    let result
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const kill = () => {
      if (child.exitCode !== null || child.signalCode) return
      child.kill('SIGTERM')
      setTimeout(() => {
        if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL')
      }, 3000).unref?.()
    }
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      if (error) {
        kill()
        reject(error)
      } else resolve(value)
    }
    const onAbort = () => finish(new Error('Yêu cầu đã bị hủy.'))
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            `Hết thời gian chờ Claude CLI (${Math.round(timeoutMs / 1000)} giây).`
          )
        ),
      timeoutMs
    )
    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort, { once: true })
    // Runtime logs may carry account context: drained, never kept.
    child.stderr?.on('data', () => {})
    child.on('error', error =>
      finish(
        new Error(
          error.code === 'ENOENT'
            ? `Không tìm thấy Claude CLI (${command}). Đặt CLAUDE_COMMAND hoặc PATH.`
            : `Không chạy được Claude CLI: ${error.message}`
        )
      )
    )
    createInterface({ input: child.stdout }).on('line', line => {
      if (!line.trim()) return
      try {
        const event = JSON.parse(line)
        if (event?.type === 'result') result = event
      } catch {
        // Non-JSON lines are not part of the protocol; ignore.
      }
    })
    child.on('close', code => {
      if (!result)
        return finish(
          new Error(`Claude CLI dừng (mã thoát ${code}) mà không trả kết quả.`)
        )
      if (result.is_error || code !== 0) return finish(cliError(result, code))
      finish(null, result)
    })
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}

/**
 * One browser-owned agent step through `claude -p`.
 *
 * @param body - Anthropic Messages request (system, messages, tools).
 * @param options.spawn - Injected by tests; defaults to child_process.spawn.
 * @param options.env - Source environment (defaults to process.env).
 */
export async function claudeMessage(
  body,
  { signal, spawn = nodeSpawn, env = process.env } = {}
) {
  const tools = body.tools ?? []
  if (
    !Array.isArray(body.messages) ||
    !body.messages.length ||
    !Array.isArray(tools)
  )
    throw new Error('Thiếu messages hoặc tools không hợp lệ.')
  if (signal?.aborted) throw new Error('Yêu cầu đã bị hủy.')
  const toolNames = tools.map(t => t.name)
  const system =
    (typeof body.system === 'string'
      ? body.system
      : (body.system ?? []).map(block => block?.text ?? '').join('\n')) +
    '\n' +
    PROTOCOL
  const command = env.CLAUDE_COMMAND || 'claude'
  const timeoutMs = Number(env.CAD_AGENT_CLAUDE_TIMEOUT_MS) || 600000
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cad-claude-step-'))
  try {
    let systemFile
    if (Buffer.byteLength(system) > MAX_SYSTEM_ARG) {
      systemFile = path.join(directory, 'system.txt')
      await writeFile(systemFile, system)
    }
    const args = claudeArgs({
      system,
      systemFile,
      model: env.CAD_AGENT_CLAUDE_MODEL
    })
    const childEnv = claudeEnv(env)
    const usage = { input_tokens: 0, output_tokens: 0 }
    let retryNote
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await runOnce({
        spawn,
        command,
        args,
        env: childEnv,
        cwd: directory,
        input: claudeInput(body, retryNote),
        signal,
        timeoutMs
      })
      usage.input_tokens +=
        (result.usage?.input_tokens ?? 0) +
        (result.usage?.cache_creation_input_tokens ?? 0) +
        (result.usage?.cache_read_input_tokens ?? 0)
      usage.output_tokens += result.usage?.output_tokens ?? 0
      const answer = readStepAnswer(result, toolNames)
      if (answer.error) {
        if (attempt === 0) {
          retryNote = `Lần trả lời trước không hợp lệ: ${answer.error}. Trả lời lại đúng structured output { "text", "tool" }, chỉ dùng công cụ có trong danh sách.`
          continue
        }
        throw new Error(
          `Claude CLI trả kết quả không hợp lệ sau 2 lần: ${answer.error}.`
        )
      }
      const tool = answer.tool
        ? {
            type: 'tool_use',
            id: `toolu_${randomUUID()}`,
            name: answer.tool.name,
            input: answer.tool.input
          }
        : null
      return {
        id: `msg_${randomUUID()}`,
        type: 'message',
        role: 'assistant',
        model: Object.keys(result.modelUsage ?? {})[0] ?? 'claude-cli',
        content: [
          ...(answer.text.trim() ? [{ type: 'text', text: answer.text }] : []),
          ...(tool ? [tool] : [])
        ],
        stop_reason: tool ? 'tool_use' : 'end_turn',
        stop_sequence: null,
        usage
      }
    }
    // Unreachable: the loop returns or throws.
    throw new Error('Claude CLI không trả kết quả.')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
