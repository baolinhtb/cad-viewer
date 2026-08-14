import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3000)
const DB_PATH = process.env.DB_PATH || join(__dirname, 'auth.db')
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000
const COOKIE_NAME = 'cv_session'

const db = new DatabaseSync(DB_PATH)
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL
  );
`)

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
      "UPDATE users SET pass_hash = ?, salt = ?, status = 'active', is_admin = 1 WHERE id = ?"
    ).run(hash, salt, existing.id)
  } else {
    db.prepare(
      "INSERT INTO users (email, name, pass_hash, salt, status, is_admin) VALUES (?, ?, ?, ?, 'active', 1)"
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', c => {
      size += c.length
      if (size > 10240) {
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
      `SELECT u.id, u.email, u.name, u.status, u.is_admin
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
  '/admin': readFileSync(join(__dirname, 'public/admin.html'))
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
        isAdmin: !!user.is_admin
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
      json(res, 200, { message: 'ok', isAdmin: !!user.is_admin })
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
      if (!user || !user.is_admin) {
        json(res, user ? 403 : 401, { error: 'forbidden' })
        return
      }

      if (req.method === 'GET' && path === '/api/admin/users') {
        const users = db
          .prepare(
            'SELECT id, email, name, status, is_admin, created_at FROM users ORDER BY created_at DESC'
          )
          .all()
        json(res, 200, { users })
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

    json(res, 404, { error: 'not found' })
  } catch (err) {
    json(res, err.message === 'body too large' ? 413 : 400, {
      error: err.message || 'bad request'
    })
  }
})

server.listen(PORT, () => {
  console.log(`auth service listening on :${PORT}, db: ${DB_PATH}`)
})
