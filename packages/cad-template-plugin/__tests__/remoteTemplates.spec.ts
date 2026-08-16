import {
  asTemplate,
  type AcApFetch,
  loadRemoteTemplates,
  markTemplateVerified,
  refreshDictionary,
  refreshRoleLayers
} from '../src/remoteTemplates'
import {
  findTemplate,
  listRegisteredTemplates,
  listTemplates,
  dictionary,
  roleLayers,
  setDictionary,
  setRemoteTemplates,
  setRoleLayers
} from '../src/templateRegistry'

jest.mock('@mlightcad/cad-template-cau-ban-btct', () => ({
  __esModule: true,
  default: {
    meta: {
      id: 'cau_ban_btct',
      version: '1.0.0',
      name: 'Cầu bản BTCT',
      category: 'cau'
    },
    params: [],
    generate: () => undefined
  }
}))

jest.mock('@mlightcad/cad-template-sdk', () => ({
  __esModule: true,
  SEED_ROLE_LAYERS: { lan_can: 'KC-LANCAN' },
  SEED_DICTIONARY: [{ role: 'lan_can', label: 'Lan can', aliases: [], layer: 'KC-LANCAN' }]
}))

/** A template as the library returns it, without evaluating any module. */
function summary(overrides: Record<string, unknown> = {}) {
  return {
    templateId: 'cau_dam_i',
    version: '1.0.0',
    name: 'Cầu dầm I',
    category: 'cau',
    description: null,
    status: 'published' as const,
    uploadedBy: 1,
    verifiedAt: '2026-08-16 07:00:00',
    ...overrides
  }
}

/**
 * Stands in for module evaluation.
 *
 * Real evaluation needs blob URLs and dynamic import, which exist only in a
 * browser. What is worth testing here is the fetching and the failure
 * isolation around it.
 */
const evaluateFake = async (code: string) => {
  if (code.includes('BROKEN')) throw new Error('Cú pháp module hỏng.')
  return {
    meta: { id: 'cau_dam_i' },
    params: [],
    generate: () => undefined
  } as never
}

/** Fetch stub driven by a URL → response map. */
function fetchOf(
  routes: Record<string, unknown>,
  missing: string[] = []
): AcApFetch {
  return async (url: string) => {
    if (missing.includes(url)) {
      return { ok: false, status: 404, json: async () => ({}) }
    }
    const body = routes[url]
    if (body === undefined) {
      return { ok: false, status: 404, json: async () => ({}) }
    }
    return { ok: true, status: 200, json: async () => body }
  }
}

describe('recognising an uploaded module', () => {
  test('a module exporting a template by default is accepted', () => {
    const value = {
      default: { meta: { id: 'x' }, params: [], generate: () => undefined }
    }
    expect(asTemplate(value)?.meta.id).toBe('x')
  })

  test('the wrong shape is rejected here, not later inside a generate run', () => {
    // A module that loads but is not a template otherwise fails during
    // drawing, where the message an engineer sees is about geometry rather
    // than about a bad upload.
    for (const value of [
      undefined,
      null,
      42,
      { default: {} },
      { default: { meta: { id: 'x' }, params: [] } }, // no generate
      { default: { meta: {}, params: [], generate: () => undefined } }, // no id
      { default: { meta: { id: 'x' }, generate: () => undefined } } // no params
    ]) {
      expect(asTemplate(value)).toBeUndefined()
    }
  })
})

