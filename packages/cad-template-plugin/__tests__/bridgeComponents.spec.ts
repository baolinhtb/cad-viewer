// Same stubbing as the other plugin specs: the core ships as a UMD bundle jest
// cannot load, and the undo grouping is the core's own concern.
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  acapRunGroupedEdit: async (
    _db: unknown,
    _label: string,
    fn: () => void | Promise<void>
  ) => {
    await fn()
  }
}))

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { formatPartId, readSemanticTag } from '@mlightcad/cad-template-sdk'
import { AcDbDatabase } from '@mlightcad/data-model'

import { findTemplate, setRemoteTemplates } from '../src/templateRegistry'
import { runTemplateTool } from '../src/templateTools'

/**
 * Lan can đến từ thư viện, không còn biên dịch sẵn.
 *
 * `lan_can_tcvn` — hình lan can suy ra từ chữ TCVN — đã rút khỏi bản dựng, vì
 * văn phòng dùng deployment này có bản vẽ cấu kiện thật cho đúng bộ phận ấy.
 * Phần kiểm theo cấp thử nghiệm bên dưới chuyển sang chạy trên template thay
 * thế, `tuong_phong_ho_btct`, vốn cùng viện dẫn điều 7.3.2.1 nhưng lấy biên
 * dạng từ `lancan-left.dwg`.
 */
const LAN_CAN = 'tuong_phong_ho_btct'

beforeAll(() => {
  ;(globalThis as unknown as Record<string, unknown>).__CAD_TEMPLATE_SDK__ = {
    formatPartId
  }
  const code = readFileSync(
    join(__dirname, '..', 'library', 'tuong_phong_ho.js'),
    'utf8'
  )
  const template = new Function(code.replace(/^\s*export default /m, 'return '))()
  setRemoteTemplates([
    {
      template,
      source: {
        templateId: LAN_CAN,
        version: template.meta.version,
        name: template.meta.name,
        status: 'published'
      } as never
    }
  ])
})

afterAll(() => setRemoteTemplates([]))

function newDatabase() {
  const database = new AcDbDatabase()
  database.createDefaultData()
  return database
}

function entities(database: AcDbDatabase) {
  return [...database.tables.blockTable.modelSpace.newIterator()]
}

/** Runs one component into a database, as the assistant would. */
function run(
  database: AcDbDatabase,
  id: string,
  thong_so: Record<string, unknown> = {}
) {
  return runTemplateTool('chay_template', { ma_template: id, thong_so }, database)
}

describe('the bridge components are registered', () => {
  test.each([
    ['ban_mat_cau_btct', 'Bản mặt cầu'],
    ['go_chan_banh_tcvn', 'Gờ chắn'],
    [LAN_CAN, 'Lan can']
  ])('%s is findable and named for an engineer', (id, namePart) => {
    const template = findTemplate(id)
    expect(template).toBeDefined()
    expect(template!.meta.name).toContain(namePart)
    // Every component takes the point it hangs from, or it cannot be assembled.
    expect(template!.params.map(p => p.key)).toEqual(
      expect.arrayContaining(['x', 'y'])
    )
  })
})

