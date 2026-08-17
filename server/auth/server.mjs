import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createDrawing,
  deleteDrawing,
  ERRORS,
  getDrawing,
  listDrawings,
  MAX_DRAWING_BYTES,
  updateDrawing
} from './drawings.mjs'
import {
  createLayer,
  createTerm,
  deleteLayer,
  deleteTerm,
  ERRORS as STANDARD_ERRORS,
  findContradictions,
  listLayers,
  listTerms,
  roleLayerMap,
  StandardsError,
  updateLayer,
  updateTerm
} from './standards.mjs'
import {
  AiError,
  buildStandardsBlock,
  ERRORS as AI_ERRORS,
  isConfigured as isAiConfigured,
  MAX_AI_REQUEST_BYTES,
  monthlyUsage,
  recordOutcome,
  sendToProvider
} from './ai.mjs'
import {
  ERRORS as TCVN_ERRORS,
  listTcvnDocuments,
  searchTcvn
} from './tcvn.mjs'
import {
  deleteTemplate,
  ERRORS as TEMPLATE_ERRORS,
  getTemplate,
  listTemplates,
  MAX_TEMPLATE_BYTES,
  publishTemplate,
  TemplateError,
  uploadTemplate
} from './templates.mjs'
import { hasRoleAtLeast, migrate, ROLES } from './schema.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3000)
const DB_PATH = process.env.DB_PATH || join(__dirname, 'auth.db')
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000
const COOKIE_NAME = 'cv_session'

const db = new DatabaseSync(DB_PATH)
migrate(db)

const hashPassword = (password, salt) =>
  scryptSync(password, salt, 64).toString('hex')

function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) return
  const salt = randomBytes(16).toString('hex')
  const hash = hashPassword(password, salt)
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) {
    db.prepare(
      "UPDATE users SET pass_hash = ?, salt = ?, status = 'active', role = 'admin' WHERE id = ?"
    ).run(hash, salt, existing.id)
  } else {
    db.prepare(
      "INSERT INTO users (email, name, pass_hash, salt, status, role) VALUES (?, ?, ?, ?, 'active', 'admin')"
    ).run(email, 'Administrator', hash, salt)
  }
}
seedAdmin()

// --- helpers ---------------------------------------------------------------

function json(res, code, body) {
  const data = JSON.stringify(body)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  res.end(data)
}

