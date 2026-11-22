/**
 * Generator 0.3.0 of the abutment dossier: the six A3 sheets of mo_2 laid
 * out as the source (sheet numbers, viewport placement, title texts, paper
 * content), while 0.1.0/0.2.0 stay exactly as they were.
 */
import { createHash } from 'node:crypto'

import {
  acTpDxfOut,
  createDrawContext,
  readSemanticTag,
  SEED_ROLE_LAYERS
} from '@mlightcad/cad-template-sdk'
import {
  AcDbAttribute,
  AcDbBlockReference,
  AcDbDatabase,
  AcDbDimension,
  AcDbEntity,
  AcDbFileType
} from '@mlightcad/data-model'

import { dossierHtml, dossierSheetSvg } from '../src/dossier/export'
import {
  buildDossierModel,
  DOSSIER_A3_VERSION,
  DOSSIER_ID,
  DOSSIER_VERSION,
  DOSSIER_VERSIONS,
  dossierDefaults
} from '../src/dossier/model'
import layout from '../src/dossier/reference/layout-mo2.json'
import type { DossierPrimitive } from '../src/dossier/scene'
import { buildDossierScene, drawDossierScene } from '../src/dossier/scene'
import { abutmentDossierLegacyTemplates } from '../src/dossier/template'

const V = DOSSIER_A3_VERSION
const scene = buildDossierScene(buildDossierModel(dossierDefaults()), V)
const sheet = (id: string) => scene.sheets.find(s => s.id === id)!

let drawn: AcDbDatabase | undefined
/** The default dossier drawn once: drawing six sheets takes seconds. */
const defaultDb = () => (drawn ??= draw())

function draw(s = scene) {
  const db = new AcDbDatabase()
  db.createDefaultData()
  const ctx = createDrawContext(db, DOSSIER_ID, SEED_ROLE_LAYERS, {
    id: 'r1',
    version: V,
    values: s.model.values
  })
  drawDossierScene(ctx, s)
  return db
}
const model = (db: AcDbDatabase): AcDbEntity[] => [
  ...db.tables.blockTable.modelSpace.newIterator()
]
const onSheet = (db: AcDbDatabase, id: string) =>
  model(db).filter(e => readSemanticTag(e)?.params?.sheet === id)

describe('0.3.1 là bộ sinh mặc định; 0.1.0/0.2.0/0.3.0 vẫn tái tạo', () => {
  test('hồ sơ mới là 0.3.1; các bộ sinh cũ chỉ để dựng lại run cũ', () => {
    // 0.3.0 is the first A3 generator; 0.3.1 builds the same A3 scene and
    // unlocks 0.3.0 dossiers the generator has moved on from (P1, Q4).
    expect(V).toBe('0.3.0')
    expect(DOSSIER_VERSION).toBe('0.3.1')
    expect(DOSSIER_VERSIONS).toEqual(['0.1.0', '0.2.0', '0.3.0', '0.3.1'])
    expect(abutmentDossierLegacyTemplates.map(t => t.meta.version)).toEqual([
      '0.1.0',
      '0.2.0',
      '0.3.0'
    ])
  })
})