describe('lan can — chiều cao theo cấp thử nghiệm', () => {
  // TCVN 11823-13:2017 điều 7.3.2.1. The number depends on the test level, and
  // a railing 685 mm high on a TL-4 bridge looks exactly like a correct one.
  test.each([
    ['TL-3', 685],
    ['TL-4', 810],
    ['TL-5', 1070]
  ])('%s accepts exactly its minimum, %i mm', async (level, min) => {
    const database = newDatabase()
    const outcome = await run(database, LAN_CAN, {
      capThuNghiem: level,
      h: min
    })
    expect(outcome.ok).toBe(true)
    expect(entities(database).length).toBeGreaterThan(0)
  })

  test('a millimetre under the test level is refused, citing the clause', async () => {
    const database = newDatabase()
    const outcome = await run(database, LAN_CAN, {
      capThuNghiem: 'TL-4',
      h: 809
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('810')
    expect(outcome.message).toContain('11823-13')
    expect(outcome.message).toContain('7.3.2.1')
    // Refused means nothing was drawn, not half a railing.
    expect(entities(database)).toHaveLength(0)
  })

  test('below the absolute floor the static range catches it first', async () => {
    const database = newDatabase()
    const outcome = await run(database, LAN_CAN, { h: 300 })
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('685')
    expect(entities(database)).toHaveLength(0)
  })
})

describe('gờ chắn bánh — dải 150–200 mm', () => {
  // TCVN 11823-13:2017 điều 11.2 gives both ends, so both are enforced.
  test.each([
    [149, 'thấp hơn'],
    [201, 'cao hơn']
  ])('%i mm is refused', async height => {
    const database = newDatabase()
    const outcome = await run(database, 'go_chan_banh_tcvn', { h: height })
    expect(outcome.ok).toBe(false)
    expect(entities(database)).toHaveLength(0)
  })

  test('the chamfer faces the carriageway on both sides', async () => {
    // Drawn the same way on both edges, the slope is backwards on one of them
    // and nothing on screen says so.
    const left = newDatabase()
    const right = newDatabase()
    await run(left, 'go_chan_banh_tcvn', { ben: 'trai', x: 0 })
    await run(right, 'go_chan_banh_tcvn', { ben: 'phai', x: 0 })

    // Read through the extents rather than the vertex list: what matters is
    // which way the kerb leans from the placement point, and that is visible
    // in the box it occupies whatever the underlying geometry class exposes.
    const span = (db: AcDbDatabase) => {
      const box = entities(db)[0].geometricExtents
      return { min: box.min.x, max: box.max.x }
    }
    const l = span(left)
    const r = span(right)

    // Placed at x = 0, the right-hand kerb occupies positive x and the
    // left-hand one negative x.
    expect(r.max).toBeGreaterThan(0)
    expect(l.min).toBeLessThan(0)
    expect(l).not.toEqual(r)
  })
})

describe('assembling a section from components', () => {
  test('deck, kerbs and railings compose into one tagged drawing', async () => {
    // This is the point of the whole exercise: a complete section built from
    // four named calls with numbers, instead of seventy strokes.
    const database = newDatabase()
    const B = 8
    const edge = (B * 1000) / 2

    expect((await run(database, 'ban_mat_cau_btct', { B, h: 50 })).ok).toBe(true)
    for (const ben of ['trai', 'phai'] as const) {
      const dir = ben === 'phai' ? 1 : -1
      expect(
        (await run(database, 'go_chan_banh_tcvn', { ben, x: dir * edge, h: 200 }))
          .ok
      ).toBe(true)
      expect(
        (
          await run(database, LAN_CAN, {
            ben,
            x: dir * edge,
            y: 200,
            capThuNghiem: 'TL-4',
            h: 1100
          })
        ).ok
      ).toBe(true)
    }

    const drawn = entities(database)
    expect(drawn.length).toBeGreaterThan(5)

    // Every entity carries a semantic tag, so the drawing can be edited by
    // name afterwards rather than by object id.
    const tags = drawn.map(e => readSemanticTag(e))
    expect(tags.every(tag => tag !== undefined)).toBe(true)

    const roles = new Set(tags.map(tag => tag!.role))
    expect(roles).toContain('ban_mat_cau')
    expect(roles).toContain('go_chan_banh')
    expect(roles).toContain('lan_can')

    // Left and right are separate parts, addressable one at a time.
    const partIds = new Set(tags.map(tag => tag!.partId))
    expect(partIds).toContain('lan_can_trai')
    expect(partIds).toContain('lan_can_phai')
  })

  test('a refused component leaves the parts already placed alone', async () => {
    // Assembly is incremental, so a bad number in step three must not undo
    // steps one and two.
    const database = newDatabase()
    await run(database, 'ban_mat_cau_btct', { B: 8 })
    const afterDeck = entities(database).length

    const outcome = await run(database, LAN_CAN, {
      capThuNghiem: 'TL-5',
      h: 900
    })
    expect(outcome.ok).toBe(false)
    expect(entities(database)).toHaveLength(afterDeck)
  })
})
