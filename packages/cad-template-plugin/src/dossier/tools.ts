import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import type { AcTpParamValues } from '@mlightcad/cad-template-sdk'
import { acTpDxfOut } from '@mlightcad/cad-template-sdk'
import type { AcDbDatabase } from '@mlightcad/data-model'

import { acapRefreshBtklAfterEdit } from '../btkl/tools'
import { editTemplateRun } from '../editRun'
import { listRuns } from '../runIdentity'
import { runTemplate } from '../runTemplate'
import type { AcApToolOutcome, AcApToolSchema } from '../semanticTools'
import { layerStyles, roleLayers } from '../templateRegistry'
import type { DossierDerived } from './derive'
import {
  acapDeriveDossierValues,
  DOSSIER_BEARING_MARGIN,
  DOSSIER_ROAD_MARGIN
} from './derive'
import type { DossierDownload } from './export'
import { dossierHtml, dossierSheetSvg, downloadDossierFile } from './export'
import {
  DOSSIER_ARRAYED_KEYS,
  DOSSIER_BEARING_KEYS,
  DOSSIER_DERIVED_KEYS,
  DOSSIER_FREE_KEYS,
  DOSSIER_PILE_KEYS,
  DOSSIER_STRETCH_KEYS
} from './grid030'
import {
  buildDossierModel,
  DOSSIER_ID,
  DOSSIER_NEW_LABEL_MODE,
  DOSSIER_PARAMS,
  DOSSIER_VERSION,
  DOSSIER_VERSIONS,
  dossierDefaults,
  dossierParamValue
} from './model'
import { buildDossierScene } from './scene'
import { acapDossierElevations, acapDossierNoteAfter } from './scene030'
import { abutmentDossierTemplate } from './template'

const paramDescription = DOSSIER_PARAMS.map(
  p =>
    `${p.key}: ${p.label}${p.unit ? ` (${p.unit})` : ''}; mặc định ${p.default}${p.choices ? `; chọn ${p.choices.map(c => c.value).join('|')}` : ''}`
).join('\n')
/**
 * What the A3 generator (0.3.0/0.3.1) can and cannot follow, from the grid's own key
 * sets, so the descriptions the agent reads never drift from the code.
 */
