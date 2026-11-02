// Live inference test using the installed Codex login, not mocked responses.
// pnpm test:codex
// pnpm test:codex --prompt "Dựng hồ sơ mố M2 theo mẫu."
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CodexCadSession } from './codex-cad/app-server.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(
  path.join(root, 'packages/cad-viewer-example/package.json')
)
const { chromium } = require('@playwright/test')
const args = process.argv.slice(2).filter(a => a !== '--')
const option = name => {
  const i = args.indexOf(name)
  return i < 0 ? undefined : args[i + 1]
}
if (args.includes('--help')) {
  console.log(
    'pnpm test:codex [--prompt "..."] [--url http://127.0.0.1:4177] [--headed]\nWithout --prompt, runs create → edit → check/export using live Codex. Uses the installed CLI login and its default model. Requires built packages and Playwright Chromium.'
  )
  process.exit(0)
}
const customPrompt = option('--prompt')
if (args.includes('--prompt') && !customPrompt)
  throw new Error('--prompt cần nội dung.')
const url = new URL(option('--url') ?? 'http://127.0.0.1:4177')
if (
  url.protocol !== 'http:' ||
  !['127.0.0.1', 'localhost'].includes(url.hostname)
)
  throw new Error('Bridge kiểm thử chỉ dùng HTTP trên localhost.')