describe('the registry', () => {
  beforeEach(() => setRemoteTemplates([]))

  test('built-ins are available before anything has been uploaded', () => {
    // A library that starts empty gives a new deployment nothing to do.
    expect(listTemplates().map(t => t.meta.id)).toEqual(['cau_ban_btct'])
  })

  test('library templates join the built-ins', () => {
    setRemoteTemplates([
      {
        template: {
          meta: { id: 'cau_dam_i' },
          params: [],
          generate: () => undefined
        } as never,
        source: summary()
      }
    ])
    expect(listTemplates().map(t => t.meta.id)).toEqual([
      'cau_ban_btct',
      'cau_dam_i'
    ])
    expect(listRegisteredTemplates().map(t => t.origin)).toEqual([
      'built-in',
      'library'
    ])
  })

  test('replacing the set removes a template deleted on the server', () => {
    // Merging instead would keep a deleted template alive in every session
    // that had already loaded it.
    setRemoteTemplates([
      {
        template: {
          meta: { id: 'cau_dam_i' },
          params: [],
          generate: () => undefined
        } as never,
        source: summary()
      }
    ])
    setRemoteTemplates([])
    expect(findTemplate('cau_dam_i')).toBeUndefined()
  })

  test('a built-in wins over a library template claiming the same id', () => {
    // Reusing an id by accident is far more likely than deliberately shadowing
    // a shipped template, and the quiet version of that mistake is worse.
    setRemoteTemplates([
      {
        template: {
          meta: { id: 'cau_ban_btct', name: 'Giả mạo' },
          params: [],
          generate: () => undefined
        } as never,
        source: summary({ templateId: 'cau_ban_btct' })
      }
    ])
    expect(findTemplate('cau_ban_btct')?.meta.name).toBe('Cầu bản BTCT')
  })

  test('the layer mapping falls back to the SDK until standards override it', () => {
    expect(roleLayers()).toEqual({ lan_can: 'KC-LANCAN' })
    setRoleLayers({ lan_can: 'CTY-LANCAN' })
    expect(roleLayers()).toEqual({ lan_can: 'CTY-LANCAN' })
    setRoleLayers(undefined as never)
  })
})

describe('loading the library', () => {
  test('a template that fails to load does not take the others down', async () => {
    // One bad upload would otherwise leave every engineer with no templates.
    const good = summary()
    const bad = summary({ templateId: 'hong', version: '1.0.0' })

    const load = await loadRemoteTemplates(
      fetchOf(
        {
          '/api/templates': { templates: [good, bad] },
          '/api/templates/cau_dam_i/1.0.0': {
            template: { code: 'export default {}' }
          }
        },
        ['/api/templates/hong/1.0.0']
      ),
      '/api/templates',
      evaluateFake
    )

    expect(load.failed.map(f => f.templateId)).toEqual(['hong'])
    expect(load.failed[0].reason).toContain('404')
    // The good one still loaded — proving the failure was isolated, not fatal.
    expect(load.loaded.map(l => l.source.templateId)).toEqual(['cau_dam_i'])
  })

  test('a listing that cannot be fetched is reported, not swallowed', async () => {
    await expect(
      loadRemoteTemplates(
        fetchOf({}, ['/api/templates']),
        '/api/templates',
        evaluateFake
      )
    ).rejects.toThrow(/HTTP 404/)
  })

  test('a template row with no code is a failure, not an empty template', async () => {
    const load = await loadRemoteTemplates(
      fetchOf({
        '/api/templates': { templates: [summary()] },
        '/api/templates/cau_dam_i/1.0.0': { template: {} }
      }),
      '/api/templates',
      evaluateFake
    )
    expect(load.loaded).toEqual([])
    expect(load.failed[0].reason).toContain('Thiếu nội dung')
  })

  test('a module that throws while evaluating is isolated too', async () => {
    const load = await loadRemoteTemplates(
      fetchOf({
        '/api/templates': { templates: [summary()] },
        '/api/templates/cau_dam_i/1.0.0': { template: { code: 'BROKEN' } }
      }),
      '/api/templates',
      evaluateFake
    )
    expect(load.loaded).toEqual([])
    expect(load.failed[0].reason).toContain('Cú pháp module hỏng')
  })
})

