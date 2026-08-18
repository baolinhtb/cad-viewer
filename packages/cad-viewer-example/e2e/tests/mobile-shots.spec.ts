/**
 * Photographs the editor at phone, tablet, and desktop width.
 *
 * Not an assertion — the assertions live in `mobile-layout.spec.ts`. This is
 * here so the layout can be looked at, because a number that passes a threshold
 * still says nothing about whether the result is usable.
 */
import { test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { uploadFixture } from '../helpers/fileUpload'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(
  currentDir,
  '..',
  'fixtures',
  'minimal-line.dxf'
)
const OUT = process.env.MOBILE_SHOT_DIR ?? 'test-results/mobile-shots'

const SIZES = [
  ['phone-360x640', { width: 360, height: 640 }],
  ['phone-390x844', { width: 390, height: 844 }],
  ['tablet-768x1024', { width: 768, height: 1024 }],
  ['desktop-1440x900', { width: 1440, height: 900 }]
] as const

for (const [label, viewport] of SIZES) {
  test(`chrome at ${label}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await uploadFixture(page, fixturePath)
    await page
      .locator('.ml-cad-container canvas')
      .first()
      .waitFor({ state: 'visible', timeout: 60_000 })
    await page.locator('.ml-ribbon').first().waitFor({ state: 'visible' })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(OUT, `${label}.png`) })
  })
}

test('agent panel on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await page
    .locator('.ml-cad-container canvas')
    .first()
    .waitFor({ state: 'visible', timeout: 60_000 })

  const row = page.locator('.ml-ribbon__panel--simplified').first()
  await row.evaluate(el => {
    el.scrollLeft = el.scrollWidth
  })
  await row
    .locator('.ml-ribbon-simplified-group')
    .filter({ hasText: /Utilities/i })
    .first()
    .click()
  await page.getByRole('button', { name: /CAD\s*Agent/i }).click()
  await page.locator('.cad-agent-panel-root').waitFor({ state: 'visible' })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(OUT, 'phone-agent-panel.png') })
})
