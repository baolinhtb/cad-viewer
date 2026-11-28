/**
 * BTKL B7 — the agent tools against a real database: build the take-off from
 * the abutments and piers in the drawing, refresh it after a dimension
 * change, undo, export.
 *
 * With BTKL_OUT=<dir> (set by `tools/fidelity/btkl-xuat.mjs`) it also writes
 * the M1 and pier samples made through the tools: DXF, the window of every
 * BTKL sheet for rendering, and the pier's xlsx from `xuat_btkl`.
 */
jest.mock('../../cad-simple-viewer/src/editor/global/eventBus', () => ({
  eventBus: { emit: jest.fn() }
}))
jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: { instance: { regen: jest.fn() } },
  ...jest.requireActual('../../cad-simple-viewer/src/util/AcApDatabaseEdit')
}))

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { acTpDxfOut } from '@mlightcad/cad-template-sdk'
import { AcDbDatabase, AcDbText } from '@mlightcad/data-model'

import { runAssembly } from '../src/assembly'
import {
  acTpBtklOfObject,
  acTpBtklSheets,
  btklMetaFromValues,
  btklObjectsFromValues
} from '../src/btkl'
import {
  type AcApBtklDownload,
  BTKL_TOOLS,
  runBtklTool
} from '../src/btkl/tools'
import { runDossierTool } from '../src/dossier/tools'
import { entitiesOfRun, listRuns } from '../src/runIdentity'
import { registerLibrary } from './helpers/libraryTemplate'

jest.setTimeout(240_000)

const database = () => {
  const db = new AcDbDatabase()
  db.createDefaultData()
  return db
}
const count = (db: AcDbDatabase) =>
  [...db.tables.blockTable.modelSpace.newIterator()].length
const texts = (db: AcDbDatabase, runId: string) =>
  entitiesOfRun(db, runId)
    .filter((e): e is AcDbText => e instanceof AcDbText)
    .map(t => t.textString)
type Tong = {
  doiTuong: string
  beTongM3: number | null
  vanKhuonM2: number | null
  thepKg: number | null
  cocM3: number | null
  tuChoi: string[]
  co: string[]
}
const tong = (outcome: { data?: unknown }) =>
  (outcome.data as { tong: Tong[] }).tong

beforeAll(() => registerLibrary('tru_mat_chinh.js', 'tru_mat_ben.js'))

// P2-M1b: after a wing-thickness change the agent called line 1.7 (the rail)
// the wing and said it ignored the thickness.
describe('BTKL tool descriptions tell the wing from the rail', () => {
  test.each(['tao_btkl', 'cap_nhat_btkl'])('%s', name => {
    const description = BTKL_TOOLS.find(t => t.name === name)!.description
    expect(description).toContain(
      'bê tông tường cánh là mục 1.4, nhân dày tường cánh'
    )
    expect(description).toContain(
      'mục 1.7 là lan can trên tường cánh, theo chiều dài cánh × chiều cao lan can, không theo dày tường cánh'
    )
    expect(description).toContain('ván khuôn tường cánh (5.4) là hai mặt lớn')
    expect(description).toContain('mục 1.7 là lan can, không phải tường cánh')
  })
})

