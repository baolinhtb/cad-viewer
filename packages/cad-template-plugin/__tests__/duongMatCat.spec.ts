jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import type { AcTpNoteBox, AcTpParamValues } from '@mlightcad/cad-template-sdk'
import {
  ACTP_DIM_STYLES_33,
  SEED_ROLE_LAYERS
} from '@mlightcad/cad-template-sdk'
import { AcDbDatabase } from '@mlightcad/data-model'

import { buildRoadModel, ROAD_ID } from '../src/road/model'
import type { RoadPrimitive, RoadScene } from '../src/road/scene'
import { buildRoadScene, roadTextBox } from '../src/road/scene'
import { ROAD_TOOLS, runRoadTool } from '../src/road/tools'
import { listRuns } from '../src/runIdentity'
import { findTemplate } from '../src/templateRegistry'

/** «Vẽ mặt cắt ngang đường 2 làn xe, mặt đường 7 m, lề gia cố mỗi bên 1,5 m, dốc ngang 2 %». */
const PROMPT: AcTpParamValues = {
  soLan: 2,
  bLan: 3500,
  bLeGiaCo: 1500,
  iMat: 2
}

const VARIANTS: Record<string, AcTpParamValues> = {
  macDinh: {},
  prompt: PROMPT,
  motLan: { soLan: 1, bLan: 3500, bLeGiaCo: 1000 },
  bonLanPhanCach: { soLan: 4, bLan: 3750, bPhanCach: 3000, bLeGiaCo: 2500 },
  doThiHe: {
    loaiDuong: 'do_thi',
    soLan: 4,
    bLan: 3500,
    bLeGiaCo: 500,
    bLeDat: 0,
    coBoVia: true,
    bHe: 4000,
    hNen: 0
  },
  doThiPhanCach: {
    loaiDuong: 'do_thi',
    soLan: 6,
    bLan: 3500,
    bPhanCach: 2000,
    bLeGiaCo: 500,
    bLeDat: 0,
    coBoVia: true,
    bHe: 5000,
    hNen: 800,
    mMai: 1.5
  },
  nenDao: { hNen: -3000, mMai: 1 },
  nenDapCao: { hNen: 6000, mMai: 2 },
  nenDapThap: { hNen: 400, bLeDat: 1000 },
  doc15: { iMat: 1.5 },
  doc3: { loaiMat: 'nhua_khac', iMat: 3 },
  motMai: { kieuDoc: 'mot_mai', soLan: 2 },
  baLop: { lopAoDuong: 'BTNC 12,5|60; CPĐD loại I|180; CPĐD loại II|200' }
}

const scene = (v: AcTpParamValues) => buildRoadScene(buildRoadModel(v))
const texts = (s: RoadScene) =>
  s.primitives.filter(
    (p): p is Extract<RoadPrimitive, { kind: 'text' }> => p.kind === 'text'
  )
const dims = (s: RoadScene) =>
  s.primitives.filter(
    (p): p is Extract<RoadPrimitive, { kind: 'dimension' }> =>
      p.kind === 'dimension'
  )
const frameRoles = new Set(['khung_ban_ve', 'khung_ten'])
const hit = (a: AcTpNoteBox, b: AcTpNoteBox) =>
  a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1

describe('road cross-section: model', () => {
  test('defaults: 2 × 3 500 lanes, 2 000 hard + 500 earth shoulders, 570 mm pavement', () => {
    const m = buildRoadModel()
    expect(m.errors).toEqual([])
    expect(m.bMatDuong).toBe(7000)
    expect(m.bAoDuong).toBe(11000)
    expect(m.bNen).toBe(12000)
    expect(m.tAoDuong).toBe(570)
    expect(m.layers.map(l => l.day)).toEqual([50, 70, 150, 300])
  })

  test('the engineer prompt: roadbed 11 000 = 7 000 + 2 × 1 500 + 2 × 500', () => {
    const m = buildRoadModel(PROMPT)
    expect(m.errors).toEqual([])
    expect(m.bNen).toBe(11000)
    expect(m.bands.map(b => [b.kind, b.x1 - b.x0])).toEqual([
      ['le_dat', 500],
      ['le_gia_co', 1500],
      ['lan', 3500],
      ['lan', 3500],
      ['le_gia_co', 1500],
      ['le_dat', 500]
    ])
  })

  test('divider bands sit symmetric about the centreline', () => {
    const m = buildRoadModel(VARIANTS.bonLanPhanCach)
    expect(m.errors).toEqual([])
    const d = m.bands.find(b => b.kind === 'phan_cach')!
    expect([d.x0, d.x1]).toEqual([-1500, 1500])
    expect(m.bNen).toBe(4 * 3750 + 3000 + 2 * 2500 + 2 * 500)
  })
})

