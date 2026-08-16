import type { AcTpTerm } from '@mlightcad/cad-template-sdk'

import {
  describeDrawing,
  findPartsByPhrase,
  highlightParts,
  runSemanticTool,
  SEMANTIC_TOOLS
} from '../src/semanticTools'

/**
 * The drawing and view the tools act on.
 *
 * Stubbed rather than built: what these tests are about is the contract the
 * assistant sees — which outcomes are `ok`, what a refusal looks like, whether
 * a highlight reaches the selection set. The query layer itself is tested
 * against real geometry in the SDK.
 */
const selection = { cleared: 0, added: [] as string[] }

let digest: unknown = {
  status: 'tagged',
  templateIds: ['cau_ban_btct'],
  untaggedEntityCount: 0,
  parts: [
    {
      role: 'lan_can',
      roleLabel: 'Lan can',
      partId: 'lan_can_trai',
      side: 'trai',
      layers: ['KC-LANCAN'],
      entityCount: 1,
      objectIds: ['e1'],
      params: { hLanCan: 1270 }
    },
    {
      role: 'lan_can',
      roleLabel: 'Lan can',
      partId: 'lan_can_phai',
      side: 'phai',
      layers: ['KC-LANCAN'],
      entityCount: 2,
      objectIds: ['e2', 'e3']
    }
  ]
}

let hasDocument = true

jest.mock('@mlightcad/cad-simple-viewer', () => ({
  __esModule: true,
  AcApDocManager: {
    get instance() {
      return {
        curDocument: hasDocument ? { database: {} } : undefined,
        curView: {
          selectionSet: {
            clear: () => {
              selection.cleared++
            },
            add: (ids: string[]) => {
              selection.added.push(...ids)
            }
          }
        }
      }
    }
  }
}))

jest.mock('@mlightcad/cad-template-sdk', () => ({
  __esModule: true,
  readDrawingDigest: () => digest,
  canEditSemantically: (_db: unknown, d: { status: string }) => ({
    allowed: d.status === 'tagged',
    reason:
      d.status === 'tagged' ? undefined : 'Bản vẽ không mang nhãn ngữ nghĩa.'
  }),
  describePart: (part: { roleLabel?: string; side?: string }) =>
    `${part.roleLabel}${part.side === 'trai' ? ' bên trái' : part.side === 'phai' ? ' bên phải' : ''}`,
  locateParts: (
    _db: unknown,
    phrase: string,
    _dictionary: unknown,
    qualifier: { side?: string } = {}
  ) => {
    const all = (digest as { parts: { side?: string }[] }).parts
    if ((digest as { status: string }).status !== 'tagged') {
      return { status: 'unsupported', parts: [], message: 'không có nhãn' }
    }
    if (phrase === 'máy xúc') {
      return {
        status: 'unknown_term',
        parts: [],
        suggestions: [
          { role: 'lan_can', label: 'Lan can', reason: 'gần giống' }
        ],
        message: 'chưa hiểu'
      }
    }
    const matched = qualifier.side
      ? all.filter(part => part.side === qualifier.side)
      : all
    if (matched.length === 0) {
      return { status: 'not_found', parts: [], message: 'không có' }
    }
    return {
      status: matched.length > 1 ? 'ambiguous' : 'found',
      parts: matched,
      message: matched.length > 1 ? 'nhiều bộ phận khớp' : 'đã xác định'
    }
  }
}))

const DICTIONARY: AcTpTerm[] = [
  { role: 'lan_can', label: 'Lan can', aliases: ['tay vịn'] }
]

beforeEach(() => {
  selection.cleared = 0
  selection.added = []
  hasDocument = true
})

describe('the tool declarations', () => {
  test('every tool closes its schema to unknown properties', () => {
    // An open schema lets a model pass a field the tool ignores, and the model
    // then believes it asked for something it did not get.
    for (const tool of SEMANTIC_TOOLS) {
      expect(tool.input_schema.additionalProperties).toBe(false)
      expect(tool.input_schema.type).toBe('object')
    }
  })

  test('the ambiguity rule is stated in the tool the model reads', () => {
    // The model only ever sees these descriptions. A rule that lives in a
    // comment is a rule the model was never told.
    const find = SEMANTIC_TOOLS.find(tool => tool.name === 'tim_bo_phan')!
    expect(find.description).toContain('ambiguous')
    expect(find.description).toContain('không tự chọn')
    expect(find.description).toContain('không đoán')
  })

  test('the untagged-drawing rule is stated too', () => {
    const describe_ = SEMANTIC_TOOLS.find(tool => tool.name === 'mo_ta_ban_ve')!
    expect(describe_.description).toContain('untagged')
    expect(describe_.description).toContain('không được sửa')
  })

  test('only implemented tools are offered', () => {
    // Declaring a modify tool this build cannot execute would tell the model
    // it can do something it cannot — worse than not offering it.
    expect(SEMANTIC_TOOLS.map(tool => tool.name)).toEqual([
      'mo_ta_ban_ve',
      'tim_bo_phan',
      'to_sang_bo_phan'
    ])
  })
})

