/** Metadata for one stored drawing, as the server lists it. */
export interface AcApStoredDrawing {
  id: string
  name: string
  template_id: string | null
  template_version: string | null
  batch_id: string | null
  revision: number
  created_at: string
  updated_at: string
  size_bytes: number | null
}

/** Payload sent when creating or updating a drawing. */
export interface AcApDrawingPayload {
  id?: string
  name?: string
  templateId?: string | null
  templateVersion?: string | null
  params?: Record<string, unknown> | null
  batchId?: string | null
  dxf?: string
  revision?: number
}

/** Everything the storage layer needs from the network. */
export interface AcApStorageApi {
  list(search?: string): Promise<AcApStoredDrawing[]>
  get(
    id: string
  ): Promise<(AcApDrawingPayload & { revision: number }) | undefined>
  create(payload: AcApDrawingPayload): Promise<{ id: string; revision: number }>
  update(
    id: string,
    payload: AcApDrawingPayload
  ): Promise<
    | { id: string; revision: number }
    | { conflict: true; currentRevision: number }
  >
  remove(id: string): Promise<boolean>
}

/** Thrown for server errors that carry a machine-readable code. */
export class AcApStorageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'AcApStorageError'
  }
}

/**
 * Talks to `/api/drawings`.
 *
 * A conflict is returned rather than thrown: two tabs on one drawing is an
 * ordinary situation the caller has to handle, not an exceptional one.
 *
 * @param fetchImpl - Injected for testing; defaults to the global `fetch`.
 * @param baseUrl - Root of the drawings API.
 */
export function createStorageApi(
  fetchImpl: typeof fetch = fetch,
  baseUrl = '/api/drawings'
): AcApStorageApi {
  async function request(
    method: string,
    url: string,
    body?: unknown
  ): Promise<Response> {
    return fetchImpl(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  }

  async function fail(response: Response): Promise<never> {
    let code = 'unknown'
    let message = `HTTP ${response.status}`
    try {
      const payload = await response.json()
      code = payload.code ?? code
      message = payload.error ?? message
    } catch {
      // Body was not JSON; the status alone has to do.
    }
    throw new AcApStorageError(code, message, response.status)
  }

  return {
    async list(search) {
      const query = search ? `?q=${encodeURIComponent(search)}` : ''
      const response = await request('GET', `${baseUrl}${query}`)
      if (!response.ok) await fail(response)
      return (await response.json()).drawings
    },

    async get(id) {
      const response = await request(
        'GET',
        `${baseUrl}/${encodeURIComponent(id)}`
      )
      if (response.status === 404) return undefined
      if (!response.ok) await fail(response)
      return await response.json()
    },

    async create(payload) {
      const response = await request('POST', baseUrl, payload)
      if (!response.ok) await fail(response)
      return await response.json()
    },

    async update(id, payload) {
      const response = await request(
        'PUT',
        `${baseUrl}/${encodeURIComponent(id)}`,
        payload
      )
      if (response.status === 409) {
        const body = await response.json()
        return { conflict: true, currentRevision: body.currentRevision }
      }
      if (!response.ok) await fail(response)
      return await response.json()
    },

    async remove(id) {
      const response = await request(
        'DELETE',
        `${baseUrl}/${encodeURIComponent(id)}`
      )
      if (response.status === 404) return false
      if (!response.ok) await fail(response)
      return true
    }
  }
}
