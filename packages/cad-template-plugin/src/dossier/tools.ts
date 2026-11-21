import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'
import { acTpDxfOut } from '@mlightcad/cad-template-sdk'
import type { AcDbDatabase } from '@mlightcad/data-model'

import { editTemplateRun } from '../editRun'
import { listRuns } from '../runIdentity'
import { runTemplate } from '../runTemplate'
import type { AcApToolOutcome, AcApToolSchema } from '../semanticTools'
import { layerStyles, roleLayers } from '../templateRegistry'
import type { DossierDerived } from './derive'
import { acapDeriveDossierValues, DOSSIER_ROAD_MARGIN } from './derive'
import type { DossierDownload } from './export'
import { dossierHtml, dossierSheetSvg, downloadDossierFile } from './export'
import {
  DOSSIER_DERIVED_KEYS,
  DOSSIER_FREE_KEYS,
  DOSSIER_STRETCH_KEYS
} from './grid030'
import {
  buildDossierModel,
  DOSSIER_ID,
  DOSSIER_NEW_LABEL_MODE,
  DOSSIER_PARAMS,
  DOSSIER_VERSIONS,
  dossierDefaults
} from './model'
import { buildDossierScene } from './scene'
import { abutmentDossierTemplate } from './template'

const paramDescription = DOSSIER_PARAMS.map(
  p =>
    `${p.key}: ${p.label}${p.unit ? ` (${p.unit})` : ''}; mặc định ${p.default}${p.choices ? `; chọn ${p.choices.map(c => c.value).join('|')}` : ''}`
).join('\n')
/**
 * What the 0.3.0 generator can and cannot follow, from the grid's own key
 * sets, so the descriptions the agent reads never drift from the code.
 */
const fixedKeys = DOSSIER_PARAMS.filter(
  p =>
    !(DOSSIER_STRETCH_KEYS as readonly string[]).includes(p.key) &&
    !DOSSIER_FREE_KEYS.has(p.key) &&
    !DOSSIER_DERIVED_KEYS.has(p.key)
).map(p => `${p.key} = ${p.default}`)
const limits =
  `Giới hạn bộ sinh 0.3.0. Co giãn được: ${DOSSIER_STRETCH_KEYS.join(', ')}. ` +
  'Bắt buộc theo nhau: bThan = bBe, aCocNgang = bBe − 2D, aCocDoc = lBe − 2D (bản gốc vẽ thân rộng bằng bệ, cọc sát mép bệ). ' +
  `Tự suy khi không truyền: chỉ cho bMatDuong (không cho bBe/bThan) thì bBe = bThan = bMatDuong + 2 × ${DOSSIER_ROAD_MARGIN} (lề mép đường cố định ${DOSSIER_ROAD_MARGIN} mm mỗi bên như M1, ví dụ mặt đường 8000 → bBe = bThan = ${8000 + 2 * DOSSIER_ROAD_MARGIN}); đổi bBe hoặc D mà không cho aCocNgang thì aCocNgang = bBe − 2D; đổi lBe hoặc D mà không cho aCocDoc thì aCocDoc = lBe − 2D. Giá trị suy ra trả về trong data.suyRa: phải báo lại cho người dùng. ` +
  `Chỉ đổi chữ: ${[...DOSSIER_FREE_KEYS].join(', ')}. ` +
  `CHƯA đổi được, phải giữ giá trị mẫu (khác mẫu thì bị từ chối, không dựng): ${fixedKeys.join(', ')}. ` +
  'Người dùng yêu cầu giá trị khác cho các thông số này thì nói rõ chưa làm được trước khi gọi, không tự thay bằng thông số khác.'
