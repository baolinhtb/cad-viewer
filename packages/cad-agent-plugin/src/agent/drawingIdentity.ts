/**
 * Which stored drawing the assistant is working on, if any.
 *
 * The agent plugin does not reach into the storage plugin to find out. Plugins
 * here stay unaware of each other and the host composes them — the same rule
 * that puts `setAgentPaletteOpener` in the viewer's registration rather than a
 * direct import. So the host supplies a provider and this module holds it.
 *
 * Unknown is a normal answer, not a failure: a drawing opened from a file and
 * never saved has no id yet, and the assistant works on it just the same.
 */
let provider: (() => string | undefined) | undefined

/** Installed by the host once the storage plugin is available. */
export function setDrawingIdProvider(fn: (() => string | undefined) | undefined) {
  provider = fn
}

/**
 * The current drawing's server id, or `undefined` when it has none.
 *
 * Never throws: this is called on the request path, and a provider that fails
 * must cost a label, not the turn.
 */
export function currentDrawingId(): string | undefined {
  try {
    const id = provider?.()
    return typeof id === 'string' && id.trim() ? id : undefined
  } catch {
    return undefined
  }
}

/**
 * Wraps `fetch` so every proxied model call says which drawing it was for.
 *
 * The server has recorded a `drawing_id` on every AI call since the table was
 * created, and the client has never sent one: 338 calls on the deployment, all
 * with it null. So the cost of a drawing could not be answered, and neither
 * could "what did the assistant do to this drawing" — the two questions the
 * column exists for.
 *
 * The body is only touched to add the field. Anything unparseable is forwarded
 * untouched, because a labelling feature must never be able to break a turn.
 */
export function createProxyFetch(
  baseFetch: typeof fetch = globalThis.fetch.bind(globalThis)
): typeof fetch {
  return async (input, init) => {
    const drawingId = currentDrawingId()
    if (!drawingId || !init?.body || typeof init.body !== 'string') {
      return baseFetch(input, init)
    }

    try {
      const body = JSON.parse(init.body) as Record<string, unknown>
      // Never overwrite one the caller set deliberately.
      if (body.drawingId === undefined) body.drawingId = drawingId
      return baseFetch(input, { ...init, body: JSON.stringify(body) })
    } catch {
      return baseFetch(input, init)
    }
  }
}
