/**
 * Sửa một bộ phận đã dựng phải THAY nó, không vẽ thêm cái nữa.
 *
 * Đây là lỗi người dùng báo bằng chính lời họ: *"tôi yêu cầu sửa thì vẽ thêm,
 * các thành phần cũ vẫn để lại, dẫn đến càng sửa hình càng rối rắm"*. Nguyên
 * nhân là trợ lý không có công cụ nào khác: `chay_template` luôn nối thêm một
 * lần chạy mới, nên câu "làm mố rộng 8 m" cho ra hai cái mố chồng nhau. Hạ
 * tầng để làm đúng đã có từ trước — mỗi đối tượng mang mã lần chạy — nhưng
 * chưa công cụ nào dùng tới.
 */
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
import { AcDbDatabase, AcDbEntity } from '@mlightcad/data-model'

import { editTemplateRun } from '../src/editRun'
import { listRuns } from '../src/runIdentity'
import { runTemplate } from '../src/runTemplate'
import { findTemplate, setRemoteTemplates } from '../src/templateRegistry'
import { registerLibrary } from './helpers/libraryTemplate'

beforeAll(() => registerLibrary('mo_be_mong.js'))
afterAll(() => setRemoteTemplates([]))

function newDatabase() {
  const database = new AcDbDatabase()
  database.createDefaultData()
  return database
}

function entities(db: AcDbDatabase): AcDbEntity[] {
  return [...db.tables.blockTable.modelSpace.newIterator()]
}

/** Bề rộng thấy được của bệ móng, đo trên chính hình đã vẽ. */
function widthOfFooting(db: AcDbDatabase) {
  const found = entities(db).filter(
    e => readSemanticTag(e)?.role === 'mo_be'
  )
  const box = found[0].geometricExtents
  return { count: found.length, width: box.max.x - box.min.x }
}

async function drawFooting(db: AcDbDatabase, values: Record<string, unknown> = {}) {
  return runTemplate(findTemplate('mo_be_mong')!, values as never, db)
}

describe('sửa một lần chạy', () => {
  it('thay hình cũ chứ không để lại — đúng lỗi người dùng báo', async () => {
    const db = newDatabase()
    await drawFooting(db, { B: 7700 })
    const truoc = entities(db).length

    const result = await editTemplateRun('r1', { B: 9000 }, db)

    expect(result.errors).toEqual([])
    expect(result.removed).toBe(truoc)
    // Đúng MỘT bệ móng, rộng 9000 — không phải hai cái chồng nhau.
    const { count, width } = widthOfFooting(db)
    expect(count).toBe(1)
    expect(width).toBeCloseTo(9000, 0)
  })

  it('giữ nguyên mã lần chạy, nên bộ phận vẫn là một thứ đã đổi', async () => {
    const db = newDatabase()
    await drawFooting(db, { B: 7700 })
    await editTemplateRun('r1', { B: 9000 }, db)

    const runs = listRuns(db)
    expect(runs.map(r => r.id)).toEqual(['r1'])
    expect(runs[0].values.B).toBe(9000)
  })

  it('giá trị không nhắc tới thì giữ nguyên', async () => {
    const db = newDatabase()
    await drawFooting(db, { B: 7700, hBe: 2400 })
    const result = await editTemplateRun('r1', { B: 9000 }, db)

    expect(result.values.hBe).toBe(2400)
    expect(result.values.B).toBe(9000)
  })

  it('sửa nhiều lần vẫn chỉ còn một bản — không tích tụ', async () => {
    const db = newDatabase()
    await drawFooting(db, { B: 7700 })
    for (const B of [8000, 9000, 10000, 11000]) {
      await editTemplateRun('r1', { B }, db)
    }
    const { count, width } = widthOfFooting(db)
    expect(count).toBe(1)
    expect(width).toBeCloseTo(11000, 0)
    expect(listRuns(db)).toHaveLength(1)
  })

  it('chỉ đụng tới lần chạy được nêu, các lần khác nguyên vẹn', async () => {
    const db = newDatabase()
    await drawFooting(db, { B: 7700, x: 0 })
    await drawFooting(db, { B: 7700, x: 20000 })
    expect(listRuns(db).map(r => r.id)).toEqual(['r1', 'r2'])

    await editTemplateRun('r2', { B: 9000 }, db)

    const runs = listRuns(db)
    expect(runs.find(r => r.id === 'r1')!.values.B).toBe(7700)
    expect(runs.find(r => r.id === 'r2')!.values.B).toBe(9000)
  })

  it('thông số sai dải thì từ chối và KHÔNG xoá gì', async () => {
    // Nếu xoá trước rồi mới kiểm thì một con số sai sẽ xoá mất bộ phận đúng.
    const db = newDatabase()
    await drawFooting(db, { B: 7700 })
    const truoc = entities(db).length

    const result = await editTemplateRun('r1', { B: 999999 }, db)

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.removed).toBe(0)
    expect(entities(db)).toHaveLength(truoc)
    expect(widthOfFooting(db).width).toBeCloseTo(7700, 0)
  })

  it('mã lần chạy không có thì nói rõ đang có những mã nào', async () => {
    const db = newDatabase()
    await drawFooting(db)
    const result = await editTemplateRun('r9', { B: 9000 }, db)
    expect(result.errors[0]).toContain('r1')
    expect(entities(db).length).toBeGreaterThan(0)
  })

  it('bản vẽ chưa có lần chạy nào thì nói thẳng là không có gì để sửa', async () => {
    const result = await editTemplateRun('r1', { B: 9000 }, newDatabase())
    expect(result.errors[0]).toContain('không có lần chạy nào')
  })

  it('template đã rút khỏi thư viện thì từ chối, không dựng bừa', async () => {
    const db = newDatabase()
    await drawFooting(db)
    setRemoteTemplates([])
    try {
      const result = await editTemplateRun('r1', { B: 9000 }, db)
      expect(result.errors[0]).toContain('không còn trong thư viện')
      expect(result.removed).toBe(0)
    } finally {
      registerLibrary('mo_be_mong.js')
    }
  })
})
