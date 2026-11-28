import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'
import type { AcDbDatabase } from '@mlightcad/data-model'

import { listRuns } from '../runIdentity'
import { runTemplate } from '../runTemplate'
import type { AcApToolOutcome, AcApToolSchema } from '../semanticTools'
import {
  buildRoadModel,
  ROAD_ID,
  ROAD_PARAMS,
  roadCrossFallRange,
  type RoadKind,
  roadMm,
  type RoadSurface
} from './model'
import { buildRoadScene } from './scene'
import { roadSectionTemplate } from './template'

/** Sheet width in drawing units, and the gap kept between two sheets. */
const SHEET_STEP = 420 * 100 + 5000

const paramDescription = ROAD_PARAMS.filter(p => p.key !== 'x' && p.key !== 'y')
  .map(
    p =>
      `${p.key}: ${p.label}${p.unit ? ` (${p.unit})` : ''}; mặc định ${p.type === 'text' ? `«${String(p.default)}»` : String(p.default)}` +
      `${p.min !== undefined ? `; ${p.min}–${p.max}` : ''}` +
      `${p.choices ? `; chọn ${p.choices.map(c => c.value).join('|')}` : ''}` +
      `${p.hint ? ` — ${p.hint}` : ''}`
  )
  .join('\n')

export const ROAD_TOOLS: readonly AcApToolSchema[] = [
  {
    name: 'tao_mat_cat_duong',
    description:
      'Vẽ bản vẽ cấu tạo MẶT CẮT NGANG ĐƯỜNG theo thông số (một tờ A3): làn xe, lề gia cố, lề đất, dải phân cách giữa, bó vỉa và hè (đô thị), mái ta luy đắp/đào 1:m, dốc ngang hai mái/một mái, cột kết cấu áo đường (tên lớp + bề dày) có hatch; kích thước ghi số thật, nhãn «i = 2,0 %», tỉ lệ tự chọn vừa khung (ghi «(TL: 1/n)»). Dùng khi người dùng muốn vẽ mặt cắt ngang đường / trắc ngang điển hình. Không thiết kế: không kiểm cường độ áo đường, không tính đào đắp, không lập bảng khối lượng (đừng gọi tao_btkl sau công cụ này). ' +
      'Đổi m/cm sang mm (dốc là %, cao độ là m). Mặt đường «7 m, 2 làn» → soLan 2, bLan 3500. «Lề gia cố mỗi bên 1,5 m» → bLeGiaCo 1500. Đường đô thị có hè → loaiDuong "do_thi", coBoVia true, bLeDat 0, bHe (kể cả bó vỉa). Nền đào → hNen âm. ' +
      'Thông số không truyền lấy mặc định; công cụ trả data.macDinh (các giá trị lấy mặc định) — PHẢI nêu lại cho người dùng các giá trị đó (nhất là kết cấu áo đường, lề đất, chiều cao nền, hệ số mái) cùng tổng bề rộng nền, bề dày áo đường và tỉ lệ. Giá trị ngoài dải TCVN 4054:2005 / TCVN 13592:2022 hoặc ràng buộc sai thì công cụ từ chối, không vẽ: báo nguyên văn lời từ chối (có điều khoản, giá trị cho phép) và hỏi lại, không tự sửa số.\n' +
      paramDescription,
    input_schema: {
      type: 'object',
      properties: {
        thong_so: {
          type: 'object',
          description: 'Thông số mặt cắt; chỉ truyền những gì người dùng nói. lopAoDuong dạng «tên|dày mm; tên|dày mm» từ trên xuống.',
          additionalProperties: { type: ['number', 'string', 'boolean'] }
        }
      },
      additionalProperties: false
    }
  }
]