const parameters = {
  type: 'object',
  description: `Thông số thiết kế. Đổi m/cm sang mm trước khi gọi; caoDoDayBe là m, dốc là %. Không tự suy số liệu chưa có.\n${paramDescription}`,
  additionalProperties: { type: ['number', 'string', 'boolean'] }
}
export const DOSSIER_TOOLS: readonly AcApToolSchema[] = [
  {
    name: 'tao_ho_so_mo',
    description:
      'Ưu tiên khi người dùng muốn dựng bộ hồ sơ mố M1 hoặc bản vẽ mố đầy đủ theo BTC mo_2. Bộ sinh 0.3.0: 6 tờ A3 1:100 SUB-010…SUB-100 như bản gốc, bằng đối tượng CAD thật (dim, hatch, block có attribute), bảng cao độ/thông số và bảng thống kê vẽ bằng nét và chữ. Thông số ngoài giới hạn dưới đây thì công cụ từ chối và không vẽ gì. Tờ thép và bảng thống kê chỉ đúng cho mố M1 gốc: đổi hình học thì tờ thép giữ hình M1 kèm cảnh báo chưa cập nhật, SUB-100 thêm bảng khối lượng theo thông số. Hồ sơ bản nháp; không tự thiết kế cốt thép hoặc chiều dài cọc. Thông số mặc định lấy từ mẫu, phải nói rõ. Sửa hồ sơ đã có dùng sua_ho_so_mo.\n' +
      limits +
      '\n' +
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
      'Sửa hồ sơ mố đang có; chỉ truyền thông số đổi. Tên mố, công trình, vị trí x/y, khung tên: vá tại chỗ, giữ nguyên đối tượng và chi tiết đã sửa tay. Kích thước (hồ sơ 0.3.0): dựng lại theo lưới co giãn — chỉ khi bản vẽ chưa bị sửa tay (so với bản dựng từ thông số đã ghi); có sửa tay, hoặc bố trí chung không theo được (đổi số/bố trí cọc, bThan khác bBe, hình tràn khung A3…) thì từ chối và không sửa gì. Đổi hình học: tờ thép giữ hình thép M1 (không kéo giãn) kèm cảnh báo "THÉP THEO M1 GỐC, CHƯA CẬP NHẬT", SUB-100 giữ bảng M1 có cảnh báo và thêm bảng khối lượng theo thông số hiện tại (BTKL tạm tính) — báo trong canhBao. lCoc không phải đổi hình học: chỉ ghi giá trị, giữ mọi đối tượng. Nếu bản dựng lại bỏ nhiều đối tượng (>10 % và ≥100), công cụ từ chối kèm số liệu: hỏi người dùng rồi mới gọi lại với xac_nhan_bo_doi_tuong: true. Hồ sơ 0.1.0/0.2.0: kích thước bị từ chối như trước. Khi bị từ chối dùng execute_cad_script trên đúng đối tượng; không dùng tao_ho_so_mo thay thế hồ sơ. Hồ sơ đang mang thông số ngoài lưới (tờ hình ghi CHƯA DỰNG ĐƯỢC) thì mọi sửa kích thước bị từ chối cho tới khi đưa thông số đó về giá trị mẫu trong cùng lần gọi; thông báo từ chối nêu giá trị cần đưa về.\n' +
      limits,
    input_schema: {
      type: 'object',
      properties: {
        ma_lan_chay: { type: 'string' },
        thong_so: parameters,
        xac_nhan_bo_doi_tuong: {
          type: 'boolean',
          description:
            'Chỉ đặt true sau khi người dùng đồng ý với số đối tượng sẽ bị bỏ mà lần gọi trước đã báo.'
        }
      },
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

/** The derived values as a data field, absent when nothing was derived. */
function suyRaOf(suyRa: DossierDerived[]): { suyRa?: DossierDerived[] } {
  return suyRa.length ? { suyRa } : {}
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
      // New dossiers label with numbers unless asked otherwise; runs stored
      // without the key keep the source's symbols (standard assumption 10).
      const given = suppliedValues(input.thong_so)
      const derived = acapDeriveDossierValues(dossierDefaults(), given)
      const model = buildDossierModel({
        nhanKichThuoc: DOSSIER_NEW_LABEL_MODE,
        ...given,
        ...Object.fromEntries(derived.suyRa.map(d => [d.thamSo, d.giaTri]))
      })
      const errors = model.issues.filter(i => i.level === 'error')
      if (errors.length)
        return {
          ok: false,
          status: 'refused',
          message: errors.map(i => i.message).join('\n'),
          data: { kiemTra: errors, ...suyRaOf(derived.suyRa) }
        }
      // No false success: a sheet whose drawing cannot follow the values
      // refuses the whole dossier — the same test sua_ho_so_mo makes.
      const unbuilt = unbuiltSheets(model)
      if (unbuilt.length)
        return {
          ok: false,
          status: 'refused',
          message: `Chưa dựng hồ sơ, không vẽ gì: ${unbuilt.join(' ')}`,
          data: { khongDungDuoc: unbuilt, ...suyRaOf(derived.suyRa) }
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
        ...suyRaOf(derived.suyRa),
        macDinhTuMau: DOSSIER_PARAMS.filter(
          p => !(p.key in given) && !derived.suyRa.some(d => d.thamSo === p.key)
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
      const derived = acapDeriveDossierValues(
        { ...dossierDefaults(), ...run.values },
        changes
      )
      const edit: AcTpParamValues = {
        ...changes,
        ...Object.fromEntries(derived.suyRa.map(d => [d.thamSo, d.giaTri]))
      }
      const result = await editTemplateRun(runId, edit, db, {
        confirmLoss: input.xac_nhan_bo_doi_tuong === true
      })
      if (result.errors.length) throw new Error(result.errors.join('\n'))
      if (!database) await refreshDossierView()
      return summary(result.values, runId, {
        soDoiTuong: result.entityCount,
        soDoiTuongXoa: result.removed,
        ...suyRaOf(derived.suyRa),
        ...(result.warnings?.length ? { canhBao: result.warnings } : {})
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

/**
 * Sheets of the scene that show the "cannot draw" notice instead of their
 * drawing, each with the reason the generator gave.
 */
function unbuiltSheets(model: ReturnType<typeof buildDossierModel>): string[] {
  const out: string[] = []
  for (const sheet of buildDossierScene(model).sheets) {
    const at = sheet.primitives.findIndex(
      p =>
        p.kind === 'text' &&
        p.text === 'CHƯA DỰNG ĐƯỢC HÌNH CHO BỘ THÔNG SỐ NÀY'
    )
    if (at < 0) continue
    const why = sheet.primitives[at + 1]
    out.push(`${sheet.id}: ${why?.kind === 'text' ? why.text : ''}`)
  }
  return out
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