describe('bố cục 0.3.0', () => {
  test('6 tờ A3 1:100, đánh số như bản gốc', () => {
    expect(scene.version).toBe('0.3.0')
    expect(scene.sheets.map(s => s.id)).toEqual([
      'SUB-010',
      'SUB-020',
      'SUB-070',
      'SUB-080',
      'SUB-090',
      'SUB-100'
    ])
    for (const s of scene.sheets) {
      expect([s.width, s.height, s.scale]).toEqual([42000, 29700, 100])
    }
    // Không tờ nào chồng tờ nào.
    for (const a of scene.sheets)
      for (const b of scene.sheets) {
        if (a === b) continue
        const overlap =
          Math.min(a.origin[0] + a.width, b.origin[0] + b.width) >
            Math.max(a.origin[0], b.origin[0]) &&
          Math.min(a.origin[1] + a.height, b.origin[1] + b.height) >
            Math.max(a.origin[1], b.origin[1])
        expect(overlap).toBe(false)
      }
  })

  test('hình nằm trọn trong khung viewport gốc của từng tờ', () => {
    for (const ls of layout.sheets) {
      if (!ls.viewport) continue
      const vp = ls.viewport
      const ops = sheet(ls.id).primitives.filter(p => p.sourceHandle)
      // Real entities (SUB-010/020) or the 0.2.0 split strokes (others).
      expect(ops.length).toBeGreaterThan(40)
      for (const p of ops) {
        const pts =
          p.kind === 'path'
            ? p.points
            : p.kind === 'fill'
              ? p.loops.flat()
              : p.kind === 'text'
                ? [p.at]
                : []
        for (const [x, y] of pts) {
          expect(x).toBeGreaterThanOrEqual(vp.x * 100 - 1e-6)
          expect(x).toBeLessThanOrEqual((vp.x + vp.w) * 100 + 1e-6)
          expect(y).toBeGreaterThanOrEqual(vp.y * 100 - 1e-6)
          expect(y).toBeLessThanOrEqual((vp.y + vp.h) * 100 + 1e-6)
        }
      }
    }
  })

  test('C–C sang SUB-020, không còn trên SUB-010', () => {
    const texts = (id: string) =>
      sheet(id).primitives.flatMap(p => (p.kind === 'text' ? [p.text] : []))
    expect(texts('SUB-020').some(t => /mặt cắt c-c/i.test(t))).toBe(true)
    expect(texts('SUB-010').some(t => /mặt cắt c-c/i.test(t))).toBe(false)
  })

  test('chữ tiêu đề ở đúng toạ độ đo trên bản gốc', () => {
    for (const ls of layout.sheets) {
      const texts = sheet(ls.id).primitives.filter(
        p => p.role === 'tieu_de_ban_ve' && p.kind === 'text'
      )
      expect(texts).toHaveLength(3)
      for (const t of ls.title) {
        const found = texts.find(
          p =>
            p.kind === 'text' &&
            Math.abs(p.at[0] - t.at[0] * 100) < 1e-6 &&
            Math.abs(p.at[1] - t.at[1] * 100) < 1e-6
        )
        expect(found && found.kind === 'text' && found.text).toBe(t.text)
      }
    }
  })

  test('tên mố và công trình đi vào chữ tiêu đề', () => {
    const renamed = buildDossierScene(
      buildDossierModel({ tenMo: 'M2', congTrinh: 'Cầu Suối Đá' }),
      V
    )
    const titles = renamed.sheets[2].primitives.flatMap(p =>
      p.role === 'tieu_de_ban_ve' && p.kind === 'text' ? [p.text] : []
    )
    expect(titles).toEqual(
      expect.arrayContaining(['BỐ TRÍ CỐT THÉP MỐ M2 (1/3)', 'CẦU SUỐI ĐÁ'])
    )
  })

  test('khung A3 có trên mọi tờ và không đè lên chữ tiêu đề gốc', () => {
    for (const s of scene.sheets) {
      const frame = s.primitives.filter(
        p => p.role === 'khung_ban_ve' || p.role === 'khung_ten'
      )
      expect(frame.length).toBeGreaterThan(10)
      for (const p of frame)
        if (p.kind === 'path')
          for (const [x, y] of p.points)
            expect(x > 34500 && y > 500 && y < 3400).toBe(false)
    }
  })

  test('nhãn TCVN3 của hình chiếu được đọc thành Unicode', () => {
    const texts = sheet('SUB-010').primitives.flatMap(p =>
      p.kind === 'text' ? [p.text] : []
    )
    expect(texts.some(t => /[Æ¾]/.test(t))).toBe(false)
    expect(texts.some(t => /mặt cắt/i.test(t))).toBe(true)
  })

  test('kích thước khác bản gốc: tờ thép giữ hình M1 và ghi rõ chưa cập nhật', () => {
    const changed = buildDossierScene(buildDossierModel({ hBe: 2500 }), V)
    expect(changed.detailMode).toBe('parametric')
    for (const s of changed.sheets.slice(2, 5)) {
      expect(s.primitives.some(p => p.sourceHandle)).toBe(true)
      expect(
        s.primitives.some(
          p =>
            p.kind === 'text' &&
            p.text === 'THÉP THEO M1 GỐC, CHƯA CẬP NHẬT CHO THÔNG SỐ NÀY'
        )
      ).toBe(true)
    }
  })
})

