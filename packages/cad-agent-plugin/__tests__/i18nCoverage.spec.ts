/**
 * Every locale the viewer supports must carry every agent string.
 *
 * A missing locale does not throw and does not warn: `agentT` falls back to
 * the key, so the panel simply renders `verificationTitle` where it meant
 * "Kiểm tra bản vẽ". That shipped — Vietnamese is the locale these engineers
 * work in, and it was the one locale the plugin never had. The `satisfies
 * Record<AcApLocale, …>` in the source was supposed to catch it and did not,
 * because this package is not type-checked at build time.
 *
 * A missing *key* inside a present locale fails the same way and just as
 * quietly, so both are checked here.
 */
import { agentCs } from '../src/i18n/cs'
import { agentEn } from '../src/i18n/en'
import { agentTr } from '../src/i18n/tr'
import { agentVi } from '../src/i18n/vi'
import { agentZh } from '../src/i18n/zh'

/** Locales `AcApLocale` declares in cad-simple-viewer. */
const SUPPORTED_LOCALES = ['en', 'zh', 'tr', 'cs', 'vi'] as const

const tables: Record<
  (typeof SUPPORTED_LOCALES)[number],
  Record<string, string>
> = {
  en: agentEn,
  zh: agentZh,
  tr: agentTr,
  cs: agentCs,
  vi: agentVi
}

test('every supported locale has a table', () => {
  for (const locale of SUPPORTED_LOCALES) {
    expect(tables[locale]).toBeDefined()
  }
})

test.each(SUPPORTED_LOCALES)('%s carries every key English has', locale => {
  const missing = Object.keys(agentEn).filter(key => !(key in tables[locale]))
  expect(missing).toEqual([])
})

test.each(SUPPORTED_LOCALES)('%s adds no key English lacks', locale => {
  const extra = Object.keys(tables[locale]).filter(key => !(key in agentEn))
  expect(extra).toEqual([])
})

test.each(SUPPORTED_LOCALES)('%s leaves no value blank', locale => {
  const blank = Object.entries(tables[locale])
    .filter(([, value]) => typeof value !== 'string' || !value.trim())
    .map(([key]) => key)
  expect(blank).toEqual([])
})