const fixedKeys = DOSSIER_PARAMS.filter(
  p =>
    !(DOSSIER_STRETCH_KEYS as readonly string[]).includes(p.key) &&
    !DOSSIER_FREE_KEYS.has(p.key) &&
    !DOSSIER_DERIVED_KEYS.has(p.key) &&
    !DOSSIER_ARRAYED_KEYS.has(p.key)
).map(p => `${p.key} = ${p.default}`)
const limits =
  `Giới hạn phiên bản ${DOSSIER_VERSION}. Co giãn được: ${DOSSIER_STRETCH_KEYS.join(', ')}. ` +
  `Gối đổi được: ${DOSSIER_BEARING_KEYS.join(', ')} (vẽ lại đúng soGoi block gối ở mặt chính, cách đều aGoi quanh tim; ụ chống xô giữ vị trí bản gốc). ` +
  `Cọc đổi được: ${DOSSIER_PILE_KEYS.join(', ')} (vẽ lại mảng cọc như gối: mặt bằng cọc soHangCoc hàng × soCotCoc cọc, mặt chính soCotCoc cọc, mặt cắt A–A/B–B/C–C soHangCoc cọc, cách đều quanh tim bệ, dim tim cọc theo; soCotCoc 1–6, soHangCoc 1–4; tim tự do khi mặt bên cọc ngoài cùng cách mép bệ ≥ 300 mm và tim > D, sai thì từ chối; 2 hàng × 2 cọc sát mép giữ đúng bản vẽ gốc). ` +
  'tCanh (dày tường cánh) phải lọt giữa mép mặt đường và tim cọc ngoài cùng: (bBe − bMatDuong)/2 < tCanh < khoảng từ mép bệ tới tim cọc ngoài cùng = (bBe − (soCotCoc − 1) × aCocNgang)/2 (cọc sát mép: D; 1 cọc mỗi hàng: D), và 2 × tCanh < bThan; ngoài khoảng đó bị từ chối. ' +
  'Bắt buộc theo nhau: bThan = bBe (bản gốc vẽ thân rộng bằng bệ). ' +
  `Tự suy khi không truyền: chỉ cho bMatDuong (không cho bBe/bThan) thì bBe = bThan = bMatDuong + 2 × ${DOSSIER_ROAD_MARGIN} (lề mép đường cố định ${DOSSIER_ROAD_MARGIN} mm mỗi bên như M1, ví dụ mặt đường 8000 → bBe = bThan = ${8000 + 2 * DOSSIER_ROAD_MARGIN}); đổi bBe, D hoặc soCotCoc mà không cho aCocNgang thì cọc biên sát mép bệ, chia đều: aCocNgang = (bBe − 2D)/(soCotCoc − 1) làm tròn xuống mm (2 cọc: bBe − 2D; ví dụ bệ 8700, D1000, 3 cọc mỗi hàng → 3350); đổi lBe, D hoặc soHangCoc mà không cho aCocDoc thì aCocDoc = (lBe − 2D)/(soHangCoc − 1) tương tự; tim cọc đã truyền thì giữ; không cho aGoi mà các gối không còn lọt trong thân ((soGoi − 1) × aGoi + 500 > bThan) thì aGoi = (bThan − 500 − 2 × ${DOSSIER_BEARING_MARGIN}) / (soGoi − 1) làm tròn xuống bội 50 mm (lề mép ${DOSSIER_BEARING_MARGIN} mm như M1; ví dụ 6 gối trên thân 8700 → aGoi = 1400, trên thân 7700 → 1200). Giá trị suy ra trả về trong data.suyRa: phải báo lại cho người dùng. ` +
  `Chỉ đổi chữ: ${[...DOSSIER_FREE_KEYS].join(', ')}. ` +
  `CHƯA đổi được, phải giữ giá trị mẫu (khác mẫu thì bị từ chối, không dựng): ${fixedKeys.join(', ')}. ` +
  'Người dùng yêu cầu giá trị khác cho các thông số này thì nói rõ chưa làm được trước khi gọi, không tự thay bằng thông số khác.'
/**
 * Words for the abutment's elevations and the question a raise needs
 * (plan P0–P1 section 2.3, decision 5): both ways are in the grid, the
 * user chooses.
 */
const raise =
  'Từ vựng mố (khác «xà mũ» của trụ): «xà mũ mố», «bệ kê gối», «đỉnh thân» = cao độ kê gối seat = caoDoDayBe + hBe + hThan (caoDoDayBe m, hBe/hThan mm); «đỉnh tường đỉnh», «đỉnh mố» = seat + hDau. ' +
  'Người dùng muốn nâng/hạ một cao độ này thêm Δ mà chưa nói cách: BẮT BUỘC hỏi đúng một câu, không tự chọn, không mặc định — (a) nâng cả mố: caoDoDayBe += Δ (m), mọi cao độ dời Δ, hình và khối lượng không đổi; hay (b) giữ móng, kéo dài thân: hThan += Δ (mm), đáy/đỉnh bệ giữ nguyên, kê gối và phía trên tăng Δ — kể cả FG, FE (cao độ mặt đường / hoàn thiện), vì mặt đường nằm trên kết cấu kê lên gối; khi báo kết quả (b) phải nói rõ FG, FE cũng tăng Δ. Người dùng chọn xong mới gọi sua_ho_so_mo với đúng một tham số đó. Nói với người dùng chỉ bằng tên tiếng Việt (cao độ đáy bệ, chiều cao thân…), không nói khóa nội bộ (kể cả trong ngoặc) hay tên công cụ, cờ — chúng chỉ dùng khi gọi công cụ; trước khi công cụ trả lời chỉ nói ý định, «Đã…» chỉ sau khi thành công.'
