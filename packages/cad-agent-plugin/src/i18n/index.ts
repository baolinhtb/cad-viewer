import { AcApI18n, type AcApLocale } from '@mlightcad/cad-simple-viewer'

import { agentCs } from './cs'
import { agentEn } from './en'
import { agentTr } from './tr'
import { agentVi } from './vi'
import { agentZh } from './zh'

/** Vue i18n key prefix for all agent UI strings (`main.toolPalette.agent`). */
export const AGENT_I18N_PREFIX = 'main.toolPalette.agent'

/** Union of keys in {@link agentEn} used for type-safe translations. */
export type AgentChatLabelKey = keyof typeof agentEn

/** Map of every agent UI label key to its translated string. */
export type AgentChatLabels = Record<AgentChatLabelKey, string>

/** Locale-specific flat message tables before nesting under `main.toolPalette.agent`. */
const agentMessagesByLocale = {
  en: agentEn,
  zh: agentZh,
  tr: agentTr,
  cs: agentCs,
  vi: agentVi
} as const satisfies Record<AcApLocale, AgentChatLabels>

/** Every locale the agent ships strings for. */
export function agentLocales(): AcApLocale[] {
  return Object.keys(agentMessagesByLocale) as AcApLocale[]
}

/** Guards {@link registerAgentI18n} against duplicate merges. */
let isRegistered = false

/**
 * Builds the nested vue-i18n message object for one locale.
 *
 * @param locale - Target locale (`en` or `zh`).
 * @returns Messages shaped for `mergeLocaleMessage`.
 */
function buildVueMessages(locale: AcApLocale) {
  return {
    main: {
      toolPalette: {
        agent: agentMessagesByLocale[locale]
      }
    }
  }
}

/**
 * Registers CAD Agent UI strings into {@link AcApI18n}.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export function registerAgentI18n(): void {
  if (isRegistered) return

  // Driven by the table, not by a hand-written list. The list is how `vi`
  // went missing: adding a locale meant remembering two call sites, and a
  // forgotten one costs nothing at build time and shows the user raw keys.
  for (const locale of agentLocales()) {
    AcApI18n.mergeLocaleMessage(locale, buildVueMessages(locale))
  }
  isRegistered = true
}

/**
 * Merges agent UI strings into a vue-i18n instance (e.g. cad-viewer).
 *
 * @param mergeLocaleMessage - Host app's `mergeLocaleMessage` callback.
 */
export function mergeAgentI18nIntoVueI18n(
  mergeLocaleMessage: (locale: AcApLocale, message: object) => void
): void {
  registerAgentI18n()
  for (const locale of agentLocales()) {
    mergeLocaleMessage(locale, buildVueMessages(locale))
  }
}

/**
 * Translates a single agent label via {@link AcApI18n}.
 *
 * @param key - Label key from {@link agentEn}.
 * @returns Localized string, or the key as fallback.
 */
export function agentT(key: AgentChatLabelKey): string {
  return AcApI18n.t(`${AGENT_I18N_PREFIX}.${key}`, { fallback: key })
}

/**
 * Builds a reactive-friendly map of all agent labels for the current locale.
 *
 * All label keys are derived from {@link agentEn} — add new strings in en.ts/zh.ts only.
 *
 * @returns Every {@link AgentChatLabelKey} mapped to its translation.
 */
export function buildAgentLabels(): AgentChatLabels {
  return Object.fromEntries(
    (Object.keys(agentEn) as AgentChatLabelKey[]).map(key => [key, agentT(key)])
  ) as AgentChatLabels
}
