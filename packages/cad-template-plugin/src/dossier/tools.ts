import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'
import { acTpDxfOut } from '@mlightcad/cad-template-sdk'
import type { AcDbDatabase } from '@mlightcad/data-model'

import { editTemplateRun } from '../editRun'
import { listRuns } from '../runIdentity'
import { runTemplate } from '../runTemplate'
import type { AcApToolOutcome, AcApToolSchema } from '../semanticTools'
import { layerStyles, roleLayers } from '../templateRegistry'
import type { DossierDownload } from './export'
import { dossierHtml, dossierSheetSvg, downloadDossierFile } from './export'
import {
  buildDossierModel,
  DOSSIER_ID,
  DOSSIER_PARAMS,
  DOSSIER_VERSIONS
} from './model'
import { buildDossierScene } from './scene'
import { abutmentDossierTemplate } from './template'

const paramDescription = DOSSIER_PARAMS.map(
  p =>
    `${p.key}: ${p.label}${p.unit ? ` (${p.unit})` : ''}; mặc định ${p.default}${p.choices ? `; chọn ${p.choices.map(c => c.value).join('|')}` : ''}`
).join('\n')
const parameters = {
  type: 'object',
  description: `Thông số thiết kế. Đổi m/cm sang mm trước khi gọi; caoDoDayBe là m, dốc là %. Không tự suy số liệu chưa có.\n${paramDescription}`,
  additionalProperties: { type: ['number', 'string', 'boolean'] }
}
export const DOSSIER_TOOLS: readonly AcApToolSchema[] = [
  {
    name: 'tao_ho_so_mo',
    description:
      'Ưu tiên khi người dùng muốn dựng bộ hồ sơ mố M1 hoặc bản vẽ mố đầy đủ theo BTC mo_2. Giữ mặc định M1 sẽ dựng chi tiết từ CAD gốc, gồm hatch, mũi tên và block kích thước. Thay kích thước chỉ có hình tham số, không được gọi là bản chi tiết hoàn chỉnh. Một mô hình sinh 6 tờ bản nháp: bố trí chung, bảng, 3 tờ thép tham chiếu, khối lượng. Cọc 2×2. Phân biệt trái/phải tuyến, Lc là chiều dài cánh. Không tự thiết kế cốt thép hoặc chiều dài cọc. Thông số mặc định lấy từ mẫu, phải nói rõ. Sửa hồ sơ đã có dùng sua_ho_so_mo.\n' +
      paramDescription,
    input_schema: {
      type: 'object',
      properties: { thong_so: parameters },
      additionalProperties: false
    }
  },
  {
    name: 'sua_ho_so_mo',
    description:
      'Cập nhật tên mố, công trình hoặc vị trí x/y trên hồ sơ đang có, giữ nguyên đối tượng và các chi tiết đã sửa tay. Không xóa rồi dựng lại. Đổi hình học bị từ chối để bảo toàn bản CAD; dùng execute_cad_script, tx.setText/tx.moveGrips trên đúng đối tượng và kiểm tra các hình chiếu liên quan. Không dùng tao_ho_so_mo thay thế hồ sơ sau khi bị từ chối. Chỉ truyền thông số đổi.',
    input_schema: {
      type: 'object',
      properties: { ma_lan_chay: { type: 'string' }, thong_so: parameters },
      required: ['ma_lan_chay', 'thong_so'],
      additionalProperties: false
    }
  },
  {
    name: 'kiem_tra_ho_so',
    description:
      'Kiểm tra thông số hồ sơ đã dựng: mối quan hệ hình học, số cọc/gối, cao độ, phạm vi áp dụng thép và các dữ liệu chưa chốt. Chỉ đọc. Luôn trả bản nháp, không xác nhận an toàn kết cấu.',
    input_schema: {
      type: 'object',
      properties: { ma_lan_chay: { type: 'string' } },
      required: ['ma_lan_chay'],
      additionalProperties: false
    }
  },
  {
    name: 'xuat_ho_so_mo',
    description:
      'DXF tải đúng toàn bộ bản vẽ đang mở, gồm chi tiết và sửa tay. PDF 6 trang A1, HTML và JSON tái sinh từ thông số đã lưu, không chứa sửa tay ngoài mô hình; phải nói rõ giới hạn này trước khi xuất. Sau sửa trực tiếp ưu tiên DXF. Không công bố/ghi đè hồ sơ.',
    input_schema: {
      type: 'object',
      properties: {
        ma_lan_chay: { type: 'string' },
        dinh_dang: { type: 'string', enum: ['pdf', 'html', 'dxf', 'json'] }
      },
      required: ['ma_lan_chay', 'dinh_dang'],
      additionalProperties: false
    }
  }
]

