import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'
import type { AcDbDatabase } from '@mlightcad/data-model'

import { editTemplateRun } from '../editRun'
import { listRuns } from '../runIdentity'
import { runTemplate } from '../runTemplate'
import type { AcApToolOutcome, AcApToolSchema } from '../semanticTools'
import { layerStyles, roleLayers } from '../templateRegistry'
import type { DossierDownload } from './export'
import {
  dossierDxf,
  dossierHtml,
  dossierSheetSvg,
  downloadDossierFile
} from './export'
import {
  buildDossierModel,
  DOSSIER_ID,
  DOSSIER_PARAMS,
  DOSSIER_VERSION
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
      'Ưu tiên khi người dùng muốn dựng bộ hồ sơ mố M1 hoặc bản vẽ mố đầy đủ theo BTC mo_2. Một mô hình sinh 6 tờ bản nháp: bố trí chung, bảng, 3 tờ thép tham chiếu, khối lượng. Cọc 2×2. Phân biệt trái/phải tuyến, Lc là chiều dài cánh. Không tự thiết kế cốt thép hoặc chiều dài cọc. Thông số mặc định lấy từ mẫu, phải nói rõ. Sửa hồ sơ đã có dùng sua_ho_so_mo.\n' +
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
      'Sửa đúng bộ hồ sơ đang có, mọi hình và bảng cập nhật đồng bộ trong một mốc hoàn tác. Chỉ truyền thông số đổi. ma_lan_chay lấy từ mo_ta_ban_ve. Hình học khác mẫu thì bỏ thép tham chiếu và nêu cần thiết kế lại, không kéo giãn thép.',
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
      'Tải hồ sơ bản nháp tái sinh từ thông số đã lưu: PDF 6 trang A1, HTML tự chứa, DXF hoặc JSON. Không chứa sửa tay ngoài mô hình; nói rõ trước khi xuất. Không công bố/ghi đè hồ sơ. PDF là ảnh 200 dpi giữ chữ Việt; DXF là bản chỉnh sửa được.',
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
  return {
    ok: !model.issues.some(i => i.level === 'error'),
    status: model.issues.some(i => i.level === 'error') ? 'refused' : 'ready',
    message: `Hồ sơ ${values.tenMo} (${runId}): 6 tờ BẢN NHÁP, ${model.piles.length} cọc, ${model.bearings.length} vị trí gối. ${model.referenceSteelApplicable ? 'Thép theo mẫu gốc, cần đối chiếu các mục chưa chốt.' : 'Chưa có thép áp dụng cho hình học này.'} ${model.issues.length} mục kiểm tra; chưa đủ để phát hành thi công.`,
    data: {
      maLanChay: runId,
      trangThaiHoSo: 'draft',
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
      if (!database) await AcApDocManager.instance.regen()
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
    if (run.version !== DOSSIER_VERSION)
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
      if (!database) await AcApDocManager.instance.regen()
      return summary(result.values, runId, {
        soDoiTuong: result.entityCount,
        soDoiTuongXoa: result.removed
      })
    }
    if (name === 'kiem_tra_ho_so') return summary({ ...run.values }, runId)
    const scene = buildDossierScene(buildDossierModel({ ...run.values }))
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
          svg: dossierSheetSvg(s),
          title: s.title,
          widthMm: 841,
          heightMm: 594
        })),
        `${filename}-ban-nhap.pdf`
      )
      return {
        ok: true,
        status: 'ready',
        message: `Đã xuất ${filename}-ban-nhap.pdf: 6 trang A1 bản nháp tái sinh từ thông số; không chứa sửa tay trên canvas.`,
        data: {
          tep: `${filename}-ban-nhap.pdf`,
          trangThaiHoSo: 'draft',
          soTo: 6
        }
      }
    }
    let file: DossierDownload
    if (format === 'html')
      file = {
        name: `${filename}-ban-nhap.html`,
        mime: 'text/html;charset=utf-8',
        content: dossierHtml(scene)
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
        content: dossierDxf(scene, roleLayers(), layerStyles())
      }
    else throw new Error('Định dạng hỗ trợ: pdf, html, dxf, json.')
    download(file)
    return {
      ok: true,
      status: 'ready',
      message: `Đã xuất ${file.name}: 6 tờ bản nháp tái sinh từ thông số; không chứa sửa tay trên canvas.${format === 'html' ? ' Mở HTML, In → Lưu PDF, A1 ngang, tỷ lệ 100%.' : ''}`,
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
