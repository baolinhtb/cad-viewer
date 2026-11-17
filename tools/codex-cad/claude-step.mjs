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
 * The CLI also answers the model inside a run, and that feedback is written
 * for a coding agent, not for this bridge. A model that reaches for a CAD tool
 * as a native `tool_use` is told "Error: No such tool available: <name>", and
 * one whose structured output misses the schema is told "Output does not match
 * required schema"; both read as "that tool is forbidden here". On 17/11/2026 a
 * step answered the engineer with "công cụ tao_ho_so_mo không dùng được trong
 * phiên này" and silently built the dossier through `chay_template` instead. So
 * every refusal the CLI makes inside a run is now traced: if the model drops a
 * tool that IS on the browser's list, the step is retried with the refusal
 * named as a channel error, and one diagnostic line per step goes to the
 * service log (tool names and counts only — never user content, never a token).
 *
 * Checked against claude 2.1.290 and 2.1.326 (2026-11-17):
 * - `--input-format stream-json` requires `--output-format stream-json`
 *   (`json` exits 1), and stream-json output requires `--verbose`;
 * - the answer is in the `result` event: `structured_output` (object), with
 *   the same JSON as a string in `result`;
 * - `--tools ""` leaves only the internal `StructuredOutput` tool;
 *   `--setting-sources ""` and `--strict-mcp-config` are accepted;
 * - not logged in: exit 1, `is_error: true`, result "Not logged in · …";
 * - base64 image blocks in the stream-json user message are read as images;
 * - `--max-turns` is accepted (absent from `--help`, present in both builds);
 *   hitting it ends the run with `subtype: "error_max_turns"`;
 * - `--exclude-dynamic-system-prompt-sections` (2.1.326) is not usable here:
 *   its own help says it "only applies with the default system prompt
 *   (ignored with --system-prompt)", and this step always passes one, which
 *   replaces the CLI's coding-agent prompt rather than adding to it. Nor is
 *   `--bare`: it reads credentials strictly from ANTHROPIC_API_KEY, never the
 *   OAuth token the deployment uses.
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

/**
 * Structured output of one step.
 *
 * `input` takes an object or a JSON string, and is not required. The CLI
 * validates the answer against this schema itself and sends the model back to
 * think again when it misses — a round trip that doubles the cost of the step
 * and, worse, hands the model an English schema error it tends to read as a ban
 * on the tool it had just chosen. A model that writes its arguments as a JSON
 * string is being sloppy, not wrong: {@link readStepAnswer} parses it here,
 * where the fix costs nothing.
 *
 * `toolNames` turns `tool.name` into an enum: the browser's list is the whole
 * set of legal answers, and saying so in the schema is the one place the model
 * cannot skim past. A name is still normalized by {@link normalizeToolName}
 * afterwards, so a decoration the CLI lets through costs nothing either.
 */
export function claudeStepSchema(toolNames = []) {
  const names = toolNames.filter(name => typeof name === 'string' && name)
  return {
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
              name: names.length
                ? {
                    type: 'string',
                    enum: [...names],
                    description:
                      'Tên công cụ, phải là một tên trong danh sách công cụ của trình duyệt.'
                  }
                : { type: 'string' },
              input: { anyOf: [{ type: 'object' }, { type: 'string' }] }
            },
            required: ['name']
          }
        ]
      }
    },
    required: ['text', 'tool'],
    additionalProperties: false
  }
}

/** The schema without a tool list (shape only). */
export const CLAUDE_STEP_SCHEMA = claudeStepSchema()

