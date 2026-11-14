/**
 * Hồi quy output của các template mố — chụp TRƯỚC khi chuẩn hoá danh mục
 * layer `_33_`.
 *
 * Ba thứ được khoá riêng để một thay đổi có chủ ý (đổi tên layer mặc định)
 * không che mất một thay đổi ngoài ý muốn (đổi hình):
 *
 * - `hinh`: kiểu, vai trò, partId, toạ độ — không có layer. Không bao giờ được
 *   đổi khi chỉ đổi danh mục layer.
 * - `layer` theo hai bảng cố định (KC cũ và `_33_` như nền chuẩn hoá đang chạy):
 *   template vẽ qua vai trò, nên với cùng một bảng thì kết quả phải y nguyên.
 * - `layer` theo bảng dự phòng của SDK (`roleLayers()` khi chưa nạp server):
 *   đây là chỗ duy nhất được phép đổi, và đổi đúng KC-* → `_33_*`.
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

import { createHash } from 'node:crypto'

import {
  createDrawContext,
  readSemanticTag,
  validateParamValues
} from '@mlightcad/cad-template-sdk'
import { AcDbDatabase, AcDbEntity } from '@mlightcad/data-model'

import { runAssembly } from '../src/assembly'
import { buildDossierModel, dossierDefaults } from '../src/dossier/model'
import { buildDossierScene } from '../src/dossier/scene'
import {
  roleLayers,
  setRemoteTemplates,
  setRoleLayers
} from '../src/templateRegistry'
import { loadLibraryTemplate, registerLibrary } from './helpers/libraryTemplate'

/** Bảng KC như seed trước khi chuẩn hoá — chép cứng, không đọc từ SDK. */
const KC_LAYERS: Record<string, string> = {
  ban_mat_cau: 'KC-BAN',
  lop_phu: 'KC-LOPPHU',
  lan_can: 'KC-LANCAN',
  go_chan_banh: 'KC-GOCHAN',
  ban_qua_do: 'KC-BANQUADO',
  mo_cau: 'KC-MO',
  mo_tuong_dau: 'KC-MO-TUONGDAU',
  mo_tuong_than: 'KC-MO-TUONGTHAN',
  mo_tuong_tai: 'KC-MO-TUONGTAI',
  mo_be: 'KC-MO-BE',
  mo_be_tong_lot: 'KC-MO-BTLOT',
  coc_khoan_nhoi: 'KC-COC',
  goi_cau: 'KC-GOI',
  khe_co_gian: 'KC-KHE',
  ong_thoat_nuoc: 'KT-THOATNUOC',
  cot_thep: 'KC-COTTHEP',
  duong_tim: 'TRUC-TIM',
  ghi_chu_cao_do: 'GC-CAODO',
  tieu_de_ban_ve: 'GC-TIEUDE',
  kich_thuoc: 'GC-KICHTHUOC',
  ghi_chu: 'GC-GHICHU'
}

/** Bảng như nền chuẩn hoá đang chạy (xem moMatChinh.spec.ts). */
const OFFICE_LAYERS: Record<string, string> = {
  ...KC_LAYERS,
  mo_be: '_33_CAU_MO_Be',
  mo_be_tong_lot: '_33_CAU_MO_Betonglot',
  mo_tuong_than: '_33_CAU_MO_Tuongthan',
  mo_tuong_dau: '_33_CAU_MO_Tuongdau',
  mo_tuong_tai: '_33_CAU_MO_Tuongtai',
  lop_phu: '_33_Matduong_BTN',
  coc_khoan_nhoi: '_33_CAU_MO_Coc',
  lan_can: '_33_CAU_MIS_Lancan',
  duong_tim: '_33_Timtuyen',
  kich_thuoc: '_33_Duongghikichthuoc',
  ghi_chu: '_33_Ghichu',
  ghi_chu_cao_do: '_33_Ghichu_Caodo',
  tieu_de_ban_ve: '_33_Tieudebanve'
}

const FILES = [
  'mo_be_mong.js',
  'mo_coc_khoan_nhoi.js',
  'mo_mat_chinh.js',
  'mo_tuong_dau.js',
  'mo_tuong_than.js',
  'tuong_phong_ho.js'
]

const r = (n: number) => Math.round(n * 100) / 100

function newDatabase() {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}

function entities(db: AcDbDatabase): AcDbEntity[] {
  return [...db.tables.blockTable.modelSpace.newIterator()]
}

/** Một dòng mô tả hình học của một đối tượng, không có layer. */
function shape(e: AcDbEntity): string {
  const tag = readSemanticTag(e)
  let box = '-'
  try {
    const b = e.geometricExtents
    box = [b.min.x, b.min.y, b.max.x, b.max.y].map(r).join(',')
  } catch {
    // Một vài đối tượng (kích thước chưa dựng khối) không có hộp bao.
  }
  return `${e.dxfTypeName}|${tag?.role ?? ''}|${tag?.partId ?? ''}|${box}`
}

/** Hình và layer, sắp ổn định. */
function signature(list: AcDbEntity[]) {
  const rows = list.map(e => ({ s: shape(e), layer: e.layer }))
  rows.sort((a, b) => (a.s + a.layer).localeCompare(b.s + b.layer))
  return {
    hinh: rows.map(x => x.s),
    layer: rows.map(x => `${x.s.split('|').slice(1, 3).join('|')} → ${x.layer}`)
  }
}