function suppliedValues(raw: unknown): AcTpParamValues {
  if (raw === undefined) return {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('thong_so phải là đối tượng tên thông số → giá trị.')
  const unknown = Object.keys(raw).filter(
    k => !ROAD_PARAMS.some(p => p.key === k)
  )
  if (unknown.length)
    throw new Error(
      `Không có thông số ${unknown.map(k => `«${k}»`).join(', ')}. Nhận: ${ROAD_PARAMS.map(p => p.key).join(', ')}.`
    )
  if (
    Object.values(raw).some(
      v => !['number', 'string', 'boolean'].includes(typeof v)
    )
  )
    throw new Error('Thông số chỉ nhận số, chuỗi hoặc boolean.')
  return raw as AcTpParamValues
}

/**
 * Checks, draws and summarises one cross-section. Refuses (draws nothing)
 * when a value is out of its cited range or the section does not fit A3.
 */
export async function runRoadTool(
  name: string,
  input: Record<string, unknown>,
  database?: AcDbDatabase
): Promise<AcApToolOutcome> {
  try {
    if (!ROAD_TOOLS.some(t => t.name === name))
      throw new Error(`Không có công cụ mặt cắt đường "${name}".`)
    const given = suppliedValues(input.thong_so)
    const model = buildRoadModel(given)
    if (model.errors.length)
      return {
        ok: false,
        status: 'refused',
        message: `Chưa vẽ mặt cắt, không vẽ gì:\n${model.errors.join('\n')}`,
        data: { loi: model.errors }
      }
    const db = database ?? AcApDocManager.instance.curDocument.database
    const values: AcTpParamValues = { ...model.values }
    // A second section goes beside the first instead of on top of it.
    if (!('x' in given) && !('y' in given)) {
      const count = listRuns(db).filter(r => r.templateId === ROAD_ID).length
      values.x = count * SHEET_STEP
    }
    let scene
    try {
      scene = buildRoadScene(buildRoadModel(values))
    } catch (e) {
      return {
        ok: false,
        status: 'refused',
        message: `Chưa vẽ mặt cắt, không vẽ gì: ${(e as Error).message}`
      }
    }
    const result = await runTemplate(roadSectionTemplate, values, db)
    if (result.errors.length) throw new Error(result.errors.join('\n'))
    if (!database) await refreshView()
    const macDinh = ROAD_PARAMS.filter(
      p =>
        !(p.key in given) &&
        !['x', 'y', 'duAn', 'congTrinh', 'donVi', 'ngay'].includes(p.key)
    ).map(p => ({ thamSo: p.key, ten: p.label, giaTri: model.values[p.key] }))
    const r = roadCrossFallRange(
      String(values.loaiDuong) as RoadKind,
      String(values.loaiMat) as RoadSurface
    )
    const tiLe = scene.tiLe
    return {
      ok: true,
      status: 'ready',
      message:
        `Đã vẽ mặt cắt ngang đường (${result.runId}), tỉ lệ 1:${tiLe}, kết cấu áo đường 1:${scene.tiLeChiTiet}. ` +
        `Bề rộng nền ${roadMm(model.bNen)} mm; phần xe chạy ${model.values.soLan} × ${roadMm(Number(model.values.bLan))} = ${roadMm(model.bMatDuong)} mm; ` +
        `áo đường dày ${roadMm(model.tAoDuong)} mm (${model.layers.length} lớp). ` +
        `Dốc ngang ${String(model.values.iMat).replace('.', ',')} % trong ${String(r.min).replace('.', ',')}–${String(r.max).replace('.', ',')} % (${r.nguon}). ` +
        'Bản vẽ cấu tạo theo thông số: không kiểm cường độ áo đường, không tính khối lượng. Nêu lại cho người dùng các giá trị lấy mặc định trong data.macDinh.',
      data: {
        maLanChay: result.runId,
        soDoiTuong: result.entityCount,
        tiLe,
        tiLeChiTiet: scene.tiLeChiTiet,
        bNen: model.bNen,
        bMatDuong: model.bMatDuong,
        bAoDuong: model.bAoDuong,
        tAoDuong: model.tAoDuong,
        lop: model.layers,
        dai: model.bands.map(b => ({
          loai: b.kind,
          ten: b.label,
          rong: Math.round(b.x1 - b.x0)
        })),
        macDinh,
        ...(scene.ghiChuNgoaiKhung
          ? { canhBao: ['GHI CHÚ đặt ngoài vùng vẽ.'] }
          : {})
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

/** Regenerate and frame the new sheet (as the dossier tool does). */
async function refreshView(): Promise<void> {
  const manager = AcApDocManager.instance
  await manager.regen()
  const view = manager.curView
  await view.waitUntilIdle(120000)
  const extents = view.getDrawingExtents()
  if (extents) view.zoomTo(extents)
}