function readBody(req, limit = 10240) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', c => {
      size += c.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {})
      } catch {
        reject(new Error('invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function parseCookies(req) {
  const out = {}
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

function currentUser(req) {
  const token = parseCookies(req)[COOKIE_NAME]
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.status, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, Date.now())
  if (!row || row.status !== 'active') return null
  return row
}

function setSessionCookie(req, res, token, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
  )
}

// Simple in-memory rate limit: 20 attempts / 10 min per IP for auth endpoints
const attempts = new Map()
function rateLimited(req) {
  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || '?'
  const now = Date.now()
  const list = (attempts.get(ip) || []).filter(t => now - t < 600_000)
  list.push(now)
  attempts.set(ip, list)
  if (attempts.size > 10_000) attempts.clear()
  return list.length > 20
}

const PAGES = {
  '/login': readFileSync(join(__dirname, 'public/login.html')),
  '/register': readFileSync(join(__dirname, 'public/register.html')),
  '/admin': readFileSync(join(__dirname, 'public/admin.html')),
  '/standards': readFileSync(join(__dirname, 'public/standards.html'))
}

/**
 * Static assets these pages share.
 *
 * Only the theme so far. Read once at startup like the pages themselves: the
 * service serves a handful of files and a directory walk per request would be
 * both slower and a path-traversal surface for no gain.
 */
const ASSETS = {
  '/theme.css': {
    type: 'text/css; charset=utf-8',
    body: readFileSync(join(__dirname, 'public/theme.css'))
  }
}

// --- routes ----------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname
  try {
    if (req.method === 'GET' && PAGES[path]) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      })
      res.end(PAGES[path])
      return
    }

    if (req.method === 'GET' && ASSETS[path]) {
      res.writeHead(200, {
        'Content-Type': ASSETS[path].type,
        'Cache-Control': 'no-cache'
      })
      res.end(ASSETS[path].body)
      return
    }

    if (req.method === 'GET' && path === '/api/health') {
      json(res, 200, { ok: true })
      return
    }

    if (req.method === 'GET' && path === '/api/auth/check') {
      const user = currentUser(req)
      if (!user) {
        json(res, 401, { error: 'unauthorized' })
        return
      }
      res.writeHead(204, { 'X-Auth-User': user.email })
      res.end()
      return
    }

    if (req.method === 'GET' && path === '/api/auth/me') {
      const user = currentUser(req)
      if (!user) {
        json(res, 401, { error: 'unauthorized' })
        return
      }
      json(res, 200, {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isAdmin: user.role === ROLES.ADMIN
      })
      return
    }

    if (req.method === 'POST' && path === '/api/auth/register') {
      if (rateLimited(req)) {
        json(res, 429, { error: 'Quá nhiều yêu cầu, thử lại sau.' })
        return
      }
      const body = await readBody(req)
      const name = String(body.name || '').trim()
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      if (!name || name.length > 100) {
        json(res, 400, { error: 'Tên không hợp lệ.' })
        return
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        json(res, 400, { error: 'Email không hợp lệ.' })
        return
      }
      if (password.length < 8 || password.length > 200) {
        json(res, 400, { error: 'Mật khẩu phải có ít nhất 8 ký tự.' })
        return
      }
      if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
        json(res, 409, { error: 'Email đã được đăng ký.' })
        return
      }
      const salt = randomBytes(16).toString('hex')
      db.prepare(
        'INSERT INTO users (email, name, pass_hash, salt) VALUES (?, ?, ?, ?)'
      ).run(email, name, hashPassword(password, salt), salt)
      json(res, 201, {
        message: 'Đăng ký thành công. Tài khoản sẽ dùng được sau khi quản trị viên kích hoạt.'
      })
      return
    }

    if (req.method === 'POST' && path === '/api/auth/login') {
      if (rateLimited(req)) {
        json(res, 429, { error: 'Quá nhiều yêu cầu, thử lại sau.' })
        return
      }
      const body = await readBody(req)
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      const user = db
        .prepare('SELECT * FROM users WHERE email = ?')
        .get(email)
      const ok =
        user &&
        timingSafeEqual(
          Buffer.from(user.pass_hash, 'hex'),
          scryptSync(password, user.salt, 64)
        )
      if (!ok) {
        json(res, 401, { error: 'Email hoặc mật khẩu không đúng.' })
        return
      }
      if (user.status === 'pending') {
        json(res, 403, { error: 'Tài khoản đang chờ quản trị viên kích hoạt.' })
        return
      }
      if (user.status !== 'active') {
        json(res, 403, { error: 'Tài khoản đã bị vô hiệu hóa.' })
        return
      }
      const token = randomBytes(32).toString('hex')
      const now = Date.now()
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now)
      db.prepare(
        'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'
      ).run(token, user.id, now + SESSION_TTL_MS)
      setSessionCookie(req, res, token, SESSION_TTL_MS / 1000)
      json(res, 200, {
        message: 'ok',
        role: user.role,
        isAdmin: user.role === ROLES.ADMIN
      })
      return
    }

    if (req.method === 'POST' && path === '/api/auth/logout') {
      const token = parseCookies(req)[COOKIE_NAME]
      if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
      setSessionCookie(req, res, '', 0)
      json(res, 200, { message: 'ok' })
      return
    }

    // --- admin ---
    if (path.startsWith('/api/admin/')) {
      const user = currentUser(req)
      if (!user || !hasRoleAtLeast(user.role, ROLES.ADMIN)) {
        json(res, user ? 403 : 401, { error: 'forbidden' })
        return
      }

      if (req.method === 'GET' && path === '/api/admin/users') {
        const users = db
          .prepare(
            'SELECT id, email, name, status, role, created_at FROM users ORDER BY created_at DESC'
          )
          .all()
        json(res, 200, { users })
        return
      }

      // Role changes are an administrator's call, and demoting yourself is
      // refused for the same reason as deactivating yourself: it is the one
      // move that cannot be undone from inside the application.
      const roleMatch = path.match(/^\/api\/admin\/users\/(\d+)\/role$/)
      if (req.method === 'POST' && roleMatch) {
        const targetId = Number(roleMatch[1])
        const body = await readBody(req)
        const role = String(body.role ?? '')
        if (!Object.values(ROLES).includes(role)) {
          json(res, 400, {
            error: 'Vai trò không hợp lệ.',
            code: 'invalid_role',
            detail: { allowed: Object.values(ROLES) }
          })
          return
        }
        if (targetId === user.id && role !== ROLES.ADMIN) {
          json(res, 400, {
            error: 'Không thể tự hạ quyền của chính mình.',
            code: 'cannot_demote_self'
          })
          return
        }
        const changed = db
          .prepare('UPDATE users SET role = ? WHERE id = ?')
          .run(role, targetId)
        if (!changed.changes) {
          json(res, 404, { error: 'Không tìm thấy người dùng.', code: 'user_not_found' })
          return
        }
        json(res, 200, { message: 'ok', id: targetId, role })
        return
      }

      const m = path.match(/^\/api\/admin\/users\/(\d+)\/(activate|deactivate)$/)
      if (req.method === 'POST' && m) {
        const targetId = Number(m[1])
        const action = m[2]
        if (action === 'deactivate' && targetId === user.id) {
          json(res, 400, { error: 'Không thể vô hiệu hóa chính mình.' })
          return
        }
        const status = action === 'activate' ? 'active' : 'disabled'
        const r = db
          .prepare('UPDATE users SET status = ? WHERE id = ?')
          .run(status, targetId)
        if (!r.changes) {
          json(res, 404, { error: 'Không tìm thấy tài khoản.' })
          return
        }
        if (status === 'disabled') {
          db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId)
        }
        json(res, 200, { message: 'ok' })
        return
      }
    }

    // --- AI proxy ---
    //
    // The provider key stays here. A key handed to thirty engineers' laptops
    // is a key that has left the company, and no amount of encrypting it in
    // localStorage changes that — the browser has to decrypt it to use it.
    if (path.startsWith('/api/ai/')) {
      const user = currentUser(req)
      if (!user) {
        json(res, 401, { error: 'unauthorized', code: 'unauthorized' })
        return
      }

      if (req.method === 'GET' && path === '/api/ai/context') {
        const standards = buildStandardsBlock(db)
        json(res, 200, {
          configured: isAiConfigured(),
          standardsHash: standards.hash,
          // The text itself so the client can show what the assistant was
          // told, and check the hash it computes against the server's.
          standards: standards.text
        })
        return
      }

      if (req.method === 'GET' && path === '/api/ai/usage') {
        json(res, 200, { months: monthlyUsage(db) })
        return
      }

      // `/messages` matches the provider's own path, so a client can set its
      // Anthropic base URL to `/api/ai` and work with no other change.
      if (req.method === 'POST' && path === '/api/ai/messages') {
        try {
          const body = await readBody(req, MAX_AI_REQUEST_BYTES + 16 * 1024)
          const result = await sendToProvider(db, user, body)

          if (result.stream) {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-store',
              Connection: 'keep-alive',
              // Every nginx between here and the browser buffers a proxied
              // response by default, which turns a stream into one late lump —
              // the failure this route is being fixed for. This header is how
              // an upstream tells nginx not to.
              'X-Accel-Buffering': 'no',
              'x-cad-call-id': String(result.callId),
              'x-cad-standards-hash': result.standardsHash
            })
            for await (const chunk of result.stream) {
              res.write(chunk)
            }
            res.end()
            return
          }

          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'x-cad-call-id': String(result.callId),
            'x-cad-standards-hash': result.standardsHash
          })
          res.end(JSON.stringify(result.body))
        } catch (error) {
          if (!(error instanceof AiError)) throw error
          json(res, error.status ?? 400, {
            error: 'Không gọi được trợ lý AI.',
            code: error.code,
            detail: error.detail ?? null
          })
        }
        return
      }

      const outcomeMatch = path.match(/^\/api\/ai\/calls\/(\d+)\/outcome$/)
      if (req.method === 'POST' && outcomeMatch) {
        const body = await readBody(req)
        if (!recordOutcome(db, user.id, Number(outcomeMatch[1]), body)) {
          json(res, 404, { error: 'Không tìm thấy lượt gọi.', code: AI_ERRORS.INVALID })
          return
        }
        json(res, 200, { message: 'ok' })
        return
      }

      json(res, 405, { error: 'Phương thức không hỗ trợ.', code: 'method_not_allowed' })
      return
    }

    // --- TCVN lookup ---
    //
    // Read-only and open to every member: these are published national
    // standards, and the assistant reaches for them mid-drawing, so a
    // permission check here would only mean the drawing gets invented numbers
    // instead. It stays behind the session because everything under /api does.
    if (path === '/api/tcvn/search' || path === '/api/tcvn/docs') {
      if (!currentUser(req)) {
        json(res, 401, { error: 'unauthorized', code: 'unauthorized' })
        return
      }
      if (req.method !== 'GET') {
        json(res, 405, {
          error: 'Phương thức không hỗ trợ.',
          code: 'method_not_allowed'
        })
        return
      }

      try {
        if (path === '/api/tcvn/docs') {
          json(res, 200, { documents: listTcvnDocuments() })
          return
        }
        json(res, 200, {
          results: searchTcvn(url.searchParams.get('q'), {
            limit: url.searchParams.get('limit'),
            maxChars: url.searchParams.get('maxChars')
          })
        })
      } catch (error) {
        if (error.code === TCVN_ERRORS.EMPTY_QUERY) {
          json(res, 400, {
            error: 'Cần có câu hỏi để tra cứu.',
            code: error.code
          })
          return
        }
        if (error.code === TCVN_ERRORS.NO_CORPUS) {
          // The service runs without the corpus rather than refusing to start:
          // every other feature works, and this one says plainly why it cannot.
          json(res, 503, {
            error: 'Bộ tiêu chuẩn chưa được cài đặt trên máy chủ.',
            code: error.code
          })
          return
        }
        throw error
      }
      return
    }

    // --- template library ---
    //
    // Reading is open to every member; uploading is not. An upload is code
    // that will execute in everybody else's browser, which is why Story 2.4
    // introduced a role for it rather than reusing the admin flag.
    if (path === '/api/templates' || path.startsWith('/api/templates/')) {
      const user = currentUser(req)
      if (!user) {
        json(res, 401, { error: 'unauthorized', code: 'unauthorized' })
        return
      }

      const rest = path.slice('/api/templates'.length).replace(/^\//, '')
      const [templateId, version, action] = rest.split('/').map(part =>
        part ? decodeURIComponent(part) : ''
      )

      const failTemplate = error => {
        if (!(error instanceof TemplateError)) throw error
        const status =
          error.code === TEMPLATE_ERRORS.NOT_FOUND
            ? 404
            : error.code === TEMPLATE_ERRORS.FORBIDDEN
              ? 403
              : error.code === TEMPLATE_ERRORS.VERSION_CONFLICT
                ? 409
                : error.code === TEMPLATE_ERRORS.TOO_LARGE
                  ? 413
                  : 400
        json(res, status, {
          error: 'Không nạp được template.',
          code: error.code,
          detail: error.detail ?? null
        })
      }

      if (req.method === 'GET' && !templateId) {
        json(res, 200, { templates: listTemplates(db, user.id) })
        return
      }

      if (req.method === 'GET' && templateId && version) {
        const template = getTemplate(db, templateId, version)
        if (!template) {
          json(res, 404, {
            error: 'Không tìm thấy template.',
            code: TEMPLATE_ERRORS.NOT_FOUND
          })
          return
        }
        // A draft belongs to its author until it has been shown to work.
        if (template.status !== 'published' && template.uploadedBy !== user.id) {
          json(res, 404, {
            error: 'Không tìm thấy template.',
            code: TEMPLATE_ERRORS.NOT_FOUND
          })
          return
        }
        json(res, 200, { template })
        return
      }

      // Everything below writes, and writing needs the author role. Checked
      // here on the server: a client that hides the upload button is not a
      // permission, it is a suggestion.
      if (!hasRoleAtLeast(user.role, ROLES.AUTHOR)) {
        json(res, 403, {
          error: 'Chỉ tác giả template mới nạp được template.',
          code: TEMPLATE_ERRORS.FORBIDDEN
        })
        return
      }

      if (req.method === 'POST' && !templateId) {
        const body = await readBody(req, MAX_TEMPLATE_BYTES + 64 * 1024)
        try {
          const result = uploadTemplate(db, user.id, body, {
            knownRoles: listTerms(db).map(term => term.role),
            knownLayers: listLayers(db).map(layer => layer.name)
          })
          json(res, 201, result)
        } catch (error) {
          failTemplate(error)
        }
        return
      }

      if (req.method === 'POST' && templateId && version && action === 'publish') {
        try {
          json(res, 200, {
            template: publishTemplate(db, user.id, templateId, version)
          })
        } catch (error) {
          failTemplate(error)
        }
        return
      }

      if (req.method === 'DELETE' && templateId && version) {
        if (!deleteTemplate(db, templateId, version)) {
          json(res, 404, {
            error: 'Không tìm thấy template.',
            code: TEMPLATE_ERRORS.NOT_FOUND
          })
          return
        }
        json(res, 200, { message: 'ok' })
        return
      }

      json(res, 405, { error: 'Phương thức không hỗ trợ.', code: 'method_not_allowed' })
      return
    }

    // --- standardisation layer ---
    //
    // Readable and writable by every activated member: this is the company's
    // own vocabulary, and a dictionary only stays accurate if the people who
    // use it can fix it. Story 2.4 adds a stricter role for uploading template
    // *code*, which is a different thing entirely.
    if (path === '/api/standards' || path.startsWith('/api/standards/')) {
      const user = currentUser(req)
      if (!user) {
        json(res, 401, { error: 'unauthorized', code: 'unauthorized' })
        return
      }

      const rest = path.slice('/api/standards'.length).replace(/^\//, '')
      const [kind, rawKey] = rest.split('/')
      const key = rawKey ? decodeURIComponent(rawKey) : ''

      const handle = fn => {
        try {
          fn()
        } catch (error) {
          if (!(error instanceof StandardsError)) throw error
          const status =
            error.code === STANDARD_ERRORS.NOT_FOUND
              ? 404
              : error.code === STANDARD_ERRORS.INVALID
                ? 400
                : 409
          json(res, status, {
            error: 'Không lưu được mục chuẩn hóa.',
            code: error.code,
            detail: error.detail ?? null
          })
        }
      }

      if (kind === 'check' && req.method === 'GET') {
        json(res, 200, { contradictions: findContradictions(db) })
        return
      }

      // The role → layer mapping the editor draws with. Served separately from
      // the term list because the client needs only this shape, on every
      // document open, and sending the whole dictionary for it would be waste.
      if (kind === 'role-layers' && req.method === 'GET') {
        json(res, 200, { roleLayers: roleLayerMap(db) })
        return
      }

      if (kind === 'terms') {
        if (req.method === 'GET' && !key) {
          json(res, 200, {
            terms: listTerms(db, { search: url.searchParams.get('q') ?? undefined })
          })
          return
        }
        if (req.method === 'POST' && !key) {
          const body = await readBody(req, 64 * 1024)
          handle(() => json(res, 201, { term: createTerm(db, user.id, body) }))
          return
        }
        if (req.method === 'PATCH' && key) {
          const body = await readBody(req, 64 * 1024)
          handle(() => json(res, 200, { term: updateTerm(db, user.id, key, body) }))
          return
        }
        if (req.method === 'DELETE' && key) {
          if (!deleteTerm(db, key)) {
            json(res, 404, {
              error: 'Không tìm thấy thuật ngữ.',
              code: STANDARD_ERRORS.NOT_FOUND
            })
            return
          }
          json(res, 200, { message: 'ok' })
          return
        }
      }

      if (kind === 'layers') {
        if (req.method === 'GET' && !key) {
          json(res, 200, { layers: listLayers(db) })
          return
        }
        if (req.method === 'POST' && !key) {
          const body = await readBody(req, 64 * 1024)
          handle(() => json(res, 201, { layer: createLayer(db, user.id, body) }))
          return
        }
        if (req.method === 'PATCH' && key) {
          const body = await readBody(req, 64 * 1024)
          handle(() => json(res, 200, { layer: updateLayer(db, user.id, key, body) }))
          return
        }
        if (req.method === 'DELETE' && key) {
          if (!deleteLayer(db, key)) {
            json(res, 404, {
              error: 'Không tìm thấy layer.',
              code: STANDARD_ERRORS.NOT_FOUND
            })
            return
          }
          json(res, 200, { message: 'ok' })
          return
        }
      }

      json(res, 405, { error: 'Phương thức không hỗ trợ.', code: 'method_not_allowed' })
      return
    }

    // --- drawings ---
    if (path === '/api/drawings' || path.startsWith('/api/drawings/')) {
      const user = currentUser(req)
      if (!user) {
        json(res, 401, { error: 'unauthorized', code: 'unauthorized' })
        return
      }

      const id = path.startsWith('/api/drawings/')
        ? decodeURIComponent(path.slice('/api/drawings/'.length))
        : ''

      if (req.method === 'GET' && !id) {
        json(res, 200, {
          drawings: listDrawings(db, user.id, {
            search: url.searchParams.get('q') ?? undefined
          })
        })
        return
      }

      if (req.method === 'GET' && id) {
        const row = getDrawing(db, user.id, id)
        if (!row) {
          json(res, 404, { error: 'Không tìm thấy bản vẽ.', code: ERRORS.NOT_FOUND })
          return
        }
        json(res, 200, {
          id: row.id,
          name: row.name,
          templateId: row.template_id,
          templateVersion: row.template_version,
          params: row.params ? JSON.parse(row.params) : null,
          batchId: row.batch_id,
          revision: row.revision,
          updatedAt: row.updated_at,
          dxf: row.dxf ? Buffer.from(row.dxf).toString('utf8') : null
        })
        return
      }

      if (req.method === 'POST' && !id) {
        const body = await readBody(req, MAX_DRAWING_BYTES)
        const created = createDrawing(db, user.id, body)
        json(res, 201, created)
        return
      }

      if (req.method === 'PUT' && id) {
        const body = await readBody(req, MAX_DRAWING_BYTES)
        const result = updateDrawing(db, user.id, id, body)
        if (result.error === ERRORS.NOT_FOUND) {
          json(res, 404, { error: 'Không tìm thấy bản vẽ.', code: result.error })
          return
        }
        if (result.error === ERRORS.CONFLICT) {
          json(res, 409, {
            error:
              'Bản vẽ đã được sửa ở nơi khác. Mở lại để xem bản mới nhất trước khi lưu.',
            code: result.error,
            currentRevision: result.currentRevision
          })
          return
        }
        json(res, 200, result)
        return
      }

      if (req.method === 'DELETE' && id) {
        if (!deleteDrawing(db, user.id, id)) {
          json(res, 404, { error: 'Không tìm thấy bản vẽ.', code: ERRORS.NOT_FOUND })
          return
        }
        res.writeHead(204)
        res.end()
        return
      }
    }

    json(res, 404, { error: 'not found' })
  } catch (err) {
    const tooLarge = err.message === 'body too large'
    json(res, tooLarge ? 413 : 400, {
      error: tooLarge
        ? 'Dữ liệu gửi lên vượt quá dung lượng cho phép.'
        : err.message || 'bad request',
      code: tooLarge ? ERRORS.TOO_LARGE : ERRORS.INVALID
    })
  }
})

server.listen(PORT, () => {
  console.log(`auth service listening on :${PORT}, db: ${DB_PATH}`)
})
