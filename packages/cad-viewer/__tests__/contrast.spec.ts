import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Checks the palette against WCAG 2.2 contrast thresholds.
 *
 * Colours are read from the token file rather than restated here, so the test
 * measures what actually ships. Adjusting a colour and quietly dropping below
 * the threshold is the failure this prevents — on a dark surface it is very
 * easy to make text look elegant and unreadable at the same time.
 */
const tokens = readFileSync(
  join(__dirname, '../src/style/design-tokens.scss'),
  'utf8'
)

function token(name: string): string {
  const match = tokens.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6});`))
  if (!match) throw new Error(`Token ${name} không tìm thấy`)
  return match[1]
}

/** Relative luminance per WCAG 2.2. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map(c =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const SURFACES = {
  canvas: token('--cv-surface-canvas'),
  panel: token('--cv-surface-panel'),
  raised: token('--cv-surface-raised')
}

/** AA for body text. */
const AA_TEXT = 4.5
/** AA for large text, icons and other non-text indicators. */
const AA_LARGE = 3

describe('contrast on the dark surfaces', () => {
  describe.each(Object.entries(SURFACES))('on %s', (_name, surface) => {
    test.each([
      ['--cv-ink-primary', AA_TEXT],
      ['--cv-ink-secondary', AA_TEXT],
      ['--cv-accent', AA_TEXT],
      ['--cv-warning', AA_TEXT],
      ['--cv-danger', AA_TEXT],
      ['--cv-selection', AA_LARGE]
    ])('%s clears %s:1', (name, threshold) => {
      expect(contrast(token(name), surface)).toBeGreaterThanOrEqual(threshold)
    })

    test('disabled text stays readable even though WCAG exempts it', () => {
      // The exemption covers inactive controls; it does not make 2.6:1 legible.
      expect(
        contrast(token('--cv-ink-disabled'), surface)
      ).toBeGreaterThanOrEqual(AA_LARGE)
    })
  })

  test('disabled text is still clearly weaker than secondary text', () => {
    // Readable is not the goal by itself: disabled has to *look* disabled, or
    // the state stops carrying information.
    expect(
      contrast(token('--cv-ink-secondary'), token('--cv-ink-disabled'))
    ).toBeGreaterThanOrEqual(1.5)
  })

  test('the accent reads against its own foreground colour', () => {
    // Used as a filled button: teal background, dark label on top.
    expect(
      contrast(token('--cv-accent'), token('--cv-accent-foreground'))
    ).toBeGreaterThanOrEqual(AA_TEXT)
  })

  test('the focus ring is visible on every surface', () => {
    for (const surface of Object.values(SURFACES)) {
      expect(contrast(token('--cv-accent'), surface)).toBeGreaterThanOrEqual(
        AA_LARGE
      )
    }
  })
})
