import viDialog from '../src/locale/vi/dialog'
import viMain from '../src/locale/vi/main'

/**
 * Guards the Vietnamese locale.
 *
 * The locale is deliberately partial — vue-i18n falls back to English for
 * anything untranslated. What must not happen is a *surface* that is half
 * translated, because that reads worse than one that is plainly in English.
 * These tests check that the surfaces claimed as done really are complete, and
 * that the microcopy keeps the register EXPERIENCE.md asks for.
 */

/** Every leaf string in a message tree, with its dotted key. */
function leaves(
  tree: Record<string, unknown>,
  prefix = ''
): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string'
      ? [[path, value] as [string, string]]
      : leaves(value as Record<string, unknown>, path)
  })
}

const all = [...leaves(viDialog, 'dialog'), ...leaves(viMain, 'main')]

describe('Vietnamese locale', () => {
  test('the template dialog is translated in full', () => {
    // The one surface the generate flow cannot avoid.
    const required = [
      'title',
      'template',
      'showAll',
      'back',
      'next',
      'generate',
      'done'
    ]
    for (const key of required) {
      expect(Object.keys(viDialog.templateDlg)).toContain(key)
    }
  })

  test('the export menu is translated in full', () => {
    // Epic 1 ends at a file the engineer can submit, so every way out of the
    // app has to be readable.
    for (const key of ['export', 'exportPdf', 'exportSvg', 'exportImage']) {
      expect(Object.keys(viMain.mainMenu)).toContain(key)
    }
  })

  test('no string was left in English by accident', () => {
    // A Vietnamese string that happens to be pure ASCII is suspicious: either
    // it is untranslated, or it belongs in the fallback rather than here.
    const suspicious = all.filter(
      ([key, value]) =>
        /^[\x20-\x7E]+$/.test(value) &&
        !key.endsWith('.template') && // "Template" is the word engineers use
        !/^(DXF|PDF|SVG|HTML)$/.test(value)
    )
    expect(suspicious).toEqual([])
  })

  test('no placeholder was dropped in translation', () => {
    // `done` carries counts; losing a placeholder silently turns the message
    // into a lie.
    expect(viDialog.templateDlg.done).toContain('{count}')
    expect(viDialog.templateDlg.done).toContain('{layers}')
  })

  test('the register stays "engineer to engineer"', () => {
    // EXPERIENCE.md is explicit: outcome and numbers, no cheering. Offenders
    // are collected rather than asserted one by one, so a failure names every
    // key at once instead of stopping at the first.
    const cheerful = all
      .filter(([, value]) => /[!🎉✨👍]/u.test(value))
      .map(([key]) => key)

    expect(cheerful).toEqual([])
  })

  test('strings are trimmed and non-empty', () => {
    const malformed = all
      .filter(([, value]) => value.length === 0 || value !== value.trim())
      .map(([key]) => key)

    expect(malformed).toEqual([])
  })
})
