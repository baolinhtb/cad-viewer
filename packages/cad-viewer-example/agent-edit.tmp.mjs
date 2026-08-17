/**
 * Measures one draw-then-edit session, so two builds can be compared on the
 * same request rather than on impressions.
 *
 * Records per turn: wall time, the tools the assistant called, and a picture
 * of the drawing. The edit turn is the one that matters — whether it finds the
 * part it was asked about or rebuilds the whole section shows up in all three.
 *
 * Usage: node agent-edit.tmp.mjs <baseURL> <outDir> <prompt1> <prompt2>
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2]
const OUT = process.argv[3]
const PROMPT_1 = process.argv[4]
const PROMPT_2 = process.argv[5]
const CHROME =
  process.env.PLAYWRIGHT_CHROME_PATH ??
  '/root/.cache/cad-viewer-chrome/chrome-linux64/chrome'

mkdirSync(OUT, { recursive: true })

const log = []
function note(line) {
  const stamped = `[${new Date().toISOString().slice(11, 19)}] ${line}`
  log.push(stamped)
  console.log(stamped)
}

const browser = await chromium.launch({ executablePath: CHROME })
const context = await browser.newContext({
  viewport: { width: 2200, height: 1200 }
})
const page = await context.newPage()

/** Every provider call, so tool use can be counted per turn. */
const calls = []
page.on('request', request => {
  if (request.url().includes('/api/ai/messages')) calls.push(Date.now())
})

async function shot(name) {
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  note(`ảnh: ${name}.png`)
}

async function canvasShot(name) {
  return page
    .locator('.ml-cad-container')
    .first()
    .screenshot({ path: join(OUT, `${name}.png`) })
    .catch(() => null)
}

async function panelText() {
  return page
    .locator('.cad-agent-panel-root')
    .innerText()
    .catch(() => '')
}

/** Waits for the send button to stop offering to stop the turn. */
async function waitForTurn(maxSeconds) {
  const started = Date.now()
  for (let elapsed = 10; elapsed <= maxSeconds; elapsed += 10) {
    await page.waitForTimeout(10_000)
    const label =
      (await page
        .locator('.cad-agent-send-btn')
        .getAttribute('aria-label')
        .catch(() => '')) || ''
    if (!/dừng|stop/i.test(label) && elapsed >= 20) break
  }
  return Math.round((Date.now() - started) / 1000)
}

async function send(prompt) {
  await page.locator('.cad-agent-panel-root textarea').fill(prompt)
  await page.locator('.cad-agent-send-btn').click()
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page
    .locator('input[type="email"], input[name="email"]')
    .first()
    .fill(process.env.ADMIN_EMAIL ?? '')
  await page
    .locator('input[type="password"]')
    .first()
    .fill(process.env.ADMIN_PASSWORD ?? '')
  await page
    .locator('button[type="submit"], button:has-text("Đăng nhập")')
    .first()
    .click()
  await page.waitForTimeout(4000)
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000)

  for (const label of ['Write', 'Extents']) {
    const radio = page.getByRole('radio', { name: new RegExp(`^${label}\\b`) })
    if (await radio.isVisible().catch(() => false)) await radio.click()
  }
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(
      '/srv/cad-viewer/packages/cad-viewer-example/e2e/fixtures/minimal-line.dxf'
    )
  await page.waitForTimeout(8000)
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page.waitForTimeout(2000)

  note(`lượt 1: "${PROMPT_1}"`)
  const callsBefore1 = calls.length
  await send(PROMPT_1)
  const seconds1 = await waitForTurn(300)
  await page.waitForTimeout(3000)
  const panel1 = await panelText()
  writeFileSync(join(OUT, 'panel-1.txt'), panel1)
  await shot('1-sau-luot-ve-toan-man')
  const before = await canvasShot('2-sau-luot-ve')
  note(`lượt 1 xong sau ${seconds1}s, ${calls.length - callsBefore1} lời gọi model`)

  note(`lượt 2 (sửa): "${PROMPT_2}"`)
  const callsBefore2 = calls.length
  await send(PROMPT_2)
  const seconds2 = await waitForTurn(300)
  await page.waitForTimeout(3000)
  const panel2 = await panelText()
  writeFileSync(join(OUT, 'panel-2.txt'), panel2)
  await shot('3-sau-luot-sua-toan-man')
  const after = await canvasShot('4-sau-luot-sua')
  note(`lượt 2 xong sau ${seconds2}s, ${calls.length - callsBefore2} lời gọi model`)

  // Tools the edit turn used, in order — the record of whether it addressed a
  // part or rebuilt the drawing.
  const editTools = (panel2.slice(panel1.length).match(/tool: [a-z_]+/g) ?? []).map(
    entry => entry.replace('tool: ', '')
  )
  const counted = {}
  for (const name of editTools) counted[name] = (counted[name] ?? 0) + 1

  writeFileSync(
    join(OUT, 'do-luong.json'),
    JSON.stringify(
      {
        promptVe: PROMPT_1,
        promptSua: PROMPT_2,
        giayLuotVe: seconds1,
        giayLuotSua: seconds2,
        loiGoiModelLuotSua: calls.length - callsBefore2,
        toolLuotSua: counted,
        tongToolLuotSua: editTools.length,
        banVeDoi: before && after ? Buffer.compare(before, after) !== 0 : null
      },
      null,
      2
    )
  )
  note(`tool ở lượt sửa: ${JSON.stringify(counted)}`)
} catch (error) {
  note(`LỖI: ${String(error).slice(0, 300)}`)
  await shot('loi')
} finally {
  writeFileSync(join(OUT, 'log.txt'), log.join('\n'))
  await browser.close()
}