const output = await mkdtemp(path.join(os.tmpdir(), 'cad-codex-live-'))
const transcript = {
  provider: 'codex-app-server',
  live: true,
  turns: [],
  calls: [],
  downloads: []
}
let server, browser, session
const downloads = []
async function chromePath() {
  if (process.env.PLAYWRIGHT_CHROME_PATH)
    return process.env.PLAYWRIGHT_CHROME_PATH
  try {
    await access(chromium.executablePath())
    return undefined
  } catch {
    /* A managed image may carry a newer Chromium. */
  }
  if (process.platform !== 'linux') return undefined
  const cache =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    path.join(os.homedir(), '.cache/ms-playwright')
  let entries
  try {
    entries = await readdir(cache)
  } catch {
    return undefined
  }
  for (const entry of entries
    .filter(n => /^chromium_headless_shell-\d+$/.test(n))
    .sort(
      (a, b) => Number(b.split('-').at(-1)) - Number(a.split('-').at(-1))
    )) {
    const executable = path.join(
      cache,
      entry,
      'chrome-headless-shell-linux64/chrome-headless-shell'
    )
    try {
      await access(executable)
      return executable
    } catch {
      /* Try another cached revision. */
    }
  }
}
try {
  if (!option('--url')) {
    server = spawn(
      'pnpm',
      [
        '--filter',
        '@mlightcad/cad-viewer-example',
        'exec',
        'vite',
        '--host',
        url.hostname,
        '--port',
        url.port,
        '--strictPort'
      ],
      { cwd: root, stdio: 'ignore' }
    )
    let serverError
    server.on('error', error => {
      serverError = error
    })
    const deadline = Date.now() + 60000
    while (true) {
      if (serverError) throw serverError
      if (server.exitCode !== null)
        throw new Error(
          'Không khởi động được Vite; kiểm tra cổng hoặc dùng --url.'
        )
      try {
        if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) break
      } catch {
        /* Wait for Vite. */
      }
      if (Date.now() > deadline)
        throw new Error('Vite chưa sẵn sàng sau 60 giây.')
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  browser = await chromium.launch({
    headless: !args.includes('--headed'),
    executablePath: await chromePath()
  })
  const page = await browser.newPage({
    viewport: { width: 1800, height: 1100 }
  })
  await page.route('**/api/**', route =>
    route.fulfill({
      status: 503,
      json: { error: 'Live Codex test uses the local stdio bridge.' }
    })
  )
  page.on('download', download => {
    const filename = path.basename(download.suggestedFilename())
    const destination = path.join(output, filename)
    downloads.push(download.saveAs(destination))
    transcript.downloads.push(filename)
  })
  await page.goto(url.href)
  await page.getByRole('radio', { name: /^Write\b/ }).click()
  await page.getByRole('radio', { name: /^Extents\b/ }).click()
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(
      path.join(
        root,
        'packages/cad-viewer-example/e2e/fixtures/minimal-line.dxf'
      )
    )
  await page.waitForFunction(() => {
    try {
      return !!window.AcApDocManager?.instance?.curDocument?.database
    } catch {
      return false
    }
  })
  const tools = await page.evaluate(async root => {
    const api = await import(
      `/@fs${root}/packages/cad-template-plugin/dist/cad-template-plugin.js`
    )
    window.__codexCadApi = api
    return [
      ...api.DOSSIER_TOOLS,
      {
        name: 'doc_ho_so_hien_tai',
        description:
          'Đọc mã, phiên bản và thông số các hồ sơ hiện có trước khi sửa. Không thay đổi bản vẽ.',
        input_schema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      }
    ]
  }, root)
  const state = () =>
    page.evaluate(() => {
      const db = window.AcApDocManager.instance.curDocument.database
      return window.__codexCadApi
        .listRuns(db)
        .filter(r => r.templateId === 'ho_so_mo_m1')
    })
  session = new CodexCadSession({
    cwd: output,
    tools,
    execute: async (name, input) => {
      console.log(`\n[CAD] ${name} ${JSON.stringify(input)}`)
      const result = await page.evaluate(
        async ({ name, input }) => {
          const api = window.__codexCadApi
          if (name === 'doc_ho_so_hien_tai')
            return {
              ok: true,
              hoSo: api.listRuns(
                window.AcApDocManager.instance.curDocument.database
              )
            }
          return api.runDossierTool(name, input)
        },
        { name, input }
      )
      transcript.calls.push({ name, input, result })
      return result
    },
    onText: delta => process.stdout.write(delta)
  })
  const connected = await session.initialize()
  transcript.model = connected.model
  console.log(
    `[Codex] Đã kết nối; model=${connected.model ?? 'mặc định CLI'}. Kết quả: ${output}`
  )
  const prompts = customPrompt
    ? [customPrompt]
    : [
        'Dựng bộ hồ sơ mố M1 theo mẫu BTC mo_2. Bệ rộng 7,7 m, dài 6 m, cao 2 m; 4 cọc D1200 bố trí 2 hàng × 2 cọc; cao độ đáy bệ 228,837 m, dốc ngang 2%. Các thông số còn lại lấy mẫu, giữ bản nháp và không tự chốt các mâu thuẫn.',
        'Tăng riêng bề rộng bệ M1 lên 8,5 m; giữ nguyên bề rộng thân và toàn bộ bố trí cọc. Sửa hồ sơ vừa dựng, không tạo thêm hồ sơ.',
        'Kiểm tra hồ sơ M1 vừa sửa rồi xuất PDF sáu trang bản nháp. Không thay đổi thông số nào khác.'
      ]
  for (const [index, prompt] of prompts.entries()) {
    console.log(`\n[Prompt ${index + 1}] ${prompt}\n`)
    let text = ''
    session.onText = delta => {
      text += delta
      process.stdout.write(delta)
    }
    const expectedDownload =
      !customPrompt && index === 2
        ? page.waitForEvent('download', { timeout: 240000 })
        : undefined
    expectedDownload?.catch(() => {})
    const result = await session.prompt(prompt)
    if (expectedDownload) await expectedDownload
    const runs = await state()
    transcript.turns.push({ prompt, text, result, runs })
    if (!customPrompt) {
      assert.equal(runs.length, 1, 'Phải giữ đúng một hồ sơ, không dựng chồng.')
      assert.equal(Number(runs[0].values.bBe), index === 0 ? 7700 : 8500)
      assert.equal(Number(runs[0].values.bThan), 7700)
      assert.equal(Number(runs[0].values.soCotCoc), 2)
      assert.equal(Number(runs[0].values.soHangCoc), 2)
      assert.equal(Number(runs[0].values.aCocNgang), 5300)
      assert.equal(Number(runs[0].values.aCocDoc), 3600)
    }
  }
  await Promise.all(downloads)
  if (!customPrompt) {
    const pdf = await readFile(path.join(output, 'M1-ban-nhap.pdf'))
    assert.equal(
      (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length,
      6
    )
    assert(
      transcript.calls.some(c => c.name === 'kiem_tra_ho_so' && c.result.ok)
    )
  }
  await page.evaluate(() =>
    window.AcApDocManager.instance.context.view.zoomToFitDrawing()
  )
  await page.screenshot({ path: path.join(output, 'cad-result.png') })
  console.log(
    `\n\nĐẠT: ${prompts.length} prompt thật; ${transcript.calls.length} lời gọi CAD. Kết quả tại ${output}`
  )
} catch (error) {
  transcript.error = error.message
  process.exitCode = 1
  console.error(`\nChưa đạt: ${error.message}\nNhật ký: ${output}`)
} finally {
  await writeFile(
    path.join(output, 'transcript.json'),
    JSON.stringify(transcript, null, 2)
  )
  await session?.close()
  await browser?.close()
  if (server && server.exitCode === null) server.kill('SIGTERM')
}
