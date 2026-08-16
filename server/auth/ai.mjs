/**
 * The AI proxy.
 *
 * Every call to the model provider goes through here, for two reasons that
 * would each be enough on their own. The provider key never reaches a
 * browser — a key handed to thirty engineers' laptops is a key that has left
 * the company. And the standardisation block, which is the same on every
 * call, is assembled once here so it can be cached by the provider instead of
 * re-sent and re-charged per request.
 *
 * The proxy does not orchestrate the conversation. It forwards messages and
 * returns what came back, because the drawing lives in the browser and only
 * the browser can act on a tool call. Keeping the loop there and the key here
 * is what lets both stay where they belong.
 *
 * The response is passed through verbatim, in the provider's own shape. That
 * is what lets an existing client point its Anthropic base URL at this route
 * and work unchanged, instead of every caller learning a bespoke envelope.
 * The two things this proxy adds — the call id and the standards hash — ride
 * on response headers, where they cost the body nothing.
 */

import { createHash } from 'node:crypto'

import { listLayers, listTerms } from './standards.mjs'
import { listTemplates } from './templates.mjs'

export const ERRORS = {
  NOT_CONFIGURED: 'ai_not_configured',
  UPSTREAM: 'ai_upstream_error',
  INVALID: 'ai_invalid_request',
  TOO_LARGE: 'ai_request_too_large'
}

/** Ceiling on a forwarded request body. */
export const MAX_AI_REQUEST_BYTES = 512 * 1024

/**
 * Default model.
 *
 * Overridable per deployment, because the right trade between capability and
 * cost is a decision for whoever pays the bill, not a constant in a file.
 */
export const DEFAULT_MODEL = process.env.AI_MODEL || 'claude-opus-5'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

/**
 * Price per million tokens, used only to show a monthly figure.
 *
 * Deliberately a plain table rather than a lookup against the provider: a
 * number that is roughly right and always available beats an exact one that
 * needs a second network call to produce. Override per deployment when the
 * published rates change.
 */
const PRICE_PER_MTOK = {
  input: Number(process.env.AI_PRICE_INPUT ?? 5),
  output: Number(process.env.AI_PRICE_OUTPUT ?? 25),
  cacheWrite: Number(process.env.AI_PRICE_CACHE_WRITE ?? 6.25),
  cacheRead: Number(process.env.AI_PRICE_CACHE_READ ?? 0.5)
}

class AiError extends Error {
  constructor(code, detail, status = 400) {
    super(code)
    this.code = code
    this.detail = detail
    this.status = status
  }
}

/** True when the deployment has been given a provider key. */
export function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

/**
 * Builds the standardisation block, byte-for-byte stable.
 *
 * Stability is the whole point. Prompt caching keys on an exact prefix match,
 * so a block that reorders its own keys between requests is a block that is
 * never cached and always paid for. Everything here is sorted and formatted
 * the same way every time, and the hash lets the client confirm it is
 * reasoning about the same standards the server sent.
 */
export function buildStandardsBlock(db) {
  const terms = listTerms(db)
    .slice()
    .sort((a, b) => a.role.localeCompare(b.role))
    .map(term => {
      const aliases = term.aliases.slice().sort()
      const parts = [`- ${term.role}: ${term.label}`]
      if (aliases.length) parts.push(`còn gọi là ${aliases.join(', ')}`)
      if (term.layer) parts.push(`layer ${term.layer}`)
      return parts.join(' · ')
    })

  const layers = listLayers(db)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(layer => `- ${layer.name}: ${layer.meaning}`)

  const templates = listTemplates(db, null, { includeDrafts: false })
    .slice()
    .sort((a, b) =>
      `${a.templateId}@${a.version}`.localeCompare(`${b.templateId}@${b.version}`)
    )
    .map(template => {
      const params = template.params
        .map(param => {
          const range =
            param.min !== undefined && param.max !== undefined
              ? ` (${param.min}–${param.max}${param.unit ? ' ' + param.unit : ''})`
              : ''
          return `${param.key}=${param.label ?? param.key}${range}`
        })
        .join(', ')
      return `- ${template.templateId} v${template.version}: ${template.name}${params ? ` [${params}]` : ''}`
    })

  const text = [
    'NỀN CHUẨN HÓA CỦA CÔNG TY',
    '',
    'Thuật ngữ (khóa: tên chuẩn · bí danh · layer):',
    ...terms,
    '',
    'Danh mục layer:',
    ...layers,
    '',
    'Template đã công bố:',
    ...(templates.length ? templates : ['- (chưa có)']),
    ''
  ].join('\n')

  return { text, hash: createHash('sha256').update(text, 'utf8').digest('hex') }
}

/** Rough cost of one call, in US dollars. */
export function estimateCost(usage) {
  const m = 1_000_000
  return (
    ((usage.input_tokens ?? 0) * PRICE_PER_MTOK.input +
      (usage.output_tokens ?? 0) * PRICE_PER_MTOK.output +
      (usage.cache_creation_input_tokens ?? 0) * PRICE_PER_MTOK.cacheWrite +
      (usage.cache_read_input_tokens ?? 0) * PRICE_PER_MTOK.cacheRead) /
    m
  )
}

