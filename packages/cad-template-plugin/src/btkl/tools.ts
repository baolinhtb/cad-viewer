/**
 * Agent tools of the structural quantity take-off (BTKL): build it from the
 * abutments and piers in the drawing, refresh it after their dimensions
 * change, and export it as `.xlsx`.
 *
 * The take-off is a run of `btkl_ket_cau` whose `doiTuong` holds a snapshot of
 * the objects' parameters; the sheets always show that snapshot, and
 * `cap_nhat_btkl` replaces it with what the drawing holds now.
 */
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'
import type { AcDbDatabase, AcDbEntity } from '@mlightcad/data-model'

import {
  DOSSIER_ID,
  DOSSIER_TITLE_KEYS,
  dossierDefaults
} from '../dossier/model'
import { editTemplateRun } from '../editRun'
import { listRuns } from '../runIdentity'
import { runTemplate } from '../runTemplate'
import type { AcApToolOutcome, AcApToolSchema } from '../semanticTools'
import { acTpBtklNumber } from './mo'
import { acTpBtklSheets } from './sheets'
import {
  type AcTpBtklObject,
  acTpBtklOfObject,
  BTKL_TEMPLATE_ID,
  btklMetaFromValues,
  btklObjectsFromValues,
  btklTemplate
} from './template'
import { BTKL_TRU_DEFAULTS } from './tru'
import type { AcTpBtklResult } from './types'
import { acTpBtklWorkbook } from './workbook'

/** A file the user downloads. */
export interface AcApBtklDownload {
  name: string
  mime: string
  content: string | Uint8Array
}

/**
 * Wing and rail are two lines (P2-M1b: after a wing-thickness change the
 * agent called line 1.7 the wing and said it ignored the thickness).
 */
const WING_LINES =
  'Mố: bê tông tường cánh là mục 1.4, nhân dày tường cánh (tCanh); mục 1.7 là lan can trên tường cánh, theo chiều dài cánh × chiều cao lan can, không theo dày tường cánh; ván khuôn tường cánh (5.4) là hai mặt lớn (tiết diện cánh), không nhân dày. Khi báo cho người dùng gọi đúng tên dòng (mục 1.7 là lan can, không phải tường cánh), bằng tên tiếng Việt, không nói khóa.'

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** What the agent is told about the steel flags' clauses. */
const STEEL_CLAUSE_RULE =
  'Cờ thép neo/nối (coThep: neo_khong_du, neo_ban_goc_chua_dat, noi_chong_cay_thep): nói lại số liệu kèm nguyên điều khoản trong ngoặc như tờ BTKL (ví dụ «TCVN 11823-5 Đ 11.5.3.1», «Đ 11.2.4.1 (PT 182)»), không bỏ, không viết lại điều khoản. Giữ đúng lời «yêu cầu … mm, có … mm» như tờ BTKL (ví dụ «yêu cầu 1 382 mm, có 648 mm»), không đổi thành «cần … nhưng chỉ có …».'

