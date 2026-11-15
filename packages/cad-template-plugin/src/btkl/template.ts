import type { AcTpParamValues, AcTpTemplate } from '@mlightcad/cad-template-sdk'

import { DOSSIER_PARAMS } from '../dossier/model'
import { acTpBtklMo } from './mo'
import {
  type AcTpBtklSheetMeta,
  acTpBtklSheets,
  drawBtklSheets
} from './sheets'

export const BTKL_TEMPLATE_ID = 'btkl_ket_cau'

/** Title-block data out of the abutment parameters (blank ones omitted). */
export function btklMetaFromValues(values: AcTpParamValues): AcTpBtklSheetMeta {
  const s = (k: string) => {
    const v = values[k]
    return v === undefined || String(v).trim() === '' ? undefined : String(v)
  }
  return {
    duAn: s('duAn'),
    congTrinh: s('congTrinh'),
    ngay: s('ngay'),
    donVi: s('donVi'),
    chuTri: s('nguoiChuTri'),
    thietKe: s('nguoiThietKe'),
    kiemTra: s('nguoiKiemTra'),
    duyet: s('nguoiDuyet'),
    x: Number(values.x) || 0,
    y: Number(values.y) || 0
  }
}

/**
 * The quantity take-off of an abutment as A3 sheets. Takes the abutment
 * dossier's own parameters, so the sheets always describe the same abutment
 * as its dossier; `x`/`y` place the first sheet.
 */
export const btklTemplate: AcTpTemplate = {
  meta: {
    id: BTKL_TEMPLATE_ID,
    version: '1.0.0',
    name: 'Bảng tổng hợp khối lượng kết cấu (BTKL) — mố',
    category: 'Hồ sơ mố',
    description:
      'Các tờ A3 bảng khối lượng 5 cột (STT, hạng mục, đơn vị, khối lượng, diễn giải công thức) tính từ thông số mố, vẽ bằng nét và chữ kiểu bảng SUB-100, có khung tên; dài thì sang tờ tiếp. Dòng không tính được ghi lý do; cờ lệch bản gốc ghi đỏ.'
  },
  params: DOSSIER_PARAMS,
  placement: 'world',
  validate(values) {
    return acTpBtklMo(values).errors
  },
  generate(ctx, values) {
    drawBtklSheets(
      ctx,
      acTpBtklSheets([acTpBtklMo(values)], btklMetaFromValues(values))
    )
  }
}
