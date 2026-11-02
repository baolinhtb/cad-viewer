import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

/** A local stdio client. Credentials remain with Codex; the browser receives
 * only CAD tool arguments/results. This never attaches to the controlling
 * coding session and never exposes a remote shell endpoint. */
export class CodexCadSession {
  constructor({
    cwd,
    tools,
    execute,
    instructions = '',
    onText = () => {},
    command = 'codex',
    timeoutMs = 240000
  }) {
    this.cwd = cwd
    this.tools = tools
    this.execute = execute
    this.instructions = instructions
    this.onText = onText
    this.timeoutMs = timeoutMs
    this.requests = new Map()
    this.sequence = 0
    this.queue = Promise.resolve()
    this.child = spawn(
      command,
      [
        'app-server',
        '--listen',
        'stdio://',
        '--disable',
        'shell_tool',
        '--disable',
        'multi_agent'
      ],
      {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    )
    this.child.stderr.on('data', () => {}) // Runtime logs can contain account context.
    this.child.stdin.on('error', error => this.fail(error))
    this.child.on('error', error => this.fail(error))
    this.child.on('exit', code =>
      this.fail(new Error(`Codex app-server đã dừng (${code}).`))
    )
    this.lines = createInterface({ input: this.child.stdout })
    this.lines.on('line', line => {
      try {
        this.receive(JSON.parse(line))
      } catch (error) {
        this.fail(error)
      }
    })
  }

  send(message) {
    if (this.failure) throw this.failure
    this.child.stdin.write(JSON.stringify(message) + '\n')
  }

  request(method, params, timeoutMs = 30000) {
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(id)
        reject(new Error(`Hết thời gian chờ Codex: ${method}.`))
      }, timeoutMs)
      this.requests.set(id, { resolve, reject, timer })
      try {
        this.send({ id, method, params })
      } catch (error) {
        clearTimeout(timer)
        this.requests.delete(id)
        reject(error)
      }
    })
  }

  receive(message) {
    if (message.method === 'item/tool/call' && message.id !== undefined) {
      // Tool requests can arrive together; CAD database writes must not overlap.
      this.queue = this.queue
        .then(async () => {
          let result
          try {
            const p = message.params
            if (
              p.threadId !== this.threadId ||
              !this.tools.some(t => t.name === p.tool)
            )
              throw new Error('Công cụ hoặc phiên CAD không hợp lệ.')
            result = await this.execute(p.tool, p.arguments)
          } catch (error) {
            result = { ok: false, message: error.message }
          }
          this.send({
            id: message.id,
            result: {
              contentItems: [
                { type: 'inputText', text: JSON.stringify(result) }
              ],
              success: result.ok !== false
            }
          })
        })
        .catch(error => this.fail(error))
      return
    }
    if (message.method && message.id !== undefined) {
      // The test session does not grant filesystem/network permissions or run
      // tools outside the CAD allowlist. Surface unsupported approval flows.
      this.send({
        id: message.id,
        error: {
          code: -32601,
          message: 'Phiên kiểm thử chỉ hỗ trợ công cụ CAD.'
        }
      })
      return
    }
    if (message.id !== undefined) {
      const pending = this.requests.get(message.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.requests.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
      return
    }
    if (message.method === 'item/agentMessage/delta')
      this.onText(message.params.delta)
    if (
      message.method === 'turn/completed' &&
      message.params.threadId === this.threadId &&
      this.turn
    ) {
      const turn = message.params.turn
      if (turn.status === 'completed') this.turn.resolve(turn)
      else
        this.turn.reject(
          new Error(
            turn.error?.message || `Lượt Codex kết thúc: ${turn.status}.`
          )
        )
    }
  }

  async initialize() {
    await this.request('initialize', {
      clientInfo: {
        name: 'cad_viewer_codex_test',
        title: 'CAD Viewer live test',
        version: '0.1.0'
      },
      capabilities: { experimentalApi: true }
    })
    this.send({ method: 'initialized', params: {} })
    const result = await this.request('thread/start', {
      cwd: this.cwd,
      ephemeral: true,
      sandbox: 'read-only',
      approvalPolicy: 'never',
      developerInstructions:
        'Bạn là trợ lý CAD tiếng Việt. Chỉ dùng các công cụ CAD được cung cấp; không dùng shell, sửa mã, hay tạo tác vụ/agent khác. Thông số chiều dài mm, cao độ m, độ dốc %. Dùng công cụ thay vì mô tả là đã làm. Tạo hồ sơ mới bằng tao_ho_so_mo; sửa bằng sua_ho_so_mo với mã từ kết quả trước hoặc doc_ho_so_hien_tai. Không tự sửa giá trị không được yêu cầu; thiếu dữ liệu thiết kế thì giữ trạng thái bản nháp. Không tự đoán chiều dài cọc hay thiết kế lại cốt thép. Khi xuất PDF gọi xuat_ho_so_mo dinh_dang=pdf. Nói ngắn gọn kết quả và các mục chưa hoàn thiện.\n' +
        this.instructions,
      dynamicTools: this.tools.map(t => ({
        type: 'function',
        name: t.name,
        description: t.description,
        inputSchema: t.input_schema
      }))
    })
    this.threadId = result.thread.id
    this.model = result.model
    return { threadId: this.threadId, model: this.model }
  }

  async prompt(text, images = []) {
    if (this.turn) throw new Error('Một lượt Codex khác đang chạy.')
    let timer
    let turnId
    const completion = new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('Lượt Codex vượt thời gian kiểm thử.')),
        this.timeoutMs
      )
      this.turn = { resolve, reject }
    })
    // Attach immediately so a startup/transport failure cannot become an
    // unhandled rejection while turn/start is still pending.
    completion.catch(() => {})
    try {
      const started = await this.request('turn/start', {
        threadId: this.threadId,
        input: [
          { type: 'text', text, text_elements: [] },
          ...images.map(url => ({ type: 'image', url }))
        ]
      })
      turnId = started.turn.id
      const result = await completion
      await this.queue
      return { id: started.turn.id, status: result.status }
    } catch (error) {
      try {
        if (turnId)
          await this.request(
            'turn/interrupt',
            { threadId: this.threadId, turnId },
            2000
          )
      } catch {
        /* Process closes below on test failure. */
      }
      throw error
    } finally {
      clearTimeout(timer)
      this.turn = undefined
    }
  }

  fail(error) {
    this.failure ??= error
    for (const p of this.requests.values()) {
      clearTimeout(p.timer)
      p.reject(error)
    }
    this.requests.clear()
    this.turn?.reject(error)
  }

  async close() {
    if (this.closing) return this.closing
    this.lines.close()
    if (
      !this.child.pid ||
      this.child.exitCode !== null ||
      this.child.signalCode
    )
      return
    const exited = new Promise(resolve => this.child.once('exit', resolve))
    this.child.kill('SIGTERM')
    const timer = setTimeout(() => this.child.kill('SIGKILL'), 2000)
    this.closing = exited.finally(() => clearTimeout(timer))
    await this.closing
  }
}
