import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import { uploadFixture } from '../helpers/fileUpload'

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'minimal-line.dxf'
)

/**
 * The CAD Agent panel has to be reachable and usable straight out of the box.
 *
 * Both halves of that shipped broken once and no test noticed, because every
 * test we had ran below the UI: the ribbon button exists only when the plugin
 * registers (and the registration swallows its own errors), and the send
 * button used to demand an API key the browser is deliberately not given —
 * so the panel opened and did nothing. This drives the real app in a real
 * browser, which is the only place either failure is visible.
 */

/**
 * Opens the editor on a drawing.
 *
 * The app boots to an upload screen; the ribbon that carries the CAD Agent
 * button only exists once something is loaded.
 */
async function openEditor(page: import('@playwright/test').Page) {
  // Wide on purpose. The CAD Agent button sits at the right-hand end of the
  // Home tab, and below roughly 1600px the ribbon folds it — along with Quick
  // Select, Count and Drawing Units — into the "..." overflow, where this
  // suite would report it missing and be right about the pixels but wrong
  // about the cause.
  await page.setViewportSize({ width: 2200, height: 1200 })
  await page.goto('/')
  await uploadFixture(page, fixturePath)
  await expect(page.locator('.ml-cad-container')).toBeVisible()
}

/** Opens the panel's settings form. */
async function openSettings(page: import('@playwright/test').Page) {
  await page.locator('.cad-agent-panel-root button[aria-label]').first().click()
}

/** The ribbon button that opens the agent palette. */
function agentButton(page: import('@playwright/test').Page) {
  return page.getByRole('button', { name: /CAD\s*Agent/i })
}

test('the CAD Agent button is on the ribbon and opens the panel', async ({
  page
}) => {
  await openEditor(page)

  const button = agentButton(page)
  await expect(button).toBeVisible()

  await button.click()

  // The panel's own input is the thing the engineer types into; if the
  // plugin chunk failed to load, nothing here appears.
  await expect(page.locator('.cad-agent-panel-root textarea')).toBeVisible()
})

test('a fresh browser can send without configuring an API key', async ({
  page
}) => {
  await openEditor(page)
  await agentButton(page).click()

  const input = page.locator('.cad-agent-panel-root textarea')
  await input.fill('vẽ một đường thẳng từ 0,0 đến 100,0')

  // The deployment's proxy holds the key, so nothing should be asking the
  // user for one. This is the assertion that would have caught the shipped
  // default pointing at api.openai.com with an empty key.
  await expect(page.locator('.cad-agent-input-hint')).toHaveCount(0)

  await expect(page.locator('.cad-agent-send-btn')).toBeEnabled()
})

test('the settings default to this deployment, not a third-party provider', async ({
  page
}) => {
  await openEditor(page)
  await agentButton(page).click()

  await openSettings(page)

  const provider = page.locator('.cad-agent-settings select').first()
  await expect(provider).toHaveValue('proxy')

  const baseUrl = page.locator('.cad-agent-settings input').first()
  await expect(baseUrl).toHaveValue('/api/ai')
})

test('a saved non-default model does not read as unsaved settings', async ({
  page
}) => {
  // What the panel writes after the user picks Sonnet 5 and clicks save.
  await page.addInitScript(() => {
    localStorage.setItem(
      'cad-agent-plugin.llm-settings',
      JSON.stringify({
        provider: 'proxy',
        baseUrl: '/api/ai',
        model: 'claude-sonnet-5',
        apiKeyEnc: ''
      })
    )
  })

  await openEditor(page)
  await agentButton(page).click()
  await page.locator('.cad-agent-panel-root textarea').fill('vẽ mặt cắt ngang')

  // Loading settings must not count as editing them. The provider watcher
  // resets baseUrl and model to the provider's defaults whenever provider
  // changes, and loading changes it from the ref's placeholder — which
  // silently overwrote the saved model and left the panel permanently
  // reporting "Lưu thiết lập trước khi gửi tin nhắn."
  await expect(page.locator('.cad-agent-input-hint')).toHaveCount(0)
  await expect(page.locator('.cad-agent-send-btn')).toBeEnabled()
})

test('choosing a provider by hand still loads that provider defaults', async ({
  page
}) => {
  await openEditor(page)
  await agentButton(page).click()
  await openSettings(page)

  const provider = page.locator('.cad-agent-settings select').first()
  await expect(provider).toHaveValue('proxy')
  await provider.selectOption('anthropic')

  // The guard added for the load path must not disable the watcher for the
  // case it exists to serve.
  await expect(page.locator('.cad-agent-settings input').first()).toHaveValue(
    'https://api.anthropic.com/v1'
  )
})