describe('SUB-010 dựng bằng đối tượng thật, theo lưới co giãn', () => {
  const content = (s: typeof scene) =>
    s.sheets[0].primitives.filter(p => p.sourceHandle)

  test('mặc định: 306 đối tượng nguồn (kể cả gối chèn từ xa), đúng loại như bản gốc', () => {
    const kinds: Record<string, number> = {}
    for (const p of content(scene))
      kinds[p.sourceType!] = (kinds[p.sourceType!] ?? 0) + 1
    expect(kinds).toEqual({
      DIMENSION: 89,
      LINE: 84,
      LWPOLYLINE: 45,
      TEXT: 38,
      INSERT: 33,
      LEADER: 15,
      HATCH: 2
    })
    expect(scene.blocks?.map(b => b.name)).toEqual(
      expect.arrayContaining(['cd11', 'D1m', 'D1200-1', 'GA', 'center1'])
    )
  })

  test('đổi chiều cao bệ: mọi dim HB đo 2000 → 2500, số dim giữ nguyên', () => {
    type Dim = Extract<DossierPrimitive, { kind: 'dimension' }>
    const hb = (s: typeof scene) =>
      content(s).filter(
        (p): p is Dim => p.kind === 'dimension' && p.text === 'HB'
      )
    const tall = buildDossierScene(buildDossierModel({ hBe: 2500 }), V)
    expect(hb(scene).length).toBeGreaterThan(3)
    expect(content(tall).filter(p => p.kind === 'dimension')).toHaveLength(89)
    for (const [before, after] of hb(scene).map(
      (d, i) => [d, hb(tall)[i]] as const
    )) {
      const h = (d: Dim) => Math.abs(d.end[1] - d.start[1])
      // Bản gốc có HB đo 1997–2000 (vẽ tay, điểm đặt lệch mốc vài mm): điểm
      // giữa hai mốc đi theo nội suy, nên dài thêm 500 trong vòng 2 mm.
      expect(Math.abs(h(before) - 2000)).toBeLessThan(5)
      expect(Math.abs(h(after) - h(before) - 500)).toBeLessThan(2)
    }
  })

  test('mặc định là ảnh đồng nhất: không điểm nào dời', () => {
    const again = buildDossierScene(
      buildDossierModel({ tenMo: 'M1', caoDoDayBe: 230 }),
      V
    )
    expect(JSON.stringify(content(again))).toBe(JSON.stringify(content(scene)))
  })

  test('bố trí lưới không theo được thì từ chối, nói lý do', () => {
    const texts = (values: Record<string, number>) =>
      buildDossierScene(buildDossierModel(values), V)
        .sheets[0].primitives.flatMap(p => (p.kind === 'text' ? [p.text] : []))
        .join(' | ')
    expect(texts({ tCanh: 600 })).toMatch(/đổi dày tường cánh/)
    expect(texts({ bBe: 8500 })).toMatch(/bề rộng thân = bề rộng bệ/)
    expect(texts({ bBe: 8500, bThan: 8500 })).toMatch(
      /tim cọc ngang = bề rộng bệ − 2 × đường kính cọc/
    )
    expect(texts({ bBe: 8500, bThan: 8500, aCocNgang: 6100 })).not.toMatch(
      /CHƯA DỰNG/
    )
  })
})