describe('road cross-section: refusals name the rule and the allowed values', () => {
  const refuse = (v: AcTpParamValues) => buildRoadModel(v).errors.join('\n')
  test('cross-fall outside TCVN 4054 Bảng 9 for asphalt', () => {
    const e = refuse({ iMat: 3 })
    expect(e).toContain('1,5–2,0 %')
    expect(e).toContain('TCVN 4054 đ.4.9 Bảng 9')
  })
  test('urban asphalt allows 2,5 % (TCVN 13592 Bảng 12), not 3 %', () => {
    expect(refuse({ loaiDuong: 'do_thi', bLeDat: 0, iMat: 2.5 })).toBe('')
    expect(refuse({ loaiDuong: 'do_thi', bLeDat: 0, iMat: 3 })).toContain(
      'TCVN 13592 đ.9.2.5 Bảng 12'
    )
  })
  test('divider needs an even count of 4 lanes or more', () => {
    expect(refuse({ soLan: 2, bPhanCach: 2000 })).toContain(
      'số làn chẵn từ 4 trở lên'
    )
  })
  test('divider narrower than the TCVN 4054 minimum', () => {
    expect(refuse({ soLan: 4, bPhanCach: 1000 })).toContain('1 500 mm')
  })
  test('lane width outside 2,75–3,75 m', () => {
    const e = refuse({ bLan: 2500 })
    expect(e).toContain('2 750–3 750 mm')
    expect(e).toContain('TCVN 4054 Bảng 6')
  })
  test('sidewalk without a curb, earth shoulder with a curb', () => {
    expect(refuse({ bHe: 3000 })).toContain('chỉ vẽ khi có bó vỉa')
    expect(refuse({ coBoVia: true })).toContain('đặt bề rộng lề đất = 0')
  })
  test('unreadable pavement layer', () => {
    expect(refuse({ lopAoDuong: 'BTN dày' })).toContain('tên lớp|bề dày mm')
  })
  test('a refused model draws nothing', () => {
    expect(() => scene({ iMat: 3 })).toThrow('TCVN 4054 đ.4.9 Bảng 9')
  })
})

describe('road cross-section: the sheet', () => {
  test.each(Object.entries(VARIANTS))(
    '%s draws inside A3, roles from _33_, no overlap',
    (_name, v) => {
      const s = scene(v)
      // Every role has its _33_ layer.
      const roles = [...new Set(s.primitives.map(p => p.role))]
      expect(roles.filter(r => !(r in SEED_ROLE_LAYERS))).toEqual([])
      // Inside the sheet.
      for (const p of s.primitives) {
        const pts =
          p.kind === 'path'
            ? p.points
            : p.kind === 'fill'
              ? p.loop
              : p.kind === 'text'
                ? [p.at]
                : [p.start, p.end]
        for (const [x, y] of pts) {
          expect(x).toBeGreaterThanOrEqual(-1)
          expect(x).toBeLessThanOrEqual(s.width + 1)
          expect(y).toBeGreaterThanOrEqual(-1)
          expect(y).toBeLessThanOrEqual(s.height + 1)
        }
      }
      // No text or dimension text over another (title block excluded).
      const boxes = [...texts(s), ...dims(s)]
        .filter(p => !frameRoles.has(p.role))
        .map(p => ({ p, b: roadTextBox(p)! }))
      const clashes: string[] = []
      boxes.forEach((a, i) =>
        boxes.slice(i + 1).forEach(b => {
          if (hit(a.b, b.b))
            clashes.push(
              `${a.p.partId}${a.p.kind === 'text' ? ` «${a.p.text}»` : ''} × ${b.p.partId}${b.p.kind === 'text' ? ` «${b.p.text}»` : ''}`
            )
        })
      )
      expect(clashes).toEqual([])
      expect(s.ghiChuNgoaiKhung).toBe(false)
      // Scale label under the title.
      expect(texts(s).map(t => t.text)).toContain(`(TL: 1/${s.tiLe})`)
    }
  )

  test('dimensions read true lengths through DIMLFAC', () => {
    const s = scene(PROMPT)
    const own =
      (ACTP_DIM_STYLES_33._33_D100 as { dimlfac?: number }).dimlfac ?? 1
    for (const d of dims(s)) {
      const drawn = Math.hypot(d.end[0] - d.start[0], d.end[1] - d.start[1])
      const lfac = (d.overrides as { dimlfac: number }).dimlfac
      expect(Math.round(drawn * lfac)).toBe(Math.round(d.value * own))
    }
    const values = dims(s).map(d => d.value)
    for (const v of [500, 1500, 3500, 7000, 11000, 50, 70, 150, 300, 570])
      expect(values).toContain(v)
  })

  test('default prompt picks 1:100 for the section, 1:10 for the pavement', () => {
    // 11 000 roadbed + 2 × 1,5 × 1 500 batter + 2 × 2 000 ground = 19 800 mm:
    // 39 600 sheet units at 1:50, wider than the ~27 000 left of the detail.
    const s = scene(PROMPT)
    expect(s.tiLe).toBe(100)
    expect(s.tiLeChiTiet).toBe(10)
  })

  test('slope labels «i = 2,0 %» on both halves and the batter ratio', () => {
    const t = texts(scene(PROMPT)).map(x => x.text)
    expect(t.filter(x => x === 'i = 2,0 %')).toHaveLength(2)
    expect(t).toContain('i = 4,0 %')
    expect(t.filter(x => x === '1:1,5')).toHaveLength(2)
    expect(t).toContain('MẶT CẮT NGANG ĐIỂN HÌNH')
    expect(t).toContain('KẾT CẤU ÁO ĐƯỜNG')
  })

  test('registered as a built-in template', () => {
    const t = findTemplate(ROAD_ID)!
    expect(t.meta.id).toBe(ROAD_ID)
    expect(t.validate!({ iMat: 3 }).join()).toContain('TCVN 4054 đ.4.9 Bảng 9')
    expect(t.validate!({})).toEqual([])
  })
})

