/**
 * A tool result has to be JSON, and `NaN` is not.
 *
 * An empty drawing has no bounding box, and the database says so with `NaN`
 * coordinates. Handing those to the model looks harmless — `JSON.stringify`
 * renders them as `null`, so the request on the wire is valid and the first
 * message works. The chat history kept in memory still holds `NaN`, and on the
 * *next* message that history is validated as a prompt and the whole turn dies
 * with "Invalid prompt: The messages must be a ModelMessage[]".
 *
 * The symptom is that an engineer can ask for a drawing but can never correct
 * it, which is most of what a drawing assistant is for.
 */
const extents = {
  min: { x: Number.NaN, y: Number.NaN, z: Number.NaN },
  max: { x: Number.NaN, y: Number.NaN, z: Number.NaN },
  isEmpty: () => true
}

/** Model-space contents the fake database hands back. */
let entities: { layer: string }[] = []

/** What `readDrawingDigest` is made to report for these entities. */
let digest = {
  status: 'untagged' as 'untagged' | 'tagged' | 'schema-mismatch',
  templateIds: [] as string[],
  parts: [] as {
    role: string
    roleLabel?: string
    partId: string
    layers: string[]
    entityCount: number
    objectIds: string[]
    params?: Record<string, number>
  }[],
  untaggedEntityCount: 0
}

jest.mock('@mlightcad/cad-template-sdk', () => ({
  __esModule: true,
  readDrawingDigest: () => digest
}))

jest.mock('@mlightcad/cad-simple-viewer', () => ({
  __esModule: true,
  AcApDocManager: {
    instance: {
      get curDocument() {
        return {
          database: {
            extents,
            insunits: 4,
            tables: {
              blockTable: {
                modelSpace: { newIterator: () => entities[Symbol.iterator]() }
              }
            }
          },
          layerStore: {
            getLayers: () => [{ name: '0' }],
            getCurrentLayerName: () => '0'
          },
          docTitle: 'minimal-line.dxf'
        }
      }
    }
  }
}))

import { getDrawingContext } from '../src/tools/DrawingContextProvider'

/** What the AI SDK's prompt schema accepts inside a tool result. */
function isJsonValue(value: unknown): boolean {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (typeof value === 'object') return Object.values(value!).every(isJsonValue)
  return false
}

test('an empty drawing reports no extents rather than NaN', () => {
  const context = getDrawingContext()

  expect(context.extents.isEmpty).toBe(true)
  expect(context.extents.min).toEqual({ x: null, y: null, z: null })
  expect(context.extents.max).toEqual({ x: null, y: null, z: null })
})

test('the whole snapshot survives being validated as a tool result', () => {
  // `JSON.stringify` would hide the problem: it turns NaN into null and the
  // check passes on a value that is still NaN in memory.
  expect(isJsonValue(getDrawingContext())).toBe(true)
})

test('real coordinates are passed through untouched', () => {
  extents.min = { x: -1200.5, y: 0, z: 0 }
  extents.max = { x: 8000, y: 2500.25, z: 0 }
  extents.isEmpty = () => false

  const context = getDrawingContext()

  expect(context.extents.min.x).toBe(-1200.5)
  expect(context.extents.max.y).toBe(2500.25)
  expect(context.extents.isEmpty).toBe(false)
})

test('an infinite bound is treated the same as a missing one', () => {
  // Some paths report an empty box as ±Infinity instead of NaN; both serialise
  // to `null` and both are rejected by the schema.
  extents.min = { x: Number.POSITIVE_INFINITY, y: 0, z: 0 }
  extents.max = { x: Number.NEGATIVE_INFINITY, y: 0, z: 0 }
  extents.isEmpty = () => true

  const context = getDrawingContext()

  expect(context.extents.min.x).toBeNull()
  expect(context.extents.max.x).toBeNull()
  expect(context.extents.min.y).toBe(0)
})

// --- what the assistant is told about the drawing ---------------------------

test('the parts of a tagged drawing are reported, with their recorded values', () => {
  // The whole point of tagging: the next turn reads what the drawing *is*
  // instead of reconstructing it from what the conversation said.
  digest = {
    status: 'tagged',
    templateIds: ['tro_ly_ai'],
    parts: [
      {
        role: 'lan_can',
        roleLabel: 'Lan can',
        partId: 'lan_can_trai',
        layers: ['KC-LANCAN'],
        entityCount: 4,
        objectIds: ['1A', '1B', '1C', '1D'],
        params: { chieu_cao: 810 }
      }
    ],
    untaggedEntityCount: 2
  }
  entities = [{ layer: 'KC-LANCAN' }, { layer: '0' }]

  const context = getDrawingContext()

  expect(context.semanticStatus).toBe('tagged')
  expect(context.parts).toEqual([
    {
      role: 'lan_can',
      roleLabel: 'Lan can',
      partId: 'lan_can_trai',
      layers: ['KC-LANCAN'],
      entityCount: 4,
      params: { chieu_cao: 810 }
    }
  ])
  expect(context.untaggedEntityCount).toBe(2)
})

test('object ids are left out of the per-turn context', () => {
  // They grow with the drawing and are read on every turn; `tim_bo_phan`
  // returns them when a part is actually being worked on.
  digest = {
    status: 'tagged',
    templateIds: ['tro_ly_ai'],
    parts: [
      {
        role: 'dam_chu',
        partId: 'dam_chu_03',
        layers: ['KC-DAM'],
        entityCount: 9,
        objectIds: Array.from({ length: 9 }, (_, i) => `E${i}`)
      }
    ],
    untaggedEntityCount: 0
  }
  entities = []

  expect(JSON.stringify(getDrawingContext())).not.toContain('E0')
})

test('an untagged drawing says so rather than reporting nothing found', () => {
  // "No parts" and "this drawing cannot be asked about parts" are different
  // answers, and only one of them means the assistant may draw fresh geometry.
  digest = {
    status: 'untagged',
    templateIds: [],
    parts: [],
    untaggedEntityCount: 37
  }
  entities = []

  const context = getDrawingContext()

  expect(context.semanticStatus).toBe('untagged')
  expect(context.parts).toEqual([])
  expect(context.untaggedEntityCount).toBe(37)
})

test('entities are counted per layer', () => {
  // Answers "is there already something on KC-LANCAN" without a tool call per
  // layer — the question that decides draw-new versus edit-existing.
  digest = {
    status: 'untagged',
    templateIds: [],
    parts: [],
    untaggedEntityCount: 3
  }
  entities = [
    { layer: 'KC-BAN' },
    { layer: 'KC-BAN' },
    { layer: 'KC-LANCAN' },
    { layer: '' }
  ]

  expect(getDrawingContext().entityCountByLayer).toEqual({
    'KC-BAN': 2,
    'KC-LANCAN': 1,
    '0': 1
  })
})