describe('nội dung paper của bản gốc', () => {
  test('sơ đồ vị trí mặt cắt SUB-070: 24 ký hiệu là block có attribute CS', async () => {
    const db = defaultDb()
    const inserts = onSheet(db, 'SUB-070').filter(
      (e): e is AcDbBlockReference =>
        e instanceof AcDbBlockReference &&
        !!e.blockTableRecord?.name.startsWith('_33_KH_MAT_CAT')
    )
    expect(inserts).toHaveLength(24)
    const values = inserts
      .flatMap(i => [...i.attributeIterator()] as AcDbAttribute[])
      .map(a => a.textString)
      .sort()
    expect(values).toEqual(
      [
        '1',
        '1',
        '2',
        '2',
        '3',
        '3',
        '4',
        '4',
        '5',
        '5',
        '6',
        '6',
        '7',
        '7',
        '7A',
        '7A',
        '8',
        '8',
        '8A',
        '8A',
        '9',
        '9',
        '10',
        '10'
      ].sort()
    )
    expect(inserts.every(i => i.layer === '_33_Kyhieumatcat')).toBe(true)
    // Giữ qua DXF.
    const again = new AcDbDatabase()
    await again.read(
      new TextEncoder().encode(acTpDxfOut(db) as string).buffer as ArrayBuffer,
      { readOnly: false },
      AcDbFileType.DXF
    )
    const reread = model(again).filter(
      (e): e is AcDbBlockReference =>
        e instanceof AcDbBlockReference &&
        !!e.blockTableRecord?.name.startsWith('_33_KH_MAT_CAT')
    )
    expect(reread).toHaveLength(24)
    expect(
      reread.flatMap(i => [...i.attributeIterator()]).map(a => a.textString)
        .length
    ).toBe(24)
  }, 120_000)

  test('bảng hình dạng thanh SUB-100: 28 kích thước thật, kiểu _33_, chữ ghi đè', () => {
    const dims = onSheet(defaultDb(), 'SUB-100').filter(
      (e): e is AcDbDimension => e instanceof AcDbDimension
    )
    expect(dims).toHaveLength(28)
    for (const d of dims)
      expect(d.dimensionStyleName).toMatch(/^_33_D1(Sagi)?(\$[0-9A-F]+)?$/)
    const shown = new Set(dims.map(d => d.dimensionText))
    for (const t of ['A', 'B', 'C']) expect(shown.has(t)).toBe(true)
  })

  test('SVG/HTML xuất được tờ A3 có cung và block', () => {
    const svg = dossierSheetSvg(
      sheet('SUB-070'),
      undefined,
      undefined,
      scene.blocks
    )
    expect(svg).toContain('width="420mm" height="297mm"')
    expect(svg).toContain('>7A<')
    expect(dossierSheetSvg(sheet('SUB-100'))).toMatch(/ A[\d.]+ [\d.]+ 0 /)
    expect(dossierHtml(scene)).toContain('size:420mm 297mm')
  })
})

describe('hồi quy 0.3.0', () => {
  test('cảnh dựng từ tham số mặc định', () => {
    expect({
      version: scene.version,
      blocks: scene.blocks?.map(b => b.name),
      perSheet: scene.sheets.map(s => {
        const roles: Record<string, number> = {}
        for (const p of s.primitives) roles[p.role] = (roles[p.role] ?? 0) + 1
        return {
          id: s.id,
          origin: s.origin,
          soPrimitive: s.primitives.length,
          roles,
          hash: createHash('sha256')
            .update(JSON.stringify(s.primitives))
            .digest('hex')
            .slice(0, 16)
        }
      })
    }).toMatchSnapshot()
  })
})

describe('SUB-020 (MC C–C) dựng bằng đối tượng thật, theo lưới co giãn', () => {
  type Dim = Extract<DossierPrimitive, { kind: 'dimension' }>
  const dims = (s: typeof scene, id: string, text: string) =>
    s.sheets
      .find(x => x.id === id)!
      .primitives.filter(
        (p): p is Dim =>
          p.kind === 'dimension' && !!p.sourceHandle && p.text === text
      )
  const len = (d: Dim) =>
    d.direction === 'ngang'
      ? Math.abs(d.end[0] - d.start[0])
      : Math.abs(d.end[1] - d.start[1])

  test('mặc định: 55 đối tượng nguồn như bản gốc, không còn nét tách 0.2.0', () => {
    const own = sheet('SUB-020').primitives.filter(p => p.sourceHandle)
    const kinds: Record<string, number> = {}
    for (const p of own) kinds[p.sourceType!] = (kinds[p.sourceType!] ?? 0) + 1
    expect(kinds).toEqual({
      DIMENSION: 21,
      LWPOLYLINE: 14,
      TEXT: 8,
      INSERT: 5,
      LEADER: 4,
      LINE: 2,
      HATCH: 1
    })
  })

  test('đổi lCanh: dim LC đo đúng giá trị mới ở cả B–B (SUB-010) và C–C', () => {
    const longer = buildDossierScene(buildDossierModel({ lCanh: 7000 }), V)
    for (const id of ['SUB-010', 'SUB-020']) {
      const [before] = dims(scene, id, 'LC')
      const [after] = dims(longer, id, 'LC')
      expect(Math.round(len(before))).toBe(6500)
      expect(Math.round(len(after))).toBe(7000)
    }
  })

  test('đổi hBe: mọi dim HB của C–C dài thêm 500', () => {
    const tall = buildDossierScene(buildDossierModel({ hBe: 2500 }), V)
    const before = dims(scene, 'SUB-020', 'HB')
    const after = dims(tall, 'SUB-020', 'HB')
    expect(before.length).toBe(2)
    before.forEach((d, i) =>
      expect(Math.abs(len(after[i]) - len(d) - 500)).toBeLessThan(2)
    )
  })
})