const PROTOCOL = `
# Giao thức cầu nối (bắt buộc)
Bạn là MỘT bước suy luận của trợ lý CAD chạy trong trình duyệt. Bạn không chạy công cụ: trình duyệt chạy công cụ bạn chọn và gửi tool_result ở lượt sau.
- Danh sách công cụ (JSON) và lịch sử hội thoại (văn bản) nằm trong tin nhắn người dùng. Lịch sử là BIÊN BẢN: "#n GỌI <công cụ> <input>" là công cụ bạn đã chọn, "#n KẾT QUẢ" là kết quả trình duyệt trả về. Tiếp tục từ cuối lịch sử; không lặp lại công cụ đã có kết quả.
- Trả lời đúng structured output { "text": chuỗi, "tool": null | { "name": tên công cụ, "input": đối tượng } }.
- Cần công cụ: chọn đúng MỘT công cụ có trong danh sách, "input" khớp input_schema của nó; "text" là câu ngắn nói việc sắp làm (có thể rỗng).
- Xong việc hoặc cần hỏi người dùng: "tool" = null, "text" là câu trả lời.
- Không tuyên bố thành công nếu chưa có tool_result xác nhận.
- Công cụ CHỈ được chọn qua structured output. Đừng gọi thẳng công cụ CAD như
  tool gốc của CLI: CLI này không có chúng, nó sẽ báo "No such tool available".
- Báo lỗi của CLI ("No such tool available", "Output does not match required
  schema") là lỗi KÊNH GỌI hoặc ĐỊNH DẠNG, không phải công cụ bị cấm. Mọi công
  cụ trong danh sách đều dùng được. Gặp lỗi này thì sửa định dạng và GIỮ NGUYÊN
  công cụ đã chọn; không đổi sang công cụ khác và không nói với người dùng rằng
  công cụ không dùng được.`

const PROXY_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE'
]

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
    'ANTHROPIC_API_KEY',
    // Network and CA settings the deployment writes to
    // /etc/cad-codex-bridge.env (deploy-codeco33.mjs): without them a host
    // behind a proxy cannot reach the API.
    ...PROXY_KEYS
  ])
    if (source[key]) env[key] = source[key]
  return env
}

/**
 * Turn cap of one CLI run.
 *
 * A healthy step is two turns: the model answers, the CLI records the
 * structured output. Four leaves room for one self-correction and stops a run
 * that has started talking to itself — the failure that cost two full model
 * calls per step and was invisible until it changed the answer.
 */
const DEFAULT_MAX_TURNS = 4

/** CLI arguments of one step. */
export function claudeArgs({ system, systemFile, model, maxTurns, toolNames }) {
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
    JSON.stringify(claudeStepSchema(toolNames)),
    '--max-turns',
    String(maxTurns || DEFAULT_MAX_TURNS),
    ...(model ? ['--model', model] : [])
  ]
}

/** How a message role is announced in the rendered history. */
const ROLE_LABEL = { user: 'NGƯỜI DÙNG', assistant: 'TRỢ LÝ' }

/**
 * The conversation so far, as plain text.
 *
 * The browser speaks Anthropic's format, so its history carries native
 * `tool_use` / `tool_result` blocks. Handing that JSON to a CLI that has no
 * CAD tools put 15–20 worked examples of exactly the forbidden calling style
 * in front of the model, in its own voice, growing with every step — and the
 * model followed the examples rather than the protocol: 16 of 27 steps on
 * 17/11/2026 were refused mid-run, each costing an extra model call. Rendered
 * as a record ("#3 GỌI …" / "#3 KẾT QUẢ: …") the same information says what
 * happened without demonstrating how to ask, and the only calling convention
 * left in the request is the structured output.
 *
 * Images stay Anthropic blocks: `onImage` takes one and returns its number,
 * which the text refers to.
 */
export function renderHistory(messages, onImage) {
  const numberOf = new Map()
  const lines = []
  let calls = 0
  const plain = block => {
    if (typeof block === 'string') return block
    if (block?.type === 'text') return block.text ?? ''
    if (block?.type === 'image') return `[Ảnh đính kèm ${onImage(block)}]`
    // Anything else (a thinking block, a format this bridge has not met) is
    // kept verbatim rather than dropped: losing history silently is worse.
    return JSON.stringify(block)
  }
  for (const message of messages) {
    const role =
      ROLE_LABEL[message?.role] ?? String(message?.role ?? '').toUpperCase()
    const content = Array.isArray(message?.content)
      ? message.content
      : [{ type: 'text', text: String(message?.content ?? '') }]
    for (const block of content) {
      if (block?.type === 'tool_use') {
        const number = ++calls
        if (block.id) numberOf.set(block.id, number)
        lines.push(
          `#${number} GỌI ${block.name} ${JSON.stringify(block.input ?? {})}`
        )
      } else if (block?.type === 'tool_result') {
        const number = numberOf.get(block.tool_use_id)
        const body = Array.isArray(block.content)
          ? block.content.map(plain).join('\n')
          : plain(block.content ?? '')
        lines.push(
          `#${number ?? '?'} KẾT QUẢ${block.is_error ? ' (LỖI)' : ''}: ${body}`
        )
      } else {
        const text = plain(block)
        if (text.trim()) lines.push(`${role}: ${text}`)
      }
    }
  }
  return lines.join('\n')
}

