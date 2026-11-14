// Runs the real auth server against an isolated database. No production users.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(root + '/packages/cad-editor-demo/package.json')
const { chromium } = require('@playwright/test')
const output = await mkdtemp(path.join(tmpdir(), 'cad-users-test-'))
const adminPassword = randomBytes(16).toString('hex')
const password = randomBytes(16).toString('hex')
const resetPassword = randomBytes(16).toString('hex')
const email = 'member@example.invalid'
let browser, server
const report = {}
try {
  server = spawn(process.execPath, ['server/auth/server.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: '4399',
      DB_PATH: output + '/test.db',
      ADMIN_EMAIL: 'admin@example.invalid',
      ADMIN_PASSWORD: adminPassword
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Auth server startup timeout')),
      15000
    )
    server.once('exit', code => {
      clearTimeout(timer)
      reject(new Error('Auth startup failed: ' + code))
    })
    server.stdout.on('data', data => {
      if (String(data).includes('auth service listening')) {
        clearTimeout(timer)
        resolve()
      }
    })
  })
  browser = await chromium.launch({
    headless: true,
    executablePath:
      '/root/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell'
  })
  const base = 'http://127.0.0.1:4399'
  const admin = await browser.newContext({
    baseURL: base,
    viewport: { width: 1440, height: 1000 }
  })
  const anon = await browser.newContext({ baseURL: base })
  assert.equal((await anon.request.get('/api/admin/users')).status(), 401)
  assert.equal(
    (
      await admin.request.post('/api/auth/login', {
        data: { email: 'admin@example.invalid', password: adminPassword }
      })
    ).status(),
    200
  )
  const page = await admin.newPage()
  await page.goto('/admin')
  await page.locator('#content').waitFor({ state: 'visible' })
  await page
    .getByRole('button', { name: 'Thêm tài khoản', exact: true })
    .click()
  await page.locator('#name').fill('Kỹ sư thử nghiệm')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#save').click()
  await page.locator('#editor').waitFor({ state: 'hidden' })
  const users = await (await admin.request.get('/api/admin/users')).json()
  const user = users.users.find(u => u.email === email)
  assert(user)
  const row = page.locator(`tr[data-id="${user.id}"]`)
  await row.waitFor()
  assert.equal(user.role, 'member')
  const member = await browser.newContext({ baseURL: base })
  assert.equal(
    (
      await member.request.post('/api/auth/login', {
        data: { email, password }
      })
    ).status(),
    200
  )
  for (const [method, url, data] of [
    ['get', '/api/admin/users'],
    [
      'post',
      '/api/admin/users',
      {
        name: 'Escalate',
        email: 'evil@example.invalid',
        password,
        role: 'admin'
      }
    ],
    ['patch', `/api/admin/users/${user.id}`, { role: 'admin' }],
    ['delete', '/api/admin/users/1']
  ])
    assert.equal((await member.request[method](url, { data })).status(), 403)
  assert.equal(
    (
      await member.request.post('/api/standards/layers', {
        data: { name: 'Forbidden', meaning: 'Not allowed' }
      })
    ).status(),
    403
  )
  const deniedPage = await member.newPage()
  await deniedPage.goto('/admin')
  await deniedPage
    .getByText('Bạn không có quyền quản lý tài khoản.', { exact: true })
    .waitFor()
  assert.equal(await deniedPage.locator('#content').isVisible(), false)
  await deniedPage.goto('/standards')
  await deniedPage.locator('#permissions').waitFor({ state: 'visible' })
  assert.equal(await deniedPage.locator('#t-add').isVisible(), false)
  assert.equal(
    (
      await admin.request.patch('/api/admin/users/1', {
        data: { role: 'member' }
      })
    ).status(),
    400
  )
  assert.equal((await admin.request.delete('/api/admin/users/1')).status(), 400)
  assert.equal(
    (
      await admin.request.post('/api/admin/users', {
        headers: { Origin: 'https://evil.invalid' },
        data: { name: 'X', email: 'cross@example.invalid', password }
      })
    ).status(),
    403
  )
  // Change profile and role through the actual form; old login must be invalidated.
  await row.getByRole('button', { name: 'Sửa', exact: true }).click()
  const literal = '<img src=x onerror="window.accountXss=1">'
  await page.locator('#name').fill(literal)
  await page.locator('#role').selectOption('author')
  await page.locator('#save').click()
  await page.locator('#editor').waitFor({ state: 'hidden' })
  await row.getByText(literal, { exact: true }).waitFor()
  assert.equal(await page.locator('img[src="x"]').count(), 0)
  assert.equal((await member.request.get('/api/auth/me')).status(), 401)
  assert.equal(
    (
      await member.request.post('/api/auth/login', {
        data: { email, password }
      })
    ).status(),
    200
  )
  assert.equal(
    (
      await member.request.post('/api/standards/layers', {
        data: { name: 'TEST-AUTHOR', meaning: 'Quy ước thử' }
      })
    ).status(),
    201
  )
  // Password reset, lock and activation all invalidate prior sessions.
  await deniedPage.reload()
  await deniedPage.locator('#t-add').waitFor({ state: 'visible' })
  await row.getByRole('button', { name: 'Sửa', exact: true }).click()
  await page.locator('#password').fill(resetPassword)
  await page.locator('#save').click()
  await page.locator('#editor').waitFor({ state: 'hidden' })
  assert.equal((await member.request.get('/api/auth/me')).status(), 401)
  assert.equal(
    (
      await member.request.post('/api/auth/login', {
        data: { email, password }
      })
    ).status(),
    401
  )
  assert.equal(
    (
      await member.request.post('/api/auth/login', {
        data: { email, password: resetPassword }
      })
    ).status(),
    200
  )
  await row.getByRole('button', { name: 'Khóa', exact: true }).click()
  await row.getByRole('button', { name: 'Kích hoạt', exact: true }).waitFor()
  assert.equal((await member.request.get('/api/auth/me')).status(), 401)
  assert.equal(
    (
      await member.request.post('/api/auth/login', {
        data: { email, password: resetPassword }
      })
    ).status(),
    403
  )
  await row.getByRole('button', { name: 'Kích hoạt', exact: true }).click()
  await row.getByRole('button', { name: 'Khóa', exact: true }).waitFor()
  assert.equal(
    (
      await member.request.post('/api/auth/login', {
        data: { email, password: resetPassword }
      })
    ).status(),
    200
  )
  const drawingResponse = await member.request.post('/api/drawings', {
    data: { name: 'M1 preserved', dxf: '0\nEOF\n' }
  })
  assert.equal(drawingResponse.status(), 201)
  await page.locator('#reload').click()
  await row.locator('td').nth(3).getByText('1', { exact: true }).waitFor()
  await row.getByRole('button', { name: 'Xóa', exact: true }).click()
  await page.locator('#delete-cancel').click()
  await row.waitFor()
  await row.getByRole('button', { name: 'Xóa', exact: true }).click()
  await page.locator('#delete-confirm').click()
  await row.waitFor({ state: 'detached' })
  assert.equal((await member.request.get('/api/auth/me')).status(), 401)
  assert.equal(
    (
      await member.request.post('/api/auth/login', {
        data: { email, password: resetPassword }
      })
    ).status(),
    401
  )
  const drawings = await (await admin.request.get('/api/drawings')).json()
  assert(drawings.drawings.some(d => d.name === 'M1 preserved'))
  assert.equal(
    (
      await admin.request.post('/api/admin/users', {
        data: { name: 'Reused email', email, password }
      })
    ).status(),
    201
  )
  await page.locator('#reload').click()
  await page.getByText('Reused email', { exact: true }).waitFor()
  await page.screenshot({ path: output + '/admin-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: output + '/admin-mobile.png' })
  report.passed = true
  report.checks = [
    'UI create/edit/delete',
    'roles enforced by API',
    'standards author permission',
    'session revocation',
    'password reset',
    'lock/activate',
    'self-protection',
    'cross-origin rejection',
    'escaped names',
    'drawing transfer',
    'email reuse'
  ]
  console.log('PASS: account management and permissions. ' + output)
} catch (error) {
  report.error = error.message
  console.error(error.stack)
  process.exitCode = 1
} finally {
  await browser?.close()
  server?.kill('SIGTERM')
  await writeFile(output + '/report.json', JSON.stringify(report, null, 2))
}