describe('SUB-070 (thép 1/3) dựng bằng đối tượng thật', () => {
  const own = (s: typeof scene) =>
    s.sheets
      .find(x => x.id === 'SUB-070')!
      .primitives.filter(p => p.sourceHandle)

  test('mặc định: 234 đối tượng nguồn, có 3 dim góc thật', () => {
    const kinds: Record<string, number> = {}
    for (const p of own(scene))
      kinds[p.sourceType!] = (kinds[p.sourceType!] ?? 0) + 1
    expect(kinds).toEqual({
      LEADER: 60,
      TEXT: 57,
      LWPOLYLINE: 36,
      LINE: 34,
      INSERT: 26,
      DIMENSION: 19,
      HATCH: 1,
      CIRCLE: 1
    })
    expect(own(scene).filter(p => p.kind === 'angular')).toHaveLength(3)
    expect(
      own(scene).filter(p => p.role === 'cot_thep').length
    ).toBeGreaterThan(40)
  })

  test('chọn F3 = D22 thì nhãn thép đổi theo, như 0.2.0', () => {
    const texts = (s: typeof scene) =>
      own(s).flatMap(p => (p.kind === 'text' ? [p.text] : []))
    const d22 = buildDossierScene(buildDossierModel({ thepF3: 'D22' }), V)
    if (texts(scene).some(t => /F3-D25/.test(t))) {
      expect(texts(d22).some(t => /F3-D25/.test(t))).toBe(false)
      expect(texts(d22).some(t => /F3-D22/.test(t))).toBe(true)
    }
  })

  test('kích thước khác bản gốc: giữ thép M1 đúng như mẫu, không kéo giãn, ghi rõ', () => {
    const tall = buildDossierScene(buildDossierModel({ hBe: 2500 }), V)
    // Exactly the M1 steel, point for point: not stretched to the new size.
    expect(own(tall)).toEqual(own(scene))
    expect(
      tall.sheets[2].primitives.some(
        p =>
          p.kind === 'text' &&
          p.text === 'THÉP THEO M1 GỐC, CHƯA CẬP NHẬT CHO THÔNG SỐ NÀY'
      )
    ).toBe(true)
  })

  test('đổi cấu tạo thép (F3 D25): vẫn không vẽ thép, ghi chưa có phương án', () => {
    const d25 = buildDossierScene(buildDossierModel({ thepF3: 'D25' }), V)
    expect(own(d25)).toHaveLength(0)
    expect(
      d25.sheets[2].primitives.some(
        p => p.kind === 'text' && /CHƯA CÓ PHƯƠNG ÁN THÉP/.test(p.text)
      )
    ).toBe(true)
  })

  test('chỉ bố trí chung (thep = khong): không vẽ thép', () => {
    const none = buildDossierScene(buildDossierModel({ thep: 'khong' }), V)
    expect(own(none)).toHaveLength(0)
  })
})

