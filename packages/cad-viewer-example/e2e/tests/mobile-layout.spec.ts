/**
 * The editor chrome at phone width.
 *
 * Every check here failed before the responsive work: the ribbon header spilled
 * past the viewport, the file-name overlay rendered a sliver of a word, and the
 * classic ribbon fitted exactly one 190 px group so every remaining command —
 * CAD Agent among them — sat behind a 28×20 px `…` menu. None of it showed up
 * in the unit suite, because none of it exists below the layout.
 */
import { expect, test } from '@playwright/test'
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

/** Narrower than `ML_UI_MOBILE_MAX_WIDTH`, and a real handset size. */
const PHONE = { width: 360, height: 640 }

test.describe('editor chrome on a phone', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadFixture(page, fixturePath)
    await expect(page.locator('.ml-cad-container canvas').first()).toBeVisible({
      timeout: 60_000
    })
    await expect(page.locator('.ml-ribbon').first()).toBeVisible()
  })

  test('nothing spills past the right edge of the screen', async ({ page }) => {
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement
      const header = document.querySelector('.ml-ribbon__header')
      return {
        page: doc.scrollWidth - doc.clientWidth,
        header: header ? header.scrollWidth - header.clientWidth : 0,
        headRightEdge:
          document
            .querySelector('.ml-ribbon__head-right')
            ?.getBoundingClientRect().right ?? 0,
        viewport: doc.clientWidth
      }
    })

    expect(overflow.page).toBeLessThanOrEqual(1)
    expect(overflow.header).toBeLessThanOrEqual(1)
    // The language selector used to be cut off 8 px past the edge.
    expect(overflow.headRightEdge).toBeLessThanOrEqual(overflow.viewport + 1)
  })

  test('no control in the header is shown as a clipped stub', async ({
    page
  }) => {
    // Scrolling the whole left half swept the collapse control along with the
    // tabs, leaving 9 px of a 32 px button jammed against the language
    // selector — present enough to look like a rendering fault, too small to
    // press. A control is either in the strip or scrolled out of it; a sliver
    // is neither.
    const stubs = await page.evaluate(() => {
      const strip = document.querySelector('.ml-ribbon__head-left')
      if (!strip) return []
      const clip = strip.getBoundingClientRect()
      return Array.from(strip.children)
        .map(el => {
          const r = el.getBoundingClientRect()
          const visible = Math.max(
            0,
            Math.min(r.right, clip.right) - Math.max(r.left, clip.left)
          )
          return {
            cls: String(el.className).slice(0, 50),
            width: Math.round(r.width),
            visible: Math.round(visible)
          }
        })
        .filter(item => item.visible > 0 && item.visible < item.width - 1)
    })

    expect(stubs).toEqual([])
  })

  test('the file name is shown whole or not at all', async ({ page }) => {
    const overlay = await page.evaluate(() => {
      const el = document.querySelector('.ml-ribbon-file-name')
      if (!el) return null
      const text = el.querySelector('.ml-ribbon-file-name__text')
      return {
        boxWidth: Math.round(el.getBoundingClientRect().width),
        // How much wider the name wants to be than the room it was given.
        clipped: text ? text.scrollWidth - text.clientWidth : 0
      }
    })

    if (overlay === null) return // Hidden, which is the correct outcome here.

    // If it is on screen at all it must be wide enough to read, and any
    // shortening must be an ellipsis rather than a slice through a word.
    expect(overlay.boxWidth).toBeGreaterThanOrEqual(56)
    expect(overlay.clipped).toBeLessThanOrEqual(1)
  })

  test('the ribbon folds to its simplified layout', async ({ page }) => {
    const ribbon = page.locator('.ml-ribbon').first()
    await expect(ribbon).toHaveClass(/ml-ribbon--simplified/)
    await expect(ribbon).not.toHaveClass(/ml-ribbon--classic/)

    // Height is the point: the classic panel row cost 96 px of a 640 px screen
    // to show a single group.
    const headerHeight = await page.evaluate(
      () =>
        document.querySelector('.ml-cad-header')?.getBoundingClientRect()
          .height ?? 0
    )
    expect(headerHeight).toBeLessThan(80)
  })

  test('every command group is reachable, none stranded in overflow', async ({
    page
  }) => {
    // In the classic layout at this width the ribbon kept one group and pushed
    // the rest — CAD Agent included — behind `…`. Scoped to the visible row:
    // the floating popup panel carries a second copy of every group.
    const groups = await page
      .locator('.ml-ribbon__panel--simplified')
      .first()
      .locator('.ml-ribbon-simplified-group')
      .allTextContents()
    expect(groups.length).toBeGreaterThan(1)
    expect(groups).toContain('Utilities')
  })

  test('groups wider than the screen can be scrolled to, not cut off', async ({
    page
  }) => {
    // The simplified row has no `…` of its own, so anything past the right edge
    // is lost unless the row scrolls. At 360 px the groups measure 433 px.
    const row = await page.evaluate(() => {
      const el = document.querySelector('.ml-ribbon__panel--simplified')
      if (!el) return null
      return {
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        overflowX: getComputedStyle(el).overflowX
      }
    })

    expect(row).not.toBeNull()
    if (row!.scrollW > row!.clientW + 1) {
      expect(['auto', 'scroll']).toContain(row!.overflowX)

      // And scrolling has to actually move it.
      const moved = await page.evaluate(() => {
        const el = document.querySelector('.ml-ribbon__panel--simplified')!
        el.scrollLeft = el.scrollWidth
        return el.scrollLeft
      })
      expect(moved).toBeGreaterThan(0)
    }
  })

  test('CAD Agent can still be opened', async ({ page }) => {
    // It lives in the Utilities group, which at 360 px starts 74 px past the
    // right edge. Before the row could scroll it was on the page and out of
    // reach — the headline feature, unusable on a phone.
    // `.first()` throughout: the floating popup panel is a second element with
    // the same classes, so a bare locator is ambiguous.
    const row = page.locator('.ml-ribbon__panel--simplified').first()
    await row.evaluate(el => {
      el.scrollLeft = el.scrollWidth
    })

    await row
      .locator('.ml-ribbon-simplified-group')
      .filter({ hasText: /Utilities/i })
      .first()
      .click()

    const agent = page.getByRole('button', { name: /CAD\s*Agent/i })
    await expect(agent).toBeVisible()
    await agent.click()
    await expect(page.locator('.cad-agent-panel-root')).toBeVisible()
  })

  test('touch targets in the ribbon are big enough for a finger', async ({
    page
  }) => {
    const tooSmall = await page.evaluate(() => {
      const selectors = [
        '.ml-ribbon-tab',
        '.ml-ribbon-simplified-group',
        '.ml-ribbon-overflow-trigger'
      ]
      return selectors
        .flatMap(selector => Array.from(document.querySelectorAll(selector)))
        .map(el => {
          const r = el.getBoundingClientRect()
          return { cls: el.className, h: Math.round(r.height) }
        })
        .filter(item => item.h > 0 && item.h < 32)
    })

    expect(tooSmall).toEqual([])
  })
})

test.describe('editor chrome on a desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('keeps the classic ribbon', async ({ page }) => {
    // The narrow rules must not leak upward: the full layout is the point of
    // the product on a real screen.
    await page.goto('/')
    await uploadFixture(page, fixturePath)
    await expect(page.locator('.ml-cad-container canvas').first()).toBeVisible({
      timeout: 60_000
    })
    await expect(page.locator('.ml-ribbon').first()).toHaveClass(
      /ml-ribbon--classic/
    )
  })
})
