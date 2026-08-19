import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'

import type { LlmSettings } from '../storage/LlmSettingsStore'
import { createProxyFetch } from './drawingIdentity'
import { createOpenAiCompatibleFetch } from './openAiCompatibleFetch'

/**
 * Instantiates an AI SDK language model from persisted LLM settings.
 *
 * Selects the Anthropic, OpenAI, or OpenAI-compatible provider implementation
 * based on {@link LlmSettings.provider}.
 *
 * @param settings - Provider, API key, base URL, and model id.
 * @returns A configured {@link LanguageModel}.
 * @throws When {@link LlmSettings.apiKey} is empty.
 */
export function createModelFromSettings(settings: LlmSettings): LanguageModel {
  // Default path: the deployment's own proxy. The key stays on the server, the
  // company standards are prepended and cached there, and every call is
  // logged against the person who made it. A browser holding a provider key
  // cannot do any of those, and encrypting it in localStorage does not help —
  // the browser has to decrypt it to use it.
  if (!settings.provider || settings.provider === 'proxy') {
    const proxied = createAnthropic({
      baseURL: settings.baseUrl || '/api/ai',
      // The proxy ignores this and uses the server key. A value is required
      // only because the SDK refuses to construct without one.
      apiKey: 'via-proxy',
      // Tells the server which drawing the call was for, so cost and edits can
      // be attributed to it — see {@link createProxyFetch}.
      fetch: createProxyFetch()
    })
    return proxied(settings.model || 'claude-opus-5')
  }

  if (!settings.apiKey.trim()) {
    throw new Error('API key is required. Open Agent settings to configure it.')
  }

  if (settings.provider === 'anthropic') {
    const anthropic = createAnthropic({
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl || undefined
    })
    return anthropic(settings.model)
  }

  if (settings.provider === 'openai') {
    const openai = createOpenAI({
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl || undefined
    })
    return openai.chat(settings.model)
  }

  // DeepSeek text API, DeepSeek VL, and other OpenAI-compatible endpoints use
  // /chat/completions and reject the `developer` role that AI SDK 5 may emit.
  const openai = createOpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl || undefined,
    fetch: createOpenAiCompatibleFetch()
  })
  return openai.chat(settings.model)
}