describe('BTKL tools — abutment M1', () => {
  test('create, refresh after a dimension change, undo, export', async () => {
    const db = database()
    expect((await runDossierTool('tao_ho_so_mo', {}, db)).ok).toBe(true)

    // Create: one A3 sheet to the right of the dossier.
    const made = await runBtklTool('tao_btkl', {}, db)
    expect(made.ok).toBe(true)
    const runId = (made.data as { maLanChay: string }).maLanChay
    expect(runId).toBe('r2')
    expect(made.data).toMatchObject({
      soTo: 1,
      doiTuong: [{ loai: 'mo', ten: 'M1', ma: 'r1' }]
    })
    const run = listRuns(db).find(r => r.id === runId)!
    expect(run.templateId).toBe('btkl_ket_cau')
    expect(JSON.parse(String(run.values.doiTuong))).toEqual([
      { loai: 'mo', ten: 'M1', ma: 'r1', thay: {} }
    ])
    expect(run.values.congTrinh).toBe('Cầu Km0+400 — Tuyến số 2')
    expect(Number(run.values.x)).toBeGreaterThan(130000)
    expect(tong(made)[0]).toMatchObject({
      doiTuong: 'Mố M1',
      beTongM3: 187.016,
      vanKhuonM2: 267.146,
      thepKg: 14058.319,
      cocM3: null
    })
    expect(tong(made)[0].co).toContain(
      '1.2 [lech_ban_goc_than] Bảng gốc ghi 53,667 m³, nhỏ hơn hình học 0,814 m³ (1,5 %); chưa giải thích được — đang chờ kỹ sư xác nhận.'
    )
    expect(texts(db, runId)).toEqual(
      expect.arrayContaining(['91,721', '187,016', '14 058,319'])
    )

    // A second take-off is refused; nothing drawn.
    const before = count(db)
    const again = await runBtklTool('tao_btkl', {}, db)
    expect(again.ok).toBe(false)
    expect(again.message).toBe(
      'Bản vẽ đã có BTKL ở r2. Dùng cap_nhat_btkl để tính lại, không lập chồng.'
    )
    expect(count(db)).toBe(before)

    // Refresh with nothing changed: no edit.
    const same = await runBtklTool('cap_nhat_btkl', { ma_lan_chay: runId }, db)
    expect(same.ok).toBe(true)
    expect(same.message).toBe(
      'BTKL r2 đã khớp bản vẽ; không có gì thay đổi, không sửa bản vẽ.'
    )

    // Change the footing height through the dossier tool: since P2-M5 the
    // take-off follows by itself (same run, same place), and says so.
    const edited = await runDossierTool(
      'sua_ho_so_mo',
      { ma_lan_chay: 'r1', thong_so: { hBe: 2500 } },
      db
    )
    expect(edited.ok).toBe(true)
    expect(
      ((edited.data as { canhBao?: string[] }).canhBao ?? []).join(' ')
    ).toContain(`Đã tự cập nhật tờ BTKL ${runId}`)
    // Nothing left to refresh by hand.
    const refreshed = await runBtklTool(
      'cap_nhat_btkl',
      { ma_lan_chay: runId },
      db
    )
    expect(refreshed.ok).toBe(true)
    expect(listRuns(db).find(r => r.id === runId)!.values.x).toBe(run.values.x)
    expect(
      JSON.parse(
        String(listRuns(db).find(r => r.id === runId)!.values.doiTuong)
      )
    ).toEqual([{ loai: 'mo', ten: 'M1', ma: 'r1', thay: { hBe: 2500 } }])
    const now = tong(refreshed)[0]
    // Only the footing changed: the concrete total follows it, the steel is
    // the M1 layout over the taller footing (P3-M1; was estimated from the
    // M1 ratios), and only the piles are still refused.
    expect(now.beTongM3).toBe(210.116)
    expect(now.thepKg).toBeGreaterThan(14058.319)
    expect(now.tuChoi).toEqual([
      expect.stringMatching(
        /^3 Bê tông cọc khoan nhồi D1200: Chưa có chiều dài cọc/
      )
    ])
    expect(now.co).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^6 \[thep_bo_tri_m1_theo_hinh_hoc\]/)
      ])
    )
    expect(refreshed.message).toContain('đã khớp bản vẽ')
    expect(tong(same)[0].beTongM3).toBe(187.016)
    expect(texts(db, runId)).toContain('114,821')
    expect(texts(db, runId)).not.toContain('91,721')

    // Undo the refresh (its own step after the dossier edit): the sheet is
    // the M1 one again; the dossier edit stays.
    expect(db.transactionManager.undo()).toBe(true)
    expect(texts(db, runId)).toContain('91,721')
    expect(texts(db, runId)).not.toContain('114,821')
    expect(listRuns(db).find(r => r.id === 'r1')!.values.hBe).toBe(2500)

    // Export what the sheet shows, warning that the drawing has moved on.
    const files: AcApBtklDownload[] = []
    const entities = count(db)
    const exported = await runBtklTool(
      'xuat_btkl',
      { ma_lan_chay: runId },
      db,
      f => files.push(f)
    )
    expect(exported.ok).toBe(true)
    expect(files.map(f => [f.name, f.mime])).toEqual([
      [
        'btkl-Cau-Km0-400-Tuyen-so-2.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ]
    ])
    const bytes = files[0].content as Uint8Array
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK')
    expect(new TextDecoder().decode(bytes)).toContain('14058.319')
    expect((exported.data as { canhBao: string[] }).canhBao).toEqual([
      'Mố/trụ trong bản vẽ đã đổi từ lúc lập r2; tệp xuất theo số liệu trên tờ BTKL. Chạy cap_nhat_btkl rồi xuất lại nếu cần số mới.'
    ])
    expect(count(db)).toBe(entities)

    // Export straight from the drawing: the current numbers, no warning.
    const live = await runBtklTool('xuat_btkl', { dinh_dang: 'json' }, db, f =>
      files.push(f)
    )
    expect(live.ok).toBe(true)
    expect(files[1].name).toBe('btkl-Cau-Km0-400-Tuyen-so-2.json')
    const items = JSON.parse(String(files[1].content))[0].items
    expect(
      items.find((i: { key: string }) => i.key === 'be').khoiLuong
    ).toBeCloseTo(114.8214, 4)
    expect((live.data as { canhBao?: unknown }).canhBao).toBeUndefined()
  })
})