/**
 * The accepted P2 dossier «L1» (8 m road, stem 1,2 m, wings 4 m, D1000 piles
 * 25 m long). «Hồ sơ L1» / «L1 mặc định» means these values, not the M1
 * template with the name changed (FIX-NOTE UI re-run: the agent named the
 * dossier L1 and got C30 187,016 and no pile volume). `dossierDefaults()`
 * stays M1: the preset applies only when L1 is asked for.
 */
export const DOSSIER_PRESET_L1: Readonly<AcTpParamValues> = Object.freeze({
  tenMo: 'L1',
  bMatDuong: 8000,
  tThan: 1200,
  lCanh: 4000,
  D: 1000,
  lCoc: 25000
})
const presetL1Words = Object.entries(DOSSIER_PRESET_L1)
  .map(([k, v]) => `${k} = ${v}`)
  .join(', ')

/**
 * The values `tao_ho_so_mo` builds from: the L1 preset under what the user
 * gave when L1 is asked for (`thong_so.tenMo` «L1», any case, or `mau: 'L1'`),
 * otherwise what the user gave alone (on the M1 template). A name that merely
 * contains L1 (QA-P2-M5, QA-FIX-NOTE…) is not the preset.
 */
export function acapDossierGivenValues(
  given: AcTpParamValues,
  mau: unknown
): { given: AcTpParamValues; mau?: 'L1' } {
  const isL1 = (v: unknown) =>
    typeof v === 'string' && /^(mố\s+)?l1$/i.test(v.trim())
  if (mau !== undefined && !isL1(mau))
    throw new Error(`mau chỉ nhận "L1" (nhận "${String(mau)}").`)
  if (!isL1(mau) && !isL1(given.tenMo)) return { given }
  return { given: { ...DOSSIER_PRESET_L1, ...given }, mau: 'L1' }
}