describe('tao_mat_cat_duong against a real database', () => {
  const database = () => {
    const db = new AcDbDatabase()
    db.createDefaultData()
    return db
  }
  const count = (db: AcDbDatabase) =>
    [...db.tables.blockTable.modelSpace.newIterator()].length

  test('the engineer prompt draws one run and reports the defaults it used', async () => {
    const db = database()
    const out = await runRoadTool('tao_mat_cat_duong', { thong_so: PROMPT }, db)
    expect(out.ok).toBe(true)
    const data = out.data as {
      maLanChay: string
      bNen: number
      tAoDuong: number
      tiLe: number
      macDinh: { thamSo: string; giaTri: unknown }[]
    }
    expect(data).toMatchObject({ bNen: 11000, tAoDuong: 570, tiLe: 100 })
    expect(out.message).toContain('Bề rộng nền 11 000 mm')
    expect(out.message).toContain('tỉ lệ 1:100')
    const keys = data.macDinh.map(d => d.thamSo)
    for (const k of ['lopAoDuong', 'bLeDat', 'hNen', 'mMai', 'iLeDat'])
      expect(keys).toContain(k)
    for (const k of Object.keys(PROMPT)) expect(keys).not.toContain(k)
    const runs = listRuns(db).filter(r => r.templateId === ROAD_ID)
    expect(runs.map(r => r.id)).toEqual([data.maLanChay])
    expect(count(db)).toBeGreaterThan(100)
  })

  test('a refused prompt draws nothing and quotes the clause', async () => {
    const db = database()
    const before = count(db)
    const out = await runRoadTool(
      'tao_mat_cat_duong',
      { thong_so: { ...PROMPT, iMat: 4 } },
      db
    )
    expect(out).toMatchObject({ ok: false, status: 'refused' })
    expect(out.message).toContain('không vẽ gì')
    expect(out.message).toContain('TCVN 4054 đ.4.9 Bảng 9')
    expect(count(db)).toBe(before)
    expect(listRuns(db)).toEqual([])
  })

  test('an unknown parameter is refused by name', async () => {
    const out = await runRoadTool(
      'tao_mat_cat_duong',
      { thong_so: { beRongMat: 7000 } },
      database()
    )
    expect(out.ok).toBe(false)
    expect(out.message).toContain('«beRongMat»')
  })

  test('a second section goes beside the first', async () => {
    const db = database()
    await runRoadTool('tao_mat_cat_duong', {}, db)
    await runRoadTool('tao_mat_cat_duong', { thong_so: { soLan: 4 } }, db)
    const runs = listRuns(db).filter(r => r.templateId === ROAD_ID)
    expect(runs.map(r => Number(r.values.x))).toEqual([0, 47000])
  })

  test('the tool takes no quantity take-off of its own accord', () => {
    const d = ROAD_TOOLS[0].description
    expect(d).toContain('không lập bảng khối lượng')
    expect(d).toContain('đừng gọi tao_btkl')
    expect(d).toContain('data.macDinh')
  })
})
