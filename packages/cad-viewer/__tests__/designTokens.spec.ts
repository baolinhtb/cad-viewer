import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Guards the design tokens against silent drift.
 *
 * The values come from the "Phòng kỹ thuật" identity in DESIGN.md. That
 * document lives outside the repository, so this test cannot compare against
 * it — what it can do is make a change deliberate: editing a token here fails
 * until someone updates the expectation, which is the moment to check the
 * design document agrees.
 */
const tokens = readFileSync(
  join(__dirname, '../src/style/design-tokens.scss'),
  'utf8'
)

describe('design tokens', () => {
  test.each([
    ['--cv-surface-canvas', '#0d0f12'],
    ['--cv-surface-panel', '#14171c'],
    ['--cv-surface-raised', '#1b2028'],
    ['--cv-border-hairline', '#262c35'],
    ['--cv-ink-primary', '#e8ecf1'],
    ['--cv-ink-disabled', '#6b7380'],
    ['--cv-accent', '#35e0a1'],
    ['--cv-selection', '#54a9ff'],
    ['--cv-warning', '#f5b942'],
    ['--cv-danger', '#f26d5b']
  ])('%s is %s', (name, value) => {
    expect(tokens).toContain(`${name}: ${value};`)
  })

  test('corner radii stay sharp: 2 / 4 / 6', () => {
    expect(tokens).toContain('--cv-radius-sm: 2px;')
    expect(tokens).toContain('--cv-radius-md: 4px;')
    expect(tokens).toContain('--cv-radius-lg: 6px;')
  })

  test('the accent is what Element Plus calls primary', () => {
    // The primary action is the live one; DESIGN.md allows at most one per
    // screen, which is what keeps the accent meaningful.
    expect(tokens).toContain('--el-color-primary: var(--cv-accent);')
  })

  test('selection blue is never wired into a component variable', () => {
    // Canvas selection only. If it ever backs an Element Plus variable, "the
    // AI touched this" and "this is selected" start looking the same.
    const mappings = tokens
      .split('\n')
      .filter(line => line.trim().startsWith('--el-'))
    expect(mappings.some(line => line.includes('--cv-selection'))).toBe(false)
  })

  test('shadows carry no hierarchy, except over the canvas', () => {
    expect(tokens).toContain('--el-box-shadow: none;')
    expect(tokens).toContain('--el-box-shadow-light: none;')
    expect(tokens).toContain('--el-box-shadow-lighter: none;')
    // Dropdowns and popovers cover the drawing, so they keep real separation.
    expect(tokens).toMatch(/--el-box-shadow-dark: 0 4px 16px/)
  })

  test('the Element Plus mapping can actually outrank the stock dark theme', () => {
    // Element Plus declares its dark values under `html.dark`. A mapping under
    // `:root` loses to that on specificity however late it is loaded, and the
    // app renders in stock Element dark with none of this identity visible —
    // which is exactly what shipped the first time. The selector is the fix,
    // so the selector is what this test pins.
    const mappingBlock = tokens.match(
      /^([^\s{][^{}\n]*?)\s*\{\n[^}]*--el-bg-color:/m
    )
    expect(mappingBlock).not.toBeNull()
    expect(mappingBlock![1].trim()).toBe('html.dark')
  })

  test('both type faces are declared, and data reads in mono', () => {
    expect(tokens).toMatch(/--cv-font-sans:/)
    expect(tokens).toMatch(/--cv-font-mono:/)
    expect(tokens).toMatch(/\.cv-data\s*{[^}]*--cv-font-mono/s)
  })
})
