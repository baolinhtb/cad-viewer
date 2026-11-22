import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import { uploadFixture } from '../helpers/fileUpload'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(
  currentDir,
  '..',
  'fixtures',
  'minimal-line.dxf'
)

// QA P2-M5: File > Open Drawing > Local file did nothing — the ribbon's
// file-menu handler had lost its `ds:` branch in the upstream 1.7.8 merge.
// The item must open the browser's file chooser, from the click itself.
test('File > Open Drawing > Local file opens the file chooser', async ({
  page
}) => {
  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()

  await page
    .getByRole('button', { name: /^File\b/i })
    .first()
    .click()
  await page
    .getByText(/^(Open Drawing|Mở bản vẽ)$/)
    .first()
    .hover()
  const chooser = page.waitForEvent('filechooser')
  await page
    .getByText(/^Local file$/)
    .first()
    .click()
  const fc = await chooser
  expect(fc.isMultiple()).toBe(false)
  await fc.setFiles(fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
})
