/* global process, Buffer */
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { CodexCadSession } from './app-server.mjs'
import { claudeMessage } from './claude-step.mjs'

/**
 * Backends, chosen by CAD_AGENT_BACKEND: `claude` (default, Claude Code CLI)
 * or `codex` (Codex app-server, kept for rollback). Both answer one step in
 * the same shape.
 */
export const BACKENDS = {
  claude: { provider: 'claude-cli', name: 'Claude CLI', infer: claudeMessage },
  codex: { provider: 'codex-cli', name: 'Codex CLI', infer: codexMessage }
}

/** The backend named by `value` (CAD_AGENT_BACKEND), or why it is invalid. */
export function selectBackend(value = process.env.CAD_AGENT_BACKEND) {
  const key = (value || 'claude').trim().toLowerCase()
  const backend = BACKENDS[key]
  if (!backend)
    throw new Error(
      `CAD_AGENT_BACKEND="${value}" không hợp lệ; chọn claude hoặc codex.`
    )
  return backend
}

// Translate a single browser-owned agent step. On a tool call we return the
// request without executing it here; the browser executes and supplies the
// result in the next request. Each step has a fresh, isolated Codex thread.
export async function codexMessage(
  body,
  { signal, Session = CodexCadSession } = {}
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cad-codex-step-'))
  let session, pending
  try {
    const tools = body.tools ?? []
    if (
      !Array.isArray(body.messages) ||
      !body.messages.length ||
      !Array.isArray(tools)
    )
      throw new Error('Thiếu messages hoặc tools không hợp lệ.')
    const images = []
    const messages = body.messages.map(message => ({
      ...message,
      content: Array.isArray(message.content)
        ? message.content.map(block => {
            if (block.type !== 'image') return block
            const source = block.source
            if (
              source?.type !== 'base64' ||
              !/^image\/(png|jpeg|webp|gif)$/.test(source.media_type)
            )
              throw new Error('Codex bridge chỉ nhận ảnh đính kèm dạng base64.')
            images.push(`data:${source.media_type};base64,${source.data}`)
            return { type: 'text', text: `[Ảnh đính kèm ${images.length}]` }
          })
        : message.content
    }))
    const system =
      typeof body.system === 'string'
        ? body.system
        : (body.system ?? []).map(block => block.text ?? '').join('\n')
    let resolveTool
    const toolReady = new Promise(resolve => {
      resolveTool = resolve
    })
    let text = ''
    session = new Session({
      cwd: directory,
      command: process.env.CODEX_COMMAND || 'codex',
      tools,
      instructions: `${system}\nLịch sử được cung cấp dưới dạng JSON. Tiếp tục từ cuối lịch sử; không lặp lại công cụ đã có kết quả. Chỉ yêu cầu một công cụ cần thiết tiếp theo hoặc trả lời cuối. Không tuyên bố thành công nếu chưa có tool_result xác nhận.`,
      execute: (name, input) => {
        resolveTool({
          type: 'tool_use',
          id: `toolu_${randomUUID()}`,
          name,
          input
        })
        // Execution belongs exclusively to the browser, never this process.
        return new Promise(() => {})
      },
      onText: delta => {
        text += delta
      }
    })
    const onAbort = () => session.close().catch(() => {})
    if (signal?.aborted) throw new Error('Yêu cầu đã bị hủy.')
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const connected = await session.initialize()
      pending = session.prompt(
        `Tiếp tục cuộc hội thoại CAD sau đây:\n${JSON.stringify(messages)}`,
        images
      )
      pending.catch(() => {})
      const tool = await Promise.race([toolReady, pending.then(() => null)])
      return {
        id: `msg_${randomUUID()}`,
        type: 'message',
        role: 'assistant',
        model: connected.model ?? 'codex-cli',
        content: [
          ...(text.trim() ? [{ type: 'text', text }] : []),
          ...(tool ? [tool] : [])
        ],
        stop_reason: tool ? 'tool_use' : 'end_turn',
        stop_sequence: null,
        // CLI subscription usage has no Anthropic token/cost equivalence.
        usage: { input_tokens: 0, output_tokens: 0 }
      }
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  } finally {
    await session?.close()
    await pending?.catch(() => {})
    await rm(directory, { recursive: true, force: true })
  }
}

export function anthropicEvents(message) {
  const event = (type, data) =>
    `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
  let result = event('message_start', {
    message: { ...message, content: [], stop_reason: null }
  })
  for (const [index, block] of message.content.entries()) {
    const tool = block.type === 'tool_use'
    result += event('content_block_start', {
      index,
      content_block: tool ? { ...block, input: {} } : { type: 'text', text: '' }
    })
    result += event('content_block_delta', {
      index,
      delta: tool
        ? {
            type: 'input_json_delta',
            partial_json: JSON.stringify(block.input)
          }
        : { type: 'text_delta', text: block.text }
    })
    result += event('content_block_stop', { index })
  }
  result += event('message_delta', {
    delta: { stop_reason: message.stop_reason, stop_sequence: null },
    usage: { output_tokens: message.usage?.output_tokens ?? 0 }
  })
  return result + event('message_stop', {})
}

export function createBridge({
  allowedPeers = ['127.0.0.1'],
  maxConcurrent = 2,
  backend = selectBackend(),
  infer = backend.infer,
  provider = backend.provider,
  name = backend.name
} = {}) {
  let active = 0
  return createServer(async (req, res) => {
    const peer = req.socket.remoteAddress?.replace(/^::ffff:/, '')
    if (!allowedPeers.includes(peer)) {
      res.writeHead(403).end()
      return
    }
    if (req.method === 'GET' && req.url === '/health') {
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ ok: true, provider, active }))
      return
    }
    if (req.method !== 'POST' || req.url !== '/messages') {
      res.writeHead(404).end()
      return
    }
    if (active >= maxConcurrent) {
      res.writeHead(429, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          error: { message: `${name} đang bận. Vui lòng thử lại sau.` }
        })
      )
      return
    }
    active++
    let heartbeat
    const abort = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) abort.abort()
    })
    try {
      const chunks = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 600 * 1024) throw new Error('Yêu cầu vượt giới hạn 600 KiB.')
        chunks.push(chunk)
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (body.stream) {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          'x-accel-buffering': 'no'
        })
        res.write(`: ${name} connected\n\n`)
        heartbeat = setInterval(() => res.write(': waiting\n\n'), 10000)
      }
      const message = await infer(body, { signal: abort.signal })
      if (abort.signal.aborted) return
      if (body.stream) res.end(anthropicEvents(message))
      else
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify(message))
    } catch (error) {
      if (abort.signal.aborted) return
      const payload = {
        type: 'error',
        error: { type: 'api_error', message: error.message }
      }
      if (res.headersSent)
        res.end(`event: error\ndata: ${JSON.stringify(payload)}\n\n`)
      else
        res
          .writeHead(502, { 'content-type': 'application/json' })
          .end(JSON.stringify(payload))
    } finally {
      clearInterval(heartbeat)
      active--
    }
  })
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const host = process.env.CODEX_BRIDGE_HOST || '127.0.0.1'
  const port = Number(process.env.CODEX_BRIDGE_PORT || 4180)
  const backend = selectBackend()
  const server = createBridge({
    allowedPeers: (process.env.CODEX_BRIDGE_PEERS || '127.0.0.1').split(','),
    backend
  })
  server.listen(port, host, () =>
    console.log(
      `CAD agent bridge (${backend.provider}) listening ${host}:${port}`
    )
  )
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => server.close(() => process.exit(0)))
}