function defaults(template: {
  params: { key: string; default?: unknown }[]
}): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const p of template.params)
    if (p.default !== undefined) values[p.key] = p.default
  return values
}

function runWith(file: string, layers: Record<string, string>) {
  const template = loadLibraryTemplate(file)
  const values = defaults(template)
  expect(validateParamValues(template.params, values as never)).toEqual([])
  const db = newDatabase()
  const ctx = createDrawContext(db, template.meta.id, layers)
  template.generate(ctx, values)
  return signature([...ctx.drawn])
}

describe('hồi quy template mố — chụp trước khi chuẩn hoá _33_', () => {
  test.each(FILES)('%s: hình học không phụ thuộc bảng layer', file => {
    const kc = runWith(file, KC_LAYERS)
    const office = runWith(file, OFFICE_LAYERS)
    expect(office.hinh).toEqual(kc.hinh)
    expect(kc.hinh).toMatchSnapshot()
  })

  test.each(FILES)('%s: layer theo bảng KC cố định', file => {
    expect(runWith(file, KC_LAYERS).layer).toMatchSnapshot()
  })

  test.each(FILES)('%s: layer theo bảng _33_ của văn phòng', file => {
    expect(runWith(file, OFFICE_LAYERS).layer).toMatchSnapshot()
  })

  test.each(FILES)('%s: layer theo bảng dự phòng của SDK', file => {
    expect(runWith(file, { ...roleLayers() }).layer).toMatchSnapshot()
  })
})

describe('hồi quy cách ghép mo_cau_hoan_chinh', () => {
  beforeAll(() =>
    registerLibrary(
      'mo_be_mong.js',
      'mo_coc_khoan_nhoi.js',
      'mo_tuong_than.js',
      'mo_tuong_dau.js',
      'tuong_phong_ho.js'
    )
  )
  afterAll(() => setRemoteTemplates([]))
  afterEach(() => setRoleLayers(undefined as never))

  test('hình và layer theo bảng _33_ của văn phòng', async () => {
    setRoleLayers(OFFICE_LAYERS)
    const db = newDatabase()
    const result = await runAssembly('mo_cau_hoan_chinh', {}, db)
    expect(result.errors).toEqual([])
    expect(signature(entities(db))).toMatchSnapshot()
  })
})

/** Per-sheet fingerprint of a scene: roles, counts and a hash of primitives. */
function fingerprint(scene: ReturnType<typeof buildDossierScene>) {
  return scene.sheets.map(s => {
    const roles: Record<string, number> = {}
    for (const p of s.primitives) roles[p.role] = (roles[p.role] ?? 0) + 1
    return {
      id: s.id,
      title: s.title,
      origin: s.origin,
      soPrimitive: s.primitives.length,
      roles,
      hash: createHash('sha256')
        .update(JSON.stringify(s.primitives))
        .digest('hex')
        .slice(0, 16)
    }
  })
}

describe('hồi quy hồ sơ mố ho_so_mo_m1 0.2.0 (khung tên)', () => {
  test('cảnh dựng từ tham số mặc định', () => {
    const scene = buildDossierScene(buildDossierModel(dossierDefaults()))
    expect(scene.version).toBe('0.2.0')
    expect({
      version: scene.version,
      perSheet: fingerprint(scene)
    }).toMatchSnapshot()
  })

  test('chỉ khung đổi so với 0.1.0; mọi phần khác giữ nguyên từng primitive', () => {
    const model = buildDossierModel(dossierDefaults())
    const oldScene = buildDossierScene(model, '0.1.0')
    const newScene = buildDossierScene(model, '0.2.0')
    for (let i = 0; i < oldScene.sheets.length; i++) {
      // 0.1.0 frame = everything frame() appended last: its count is fixed.
      const before = oldScene.sheets[i].primitives
      const after = newScene.sheets[i].primitives
      const content = after.filter(
        p => p.role !== 'khung_ten' && p.role !== 'khung_ban_ve'
      )
      // The 0.1.0 frame is the last 7 primitives of each sheet (rect, line,
      // five texts); everything before them is the drawing itself.
      expect(content).toEqual(before.slice(0, before.length - 7))
    }
  })
})

describe('hồi quy hồ sơ mố ho_so_mo_m1 0.1.0', () => {
  test('cảnh dựng từ tham số mặc định', () => {
    // Pinned to its own generator: a saved 0.1.0 run must regenerate exactly
    // as it did before 0.2.0 existed. Same snapshot as before the change.
    const scene = buildDossierScene(
      buildDossierModel(dossierDefaults()),
      '0.1.0'
    )
    const perSheet = scene.sheets.map(s => {
      const roles: Record<string, number> = {}
      for (const p of s.primitives) roles[p.role] = (roles[p.role] ?? 0) + 1
      return {
        id: s.id,
        title: s.title,
        origin: s.origin,
        soPrimitive: s.primitives.length,
        roles,
        hash: createHash('sha256')
          .update(JSON.stringify(s.primitives))
          .digest('hex')
          .slice(0, 16)
      }
    })
    expect({ version: scene.version, perSheet }).toMatchSnapshot()
  })
})
