import {
  createDrawContext,
  findParts,
  readDrawingDigest,
  SEED_ROLE_LAYERS,
  SEED_ROLES
} from '@mlightcad/cad-template-sdk'
import { AcDbDatabase } from '@mlightcad/data-model'

import template from '../src/index'

/**
 * Checks the drawing this template produces against the sentence set of
 * Story 1.1 (`_bmad-output/planning-artifacts/story-1.1-bo-cau-lenh-NHAP.md`).
 *
 * The sentence set is not a command vocabulary — the command bar takes free
 * natural language. It is the exam paper: every object those sentences refer
 * to has to resolve to a concrete `role` + `partId`, or the assistant has
 * nothing to point at no matter how well it reads Vietnamese.
 *
 * Gaps are recorded rather than treated as failures. The template is a
 * cross-section; parts that only exist in a longitudinal view were never
 * expected here. What must not happen is a gap appearing or closing without
 * anyone noticing, so the list below is exact — add a role to the template and
 * this test fails until the list is updated.
 */

/** Every object the twenty sentences refer to, in the order they appear. */
const REFERENCED_ROLES = [
  'ban_mat_cau', // 1, 2, 16 — bề rộng, chiều dày
  'lan_can', // 3, 6, 11, 17 — chiều cao, thêm, xóa bên phải
  'lop_phu', // 4 — chiều dày lớp phủ
  'ong_thoat_nuoc', // 7, 12, 18, 20 — khoảng cách, xóa, đếm
  'ban_qua_do', // 8, 13 — thêm hai đầu, xóa đầu mố A
  'khe_co_gian', // 9 — thêm ở hai đầu nhịp
  'kich_thuoc', // 10, 14 — thêm cột, xóa cột trùng
  'ghi_chu', // 15 — xóa ghi chú góc dưới trái
  'goi_cau' // 19 — chỉ cho tôi gối cầu ở mố A
] as const

/**
 * Roles the sentences name that this template does not draw.
 *
 * These are the gaps the story asks to be written down. All four are parts of
 * the longitudinal or detail views; none belongs on a cross-section. They stop
 * being gaps when a template that draws those views exists — not by adding
 * them here.
 */
const KNOWN_GAPS = ['ban_qua_do', 'khe_co_gian', 'kich_thuoc', 'goi_cau']

function generateDefault(): AcDbDatabase {
  const db = new AcDbDatabase()
  db.createDefaultData()
  const values: Record<string, number | string | boolean> = {}
  for (const spec of template.params) {
    if (spec.default !== undefined) values[spec.key] = spec.default
  }
  template.generate(
    createDrawContext(db, template.meta.id, SEED_ROLE_LAYERS),
    values
  )
  return db
}

describe('bộ câu đối chiếu Story 1.1', () => {
  const digest = readDrawingDigest(generateDefault())

  test('mọi vai trò các câu nhắc tới đều nằm trong từ điển chuẩn hóa', () => {
    // A sentence naming something the dictionary has no key for cannot be
    // mapped at all — that is a standardisation gap, not a template gap.
    const unknown = REFERENCED_ROLES.filter(role => !(role in SEED_ROLES))
    expect(unknown).toEqual([])
  })

  test('vai trò nào có mặt thì trỏ được vào bộ phận cụ thể', () => {
    const unaddressable = REFERENCED_ROLES.filter(
      role => !KNOWN_GAPS.includes(role) && findParts(digest, { role }).length === 0
    )
    expect(unaddressable).toEqual([])
  })

  test('danh sách khoảng trống đúng bằng thực tế, không thừa không thiếu', () => {
    // Pins the gap list to reality in both directions: a role that quietly
    // starts being drawn, or one that quietly stops, fails here.
    const actualGaps = REFERENCED_ROLES.filter(
      role => findParts(digest, { role }).length === 0
    )
    expect([...actualGaps].sort()).toEqual([...KNOWN_GAPS].sort())
  })

  test('câu "xóa lan can bên phải" trỏ đúng một bộ phận', () => {
    // Sentence 11. Two rails share a role; only the partId convention tells
    // them apart, and picking the wrong one deletes the wrong rail.
    const right = findParts(digest, { role: 'lan_can', side: 'phai' })
    expect(right).toHaveLength(1)
    expect(right[0].partId).toBe('lan_can_phai')
  })

  test('câu "có bao nhiêu ống thoát nước" đếm được mà không cần đo hình', () => {
    // Sentence 20.
    const pipes = findParts(digest, { role: 'ong_thoat_nuoc' })
    expect(pipes.length).toBe(
      Number(template.params.find(p => p.key === 'soOngThoatNuoc')?.default)
    )
    expect(pipes.every(p => p.ordinal !== undefined)).toBe(true)
  })

  test('câu "lan can cao bao nhiêu" trả lời được kèm mốc tính', () => {
    // Sentence 17. The draft marks an answer without the datum as a wrong
    // answer, because slab-top and pavement-top differ by the wearing course.
    const rail = findParts(digest, { role: 'lan_can', side: 'trai' })[0]
    expect(rail.params?.hLanCan).toBeDefined()
    expect(rail.params?.mocDo).toBe('mat_lop_phu')
  })

  test('câu "bản mặt cầu dày bao nhiêu" đọc được từ bản ghi thông số', () => {
    // Sentence 16.
    const slab = findParts(digest, { role: 'ban_mat_cau' })[0]
    expect(typeof slab.params?.h).toBe('number')
    expect(typeof slab.params?.B).toBe('number')
  })
})