describe('BTKL tools — piers', () => {
  test('a pier of tru_cau_hoan_chinh is counted once, with the abutment', async () => {
    const db = database()
    expect((await runDossierTool('tao_ho_so_mo', {}, db)).ok).toBe(true)
    const pier = await runAssembly(
      'tru_cau_hoan_chinh',
      { x: 0, y: -60000 },
      db
    )
    expect(pier.errors).toEqual([])
    expect(listRuns(db).map(r => r.templateId)).toEqual([
      'ho_so_mo_m1',
      'tru_mat_chinh',
      'tru_mat_ben'
    ])
    const made = await runBtklTool('tao_btkl', {}, db)
    expect(made.ok).toBe(true)
    expect((made.data as { doiTuong: unknown }).doiTuong).toEqual([
      { loai: 'mo', ten: 'M1', ma: 'r1' },
      { loai: 'tru', ten: 'Trụ T1', ma: 'r2' }
    ])
    const t1 = tong(made)[1]
    expect(t1).toMatchObject({
      doiTuong: 'Trụ T1',
      beTongM3: 197.542,
      vanKhuonM2: 167.2,
      thepKg: null,
      cocM3: null
    })
    expect(t1.co).toEqual(
      expect.arrayContaining([
        '1.1 [gia_dinh] Giả định: đầu cọc ngàm vào bệ 150 mm như mố M1 (template trụ vẽ đầu cọc tại đáy bệ).'
      ])
    )
    const runId = (made.data as { maLanChay: string }).maLanChay
    expect(texts(db, runId)).toEqual(
      expect.arrayContaining(['MỐ M1', 'TRỤ T1'])
    )
  })

  test('a column pier is read from its run values', async () => {
    const db = database()
    await runAssembly('tru_cau_hoan_chinh', { soCot: 2 }, db)
    const made = await runBtklTool('tao_btkl', {}, db)
    expect(made.ok).toBe(true)
    const run = listRuns(db).find(r => r.templateId === 'btkl_ket_cau')!
    expect(JSON.parse(String(run.values.doiTuong))).toEqual([
      { loai: 'tru', ten: 'Trụ T1', ma: 'r1', thay: { loaiThan: 'cot' } }
    ])
    expect(tong(made)[0].beTongM3).toBeCloseTo(
      112.982 + 2 * Math.PI * 0.36 * 6 + 33.2 + 0.96,
      3
    )
  })
})

describe('BTKL tools — refusals', () => {
  test('nothing to take off, unknown run, unknown format', async () => {
    const db = database()
    const empty = await runBtklTool('tao_btkl', {}, db)
    expect(empty.ok).toBe(false)
    expect(empty.message).toBe(
      'Bản vẽ chưa có mố (tao_ho_so_mo) hay trụ (tru_cau_hoan_chinh) dựng bằng template, nên chưa có gì để bóc khối lượng.'
    )
    expect(
      (await runBtklTool('cap_nhat_btkl', { ma_lan_chay: 'r9' }, db)).message
    ).toBe('Không có BTKL mang mã "r9". Dùng tao_btkl để lập.')
    expect((await runBtklTool('xuat_btkl', {}, db)).message).toBe(
      'Bản vẽ chưa có mố hay trụ dựng bằng template.'
    )
    expect(
      (await runBtklTool('xuat_btkl', { dinh_dang: 'pdf' }, db)).message
    ).toBe('Định dạng hỗ trợ: xlsx, json.')
    expect((await runBtklTool('xoa_btkl', {}, db)).message).toBe(
      'Không có công cụ BTKL "xoa_btkl".'
    )
    expect(count(db)).toBe(0)
  })
})

// The samples, made through the tools as the agent would.
const OUT = process.env.BTKL_OUT
;(OUT ? test : test.skip)(
  'write the M1 and pier samples through the tools',
  async () => {
    mkdirSync(join(OUT!, 'work'), { recursive: true })
    const jobs: { name: string; input: string; window: object }[] = []
    for (const [name, build] of [
      ['M1', (db: AcDbDatabase) => runDossierTool('tao_ho_so_mo', {}, db)],
      ['T1', (db: AcDbDatabase) => runAssembly('tru_cau_hoan_chinh', {}, db)]
    ] as const) {
      const db = database()
      await build(db)
      const made = await runBtklTool('tao_btkl', {}, db)
      expect(made.ok).toBe(true)
      const run = listRuns(db).find(r => r.templateId === 'btkl_ket_cau')!
      const input = join(OUT!, 'work', `btkl-${name}.dxf`)
      writeFileSync(input, acTpDxfOut(db, 6) as string)
      const { objects } = btklObjectsFromValues(run.values)
      acTpBtklSheets(
        objects.map(acTpBtklOfObject),
        btklMetaFromValues(run.values)
      ).forEach((s, k) =>
        jobs.push({
          name: `${name}-${k + 1}`,
          input,
          window: {
            x0: s.origin[0],
            y0: s.origin[1],
            x1: s.origin[0] + s.width,
            y1: s.origin[1] + s.height
          }
        })
      )
      if (name === 'T1')
        await runBtklTool('xuat_btkl', { ma_lan_chay: run.id }, db, f =>
          writeFileSync(join(OUT!, `btkl-${name}.xlsx`), f.content)
        )
    }
    writeFileSync(
      join(OUT!, 'work', 'btkl-sheets.json'),
      JSON.stringify(jobs, null, 1)
    )
  }
)
