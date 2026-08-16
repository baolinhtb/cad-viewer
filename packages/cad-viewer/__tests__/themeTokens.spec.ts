import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * Keeps the service's static pages on the same palette as the editor.
 *
 * The auth service serves plain HTML with no bundler, so it carries its own
 * copy of the tokens. Two copies drift, and this drift is the visible kind: a
 * login page in one palette leading into an editor in another reads as two
 * different products stitched together.
 */
const read = (path: string) =>
  readFileSync(join(__dirname, '../../..', path), 'utf8')

const scss = read('packages/cad-viewer/src/style/design-tokens.scss')
const css = read('server/auth/public/theme.css')

/** `--cv-accent: #35e0a1;` → value */
function tokenOf(source: string, name: string): string | undefined {
  return source.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`))?.[1]
}

const SHARED = [
  '--cv-surface-canvas',
  '--cv-surface-panel',
  '--cv-surface-raised',
  '--cv-border-hairline',
  '--cv-ink-primary',
  '--cv-ink-secondary',
  '--cv-ink-disabled',
  '--cv-accent',
  '--cv-accent-foreground',
  '--cv-selection',
  '--cv-warning',
  '--cv-danger'
]

describe('service pages share the editor palette', () => {
  test.each(SHARED)('%s matches', name => {
    const expected = tokenOf(scss, name)
    expect(expected).toBeDefined()
    expect(tokenOf(css, name)).toBe(expected)
  })

  /**
   * Matching tokens are worthless if a page never reads them.
   *
   * Three pages sat on `#f0f2f5` long after the palette existed, because
   * nothing connected "the tokens are correct" to "the page uses them". Each
   * page carries its own `<style>` block, so the check is: link the stylesheet,
   * and state no colour of your own.
   */
  const PAGES = readdirSync(join(__dirname, '../../..', 'server/auth/public'))
    .filter(name => name.endsWith('.html'))

  test('there are pages to check', () => {
    // A glob that silently matched nothing would pass every case below.
    expect(PAGES.length).toBeGreaterThan(0)
  })

  test.each(PAGES)('%s links the shared stylesheet', name => {
    expect(read(`server/auth/public/${name}`)).toContain(
      '<link rel="stylesheet" href="/theme.css">'
    )
  })

  test.each(PAGES)('%s names no colour of its own', name => {
    // rgba() is allowed: tinted backgrounds for message states have no token,
    // and spelling one per state would be more palette, not less.
    const hex = read(`server/auth/public/${name}`).match(/#[0-9a-fA-F]{3,8}\b/g)
    expect(hex ?? []).toEqual([])
  })

  test('the corner radii match too', () => {
    for (const [name, value] of [
      ['--cv-radius-sm', '2px'],
      ['--cv-radius-md', '4px'],
      ['--cv-radius-lg', '6px']
    ]) {
      expect(css).toContain(`${name}: ${value};`)
      expect(scss).toContain(`${name}: ${value};`)
    }
  })
})
