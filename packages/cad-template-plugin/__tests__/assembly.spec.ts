/**
 * Cách ghép phải cho ra đúng bản vẽ của kỹ sư, không phải một chồng bộ phận.
 *
 * Từng template biết hình của riêng nó và không biết gì về thứ nó đứng lên.
 * Nửa còn lại của công việc — cao độ nối nhau, độ dốc chạy suốt, lan can đứng
 * đâu — nằm ở `assembly.ts`. Bài này kiểm chính nửa ấy, bằng số đo lấy từ bản
 * chuẩn hoá `Phantachcaukienmo_va_dat_ten_layer.dwg` đã trừ độ dời phá khối.
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

import { assemblyCatalogue, findAssembly, runAssembly } from '../src/assembly'
import { listRuns } from '../src/runIdentity'
import { setRemoteTemplates } from '../src/templateRegistry'
import { registerLibrary } from './helpers/libraryTemplate'

const LIBRARY = [
  'mo_be_mong.js',
  'mo_coc_khoan_nhoi.js',
  'mo_tuong_than.js',
  'mo_tuong_dau.js',
  'tuong_phong_ho.js'
]

beforeAll(() => registerLibrary(...LIBRARY))
afterAll(() => setRemoteTemplates([]))

function newDatabase() {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}

function entities(db: AcDbDatabase): AcDbEntity[] {
  return [...db.tables.blockTable.modelSpace.newIterator()]
}

/** Hộp bao gộp của một vai trò. */
function boxOf(db: AcDbDatabase, role: string) {
  const found = entities(db).filter(e => readSemanticTag(e)?.role === role)
  if (!found.length) return null
  let [x1, y1, x2, y2] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const e of found) {
    const b = e.geometricExtents
    x1 = Math.min(x1, b.min.x)
    y1 = Math.min(y1, b.min.y)
    x2 = Math.max(x2, b.max.x)
    y2 = Math.max(y2, b.max.y)
  }
  return [x1, y1, x2, y2]
}

/** Số đo từ bản chuẩn hoá, quy về gốc template (x=0 tại tim, y=0 đáy lót). */
const BANVE = {
  lot: [-3949.9, 0, 3949.9, 100],
  be: [-3850, 100, 3850, 2100],
  thanDinhPhai: 6893.3,
  dauDinhNgoaiPhai: 8697.5,
  phu: [-3500, 8564.5, 3500, 8774.5]
}
/** Hai mặt tường đầu trong bản vẽ không song song; xem moComponents.spec. */
const DUNG_SAI = 15

