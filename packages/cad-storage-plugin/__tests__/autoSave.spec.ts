import { createAutoSaver } from '../src/autoSave'
import type { AcApStorageApi } from '../src/storageApi'

/** Stub API that records what was asked of it. */
function createApi(overrides: Partial<AcApStorageApi> = {}) {
  const calls = { create: 0, update: 0 }
  let revision = 0

  const api: AcApStorageApi = {
    list: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue(undefined),
    create: jest.fn(async () => {
      calls.create++
      revision = 1
      return { id: 'drw_1', revision }
    }),
    update: jest.fn(async () => {
      calls.update++
      revision++
      return { id: 'drw_1', revision }
    }),
    remove: jest.fn().mockResolvedValue(true),
    ...overrides
  }

  return { api, calls }
}

function saverFor(api: AcApStorageApi, dxf: () => string | undefined) {
  return createAutoSaver({ api, readDxf: dxf, debounceMs: 0 })
}

const flushTimers = () => new Promise(resolve => setTimeout(resolve, 5))

describe('auto save', () => {
  test('the first save creates the drawing, later saves update it', async () => {
    let dxf = 'v1'
    const { api, calls } = createApi()
    const saver = saverFor(api, () => dxf)
    saver.attach({ name: 'Cầu A' })

    await saver.flush()
    expect(calls.create).toBe(1)
    expect(saver.current?.id).toBe('drw_1')
    expect(saver.current?.revision).toBe(1)

    dxf = 'v2'
    await saver.flush()
    expect(calls.update).toBe(1)
    expect(saver.current?.revision).toBe(2)
  })

  test('a run that changes nothing does not upload again', async () => {
    const { api, calls } = createApi()
    const saver = saverFor(api, () => 'same-bytes')
    saver.attach({ name: 'Cầu A' })

    await saver.flush()
    const result = await saver.flush()

    expect(result).toEqual({ status: 'unchanged' })
    expect(calls.create).toBe(1)
    expect(calls.update).toBe(0)
  })

  test('a burst of edits collapses into one upload', async () => {
    // A template drawing two hundred entities closes one undo mark, but any
    // UI can emit several events in a row; the saver must not turn those into
    // several uploads.
    let dxf = 'v1'
    const { api, calls } = createApi()
    const saver = saverFor(api, () => dxf)
    saver.attach({ name: 'Cầu A' })

    saver.onEditCompleted()
    saver.onEditCompleted()
    dxf = 'v2'
    saver.onEditCompleted()

    await flushTimers()

    expect(calls.create).toBe(1)
    expect(calls.update).toBe(0)
  })

  test('a conflict stops automatic writing instead of overwriting', async () => {
    let dxf = 'v1'
    const { api } = createApi({
      update: jest.fn(async () => ({
        conflict: true as const,
        currentRevision: 7
      }))
    })
    const saver = saverFor(api, () => dxf)
    saver.attach({ name: 'Cầu A' })

    await saver.flush() // create
    dxf = 'v2'
    const result = await saver.flush()

    expect(result).toEqual({ status: 'conflict', currentRevision: 7 })
    expect(saver.isHalted).toBe(true)

    // Nothing further goes out until the user has dealt with it.
    dxf = 'v3'
    await saver.flush()
    expect(api.update).toHaveBeenCalledTimes(1)
  })

  test('resuming after a conflict picks up the server revision', async () => {
    let dxf = 'v1'
    const update = jest
      .fn()
      .mockResolvedValueOnce({ conflict: true as const, currentRevision: 7 })
      .mockResolvedValueOnce({ id: 'drw_1', revision: 8 })
    const { api } = createApi({ update })
    const saver = saverFor(api, () => dxf)
    saver.attach({ name: 'Cầu A' })

    await saver.flush()
    dxf = 'v2'
    await saver.flush()

    saver.resume(7)
    dxf = 'v3'
    const result = await saver.flush()

    expect(result).toEqual({ status: 'saved', id: 'drw_1', revision: 8 })
    expect(saver.isHalted).toBe(false)
  })

  test('a network failure is reported and does not lose the next attempt', async () => {
    const dxf = 'v1'
    const create = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('mất kết nối'), { code: 'offline' })
      )
      .mockResolvedValueOnce({ id: 'drw_1', revision: 1 })
    const { api } = createApi({ create })
    const saver = saverFor(api, () => dxf)
    saver.attach({ name: 'Cầu A' })

    const failed = await saver.flush()
    expect(failed).toEqual({
      status: 'failed',
      code: 'offline',
      message: 'mất kết nối'
    })

    const ok = await saver.flush()
    expect(ok).toEqual({ status: 'saved', id: 'drw_1', revision: 1 })
  })

  test('listeners see every outcome', async () => {
    const { api } = createApi()
    const saver = saverFor(api, () => 'v1')
    const seen: string[] = []
    saver.onResult(result => seen.push(result.status))
    saver.attach({ name: 'Cầu A' })

    await saver.flush()

    expect(seen).toEqual(['saved'])
  })

  test('the drawing recipe travels with the save', async () => {
    const { api } = createApi()
    const saver = saverFor(api, () => 'v1')
    saver.attach({
      name: 'Cầu Sông Lô',
      templateId: 'cau_ban_btct',
      templateVersion: '1.0.0',
      params: { B: 9 },
      batchId: 'batch-1'
    })

    await saver.flush()

    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Cầu Sông Lô',
        templateId: 'cau_ban_btct',
        templateVersion: '1.0.0',
        params: { B: 9 },
        batchId: 'batch-1',
        dxf: 'v1'
      })
    )
  })

  test('nothing is saved before a drawing is attached', async () => {
    const { api, calls } = createApi()
    const saver = saverFor(api, () => 'v1')

    await saver.flush()

    expect(calls.create).toBe(0)
  })
})