describe('SUB-080/090 (thép tường cánh trái/phải) dựng bằng đối tượng thật', () => {
  const own = (s: typeof scene, id: string) =>
    s.sheets.find(x => x.id === id)!.primitives.filter(p => p.sourceHandle)

  test.each(['SUB-080', 'SUB-090'])(
    '%s mặc định: 215 đối tượng nguồn như bản gốc, có POINT thật',
    id => {
      const kinds: Record<string, number> = {}
      for (const p of own(scene, id))
        kinds[p.sourceType!] = (kinds[p.sourceType!] ?? 0) + 1
      expect(kinds).toEqual({
        LWPOLYLINE: 54,
        TEXT: 47,
        LEADER: 45,
        LINE: 30,
        DIMENSION: 21,
        INSERT: 12,
        POINT: 3,
        HATCH: 2,
        CIRCLE: 1
      })
    }
  )

  test('chọn W16 = D16 thì nhãn W16/W16′ đổi theo', () => {
    const texts = (s: typeof scene, id: string) =>
      own(s, id).flatMap(p => (p.kind === 'text' ? [p.text] : []))
    const d16 = buildDossierScene(buildDossierModel({ thepW16: 'D16' }), V)
    for (const id of ['SUB-080', 'SUB-090']) {
      if (!texts(scene, id).some(t => /W16'?-D14/.test(t))) continue
      expect(texts(d16, id).some(t => /W16'?-D14/.test(t))).toBe(false)
      expect(texts(d16, id).some(t => /W16'?-D16/.test(t))).toBe(true)
    }
  })

  test('kích thước khác bản gốc: không kéo giãn thép tường cánh, giữ M1 có cảnh báo', () => {
    const longer = buildDossierScene(buildDossierModel({ lCanh: 7000 }), V)
    for (const id of ['SUB-080', 'SUB-090']) {
      expect(own(longer, id)).toEqual(own(scene, id))
      expect(
        longer.sheets
          .find(x => x.id === id)!
          .primitives.some(
            p => p.kind === 'text' && /^THÉP THEO M1 GỐC/.test(p.text)
          )
      ).toBe(true)
    }
  })
})

describe('SUB-100: bảng thống kê và khối lượng vẽ bằng nét và chữ CAD', () => {
  const sub100 = (s: typeof scene) => s.sheets.find(x => x.id === 'SUB-100')!
  const texts = (s: typeof scene) =>
    sub100(s).primitives.flatMap(p => (p.kind === 'text' ? [p.text] : []))

  test('hai bảng: lưới và chữ từ hình trình bày OLE, không còn OLE', () => {
    const table = layout.sheets
      .find(x => x.id === 'SUB-100')!
      .paper.filter(p => (p as { ole?: string }).ole)
    expect(table.filter(p => p.kind === 'path')).toHaveLength(310)
    expect(table.filter(p => p.kind === 'text')).toHaveLength(1095)
    const all = texts(scene)
    for (const t of [
      'TỔNG KHỐI LƯỢNG THÉP (KG)',
      '14058.319',
      'TỔNG KHỐI LƯỢNG BÊ TÔNG MỐ (M3)',
      '186.253',
      'BÊ TÔNG ĐỆM C10(M3)',
      'W16',
      'TƯỜNG CÁNH PHẢI'
    ])
      expect(all).toContain(t)
    // Nhãn ô gộp dựng đứng như Excel.
    expect(
      sub100(scene).primitives.some(
        p =>
          p.kind === 'text' && p.text === 'TƯỜNG CÁNH PHẢI' && p.rotation === 90
      )
    ).toBe(true)
  })

  test('đường lưới và chữ là đối tượng thật trong bản vẽ', () => {
    const db = defaultDb()
    const own = onSheet(db, 'SUB-100')
    expect(own.filter(e => e.dxfTypeName === 'LINE').length).toBeGreaterThan(
      300
    )
    expect(own.filter(e => e.dxfTypeName === 'TEXT').length).toBeGreaterThan(
      1100
    )
    expect(own.some(e => e.dxfTypeName === 'OLE2FRAME')).toBe(false)
  })

  test('kích thước khác bản gốc: bảng M1 giữ nguyên có cảnh báo, thêm bảng khối lượng theo thông số', () => {
    const tall = buildDossierScene(buildDossierModel({ hBe: 2500 }), V)
    expect(texts(tall)).toContain('14058.319')
    expect(texts(tall)).toContain(
      'BẢNG THỐNG KÊ THÉP VÀ KHỐI LƯỢNG BÊN PHẢI LÀ CỦA M1 GỐC, CHƯA CẬP NHẬT CHO THÔNG SỐ NÀY'
    )
    // The take-off of the current parameters: footing 7,7 × 6 × 2,5 − piles.
    expect(texts(tall)).toContain(
      'BẢNG KHỐI LƯỢNG M1 THEO THÔNG SỐ HIỆN TẠI (TẠM TÍNH, xem BTKL)'
    )
    expect(texts(tall)).toContain('114,821')
    expect(texts(tall)).toContain('Cốt thép (tạm tính theo hàm lượng mẫu M1)')
    // Kept clear of the M1 tables and the title block: lower left only.
    const added = sub100(tall).primitives.filter(
      p => p.partId === 'ghi_chu_btkl_SUB-100'
    )
    expect(added.length).toBeGreaterThan(60)
    for (const p of added)
      if (p.kind === 'text' && !p.text.startsWith('BẢNG THỐNG KÊ'))
        expect([p.text, p.at[0] < 20000 && p.at[1] < 10500]).toEqual([
          p.text,
          true
        ])
    // Not on the source sheet.
    expect(texts(scene)).not.toContain(
      'BẢNG KHỐI LƯỢNG M1 THEO THÔNG SỐ HIỆN TẠI (TẠM TÍNH, xem BTKL)'
    )
    // Without steel there is no M1 table to keep.
    const none = buildDossierScene(buildDossierModel({ thep: 'khong' }), V)
    expect(texts(none)).toContain(
      'BẢNG THỐNG KÊ THÉP VÀ KHỐI LƯỢNG CHƯA ÁP DỤNG'
    )
    // Bảng hình dạng thanh (chú giải) vẫn giữ.
    expect(
      sub100(tall).primitives.filter(p => p.kind === 'dimension')
    ).toHaveLength(28)
  })
})

describe('INSERT chèn từ xa nhưng vẽ trong viewport', () => {
  test('gối Goi I24 và ụ UCX dam I24 có trên mặt bằng mố SUB-010', () => {
    const blocks = sheet('SUB-010').primitives.flatMap(p =>
      p.kind === 'insert' && p.sourceHandle ? [p.block] : []
    )
    expect(blocks.filter(b => b === 'Goi I24')).toHaveLength(4)
    expect(blocks.filter(b => b === 'UCX dam I24')).toHaveLength(2)
  })
})

describe('GĐ5: bảng cao độ và bảng thông số SUB-020 theo tham số', () => {
  const tableTexts = (s: typeof scene) =>
    s.sheets
      .find(x => x.id === 'SUB-020')!
      .primitives.flatMap(p =>
        p.kind === 'text' && p.role === 'ghi_chu' ? [p.text] : []
      )
  const values = (s: typeof scene) =>
    tableTexts(s).filter(t => /^-?\d+(\.\d+)?$/.test(t))

  test('mặc định: đúng số của bảng gốc, chữ tiếng Việt đầy đủ', () => {
    const v = values(scene)
    for (const x of [
      '237.491',
      '237.441',
      '228.837',
      '230.837',
      '235.554',
      '6.5',
      '6.604',
      '4.717',
      '1.887',
      '2.000',
      '3.500'
    ])
      expect(v).toContain(x)
    const t = tableTexts(scene)
    expect(t).toEqual(expect.arrayContaining(['TÊN MỐ', 'CAO ĐỘ', 'MỐ M1']))
    expect(t.some(x => x.includes('?'))).toBe(false)
  })

  test('đổi hBe: EL5 và các cao độ phía trên tăng 0,5 m, HB = 2,500, EL6 giữ', () => {
    const v = values(buildDossierScene(buildDossierModel({ hBe: 2500 }), V))
    expect(v).toEqual(
      expect.arrayContaining([
        '231.337',
        '236.054',
        '237.941',
        '2.500',
        '228.837'
      ])
    )
    expect(v).not.toContain('230.837')
  })

  test('đổi caoDoDayBe: mọi cao độ dời cùng một lượng, kích thước giữ', () => {
    const v = values(
      buildDossierScene(buildDossierModel({ caoDoDayBe: 230 }), V)
    )
    expect(v).toEqual(
      expect.arrayContaining([
        '230.000',
        '232.000',
        '236.717',
        '238.604',
        '6.604',
        '2.000'
      ])
    )
  })

  test('đổi lCanh: Lc của bảng theo dim LC', () => {
    const v = values(buildDossierScene(buildDossierModel({ lCanh: 7000 }), V))
    expect(v).toContain('7.0')
  })

  test('thông số lưới không theo được: không đưa số sai lên, ghi rõ', () => {
    const s = buildDossierScene(buildDossierModel({ tCanh: 600 }), V)
    const t = tableTexts(s)
    expect(t).toContain(
      'BẢNG CAO ĐỘ VÀ THÔNG SỐ CHƯA TÍNH ĐƯỢC CHO THÔNG SỐ NÀY'
    )
    expect(t).not.toContain('230.837')
  })
})