describe('ghép mố cầu hoàn chỉnh', () => {
  it('dựng đủ sáu bước, không bước nào lỗi', async () => {
    const db = newDatabase()
    const result = await runAssembly('mo_cau_hoan_chinh', {}, db)

    expect(result.errors).toEqual([])
    expect(result.buoc).toHaveLength(6)
    for (const buoc of result.buoc) {
      expect(buoc.errors).toEqual([])
      expect(buoc.entityCount).toBeGreaterThan(0)
    }
    expect(result.entityCount).toBe(entities(db).length)
  })

  it('mỗi bộ phận sửa được riêng: sáu lần chạy, sáu mã', async () => {
    const db = newDatabase()
    await runAssembly('mo_cau_hoan_chinh', {}, db)
    const runs = listRuns(db)
    expect(runs.map(r => r.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6'])
  })

  it('cao độ nối khít nhau, khớp bản vẽ chuẩn hoá', async () => {
    const db = newDatabase()
    await runAssembly('mo_cau_hoan_chinh', {}, db)

    // So từng cạnh chứ không so mảng: bản vẽ ghi mép bê tông lót ở 3949,9 còn
    // template tính ra 3950 — chênh 0,1 mm là làm tròn trong bản vẽ, không phải
    // sai lệch của cách ghép.
    const lot = boxOf(db, 'mo_be_tong_lot')!
    BANVE.lot.forEach((v, i) => expect(lot[i]).toBeCloseTo(v, 0))
    const be = boxOf(db, 'mo_be')!
    BANVE.be.forEach((v, i) => expect(be[i]).toBeCloseTo(v, 0))
    expect(boxOf(db, 'mo_tuong_than')![3]).toBeCloseTo(BANVE.thanDinhPhai, 0)
    expect(
      Math.abs(boxOf(db, 'mo_tuong_dau')![3] - BANVE.dauDinhNgoaiPhai)
    ).toBeLessThan(DUNG_SAI)
    const phu = boxOf(db, 'lop_phu')!
    expect(phu[0]).toBeCloseTo(BANVE.phu[0], 0)
    expect(phu[2]).toBeCloseTo(BANVE.phu[2], 0)
    expect(Math.abs(phu[3] - BANVE.phu[3])).toBeLessThan(DUNG_SAI)
  })

  it('cọc chui ra từ đáy bệ, không phải đáy bê tông lót', async () => {
    const db = newDatabase()
    await runAssembly('mo_cau_hoan_chinh', {}, db)
    const coc = boxOf(db, 'coc_khoan_nhoi')!
    // Đáy bệ ở 100; đầu cọc ngàm 150 lên trên nó.
    expect(coc[3]).toBeCloseTo(250, 0)
  })

  it('hai lan can: mặt trong cách nhau đúng 7000, đáy lệch đúng 140', async () => {
    // Đây là quy tắc đo được trên banve_mo.dwg và là thứ khó đoán nhất trong
    // cả cụm: khoảng cách do lớp phủ quyết định, không do bề rộng mố.
    const db = newDatabase()
    await runAssembly('mo_cau_hoan_chinh', {}, db)

    const lanCan = entities(db).filter(
      e => readSemanticTag(e)?.role === 'lan_can'
    )
    const trai = lanCan.filter(e => e.geometricExtents.min.x < 0)
    const phai = lanCan.filter(e => e.geometricExtents.min.x > 0)
    expect(trai.length).toBeGreaterThan(0)
    expect(phai.length).toBeGreaterThan(0)

    const trongTrai = Math.max(...trai.map(e => e.geometricExtents.max.x))
    const trongPhai = Math.min(...phai.map(e => e.geometricExtents.min.x))
    expect(trongPhai - trongTrai).toBeCloseTo(7000, 0)

    const dayTrai = Math.min(...trai.map(e => e.geometricExtents.min.y))
    const dayPhai = Math.min(...phai.map(e => e.geometricExtents.min.y))
    expect(dayPhai - dayTrai).toBeCloseTo(140, 0)
  })

  it('lan can đứng trên mặt lớp phủ, không lơ lửng và không chìm', async () => {
    const db = newDatabase()
    await runAssembly('mo_cau_hoan_chinh', {}, db)
    const phu = boxOf(db, 'lop_phu')!
    const lanCan = entities(db).filter(
      e => readSemanticTag(e)?.role === 'lan_can'
    )
    const dayThapNhat = Math.min(...lanCan.map(e => e.geometricExtents.min.y))
    // Mặt lớp phủ nghiêng, nên chân lan can thấp nhất nằm ở mép thấp của nó.
    expect(dayThapNhat).toBeCloseTo(phu[3] - 140, 0)
  })

  it('đổi độ dốc là cả cụm đổi theo, kể cả lan can', async () => {
    const db = newDatabase()
    await runAssembly('mo_cau_hoan_chinh', { doDocNgang: 0 }, db)
    const lanCan = entities(db).filter(
      e => readSemanticTag(e)?.role === 'lan_can'
    )
    const trai = lanCan.filter(e => e.geometricExtents.min.x < 0)
    const phai = lanCan.filter(e => e.geometricExtents.min.x > 0)
    const dayTrai = Math.min(...trai.map(e => e.geometricExtents.min.y))
    const dayPhai = Math.min(...phai.map(e => e.geometricExtents.min.y))
    // Dốc bằng 0 thì hai chân ngang bằng nhau.
    expect(dayPhai - dayTrai).toBeCloseTo(0, 3)
  })

  it('đổi bề rộng là lan can dịch theo, vì nó bám mép lớp phủ', async () => {
    const db = newDatabase()
    await runAssembly('mo_cau_hoan_chinh', { B: 10000 }, db)
    const lanCan = entities(db).filter(
      e => readSemanticTag(e)?.role === 'lan_can'
    )
    const trongTrai = Math.max(
      ...lanCan.filter(e => e.geometricExtents.min.x < 0).map(e => e.geometricExtents.max.x)
    )
    const trongPhai = Math.min(
      ...lanCan.filter(e => e.geometricExtents.min.x > 0).map(e => e.geometricExtents.min.x)
    )
    // 10000 − 2×350 = 9300.
    expect(trongPhai - trongTrai).toBeCloseTo(9300, 0)
  })

  it('thiếu template trong thư viện thì từ chối, không dựng nửa vời', async () => {
    setRemoteTemplates([])
    try {
      const db = newDatabase()
      const result = await runAssembly('mo_cau_hoan_chinh', {}, db)
      expect(result.errors[0]).toContain('Thiếu template')
      expect(entities(db)).toHaveLength(0)
    } finally {
      registerLibrary(...LIBRARY)
    }
  })

  it('tên cách ghép không có thì nói rõ đang có những cách nào', async () => {
    const result = await runAssembly('khong_co', {}, newDatabase())
    expect(result.errors[0]).toContain('mo_cau_hoan_chinh')
  })

  it('danh mục viết ra quy tắc, không chỉ tên bước', () => {
    const text = assemblyCatalogue()
    expect(text).toContain('mo_cau_hoan_chinh')
    // Quy tắc khó đoán nhất phải có mặt, vì đó là thứ trợ lý cần đọc.
    expect(text).toContain('7000')
    expect(text).toContain('đỉnh tường thân')
    for (const step of findAssembly('mo_cau_hoan_chinh')!.buoc) {
      expect(text).toContain(step.templateId)
    }
  })
})