describe('describing the drawing', () => {
  test('a tagged drawing lists its parts', () => {
    const outcome = describeDrawing()
    expect(outcome.ok).toBe(true)
    expect((outcome.data as { parts: unknown[] }).parts).toHaveLength(2)
  })

  test('an untagged drawing refuses, and says why', () => {
    digest = {
      status: 'untagged',
      parts: [],
      templateIds: [],
      untaggedEntityCount: 40
    }
    const outcome = describeDrawing()
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('unsupported')
    expect(outcome.message).toContain('không mang nhãn')
    digest = { ...(digest as object), status: 'tagged' }
  })

  test('no open drawing is a refusal, not a crash', () => {
    hasDocument = false
    expect(describeDrawing().ok).toBe(false)
  })
})

describe('locating', () => {
  beforeEach(() => {
    digest = {
      status: 'tagged',
      templateIds: [],
      untaggedEntityCount: 0,
      parts: [
        {
          role: 'lan_can',
          roleLabel: 'Lan can',
          partId: 'lan_can_trai',
          side: 'trai',
          layers: ['KC-LANCAN'],
          entityCount: 1,
          objectIds: ['e1']
        },
        {
          role: 'lan_can',
          roleLabel: 'Lan can',
          partId: 'lan_can_phai',
          side: 'phai',
          layers: ['KC-LANCAN'],
          entityCount: 2,
          objectIds: ['e2', 'e3']
        }
      ]
    }
  })

  test('an ambiguous match is not ok, so the model cannot treat it as an answer', () => {
    const outcome = findPartsByPhrase({ cum_tu: 'lan can' }, DICTIONARY)
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe('ambiguous')
    expect((outcome.data as { parts: unknown[] }).parts).toHaveLength(2)
  })

  test('a qualified phrase resolves and is ok', () => {
    const outcome = findPartsByPhrase(
      { cum_tu: 'lan can', ben: 'phai' },
      DICTIONARY
    )
    expect(outcome.ok).toBe(true)
    expect(outcome.status).toBe('found')
  })

  test('an unknown word comes back with suggestions and is not ok', () => {
    const outcome = findPartsByPhrase({ cum_tu: 'máy xúc' }, DICTIONARY)
    expect(outcome.ok).toBe(false)
    expect((outcome.data as { goiY: unknown[] }).goiY).toHaveLength(1)
  })
})

describe('highlighting', () => {
  test('the parts reach the selection set, replacing what was there', () => {
    // Adding without clearing would grow the selection every time someone
    // asked where something is.
    const outcome = highlightParts({ ma_bo_phan: ['lan_can_phai'] })
    expect(outcome.ok).toBe(true)
    expect(selection.cleared).toBe(1)
    expect(selection.added).toEqual(['e2', 'e3'])
  })

  test('an id nobody has is refused rather than silently doing nothing', () => {
    const outcome = highlightParts({ ma_bo_phan: ['khong_co'] })
    expect(outcome.ok).toBe(false)
    expect(selection.added).toEqual([])
  })
})

describe('dispatch', () => {
  test('an invented tool name is refused, and named back', () => {
    // A model that invented a name needs to see which one, or it invents the
    // same one again.
    const outcome = runSemanticTool('xoa_tat_ca', {}, DICTIONARY)
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('xoa_tat_ca')
  })

  test('each declared tool is reachable through dispatch', () => {
    for (const tool of SEMANTIC_TOOLS) {
      const outcome = runSemanticTool(
        tool.name,
        tool.name === 'tim_bo_phan'
          ? { cum_tu: 'lan can', ben: 'phai' }
          : { ma_bo_phan: ['lan_can_phai'] },
        DICTIONARY
      )
      expect(outcome.message).not.toContain('Không có công cụ')
    }
  })
})
