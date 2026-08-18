import { APICallError } from 'ai'

/**
 * Extracts a human-readable message from a provider error payload.
 *
 * @param value - Parsed JSON body or nested `error` object from an API response.
 * @returns Trimmed message string, or `undefined` when none is found.
 */
function extractApiMessage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined

  const record = value as Record<string, unknown>
  const nestedError = record.error
  if (nestedError && typeof nestedError === 'object') {
    const nestedMessage = (nestedError as Record<string, unknown>).message
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
      return nestedMessage.trim()
    }
  }

  for (const key of ['message', 'detail', 'error']) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return undefined
}

/**
 * Turns provider/API errors into a short user-facing message.
 *
 * @param error - Error thrown by the AI SDK or transport layer.
 * @returns A concise message suitable for the chat error banner.
 */
/**
 * Names the field behind an "Invalid prompt" instead of the message type.
 *
 * `InvalidPromptError` reports that the messages "must be a ModelMessage[]",
 * which is almost never what went wrong: the messages were converted, and one
 * value inside them failed validation — an `undefined`, a `NaN`, an `Infinity`
 * left in a tool result. The useful detail is in the error's `cause`, a Zod
 * error nobody sees, so a whole conversation dies pointing at the wrong thing.
 * Twice now that has cost a session's worth of investigation.
 */
function describePromptCause(error: Error): string | undefined {
  // Walk the chain rather than reading `cause` once: the SDK wraps the Zod
  // error in a `TypeValidationError` before attaching it, so the issues sit at
  // `cause.cause`. Reading one level found nothing and printed no hint at all,
  // which is worse than useless — it looks like there was nothing to say.
  let node: unknown = error
  let issues: unknown
  for (let depth = 0; depth < 5 && node; depth += 1) {
    const candidate = (node as { issues?: unknown }).issues
    if (Array.isArray(candidate) && candidate.length > 0) {
      issues = candidate
      break
    }
    node = (node as { cause?: unknown }).cause
  }
  if (!Array.isArray(issues) || issues.length === 0) return undefined

  const paths = issues
    .slice(0, 3)
    .map(issue => {
      const path = (issue as { path?: unknown[] }).path
      return Array.isArray(path) && path.length > 0 ? path.join('.') : undefined
    })
    .filter((path): path is string => Boolean(path))

  return paths.length > 0 ? paths.join(', ') : undefined
}

export function formatChatError(error: Error): string {
  const promptCause =
    error.name === 'AI_InvalidPromptError' ||
    /Invalid prompt/i.test(error.message ?? '')
      ? describePromptCause(error)
      : undefined
  if (promptCause) {
    return `${error.message.trim()} (không hợp lệ tại: ${promptCause})`
  }

  if (APICallError.isInstance(error)) {
    const fromBody = extractApiMessage(error.responseBody)
    if (fromBody) return fromBody
  }

  const responseBody = (error as Error & { responseBody?: unknown })
    .responseBody
  const fromBody = extractApiMessage(responseBody)
  if (fromBody) return fromBody

  const message = error.message?.trim()
  if (!message) return 'Unknown error'

  const jsonMatch = message.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      const fromJson = extractApiMessage(parsed)
      if (fromJson) return fromJson
    } catch {
      // fall through to raw message
    }
  }

  return message
}
