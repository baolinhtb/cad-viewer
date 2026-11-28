import type { AcTpTemplate } from '@mlightcad/cad-template-sdk'

import { buildRoadModel, ROAD_ID, ROAD_PARAMS, ROAD_VERSION } from './model'
import { buildRoadScene, drawRoadScene } from './scene'

/**
 * Road cross-section (mặt cắt ngang đường), compiled into the plugin like the
 * abutment dossier: `deploy --frontend-only` is enough for it to exist live,
 * nothing has to be published to the library.
 */
export const roadSectionTemplate: AcTpTemplate = {
  meta: {
    id: ROAD_ID,
    version: ROAD_VERSION,
    name: 'Mặt cắt ngang đường (cấu tạo theo thông số)',
    category: 'Đường',
    description:
      'Một tờ A3: mặt cắt ngang đường theo thông số (làn xe, lề gia cố, lề đất, dải phân cách, bó vỉa, hè, mái ta luy đắp/đào, dốc ngang) và cột kết cấu áo đường (tên lớp + bề dày), tỉ lệ tự chọn vừa khung, kích thước ghi số thật. Dải tham số dẫn TCVN 4054:2005 và TCVN 13592:2022. Không kiểm cường độ áo đường, không tính khối lượng đào đắp. Dùng công cụ tao_mat_cat_duong.'
  },
  params: ROAD_PARAMS,
  placement: 'world',
  validate(values) {
    const model = buildRoadModel(values)
    if (model.errors.length) return model.errors
    try {
      buildRoadScene(model)
    } catch (e) {
      return [(e as Error).message]
    }
    return []
  },
  generate(ctx, values) {
    drawRoadScene(ctx, buildRoadScene(buildRoadModel(values)))
  }
}
