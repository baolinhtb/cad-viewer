import { i18n } from '@mlightcad/cad-viewer'
import { AcApI18n } from '@mlightcad/cad-simple-viewer'

import en from './en'
import vi from './vi'
import zh from './zh'

const LOCALES = { en, zh, vi } as const

export const initializeLocale = () => {
  for (const [locale, messages] of Object.entries(LOCALES)) {
    AcApI18n.mergeLocaleMessage(locale as keyof typeof LOCALES, messages)
    // vue-i18n took a snapshot of AcApI18n.messages when its instance was
    // created, which happens on import — before this function runs. Merging
    // into AcApI18n alone therefore updates the command line but not the Vue
    // components, so the instance is told directly as well.
    i18n.global.mergeLocaleMessage(locale, messages)
  }
}