const parameters = {
  type: 'object',
  description: `Thông số thiết kế. Đổi m/cm sang mm trước khi gọi; caoDoDayBe là m, dốc là %. Không tự suy số liệu chưa có.\n${paramDescription}`,
  additionalProperties: { type: ['number', 'string', 'boolean'] }
}
export const DOSSIER_TOOLS: readonly AcApToolSchema[] = [
  {
    name: 'tao_ho_so_mo',
    description:
      'Ưu tiên khi người dùng muốn dựng bộ hồ sơ mố M1 hoặc bản vẽ mố đầy đủ theo BTC mo_2. Phiên bản 0.3.1 (hồ sơ mới): 6 tờ A3 1:100 SUB-010…SUB-100 như bản gốc, bằng đối tượng CAD thật (dim, hatch, block có attribute), bảng cao độ/thông số và bảng thống kê vẽ bằng nét và chữ. Thông số ngoài giới hạn dưới đây thì công cụ từ chối và không vẽ gì. Đổi hình học: tờ thép SUB-070/080/090 và bảng thép SUB-100 là bố trí thép mẫu M1 kéo theo kích thước mới (giữ đường kính, móc, lớp phủ, cự ly; thêm/bớt thanh), SUB-100 thêm bảng khối lượng theo thông số; thép tường cánh còn tạm tính theo hàm lượng (tường tai đếm thanh); kiểm neo/nối chồng theo TCVN 11823-5 (thanh dài hơn cây thép 11,7 m giả định được cộng nối chồng, neo không đủ thì báo, giữ hình). Chưa phải thiết kế cốt thép mới, chưa kiểm toán. Hồ sơ bản nháp; không tự thiết kế cốt thép. Mẫu M1 (không nói L1): chưa có chiều dài cọc thì không tự đặt (lCoc 0). Thông số mặc định lấy từ mẫu, phải nói rõ. Sửa hồ sơ đã có dùng sua_ho_so_mo.\n' +
      `«Hồ sơ L1», «L1 mặc định», «tạo hồ sơ L1, lập BTKL mặc định»: gọi với thong_so.tenMo = "L1" (hoặc mau: "L1"); công cụ áp bộ L1 đã chấp nhận: ${presetL1Words} (gồm chiều dài cọc 25 m), rồi tự suy bBe = bThan = 8700, tim cọc ngang 6700, tim cọc dọc 4000. Thông số truyền thêm đè lên bộ L1 (ví dụ tenMo "L1", lCoc 0 giữ lCoc 0). Phải báo lại các số của bộ L1 cho người dùng; không hỏi lại chiều dài cọc khi đã áp bộ L1. Không được chỉ đổi tên rồi để mẫu M1.\n` +
      limits +
      '\n' +
      raise +
      '\n' +
      paramDescription,
    input_schema: {
      type: 'object',
      properties: {
        thong_so: parameters,
        mau: {
          type: 'string',
          enum: ['L1'],
          description: `Bộ thông số có sẵn. "L1" = hồ sơ L1 đã chấp nhận (${presetL1Words}); thong_so truyền kèm đè lên bộ này. Bỏ trống = mẫu M1. thong_so.tenMo = "L1" cũng áp bộ L1.`
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'sua_ho_so_mo',
    description:
      'Sửa hồ sơ mố đang có; chỉ truyền thông số đổi. Tên mố, công trình, vị trí x/y, khung tên: vá tại chỗ, giữ nguyên đối tượng và chi tiết đã sửa tay. Kích thước (hồ sơ A3 0.3.0/0.3.1): dựng lại theo lưới co giãn, chỉ vẽ lại vùng mà thông số làm đổi (so theo vùng với bản dựng từ thông số đã ghi): đối tượng người dùng thêm và nét do công cụ vẽ dời/xóa tay ngoài vùng đó được giữ (báo trong canhBao); sửa tay trong vùng đổi, chữ nhãn đã sửa số, hoặc bố trí chung không theo được (bThan khác bBe, hình tràn khung A3, tim cọc phạm lề 300 mm hoặc chồng cọc…) thì từ chối và không sửa gì. Đổi hình học: tờ thép SUB-070/080/090 dựng lại theo kích thước mới (bố trí mẫu M1: giữ lớp phủ, cự ly, thêm/bớt thanh), bảng thép SUB-100 theo bố trí đó, kèm bảng khối lượng theo thông số hiện tại. Bản vẽ đã có tờ BTKL thì sau khi sửa thành công công cụ tự cập nhật tờ BTKL đó (cùng mã, cùng chỗ, như cap_nhat_btkl; không lập tờ mới) và đưa vào canhBao / thông báo một dòng tóm tắt (1.4 Tường cánh, 1.7 Lan can trên tường cánh, tổng C30, cũ → mới khi đổi) — nhắc lại nguyên văn dòng đó, không thay bằng chỉ tổng C30. Cảnh báo tĩnh (thép là bố trí mẫu M1 kéo theo kích thước, chưa thiết kế/kiểm toán; cờ cần kỹ sư) nói khi tạo hoặc mô tả hồ sơ, không lặp trong canhBao sau mỗi lần sửa. lCoc không phải đổi hình học: chỉ ghi giá trị, giữ mọi đối tượng. Nếu bản dựng lại bỏ nhiều đối tượng (>10 % và ≥100), công cụ từ chối kèm số liệu: hỏi người dùng rồi mới gọi lại với xac_nhan_bo_doi_tuong: true. Hồ sơ 0.1.0/0.2.0: kích thước bị từ chối như trước. Hồ sơ 0.3.0 (phiên bản trước M2–M5b) mà bản vẽ không còn khớp phiên bản 0.3.1: từ chối, không đụng gì, thông báo nêu đường mở khóa — giải thích cho người dùng, hỏi xác nhận dựng lại theo 0.3.1 từ đúng thông số đã lưu (mất chữ/hình vẽ thêm và số sửa tay), đồng ý thì gọi lại MỘT lần với cùng thông số và mo_khoa_031: true; không lách bằng script, không dùng tao_ho_so_mo thay thế. Hồ sơ 0.3.0 khớp thì sửa bình thường và thành 0.3.1. Khi bị từ chối vì sửa tay: không sửa gì thêm, báo đúng các chỗ trong thông báo và hỏi người dùng MỘT lần (đưa về thiết kế gốc rồi làm tiếp / giữ bản vẽ đã sửa tay / hủy); chọn đưa về thiết kế gốc thì gọi lại MỘT lần với cùng thông số và dua_ve_so_bo_sinh: true — công cụ tự viết lại các chỗ đó và áp thay đổi; không dùng tx.setText hay execute_cad_script để tự tăng/giảm từng chữ cao độ, kích thước của hồ sơ, không dùng tao_ho_so_mo thay thế hồ sơ. Hồ sơ đang mang thông số ngoài lưới (tờ hình ghi CHƯA DỰNG ĐƯỢC) thì mọi sửa kích thước bị từ chối cho tới khi đưa thông số đó về giá trị mẫu trong cùng lần gọi; thông báo từ chối nêu giá trị cần đưa về.\n' +
      limits +
      '\n' +
      raise,
    input_schema: {
      type: 'object',
      properties: {
        ma_lan_chay: { type: 'string' },
        thong_so: parameters,
        mo_khoa_031: {
          type: 'boolean',
          description:
            'Chỉ đặt true khi lần gọi trước báo hồ sơ dựng bằng phiên bản cũ (0.3.0) không còn khớp phiên bản 0.3.1, và người dùng đã xác nhận dựng lại theo 0.3.1 từ đúng thông số đã lưu (mất chữ/hình vẽ thêm và số sửa tay). Công cụ dựng lại và áp thông số đổi trong CÙNG lần gọi này.'
        },
        dua_ve_so_bo_sinh: {
          type: 'boolean',
          description:
            'Chỉ đặt true khi người dùng đã chọn đưa các chữ / thẻ cao độ / kích thước đã sửa tay (lần gọi trước đã liệt kê) về thiết kế gốc (giá trị mặc định) rồi làm tiếp. Công cụ tự viết lại chúng đúng kiểu ban đầu (Text, font, màu, layer) và áp thay đổi trong CÙNG lần gọi này; không dùng script để làm việc đó.'
        },
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

/**
 * The elevations as the drawing shows them: the SUB-020 table, which the
 * elevation tags repeat. One source, so the agent never quotes a number the
 * sheet does not carry (QA P1/M4: 235,941 said, 235.931 drawn).
 */
function drawnElevations(model: ReturnType<typeof buildDossierModel>) {
  const table = acapDossierElevations(model.values)
  if (!table) return model.elevations
  return {
    nguon:
      'Bảng cao độ SUB-020 (số đã vẽ, trùng thẻ cao độ). Trích đúng các số này, không tự tính lại.',
    dayBe: table.EL6,
    dinhBe: table.EL5,
    keGoiTim: table.EL3,
    keGoiTrai: table['EL4.L'],
    keGoiPhai: table['EL4.R'],
    bang: table
  }
}

/** The derived values, spelt out for the agent to repeat to the user. */
function derivedNote(suyRa: unknown): string {
  if (!Array.isArray(suyRa) || !suyRa.length) return ''
  const list = (suyRa as DossierDerived[])
    .map(d => dossierParamValue(d.thamSo, d.giaTri))
    .join(', ')
  return `Đã tự suy (phải báo lại người dùng): ${list}. `
}

function summary(
  values: AcTpParamValues,
  runId: string,
  extra: Record<string, unknown> = {},
  kind: 'full' | 'edit' = 'full'
): AcApToolOutcome {
  const model = buildDossierModel(values)
  const detailMode = buildDossierScene(model).detailMode
  const btklNote = Array.isArray(extra.btkl) ? ` ${extra.btkl.join(' ')}` : ''
  const presetNote =
    extra.boThongSo === 'L1'
      ? `Đã áp bộ L1 (phải báo lại người dùng): bề rộng mặt đường ${values.bMatDuong} mm, dày tường thân ${values.tThan} mm, chiều dài tường cánh ${values.lCanh} mm, đường kính cọc ${values.D} mm, chiều dài cọc ${values.lCoc} mm. `
      : ''
  const message =
    kind === 'edit'
      ? `Đã sửa hồ sơ ${values.tenMo} (${runId}): ${model.bearings.length} vị trí gối cách nhau ${model.values.aGoi} mm (${model.stops.offsets.length} ụ chống xô), ${model.piles.length} cọc (${model.values.soHangCoc} hàng × ${model.values.soCotCoc} cọc, tim ngang ${model.values.aCocNgang} mm, tim dọc ${model.values.aCocDoc} mm). ${derivedNote(extra.suyRa)}`.trimEnd() +
        btklNote
      : `Hồ sơ ${values.tenMo} (${runId}): 6 tờ BẢN NHÁP, ${model.bearings.length} vị trí gối cách nhau ${model.values.aGoi} mm (${model.stops.offsets.length} ụ chống xô), ${model.piles.length} cọc (${model.values.soHangCoc} hàng × ${model.values.soCotCoc} cọc, tim ngang ${model.values.aCocNgang} mm, tim dọc ${model.values.aCocDoc} mm). ${presetNote}${derivedNote(extra.suyRa)}${Number(model.values.lCoc) ? '' : 'Chưa có chiều dài cọc: cọc vẽ ngắt đoạn, chưa tính khối lượng cọc — hỏi người dùng chiều dài cọc thực, không tự đặt. '}${model.referenceSteelApplicable ? 'Thép theo mẫu gốc, cần đối chiếu các mục chưa chốt.' : 'Chưa có thép áp dụng cho hình học này.'} ${model.issues.length} mục kiểm tra; chưa đủ để phát hành thi công.${btklNote}`
  return {
    ok: !model.issues.some(i => i.level === 'error'),
    status: model.issues.some(i => i.level === 'error') ? 'refused' : 'ready',
    message,
    data: {
      maLanChay: runId,
      trangThaiHoSo: 'draft',
      mucDoChiTiet: detailMode,
      moTaChiTiet:
        detailMode === 'source'
          ? 'Bố trí trích từ CAD mẫu M1, giữ chi tiết nguồn.'
          : 'Bố trí theo thông số là sơ đồ; chi tiết cho kích thước mới chưa được thiết kế.',
      thongSo: values,
      caoDo: drawnElevations(model),
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
      // «Hồ sơ L1»: the preset under the user's own values, derived from the
      // M1 defaults like any input so bBe/bThan/pile spacing follow.
      const { given, mau } = acapDossierGivenValues(
        suppliedValues(input.thong_so),
        input.mau
      )
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
        ...(mau ? { boThongSo: mau, boL1: { ...DOSSIER_PRESET_L1 } } : {}),
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
        `Hồ sơ dùng phiên bản ${run.version}; cần bản cài có đúng phiên bản để tái tạo.`
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
        confirmLoss: input.xac_nhan_bo_doi_tuong === true,
        revertHandEdits: input.dua_ve_so_bo_sinh === true,
        unlock031: input.mo_khoa_031 === true
      })
      if (result.errors.length) throw new Error(result.errors.join('\n'))
      // An existing take-off follows the dossier (P2-M5 b).
      const btkl = await acapRefreshBtklAfterEdit(runId, database)
      const warnings = [...(result.warnings ?? []), ...btkl]
      if (!database) await refreshDossierView()
      return summary(
        result.values,
        runId,
        {
          soDoiTuong: result.entityCount,
          soDoiTuongXoa: result.removed,
          ...suyRaOf(derived.suyRa),
          ...(warnings.length ? { canhBao: warnings } : {}),
          ...(btkl.length ? { btkl } : {})
        },
        'edit'
      )
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
    // The reason is the next note of the sheet's GHI CHÚ block, wrapped.
    const why = acapDossierNoteAfter(
      sheet,
      'CHƯA DỰNG ĐƯỢC HÌNH CHO BỘ THÔNG SỐ NÀY'
    )
    if (why === undefined) continue
    out.push(`${sheet.id}: ${why}`)
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