/**
 * The single stream-json user message: the tool list as JSON, the history as
 * text, images kept as Anthropic base64 blocks after it (referenced by number).
 */
export function claudeInput(body, retryNote) {
  const images = []
  const history = renderHistory(body.messages, block => {
    const source = block.source
    if (
      source?.type !== 'base64' ||
      !/^image\/(png|jpeg|webp|gif)$/.test(source.media_type)
    )
      throw new Error('Cầu nối Claude chỉ nhận ảnh đính kèm dạng base64.')
    images.push({ type: 'image', source })
    return images.length
  })
  const tools = (body.tools ?? []).map(t => ({
    name: t.name,
    description: t.description ?? '',
    input_schema: t.input_schema ?? { type: 'object' }
  }))
  const text =
    `Công cụ có sẵn (JSON):\n${JSON.stringify(tools)}\n\n` +
    'Lịch sử hội thoại (biên bản, không phải cách gọi công cụ: ' +
    '"#n GỌI <công cụ> <input JSON>" là công cụ bạn đã chọn ở bước trước, ' +
    '"#n KẾT QUẢ" là kết quả trình duyệt trả về' +
    `${images.length ? `; ${images.length} ảnh đính kèm gửi theo thứ tự ngay sau` : ''}):\n` +
    history +
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

/**
 * The name the model meant.
 *
 * Models name a tool the way their training data names one: `functions.x`,
 * `default_api.x`, a stray space, a backtick. None of that is a different
 * tool, and refusing it costs a whole extra model call to get the same name
 * back without the decoration.
 */
export function normalizeToolName(name) {
  return String(name)
    .trim()
    .replace(/^[`'"]+|[`'"]+$/g, '')
    .replace(/^(?:functions|default_api|tools|tool)\./, '')
    .trim()
}

/** The arguments the model meant, as an object, or `null` if they are not. */
function readToolInput(input) {
  if (input === undefined || input === null) return {}
  if (typeof input === 'string') {
    const text = input.trim()
    if (!text) return {}
    let parsed
    try {
      parsed = parseJsonText(text)
    } catch {
      return null
    }
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null
  }
  return typeof input === 'object' && !Array.isArray(input) ? input : null
}

/**
 * The step's answer, or why it is not acceptable.
 *
 * Every refusal carries a `code` as well as a sentence: the sentence is for the
 * model on the retry, the code is for the service log, where a sentence that
 * quotes the model would be a leak.
 */
export function readStepAnswer(result, toolNames) {
  let answer = result.structured_output
  if (answer === undefined || answer === null) {
    if (typeof result.result !== 'string')
      return { error: 'không có structured output', code: 'thieu_ket_qua' }
    try {
      answer = parseJsonText(result.result)
    } catch {
      return { error: 'kết quả không phải JSON hợp lệ', code: 'khong_json' }
    }
  }
  if (!answer || typeof answer !== 'object' || Array.isArray(answer))
    return {
      error: 'kết quả không phải đối tượng { text, tool }',
      code: 'sai_hinh_dang'
    }
  const text = typeof answer.text === 'string' ? answer.text : ''
  const tool = answer.tool ?? null
  if (tool === null) return { text, tool: null }
  if (typeof tool !== 'object' || typeof tool.name !== 'string')
    return {
      error: '"tool" phải là null hoặc { name, input }',
      code: 'sai_hinh_dang_tool'
    }
  const name = normalizeToolName(tool.name)
  if (!toolNames.includes(name))
    return {
      error: `công cụ "${name}" không có trong danh sách (${toolNames.join(', ') || 'trống'})`,
      code: 'cong_cu_la',
      name
    }
  const input = readToolInput(tool.input)
  if (input === null)
    return {
      error: `"input" của ${name} phải là đối tượng (hoặc chuỗi JSON của đối tượng đó)`,
      code: 'sai_input',
      name
    }
  return { text, tool: { name, input } }
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

/** The CLI's own tool, the only one a bare run has. */
const STRUCTURED_TOOL = 'StructuredOutput'

/** What the CLI refused, in one word, for the log and the retry note. */
function refusalReason(text) {
  if (/no such tool available/i.test(text)) return 'cong_cu_khong_co'
  if (/does not match required schema|required schema/i.test(text))
    return 'sai_schema'
  return 'khac'
}

/**
 * Runs the CLI once; returns its `result` event and what happened inside it.
 *
 * The trace is the point. A run answers in one `result` event, so everything
 * the CLI said to the model on the way — a tool it refused, a schema it sent
 * back — used to be invisible here even though it is what decided the answer.
 */
function runOnce({ spawn, command, args, env, cwd, input, signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let settled = false
    let result
    // Which tool each in-flight call was for, so a refusal can name it.
    const asked = new Map()
    const trace = { turns: null, refusals: [], maxTurns: false }
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
        if (event?.type === 'result') {
          result = event
          trace.turns =
            typeof event.num_turns === 'number' ? event.num_turns : null
          trace.maxTurns = event.subtype === 'error_max_turns'
        } else if (event?.type === 'assistant' || event?.type === 'user')
          for (const block of event.message?.content ?? []) {
            if (block?.type === 'tool_use') {
              // A bare run has one tool, so anything else is the model
              // reaching for a CAD tool the CLI cannot have.
              const native = block.name !== STRUCTURED_TOOL
              const name = native ? block.name : block.input?.tool?.name
              asked.set(block.id, {
                name: typeof name === 'string' ? name : null,
                native
              })
            } else if (block?.type === 'tool_result' && block.is_error) {
              const said =
                typeof block.content === 'string'
                  ? block.content
                  : JSON.stringify(block.content ?? '')
              const who = asked.get(block.tool_use_id)
              trace.refusals.push({
                ten: who?.name ?? null,
                goc: who?.native ?? null,
                ly_do: refusalReason(said)
              })
            }
          }
      } catch {
        // Non-JSON lines are not part of the protocol; ignore.
      }
    })
    child.on('close', code => {
      if (!result)
        return finish(
          new Error(`Claude CLI dừng (mã thoát ${code}) mà không trả kết quả.`)
        )
      // A run that ran out of turns still carries its usage and its trace, and
      // the step above can retry it; every other failure is terminal.
      if (!trace.maxTurns && (result.is_error || code !== 0))
        return finish(cliError(result, code))
      finish(null, { result, trace })
    })
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}

/**
 * Tools the CLI refused inside a run, kept only when the browser offers them.
 *
 * An unknown name is reported as `<lạ>`: the log is read by whoever is paged,
 * and a name invented by the model is the one thing in it that is not already
 * public in the request.
 */
function refusedTools(trace, toolNames) {
  const named = []
  for (const refusal of trace.refusals) {
    const name = refusal.ten ? normalizeToolName(refusal.ten) : null
    if (name && toolNames.includes(name)) named.push(name)
  }
  return [...new Set(named)]
}

/** The same list, as the log should carry it. */
function tracedNames(trace, toolNames) {
  return trace.refusals.map(refusal => {
    const name = refusal.ten ? normalizeToolName(refusal.ten) : null
    return {
      ten: name && toolNames.includes(name) ? name : '<lạ>',
      goc: refusal.goc,
      ly_do: refusal.ly_do
    }
  })
}

/**
 * What the model is told before it answers a second time.
 *
 * The old note said only "use a tool from the list", which is the one thing
 * the model had already believed it could not do: told that `tao_ho_so_mo` was
 * unavailable, it heard the note as confirmation. So the note now states the
 * opposite plainly, names the tool it gave up, and says the refusal came from
 * the channel rather than from the tool.
 */
export function buildRetryNote({
  answer,
  refused,
  abandoned,
  maxTurns,
  toolNames
}) {
  const lines = []
  if (abandoned) {
    const names = refused.map(name => `"${name}"`).join(', ')
    lines.push(
      `Lần trước CLI báo lỗi khi bạn chọn ${names} và bạn đã bỏ công cụ đó. ` +
        'Đó là lỗi kênh gọi/định dạng của CLI, KHÔNG phải công cụ bị cấm: ' +
        `${names} CÓ trong danh sách và dùng được. Chọn lại đúng công cụ phù ` +
        'hợp với việc cần làm, qua structured output, và sửa phần input nếu nó sai.'
    )
  } else if (answer.error) {
    lines.push(`Lần trả lời trước không hợp lệ: ${answer.error}.`)
    if (answer.name && toolNames.includes(answer.name))
      lines.push(
        `Công cụ "${answer.name}" CÓ trong danh sách; lỗi chỉ ở định dạng, giữ nguyên công cụ này.`
      )
  }
  if (maxTurns)
    lines.push(
      'Lần trước bạn chạm giới hạn số lượt của CLI. Trả lời ngay trong một lượt.'
    )
  lines.push(
    `Trả lời lại đúng structured output { "text", "tool" }, chỉ dùng công cụ có trong danh sách: ${toolNames.join(', ') || 'trống'}.`
  )
  return lines.join(' ')
}

/**
 * One diagnostic line per step, on the service's stdout.
 *
 * Counts, codes and tool names the browser itself sent — never a prompt, never
 * a drawing, never a credential. The incident this file carries was diagnosed
 * from token totals alone because nothing else existed; this is the line that
 * would have answered it in a second.
 */
function logStep(log, entry) {
  if (!log) return
  try {
    log(JSON.stringify({ tag: 'cad-agent-step', ...entry }))
  } catch {
    // Diagnostics never take a step down with them.
  }
}

/**
 * One browser-owned agent step through `claude -p`.
 *
 * @param body - Anthropic Messages request (system, messages, tools).
 * @param options.spawn - Injected by tests; defaults to child_process.spawn.
 * @param options.env - Source environment (defaults to process.env).
 * @param options.log - One-line diagnostics sink; `null` turns it off.
 */
export async function claudeMessage(
  body,
  { signal, spawn = nodeSpawn, env = process.env, log = console.log } = {}
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
      model: env.CAD_AGENT_CLAUDE_MODEL,
      maxTurns: Number(env.CAD_AGENT_CLAUDE_MAX_TURNS) || undefined,
      toolNames
    })
    const childEnv = claudeEnv(env)
    const usage = { input_tokens: 0, output_tokens: 0 }
    const steps = []
    let retryNote
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now()
      let run
      try {
        run = await runOnce({
          spawn,
          command,
          args,
          env: childEnv,
          cwd: directory,
          input: claudeInput(body, retryNote),
          signal,
          timeoutMs
        })
      } catch (error) {
        steps.push({ loi_cli: true, ms: Date.now() - started })
        logStep(log, {
          luot: steps.length,
          ket_qua: 'loi_cli',
          buoc: steps,
          tong: usage
        })
        throw error
      }
      const { result, trace } = run
      usage.input_tokens +=
        (result.usage?.input_tokens ?? 0) +
        (result.usage?.cache_creation_input_tokens ?? 0) +
        (result.usage?.cache_read_input_tokens ?? 0)
      usage.output_tokens += result.usage?.output_tokens ?? 0
      const answer = readStepAnswer(result, toolNames)
      const refused = refusedTools(trace, toolNames)
      const step = {
        luot: attempt + 1,
        turns: trace.turns,
        ms: Date.now() - started,
        ...(trace.maxTurns ? { het_luot: true } : {}),
        ...(trace.refusals.length
          ? { tu_choi: tracedNames(trace, toolNames) }
          : {}),
        dap_an: answer.error ? answer.code : 'ok',
        ...(answer.tool ? { chon: answer.tool.name } : {})
      }
      steps.push(step)
      // A tool the CLI refused mid-run, that the browser does offer, and that
      // the model then walked away from: the refusal was about the channel or
      // the format, and the answer below is the model acting on a ban that
      // does not exist. Everything else about the answer can be perfectly
      // well-formed, which is why this is checked separately.
      const abandoned =
        !answer.error &&
        refused.length > 0 &&
        (!answer.tool || !refused.includes(answer.tool.name))
      if (answer.error || abandoned) {
        if (abandoned) step.bo_cong_cu = refused
        if (attempt === 0) {
          retryNote = buildRetryNote({
            answer,
            refused,
            abandoned,
            maxTurns: trace.maxTurns,
            toolNames
          })
          continue
        }
        if (answer.error) {
          logStep(log, {
            luot: steps.length,
            ket_qua: 'khong_hop_le',
            ma_loi: answer.code,
            buoc: steps,
            tong: usage
          })
          throw new Error(
            `Claude CLI trả kết quả không hợp lệ sau 2 lần: ${answer.error}.`
          )
        }
        // Still well-formed: the answer is handed over, with the log saying it
        // was given up on a usable tool twice.
      }
      logStep(log, {
        luot: steps.length,
        ket_qua: abandoned ? 'ok_du_da_bo_cong_cu' : 'ok',
        cong_cu: answer.tool ? answer.tool.name : null,
        buoc: steps,
        tong: usage
      })
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
