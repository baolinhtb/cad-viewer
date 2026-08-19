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

import { readSemanticTag } from '@mlightcad/cad-template-sdk'
import { AcDbDatabase } from '@mlightcad/data-model'

import { findTemplate, setRemoteTemplates } from '../src/templateRegistry'
import { runTemplateTool } from '../src/templateTools'
import { registerLibrary } from './helpers/libraryTemplate'

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

beforeAll(() => registerLibrary('tuong_phong_ho.js', 'mo_be_mong.js'))

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
  test.each([[LAN_CAN, 'Lan can']])('%s is findable and named for an engineer', (id, namePart) => {
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

// Khối kiểm gờ chắn bánh (dải 150–200 mm, TCVN 11823-13:2017 điều 11.2) đã đi
// cùng template của nó: `go_chan_banh_tcvn` là hình hệ thống suy từ chữ tiêu
// chuẩn, và đã rút khỏi bản dựng cùng mọi mẫu tự sinh khác.

describe('ghép nhiều cấu kiện vào một bản vẽ', () => {
  test('bệ mố và hai lan can vào chung một bản vẽ, cái nào cũng có nhãn', async () => {
    // Trước đây bài này ghép bản mặt cầu + gờ chắn + lan can. Hai thứ đầu là
    // mẫu tự sinh và đã rút; thứ được kiểm ở đây không phải bộ phận nào cụ thể
    // mà là việc nhiều lần chạy template dồn vào một bản vẽ mà vẫn tách bạch.
    const database = newDatabase()
    expect((await run(database, 'mo_be_mong', {})).ok).toBe(true)
    for (const ben of ['trai', 'phai'] as const) {
      const dir = ben === 'phai' ? 1 : -1
      expect(
        (
          await run(database, LAN_CAN, {
            ben,
            x: dir * 3850,
            y: 2100,
            capThuNghiem: 'TL-4',
            h: 1100
          })
        ).ok
      ).toBe(true)
    }

    const drawn = entities(database)
    expect(drawn.length).toBeGreaterThan(5)

    // Mọi đối tượng đều mang nhãn ngữ nghĩa, để sửa bản vẽ về sau gọi được
    // theo tên chứ không phải theo id đối tượng.
    const tags = drawn.map(e => readSemanticTag(e))
    expect(tags.every(tag => tag !== undefined)).toBe(true)

    const roles = new Set(tags.map(tag => tag!.role))
    expect(roles).toContain('mo_be')
    expect(roles).toContain('mo_be_tong_lot')
    expect(roles).toContain('lan_can')

    // Trái và phải là hai bộ phận riêng, gọi tên từng cái được.
    const partIds = new Set(tags.map(tag => tag!.partId))
    expect(partIds).toContain('lan_can_trai')
    expect(partIds).toContain('lan_can_phai')
  })

  test('một cấu kiện bị từ chối không đụng tới phần đã đặt', async () => {
    // Ghép là việc tăng dần, nên một con số sai ở bước ba không được xoá bước
    // một và hai.
    const database = newDatabase()
    await run(database, 'mo_be_mong', {})
    const truoc = entities(database).length

    const outcome = await run(database, LAN_CAN, {
      capThuNghiem: 'TL-5',
      h: 900
    })
    expect(outcome.ok).toBe(false)
    expect(entities(database)).toHaveLength(truoc)
  })
})
