/**
 * When two versions of a template are loaded, the newest one runs.
 *
 * The library holds every uploaded version — entries are keyed `id@version` —
 * so uploading a correction leaves both in place. Taking whichever the map
 * yielded first ran the old one, and that is a failure nobody spots by looking:
 * a drawing appears, it is simply the wrong drawing. Measured on the
 * deployment: `mo_cau_btct` v2 was uploaded, v2 was asked for, v1 was drawn.
 */
import {
  findRemoteSource,
  findTemplate,
  listRegisteredTemplates,
  listTemplates,
  setRemoteTemplates
} from '../src/templateRegistry'

function entry(id: string, version: string) {
  return {
    template: {
      meta: { id, version, name: `${id} ${version}` },
      params: [],
      generate: () => {}
    },
    source: {
      templateId: id,
      version,
      status: 'published' as const,
      name: id,
      updatedAt: ''
    }
  } as never
}

afterEach(() => setRemoteTemplates([]))

test('picks the newest of two versions, whatever order they load in', () => {
  for (const order of [
    ['1.0.0', '2.0.0'],
    ['2.0.0', '1.0.0']
  ]) {
    setRemoteTemplates(order.map(v => entry('mo_cau_btct', v)))
    expect(findTemplate('mo_cau_btct')?.meta.version).toBe('2.0.0')
    expect(findRemoteSource('mo_cau_btct')?.source.version).toBe('2.0.0')
  }
})

test('compares versions as numbers, not as text', () => {
  // The trap in string ordering: "10" sorts before "2".
  setRemoteTemplates([entry('x', '2.0.0'), entry('x', '10.0.0')])
  expect(findTemplate('x')?.meta.version).toBe('10.0.0')
})

test('minor and patch are compared too', () => {
  setRemoteTemplates([
    entry('x', '1.2.0'),
    entry('x', '1.10.0'),
    entry('x', '1.10.3')
  ])
  expect(findTemplate('x')?.meta.version).toBe('1.10.3')
})

test('an id nobody uploaded is still not found', () => {
  setRemoteTemplates([entry('x', '1.0.0')])
  expect(findTemplate('khong_co')).toBeUndefined()
  expect(findRemoteSource('khong_co')).toBeUndefined()
})

// Từng có một bài kiểm "built-in vẫn thắng bản tải lên trùng id" ở đây. Bản
// dựng nay **không biên dịch sẵn template nào** — mọi mẫu ship kèm đều là hình
// hệ thống suy từ chữ tiêu chuẩn và đã rút hết — nên quy tắc ấy không còn đối
// tượng để chạy qua. Nhánh xử lý vẫn nằm trong `findTemplate`, chờ ngày lại có
// built-in; bài kiểm thì không thể dựng một cái giả, vì danh sách là hằng số
// của module.

describe('the list the dialog offers', () => {
  test('one card per id, the newest version, whatever order the library sent', () => {
    // The dialog resolves a card by id and ran the first match, so two
    // versions of one template meant two identical cards and the old code
    // behind both of them. Seen on the deployment: 1.1.0 published, 1.0.0 drawn.
    setRemoteTemplates([
      entry('mo_mat_chinh', '1.0.0'),
      entry('tuong_phong_ho_btct', '3.1.0'),
      entry('mo_mat_chinh', '1.1.0'),
      entry('tuong_phong_ho_btct', '3.0.0')
    ])
    expect(
      listTemplates().map(t => `${t.meta.id}@${t.meta.version}`)
    ).toEqual(['mo_mat_chinh@1.1.0', 'tuong_phong_ho_btct@3.1.0'])
    // Every version is still visible where versions are the point.
    expect(listRegisteredTemplates()).toHaveLength(4)
  })
})
