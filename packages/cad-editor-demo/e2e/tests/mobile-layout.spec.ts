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

  test('all four tabs fit without scrolling in English', async ({ page }) => {
    // The strip was 12 px short until the tab padding came down; a tab clipped
    // by 5 px still reads as broken.
    const short = await page.evaluate(() => {
      const strip = document.querySelector('.ml-ribbon-contextual-tabs')
      return strip.scrollWidth - strip.clientWidth
    })
    expect(short).toBeLessThanOrEqual(1)
  })

  test('every group sits fully on screen, none needing a swipe', async ({
    page
  }) => {
    // Six groups want 433 px against 358 px, so the row wraps. The invariant is
    // not "it scrolls" but "nothing is off screen": a group half past the edge
    // is the defect, whether or not it can be scrolled into view.
    const offscreen = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const row = document.querySelector('.ml-ribbon__panel--simplified')
      if (!row) return ['hàng nhóm không tồn tại']
      return Array.from(row.querySelectorAll('.ml-ribbon-simplified-group'))
        .map(el => {
          const r = el.getBoundingClientRect()
          return { text: el.textContent.trim(), left: r.left, right: r.right }
        })
        .filter(item => item.right > vw + 1 || item.left < -1)
        .map(item => `${item.text} (${Math.round(item.left)}→${Math.round(item.right)})`)
    })

    expect(offscreen).toEqual([])
  })

  test('wrapping the group row does not cost the canvas much', async ({
    page
  }) => {
    // Wrapping is only worth it while the header stays far below the 123 px the
    // classic ribbon cost; otherwise scrolling would have been the better trade.
    const headerHeight = await page.evaluate(
      () =>
        document.querySelector('.ml-cad-header')?.getBoundingClientRect()
          .height ?? 0
    )
    expect(headerHeight).toBeLessThan(120)
  })

  test('CAD Agent can still be opened', async ({ page }) => {
    // It lives in the Utilities group — the one the classic layout at this width
    // pushed into a 28×20 px `…` menu, taking the headline feature with it.
    // `.first()`: the floating popup panel is a second element with the same
    // classes, so a bare locator is ambiguous.
    const row = page.locator('.ml-ribbon__panel--simplified').first()

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

/**
 * Vietnamese is the deployment's actual audience, and it is the harder case:
 * its tab labels run half again as long as English's ("Trang chính" against
 * "Home"), while its group labels run shorter. The two rows therefore fail in
 * opposite directions, and testing only English would miss both.
 */
test.describe('editor chrome on a phone, in Vietnamese', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadFixture(page, fixturePath)
    await expect(page.locator('.ml-cad-container canvas').first()).toBeVisible({
      timeout: 60_000
    })
    await page.locator('.ml-ribbon-language-switch__select').click()
    await page
      .locator('.el-select-dropdown__item')
      .filter({ hasText: /Tiếng Việt/i })
      .first()
      .click()
    await expect(
      page.locator('.ml-ribbon-tab').filter({ hasText: 'Trang chính' })
    ).toBeVisible()
  })

  test('the six groups fit on one row', async ({ page }) => {
    // Shorter labels than English, so no wrap is needed and none should happen.
    const rows = await page.evaluate(() => {
      const row = document.querySelector('.ml-ribbon__panel--simplified')
      const tops = Array.from(
        row.querySelectorAll('.ml-ribbon-simplified-group')
      ).map(el => Math.round(el.getBoundingClientRect().top))
      return new Set(tops).size
    })
    expect(rows).toBe(1)
  })

  test('a tab strip that overflows says so with a fade', async ({ page }) => {
    // "Tệp / Trang chính / Chèn / Công cụ" plus the selector and the collapse
    // control genuinely exceed 360 px. The strip may scroll — what it may not
    // do is slice a tab off against a hard edge with nothing to say why.
    const state = await page.evaluate(() => {
      const strip = document.querySelector('.ml-ribbon-contextual-tabs')
      const container = document.querySelector('.ml-ribbon-toolbar-container')
      return {
        overflows: strip.scrollWidth > strip.clientWidth + 1,
        faded: container.classList.contains(
          'ml-ribbon-toolbar-container--tabs-overflow'
        ),
        masked: getComputedStyle(strip).maskImage
      }
    })

    // The class tracks the measurement in both directions.
    expect(state.faded).toBe(state.overflows)
    if (state.overflows) {
      expect(state.masked).toContain('gradient')
    }
  })

  test('every tab can be reached by scrolling the strip', async ({ page }) => {
    const strip = page.locator('.ml-ribbon-contextual-tabs')
    await strip.evaluate(el => {
      el.scrollLeft = el.scrollWidth
    })

    const lastTabFullyShown = await page.evaluate(() => {
      const el = document.querySelector('.ml-ribbon-contextual-tabs')
      const clip = el.getBoundingClientRect()
      const tabs = Array.from(el.querySelectorAll('.ml-ribbon-tab'))
      const last = tabs[tabs.length - 1].getBoundingClientRect()
      return last.right <= clip.right + 1 && last.left >= clip.left - 1
    })

    expect(lastTabFullyShown).toBe(true)
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
