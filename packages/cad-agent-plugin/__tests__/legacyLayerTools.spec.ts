/**
 * `create_layer` and `set_current_layer` with an old layer name (KC-*).
 *
 * Old names are recognition-only. Creating one in a drawing that lacks it is
 * redirected to the `_33_` layer it stands for — the same redirect the
 * template draw context applies. An old drawing that already has the layer
 * keeps it (the drawing's own layers are the engineer's), but the assistant
 * is told the `_33_` name.
 */
const layersInDrawing = new Set<string>()
const created: string[] = []
let current = '0'

jest.mock('@mlightcad/cad-simple-viewer', () => ({
  __esModule: true,
  AcEdOpenMode: { Read: 0, Write: 1 },
  acapRunDatabaseEdit: (_db: unknown, _label: string, fn: () => void) => fn(),
  AcApDocManager: {
    instance: {
      get curDocument() {
        return {
          openMode: 1,
          database: {
            tables: {
              layerTable: {
                getAt: (name: string) =>
                  layersInDrawing.has(name) ? { name } : undefined
              }
            }
          },
          layerService: {
            createLayers: (names: string[]) => {
              const existed = names.filter(n => layersInDrawing.has(n))
              for (const n of names) {
                if (!layersInDrawing.has(n)) {
                  layersInDrawing.add(n)
                  created.push(n)
                }
              }
              return { created: names.length - existed.length, existed }
            },
            setCurrentLayer: (name: string) => {
              if (!layersInDrawing.has(name)) return false
              current = name
              return true
            }
          }
        }
      }
    }
  }
}))

jest.mock('@mlightcad/cad-template-plugin', () => ({
  __esModule: true,
  currentLayerForLegacy: (name: string) =>
    name.toLowerCase() === 'kc-coc' ? '_33_CAU_MO_Coc' : undefined
}))

import { CadActionExecutor } from '../src/tools/CadActionExecutor'

const executor = new CadActionExecutor()

beforeEach(() => {
  layersInDrawing.clear()
  layersInDrawing.add('0')
  created.length = 0
  current = '0'
})

describe('create_layer with an old name', () => {
  test('creates the _33_ layer instead, and says so', () => {
    const result = executor.createLayer('KC-COC')
    expect(result.success).toBe(true)
    expect(created).toEqual(['_33_CAU_MO_Coc'])
    expect(result.message).toContain(
      "'KC-COC' là tên layer cũ (chỉ để nhận dạng); đã dùng '_33_CAU_MO_Coc' thay thế."
    )
  })

  test('an old drawing that already has the layer keeps it, with a note', () => {
    layersInDrawing.add('KC-COC')
    const result = executor.createLayer('KC-COC')
    expect(result.success).toBe(true)
    expect(created).toEqual([])
    expect(result.message).toContain("vẽ mới hãy dùng '_33_CAU_MO_Coc'")
  })

  test('a current name is created as asked, with no note', () => {
    const result = executor.createLayer('_33_CAU_MO_Coc')
    expect(created).toEqual(['_33_CAU_MO_Coc'])
    expect(result.message).toBe('Layer created: _33_CAU_MO_Coc.')
  })
})

describe('set_current_layer with an old name', () => {
  test('switches on an old drawing but points to the _33_ name', () => {
    layersInDrawing.add('KC-COC')
    const result = executor.setCurrentLayer('KC-COC')
    expect(result.success).toBe(true)
    expect(current).toBe('KC-COC')
    expect(result.message).toContain("vẽ mới hãy dùng '_33_CAU_MO_Coc'")
  })
})