describe('publishing after a successful run', () => {
  test('the publish call targets the id and version that ran', async () => {
    const calls: string[] = []
    const ok = await markTemplateVerified('cau_dam_i', '1.0.0', async url => {
      calls.push(url)
      return { ok: true, status: 200, json: async () => ({}) }
    })
    expect(ok).toBe(true)
    expect(calls).toEqual(['/api/templates/cau_dam_i/1.0.0/publish'])
  })

  test('a refused publish is reported rather than thrown', async () => {
    // The engineer got their drawing; a failed publish must not surface as an
    // error against the run.
    const ok = await markTemplateVerified('x', '1.0.0', async () => ({
      ok: false,
      status: 403,
      json: async () => ({})
    }))
    expect(ok).toBe(false)
  })
})

describe('the company layer mapping', () => {
  beforeEach(() => setRoleLayers(undefined as never))

  test('a fetched mapping replaces the built-in one', async () => {
    const applied = await refreshRoleLayers(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ roleLayers: { lan_can: 'CTY-LANCAN' } })
    }))
    expect(applied).toBe(true)
    expect(roleLayers()).toEqual({ lan_can: 'CTY-LANCAN' })
  })

  test('an empty mapping is not applied', async () => {
    // Applying it would leave every role unlayered and every template unable
    // to draw — worse than drawing on the built-in names.
    const applied = await refreshRoleLayers(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ roleLayers: {} })
    }))
    expect(applied).toBe(false)
    expect(roleLayers()).toEqual({ lan_can: 'KC-LANCAN' })
  })

  test('a mapping that cannot be fetched leaves the built-in one alone', async () => {
    const applied = await refreshRoleLayers(async () => {
      throw new Error('mạng hỏng')
    })
    expect(applied).toBe(false)
    expect(roleLayers()).toEqual({ lan_can: 'KC-LANCAN' })
  })
})

describe('the company dictionary', () => {
  beforeEach(() => setDictionary(undefined as never))

  test('until it loads, the seed terms still resolve', () => {
    // A deployment whose standards service is briefly unreachable should still
    // answer "lan can". An empty dictionary answers nothing at all.
    expect(dictionary().map(term => term.role)).toEqual(['lan_can'])
  })

  test('the company terms replace the seed set', async () => {
    const applied = await refreshDictionary(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        terms: [
          { role: 'lan_can', label: 'Lan can', aliases: ['tay vịn'], layer: 'CTY-LANCAN' }
        ]
      })
    }))
    expect(applied).toBe(true)
    expect(dictionary()[0].aliases).toEqual(['tay vịn'])
  })

  test('aliases stored as a JSON string are read, not dropped', async () => {
    // SQLite hands them back as text on some paths and as an array on others.
    await refreshDictionary(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        terms: [{ role: 'lan_can', label: 'Lan can', aliases: '["tay vịn"]' }]
      })
    }))
    expect(dictionary()[0].aliases).toEqual(['tay vịn'])
  })

  test('one unreadable alias list costs that term its aliases, not the dictionary', async () => {
    await refreshDictionary(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        terms: [
          { role: 'lan_can', label: 'Lan can', aliases: 'không phải JSON' },
          { role: 'lop_phu', label: 'Lớp phủ', aliases: ['bê tông nhựa'] }
        ]
      })
    }))
    expect(dictionary()).toHaveLength(2)
    expect(dictionary()[0].aliases).toEqual([])
    expect(dictionary()[1].aliases).toEqual(['bê tông nhựa'])
  })

  test('a term with no role is skipped rather than resolved to undefined', async () => {
    await refreshDictionary(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        terms: [{ label: 'Không có role' }, { role: 'lan_can', label: 'Lan can' }]
      })
    }))
    expect(dictionary().map(term => term.role)).toEqual(['lan_can'])
  })

  test('an empty dictionary is not applied', async () => {
    const applied = await refreshDictionary(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ terms: [] })
    }))
    expect(applied).toBe(false)
    expect(dictionary().map(term => term.role)).toEqual(['lan_can'])
  })

  test('a failed request leaves the seed terms in place', async () => {
    const applied = await refreshDictionary(async () => {
      throw new Error('mạng hỏng')
    })
    expect(applied).toBe(false)
    expect(dictionary()).toHaveLength(1)
  })
})