function suppliedValues(raw: unknown): AcTpParamValues {
  if (raw === undefined) return {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('thong_so phải là đối tượng tên thông số → giá trị.')
  if (
    Object.values(raw).some(
      v => !['number', 'string', 'boolean'].includes(typeof v)
    )
  )
    throw new Error('Thông số chỉ nhận số, chuỗi hoặc boolean.')
  return raw as AcTpParamValues
}

function summary(
  values: AcTpParamValues,
  runId: string,
  extra: Record<string, unknown> = {}
): AcApToolOutcome {
  const model = buildDossierModel(values)
  const detailMode = buildDossierScene(model).detailMode
  return {
    ok: !model.issues.some(i => i.level === 'error'),
    status: model.issues.some(i => i.level === 'error') ? 'refused' : 'ready',
    message: `Hồ sơ ${values.tenMo} (${runId}): 6 tờ BẢN NHÁP, ${model.piles.length} cọc, ${model.bearings.length} vị trí gối. ${model.referenceSteelApplicable ? 'Thép theo mẫu gốc, cần đối chiếu các mục chưa chốt.' : 'Chưa có thép áp dụng cho hình học này.'} ${model.issues.length} mục kiểm tra; chưa đủ để phát hành thi công.`,
    data: {
      maLanChay: runId,
      trangThaiHoSo: 'draft',
      mucDoChiTiet: detailMode,
      moTaChiTiet:
        detailMode === 'source'
          ? 'Bố trí trích từ CAD mẫu M1, giữ chi tiết nguồn.'
          : 'Bố trí theo thông số là sơ đồ; chi tiết cho kích thước mới chưa được thiết kế.',
      thongSo: values,
      caoDo: model.elevations,
      kiemTra: model.issues,
      thepApDung: model.referenceSteelApplicable,
      ...extra
    }
  }
}

export async function runDossierTool(
  name: string,
  input: Record<string, unknown>,
  database?: AcDbDatabase,
  download: (file: DossierDownload) => void = downloadDossierFile
): Promise<AcApToolOutcome> {
  try {
    if (!DOSSIER_TOOLS.some(t => t.name === name))
      throw new Error(`Không có công cụ hồ sơ "${name}".`)
    const db = database ?? AcApDocManager.instance.curDocument.database
    if (name === 'tao_ho_so_mo') {
      const model = buildDossierModel(suppliedValues(input.thong_so))
      const errors = model.issues.filter(i => i.level === 'error')
      if (errors.length)
        return {
          ok: false,
          status: 'refused',
          message: errors.map(i => i.message).join('\n'),
          data: { kiemTra: errors }
        }
      const existing = listRuns(db).find(
        r =>
          r.templateId === DOSSIER_ID && r.values.tenMo === model.values.tenMo
      )
      if (existing)
        throw new Error(
          `Đã có ${model.values.tenMo} ở ${existing.id}. Dùng sua_ho_so_mo để sửa, không dựng chồng.`
        )
      const result = await runTemplate(
        abutmentDossierTemplate,
        model.values,
        db
      )
      if (result.errors.length) throw new Error(result.errors.join('\n'))
      if (!database) await refreshDossierView()
      return summary(model.values, result.runId!, {
        soDoiTuong: result.entityCount,
        macDinhTuMau: DOSSIER_PARAMS.filter(
          p => !(p.key in suppliedValues(input.thong_so))
        ).map(p => p.key)
      })
    }
    const runId = String(input.ma_lan_chay ?? '')
    const run = listRuns(db).find(
      r => r.id === runId && r.templateId === DOSSIER_ID
    )
    if (!run)
      throw new Error(
        `Không có hồ sơ mố mang mã "${runId}". Dùng mo_ta_ban_ve để lấy mã.`
      )
    if (!DOSSIER_VERSIONS.includes(run.version))
      throw new Error(
        `Hồ sơ dùng phiên bản ${run.version}; cần bộ sinh đúng phiên bản để tái tạo.`
      )
    if (name === 'sua_ho_so_mo') {
      const changes = suppliedValues(input.thong_so)
      if (!Object.keys(changes).length)
        throw new Error('Chưa có thông số cần đổi.')
      const renamed = changes.tenMo ?? run.values.tenMo
      if (
        listRuns(db).some(
          r =>
            r.id !== runId &&
            r.templateId === DOSSIER_ID &&
            r.values.tenMo === renamed
        )
      )
        throw new Error(`Tên ${renamed} đã thuộc hồ sơ khác; chưa sửa gì.`)
      const result = await editTemplateRun(runId, changes, db)
      if (result.errors.length) throw new Error(result.errors.join('\n'))
      if (!database) await refreshDossierView()
      return summary(result.values, runId, {
        soDoiTuong: result.entityCount,
        soDoiTuongXoa: result.removed
      })
    }
    if (name === 'kiem_tra_ho_so') return summary({ ...run.values }, runId)
    // Exported with the generator that made the run, so a 0.1.0 dossier
    // exports with its original border.
    const scene = buildDossierScene(
      buildDossierModel({ ...run.values }),
      run.version
    )
    const format = String(input.dinh_dang)
    const filename =
      String(run.values.tenMo)
        .normalize('NFKC')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 60) || 'mo'
    if (format === 'pdf') {
      const { downloadSvgSheetsAsPdf } =
        await import('@mlightcad/cad-pdf-plugin/sheets')
      await downloadSvgSheetsAsPdf(
        scene.sheets.map(s => ({
          svg: dossierSheetSvg(s, roleLayers(), layerStyles()),
          title: s.title,
          widthMm: Math.round(s.width / s.scale),
          heightMm: Math.round(s.height / s.scale)
        })),
        `${filename}-ban-nhap.pdf`
      )
      return {
        ok: true,
        status: 'ready',
        message: `Đã xuất ${filename}-ban-nhap.pdf: ${scene.sheets.length} trang ${Math.round(scene.sheets[0].width / scene.sheets[0].scale) === 420 ? 'A3' : 'A1'} bản nháp tái sinh từ thông số; không chứa sửa tay trên canvas.`,
        data: {
          tep: `${filename}-ban-nhap.pdf`,
          trangThaiHoSo: 'draft',
          soTo: scene.sheets.length
        }
      }
    }
    let file: DossierDownload
    if (format === 'html')
      file = {
        name: `${filename}-ban-nhap.html`,
        mime: 'text/html;charset=utf-8',
        content: dossierHtml(scene, roleLayers(), layerStyles())
      }
    else if (format === 'json')
      file = {
        name: `${filename}-ban-nhap.json`,
        mime: 'application/json;charset=utf-8',
        content: JSON.stringify(scene, null, 2)
      }
    else if (format === 'dxf')
      file = {
        name: `${filename}-ban-nhap.dxf`,
        mime: 'application/dxf;charset=utf-8',
        // acTpDxfOut keeps lineweights, full dimension styles and TrueType
        // font names, which the data model's own writer drops.
        content: acTpDxfOut(db) as string
      }
    else throw new Error('Định dạng hỗ trợ: pdf, html, dxf, json.')
    download(file)
    return {
      ok: true,
      status: 'ready',
      message:
        format === 'dxf'
          ? `Đã xuất ${file.name}: toàn bộ bản vẽ hiện tại, giữ chi tiết CAD và các chỉnh sửa trực tiếp.`
          : `Đã xuất ${file.name}: 6 tờ bản nháp tái sinh từ thông số; không chứa sửa tay trên canvas.${format === 'html' ? ' Mở HTML, In → Lưu PDF, A1 ngang, tỷ lệ 100%.' : ''}`,
      data: {
        tep: file.name,
        trangThaiHoSo: 'draft',
        soTo: scene.sheets.length
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

/** Finish regeneration before framing the generated sheets; a successful tool
 * must show its result even in Simple mode, which does not run a zoom round. */
async function refreshDossierView(): Promise<void> {
  const manager = AcApDocManager.instance
  await manager.regen()
  const view = manager.curView
  await view.waitUntilIdle(120000)
  const extents = view.getDrawingExtents()
  if (extents) view.zoomTo(extents)
}