function assertRequest(body) {
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    throw new AiError(ERRORS.INVALID, { reason: 'Thiếu danh sách messages.' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_AI_REQUEST_BYTES) {
    throw new AiError(
      ERRORS.TOO_LARGE,
      { limit: MAX_AI_REQUEST_BYTES },
      413
    )
  }
}

/**
 * Forwards one exchange to the provider and records what it cost.
 *
 * @param fetchImpl - Injected so tests never reach the network.
 */
export async function sendToProvider(
  db,
  user,
  body,
  fetchImpl = globalThis.fetch
) {
  assertRequest(body)

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    throw new AiError(
      ERRORS.NOT_CONFIGURED,
      {
        reason:
          'Máy chủ chưa được cấu hình khóa AI. Đặt ANTHROPIC_API_KEY rồi khởi động lại dịch vụ.'
      },
      503
    )
  }

  const standards = buildStandardsBlock(db)
  const model = body.model || DEFAULT_MODEL

  // The standards block is its own system block, marked for caching. It is
  // identical on every call and would otherwise be the largest thing paid for
  // on each one. Anything the caller sent goes after it, so the cached prefix
  // stays exact — putting a caller's prompt first would break the cache on
  // every request that customises anything.
  const system = [
    {
      type: 'text',
      text: standards.text,
      cache_control: { type: 'ephemeral' }
    }
  ]
  if (typeof body.system === 'string' && body.system.trim()) {
    system.push({ type: 'text', text: body.system })
  } else if (Array.isArray(body.system)) {
    // Clients built on an SDK send system as blocks. Their cache_control is
    // dropped: a second cache breakpoint on a prompt that changes per request
    // costs a cache write and buys nothing.
    for (const block of body.system) {
      if (block?.type === 'text' && block.text) {
        system.push({ type: 'text', text: block.text })
      }
    }
  }

  const payload = {
    model,
    max_tokens: Math.min(Number(body.max_tokens) || 4096, 16_000),
    system,
    messages: body.messages,
    // Adaptive thinking on the 4.6+ line; `budget_tokens` is rejected there.
    thinking: { type: 'adaptive' },
    ...(Array.isArray(body.tools) && body.tools.length
      ? { tools: body.tools }
      : {})
  }

  let response
  try {
    response = await fetchImpl(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify(payload)
    })
  } catch (error) {
    throw new AiError(
      ERRORS.UPSTREAM,
      { reason: error instanceof Error ? error.message : String(error) },
      502
    )
  }

  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    recordCall(db, {
      userId: user.id,
      drawingId: body.drawingId ?? null,
      command: body.command ?? '',
      model,
      usage: {},
      errorCode: result?.error?.type ?? `http_${response.status}`
    })
    throw new AiError(
      ERRORS.UPSTREAM,
      { status: response.status, reason: result?.error?.message ?? 'Lỗi từ nhà cung cấp.' },
      502
    )
  }

  const callId = recordCall(db, {
    userId: user.id,
    drawingId: body.drawingId ?? null,
    command: body.command ?? '',
    model,
    usage: result.usage ?? {}
  })

  return { callId, standardsHash: standards.hash, body: result }
}

/** Writes one row of the call log. Returns its id. */
export function recordCall(db, entry) {
  const usage = entry.usage ?? {}
  const result = db
    .prepare(
      `INSERT INTO ai_calls
         (user_id, drawing_id, command, model, input_tokens, output_tokens,
          cache_read_tokens, cache_write_tokens, error_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      entry.userId,
      entry.drawingId ?? null,
      entry.command ?? '',
      entry.model,
      usage.input_tokens ?? 0,
      usage.output_tokens ?? 0,
      usage.cache_read_input_tokens ?? 0,
      usage.cache_creation_input_tokens ?? 0,
      entry.errorCode ?? null
    )
  return Number(result.lastInsertRowid)
}

/**
 * Records what an AI edit actually did, once the browser knows.
 *
 * Separate from the call itself because neither number exists when the
 * response is written: how many entities changed is known after the tools
 * run, and whether it was undone is only known 30 seconds later.
 */
export function recordOutcome(db, userId, callId, outcome) {
  const result = db
    .prepare(
      `UPDATE ai_calls
          SET entities_touched = COALESCE(?, entities_touched),
              undone_within_30s = COALESCE(?, undone_within_30s)
        WHERE id = ? AND user_id = ?`
    )
    .run(
      outcome.entitiesTouched ?? null,
      outcome.undone === undefined ? null : outcome.undone ? 1 : 0,
      callId,
      userId
    )
  return result.changes > 0
}

/**
 * Monthly totals.
 *
 * The undo rate sits beside the cost on purpose: spend alone says how much the
 * assistant was used, not whether it was worth using.
 */
export function monthlyUsage(db, { months = 6 } = {}) {
  return db
    .prepare(
      `SELECT strftime('%Y-%m', created_at) AS month,
              COUNT(*) AS calls,
              SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens,
              SUM(cache_read_tokens) AS cache_read_tokens,
              SUM(cache_write_tokens) AS cache_write_tokens,
              SUM(undone_within_30s) AS undone,
              SUM(CASE WHEN error_code IS NOT NULL THEN 1 ELSE 0 END) AS errors
         FROM ai_calls
        GROUP BY month
        ORDER BY month DESC
        LIMIT ?`
    )
    .all(months)
    .map(row => ({
      ...row,
      estimatedCostUsd:
        Math.round(
          estimateCost({
            input_tokens: row.input_tokens,
            output_tokens: row.output_tokens,
            cache_read_input_tokens: row.cache_read_tokens,
            cache_creation_input_tokens: row.cache_write_tokens
          }) * 10000
        ) / 10000
    }))
}

export { AiError }