export const BTKL_TOOLS: readonly AcApToolSchema[] = [
  {
    name: 'tao_btkl',
    description:
      'Lập hồ sơ bóc tách khối lượng (BTKL) phần kết cấu cho mọi mố (hồ sơ ho_so_mo_m1) và trụ (tru_mat_chinh/tru_mat_ben, tru_cau_hoan_chinh) đang có trong bản vẽ: các tờ A3 bảng 5 cột STT · Hạng mục · Đơn vị · Khối lượng · Diễn giải công thức, đặt bên phải bản vẽ. Bê tông theo cấu kiện, lót, cọc (khi có lCoc), ván khuôn (quy tắc mặt tiếp xúc lớn như bản gốc M1, chờ định mức), thép mố M1 theo bảng gốc, mố đã đổi hình học thì thép đếm theo bố trí mẫu M1 kéo theo kích thước mới (cờ thep_bo_tri_m1_theo_hinh_hoc), riêng tường cánh tạm tính theo hàm lượng kg/m³ của mẫu M1 (cờ thep_tam_tinh_ham_luong), tường tai đếm thanh; thanh dài hơn cây thép được cộng nối chồng theo TCVN 11823-5 Đ 11.5.3.1 (cờ noi_chong_cay_thep), neo không đủ báo cờ neo_khong_du, chỗ bản gốc M1 chưa đạt báo neo_ban_goc_chua_dat; thép trụ bị từ chối có lý do. Dòng nào chỉ bị từ chối khi chính tham số của dòng đó đổi (phuThuoc). Cọc cần lCoc: thiếu thì mời người dùng cho lCoc. Mỗi dòng ghi công thức bằng chính trị số; cờ lệch bản gốc/giả định/chờ định mức phải được nói lại với người dùng. Đã có BTKL thì dùng cap_nhat_btkl. ' +
      WING_LINES +
      ' ' +
      STEEL_CLAUSE_RULE,
    input_schema: {
      type: 'object',
      properties: {
        vi_tri: {
          type: 'object',
          description:
            'Góc dưới trái tờ đầu (mm, toạ độ thế giới). Bỏ trống: đặt bên phải toàn bộ bản vẽ.',
          properties: { x: { type: 'number' }, y: { type: 'number' } }
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'cap_nhat_btkl',
    description:
      'Tính lại BTKL sau khi mố/trụ trong bản vẽ đổi kích thước, được thêm hoặc xoá: đọc lại thông số từ bản vẽ và dựng lại các tờ BTKL tại chỗ (cùng mã lần chạy, cùng vị trí). Tờ BTKL là kết quả tính, sửa tay trên tờ sẽ mất. Không có gì đổi thì không sửa bản vẽ. ' +
      WING_LINES +
      ' ' +
      STEEL_CLAUSE_RULE,
    input_schema: {
      type: 'object',
      properties: { ma_lan_chay: { type: 'string' } },
      required: ['ma_lan_chay'],
      additionalProperties: false
    }
  },
  {
    name: 'xuat_btkl',
    description:
      'Tải BTKL dạng xlsx (sheet BTKL 5 cột + sheet thép chi tiết theo từng đối tượng) hoặc json. Có ma_lan_chay thì xuất đúng số liệu trên tờ BTKL đó và cảnh báo nếu bản vẽ đã đổi từ lúc lập (cần cap_nhat_btkl); không có thì tính thẳng từ bản vẽ hiện tại. Không đổi bản vẽ.',
    input_schema: {
      type: 'object',
      properties: {
        ma_lan_chay: { type: 'string' },
        dinh_dang: { type: 'string', enum: ['xlsx', 'json'] }
      },
      additionalProperties: false
    }
  }
]

/** Abutment keys that never change a quantity (labels, title block, place). */
const MO_LABEL_KEYS = new Set([
  'x',
  'y',
  'nhanKichThuoc',
  'caoDoDayBe',
  'tenMo',
  'congTrinh',
  ...DOSSIER_TITLE_KEYS
])
const TRU_LABEL_KEYS = new Set(['x', 'y', 'ghiKichThuoc'])

function changedFrom(
  values: Readonly<Record<string, number | string | boolean>>,
  defaults: Readonly<Record<string, number | string | boolean>>,
  skip: Set<string>
) {
  const out: Record<string, number | string | boolean> = {}
  for (const [k, v] of Object.entries(values))
    if (k in defaults && !skip.has(k) && v !== defaults[k]) out[k] = v
  return out
}

/**
 * The abutments and piers of a drawing, as take-off objects, and the
 * title-block data of the first abutment.
 *
 * A pier drawn by `tru_cau_hoan_chinh` is two runs (front and side view) of
 * the same values: it is counted once, by its front view; a side view with no
 * matching front view counts on its own.
 */
export function acapBtklObjects(db: AcDbDatabase): {
  objects: AcTpBtklObject[]
  meta: AcTpParamValues
} {
  const runs = listRuns(db)
  const objects: AcTpBtklObject[] = []
  const meta: AcTpParamValues = {}
  for (const run of runs.filter(r => r.templateId === DOSSIER_ID)) {
    if (!objects.length) {
      for (const k of ['duAn', 'congTrinh', 'ngay', 'donVi'])
        if (run.values[k] !== undefined) meta[k] = run.values[k]
      for (const [from, to] of [
        ['nguoiChuTri', 'chuTri'],
        ['nguoiThietKe', 'thietKe'],
        ['nguoiKiemTra', 'kiemTra'],
        ['nguoiDuyet', 'duyet']
      ])
        if (run.values[from] !== undefined) meta[to] = run.values[from]
    }
    objects.push({
      loai: 'mo',
      ten: String(run.values.tenMo ?? 'M1'),
      ma: run.id,
      thay: changedFrom(run.values, dossierDefaults(), MO_LABEL_KEYS)
    })
  }
  const piers = [
    ...runs.filter(r => r.templateId === 'tru_mat_chinh'),
    ...runs.filter(r => r.templateId === 'tru_mat_ben')
  ]
  const seen: string[] = []
  for (const run of piers) {
    const thay = changedFrom(run.values, BTKL_TRU_DEFAULTS, TRU_LABEL_KEYS)
    const key = JSON.stringify(Object.entries(thay).sort())
    // A side view of a pier already counted by its front view.
    if (run.templateId === 'tru_mat_ben' && seen.includes(key)) {
      seen.splice(seen.indexOf(key), 1)
      continue
    }
    if (run.templateId === 'tru_mat_chinh') seen.push(key)
    objects.push({
      loai: 'tru',
      ten: `Trụ T${objects.filter(o => o.loai === 'tru').length + 1}`,
      ma: run.id,
      thay
    })
  }
  return { objects, meta }
}

/** Right of everything drawn, bottoms aligned. */
function besideDrawing(db: AcDbDatabase): { x: number; y: number } {
  let maxX = -Infinity
  let minY = Infinity
  for (const entity of db.tables.blockTable.modelSpace.newIterator()) {
    let box
    try {
      box = (entity as AcDbEntity).geometricExtents
    } catch {
      continue
    }
    if (!box?.min || !box?.max) continue
    if (!Number.isFinite(box.max.x) || !Number.isFinite(box.min.y)) continue
    maxX = Math.max(maxX, box.max.x)
    minY = Math.min(minY, box.min.y)
  }
  return Number.isFinite(maxX)
    ? { x: Math.round(maxX + 10000), y: Math.round(minY) }
    : { x: 0, y: 0 }
}

/** Totals a reader wants first, per object. */
function totals(r: AcTpBtklResult) {
  const value = (key: string) =>
    r.items.find(i => i.key === key)?.khoiLuong ?? null
  const round = (v: number | null) =>
    v === null ? null : Math.round(v * 1000) / 1000
  return {
    doiTuong: r.doiTuong,
    beTongM3: round(value('be_tong')),
    lotM3: round(value('lot')),
    cocM3: round(value('coc')),
    vanKhuonM2: round(value('van_khuon')),
    thepKg: round(value('thep')),
    /** The steel total as the sheet writes it, to repeat as is. */
    thepKgHienThi: value('thep') === null ? null : vi(value('thep')),
    tuChoi: r.items
      .filter(i => i.nguon === 'tu_choi')
      .map(i => `${i.stt} ${i.hangMuc}: ${i.lyDo ?? ''}`),
    co: [
      ...new Set(
        r.items.flatMap(i =>
          (i.flags ?? []).map(f => `${i.stt} [${f.code}] ${f.message}`)
        )
      )
    ],
    /**
     * The anchorage / lap flags of the steel, as the sheet words them, clause
     * included («TCVN 11823-5 Đ 11.5.3.1»): to be repeated as they are
     * (P3-M2b, UI case 1: the chat dropped the clause).
     */
    coThep: steelClauseFlags(r),
    loi: r.errors
  }
}

/** Flag codes of the anchorage and lap checks (TCVN 11823-5). */
export const ACAP_BTKL_STEEL_CLAUSE_FLAGS: readonly string[] = [
  'neo_khong_du',
  'neo_ban_goc_chua_dat',
  'noi_chong_cay_thep'
]

/** «[code] message» of the anchorage / lap flags of one result. */
function steelClauseFlags(r: AcTpBtklResult | undefined): string[] {
  return [
    ...new Set(
      (r?.items ?? []).flatMap(i =>
        (i.flags ?? [])
          .filter(f => ACAP_BTKL_STEEL_CLAUSE_FLAGS.includes(f.code))
          .map(f => `[${f.code}] ${f.message}`)
      )
    )
  ]
}

function describe(
  runId: string,
  values: AcTpParamValues,
  extra: Record<string, unknown> = {}
): AcApToolOutcome {
  const { objects } = btklObjectsFromValues(values)
  const results = objects.map(acTpBtklOfObject)
  const sheets = acTpBtklSheets(results, btklMetaFromValues(values))
  // P3-M3 backlog (a): the steel flags in the message itself, worded as the
  // sheet words them, so the chat has the sheet's sentence to repeat.
  const steel = [...new Set(results.flatMap(r => steelClauseFlags(r)))]
  return {
    ok: true,
    status: 'ready',
    message: `BTKL ${runId}: ${sheets.length} tờ A3 (${sheets.map(s => s.id).join(', ')}) cho ${objects.map(o => (o.loai === 'mo' ? `mố ${o.ten}` : o.ten)).join(', ')}. Bản nháp: nói lại các dòng từ chối và các cờ cho người dùng. Số viết như tờ BTKL: nhóm nghìn bằng khoảng trắng, thập phân dấu phẩy (thép dùng thepKgHienThi, ví dụ 14 058,319 — không viết 14.058,319). ${STEEL_CLAUSE_RULE}${steel.length ? ` Cờ thép (nguyên văn tờ BTKL): ${steel.join(' ')}` : ''}`,
    data: {
      maLanChay: runId,
      soTo: sheets.length,
      viTri: { x: values.x, y: values.y },
      doiTuong: objects.map(o => ({ loai: o.loai, ten: o.ten, ma: o.ma })),
      tong: results.map(totals),
      ...extra
    }
  }
}

function btklValues(
  objects: AcTpBtklObject[],
  meta: AcTpParamValues,
  at: { x: number; y: number }
): AcTpParamValues {
  return { ...meta, doiTuong: JSON.stringify(objects), x: at.x, y: at.y }
}

/** Browser download; tests and the CLI pass their own sink. */
export function acapDownloadBtklFile(file: AcApBtklDownload): void {
  const blob = new Blob(
    [
      typeof file.content === 'string'
        ? file.content
        : new Uint8Array(file.content)
    ],
    { type: file.mime }
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}

/**
 * A quantity as the drawing writes it: three decimals at most, decimal comma,
 * thousands grouped by a space (14 058,319 — not 14.058,319).
 */
const vi = (v: number | null | undefined) =>
  v === null || v === undefined ? '–' : acTpBtklNumber(v)

const qty3 = (v: number | null | undefined): number | null =>
  v === null || v === undefined ? null : Math.round(v * 1000) / 1000

/**
 * One short line the agent must repeat verbatim after sua_ho_so_mo refreshes
 * an existing take-off (P2-M6c): key items 1.4, 1.7 and tổng C30 always,
 * plus cọc/bệ when they changed; old → new where the figure moved.
 */
export function acapBtklKeyItemsLine(
  before: AcTpBtklResult | undefined,
  after: AcTpBtklResult
): string {
  const val = (r: AcTpBtklResult | undefined, key: string) =>
    r?.items.find(i => i.key === key)?.khoiLuong ?? null
  const part = (key: string, label: string, always: boolean) => {
    const now = val(after, key)
    const was = val(before, key)
    if (!always && (before == null || qty3(was) === qty3(now))) return null
    if (before != null && qty3(was) !== qty3(now))
      return `${label} ${vi(was)} → ${vi(now)} m³`
    return `${label} ${vi(now)} m³`
  }
  return [
    part('coc', 'cọc', false),
    part('be', 'bệ', false),
    part('canh', '1.4 Tường cánh', true),
    part('lan_can', '1.7 Lan can trên tường cánh', true),
    part('be_tong', 'tổng C30', true)
  ]
    .filter((s): s is string => s != null)
    .join('; ')
}

/**
 * After an abutment dossier changed (`sua_ho_so_mo`), every take-off already
 * in the drawing is refreshed the way `cap_nhat_btkl` does it — same run id,
 * same place — so the sheet never shows the old quantities (UI acceptance
 * P2-M4: 4 → 6 piles left the sheet at 78,54 m³ until it was rebuilt by
 * hand). A take-off whose objects did not change is left alone, and none is
 * created when the drawing has none. Returns what to tell the user, naming
 * the new numbers of the edited abutment (`moRunId`).
 */
export async function acapRefreshBtklAfterEdit(
  moRunId: string,
  database?: AcDbDatabase
): Promise<string[]> {
  const db = database ?? AcApDocManager.instance.curDocument.database
  const notes: string[] = []
  for (const run of listRuns(db).filter(
    r => r.templateId === BTKL_TEMPLATE_ID
  )) {
    const beforeMine = btklObjectsFromValues(run.values).objects.find(
      o => o.ma === moRunId
    )
    const beforeResult = beforeMine ? acTpBtklOfObject(beforeMine) : undefined
    const out = await runBtklTool(
      'cap_nhat_btkl',
      { ma_lan_chay: run.id },
      database
    )
    if (!out.ok) {
      notes.push(
        `Tờ BTKL ${run.id} chưa tự cập nhật được (${out.message}); số trên tờ BTKL là số cũ — chạy cap_nhat_btkl.`
      )
      continue
    }
    // Already matching the drawing: nothing was redrawn.
    if (!(out.data as { truoc?: unknown } | undefined)?.truoc) continue
    const now = listRuns(db).find(r => r.id === run.id)
    const { objects } = btklObjectsFromValues(now?.values ?? {})
    const mine = objects.find(o => o.ma === moRunId)
    const result = mine ? acTpBtklOfObject(mine) : undefined
    const items = result ? acapBtklKeyItemsLine(beforeResult, result) : ''
    notes.push(
      items
        ? `Đã tự cập nhật tờ BTKL ${run.id}: ${items}.`
        : `Đã tự cập nhật tờ BTKL ${run.id} theo hồ sơ mới (cùng chỗ).`
    )
    // A steel flag the edit brought (a splice past the stock bar, a short
    // anchorage): with its clause, as on the sheet.
    const was = new Set(steelClauseFlags(beforeResult))
    const added = steelClauseFlags(result).filter(f => !was.has(f))
    if (added.length)
      notes.push(
        `Cờ thép mới trên tờ BTKL ${run.id} (nói lại nguyên văn: «yêu cầu … mm, có … mm» và điều khoản): ${added.join(' ')}`
      )
  }
  return notes
}

/** Runs one BTKL tool; refusals come back as `ok: false` with the reason. */
export async function runBtklTool(
  name: string,
  input: Record<string, unknown>,
  database?: AcDbDatabase,
  download: (file: AcApBtklDownload) => void = acapDownloadBtklFile
): Promise<AcApToolOutcome> {
  try {
    if (!BTKL_TOOLS.some(t => t.name === name))
      throw new Error(`Không có công cụ BTKL "${name}".`)
    const db = database ?? AcApDocManager.instance.curDocument.database
    const existing = listRuns(db).filter(r => r.templateId === BTKL_TEMPLATE_ID)

    if (name === 'tao_btkl') {
      if (existing.length)
        throw new Error(
          `Bản vẽ đã có BTKL ở ${existing.map(r => r.id).join(', ')}. Dùng cap_nhat_btkl để tính lại, không lập chồng.`
        )
      const { objects, meta } = acapBtklObjects(db)
      if (!objects.length)
        throw new Error(
          'Bản vẽ chưa có mố (tao_ho_so_mo) hay trụ (tru_cau_hoan_chinh) dựng bằng template, nên chưa có gì để bóc khối lượng.'
        )
      const raw = input.vi_tri as { x?: unknown; y?: unknown } | undefined
      const at =
        raw && Number.isFinite(Number(raw.x)) && Number.isFinite(Number(raw.y))
          ? { x: Number(raw.x), y: Number(raw.y) }
          : besideDrawing(db)
      const values = btklValues(objects, meta, at)
      const made = await runTemplate(btklTemplate, values, db)
      if (made.errors.length) throw new Error(made.errors.join('\n'))
      if (!database) await AcApDocManager.instance.regen()
      return describe(made.runId!, values, { soDoiTuongCad: made.entityCount })
    }

    if (name === 'cap_nhat_btkl') {
      const runId = String(input.ma_lan_chay ?? '')
      const run = existing.find(r => r.id === runId)
      if (!run)
        throw new Error(
          `Không có BTKL mang mã "${runId}".${existing.length ? ` Đang có: ${existing.map(r => r.id).join(', ')}.` : ' Dùng tao_btkl để lập.'}`
        )
      const { objects, meta } = acapBtklObjects(db)
      if (!objects.length)
        throw new Error(
          'Bản vẽ không còn mố hay trụ dựng bằng template; chưa sửa BTKL.'
        )
      const before = btklObjectsFromValues(run.values).objects
      const next = btklValues(objects, meta, {
        x: Number(run.values.x),
        y: Number(run.values.y)
      })
      const same = Object.entries(next).every(([k, v]) => run.values[k] === v)
      if (same)
        return {
          ...describe(runId, { ...run.values }),
          message: `BTKL ${runId} đã khớp bản vẽ; không có gì thay đổi, không sửa bản vẽ.`
        }
      const result = await editTemplateRun(runId, next, db)
      if (result.errors.length) throw new Error(result.errors.join('\n'))
      if (!database) await AcApDocManager.instance.regen()
      const was = before.map(acTpBtklOfObject).map(totals)
      return describe(runId, result.values, {
        truoc: was,
        soDoiTuongCad: result.entityCount,
        soDoiTuongXoa: result.removed
      })
    }

    // xuat_btkl
    const format = String(input.dinh_dang ?? 'xlsx')
    if (!['xlsx', 'json'].includes(format))
      throw new Error('Định dạng hỗ trợ: xlsx, json.')
    let values: AcTpParamValues
    const warnings: string[] = []
    const current = acapBtklObjects(db)
    if (input.ma_lan_chay !== undefined) {
      const runId = String(input.ma_lan_chay)
      const run = existing.find(r => r.id === runId)
      if (!run) throw new Error(`Không có BTKL mang mã "${runId}".`)
      values = { ...run.values }
      if (run.values.doiTuong !== JSON.stringify(current.objects))
        warnings.push(
          `Mố/trụ trong bản vẽ đã đổi từ lúc lập ${runId}; tệp xuất theo số liệu trên tờ BTKL. Chạy cap_nhat_btkl rồi xuất lại nếu cần số mới.`
        )
    } else {
      if (!current.objects.length)
        throw new Error('Bản vẽ chưa có mố hay trụ dựng bằng template.')
      values = btklValues(current.objects, current.meta, { x: 0, y: 0 })
    }
    const { objects, errors } = btklObjectsFromValues(values)
    if (errors.length) throw new Error(errors.join('\n'))
    const results = objects.map(acTpBtklOfObject)
    const meta = btklMetaFromValues(values)
    const base =
      (meta.congTrinh ?? 'ket-cau')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'ket-cau'
    const file: AcApBtklDownload =
      format === 'xlsx'
        ? {
            name: `btkl-${base}.xlsx`,
            mime: XLSX_MIME,
            content: acTpBtklWorkbook(results, {
              congTrinh: meta.congTrinh,
              ngay: meta.ngay
            })
          }
        : {
            name: `btkl-${base}.json`,
            mime: 'application/json;charset=utf-8',
            content: JSON.stringify(results, null, 2)
          }
    download(file)
    return {
      ok: true,
      status: 'ready',
      message: `Đã xuất ${file.name}: ${objects.length} đối tượng${format === 'xlsx' ? `, sheet BTKL và ${objects.length} sheet thép chi tiết` : ''}. Bản nháp.`,
      data: {
        tep: file.name,
        tong: results.map(totals),
        ...(warnings.length ? { canhBao: warnings } : {})
      }
    }
  } catch (error) {
    return {
      ok: false,
      status: 'refused',
      message: error instanceof Error ? error.message : String(error)
    }
  }
}
