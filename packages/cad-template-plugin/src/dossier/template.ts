import type { AcTpTemplate } from '@mlightcad/cad-template-sdk'

import {
  buildDossierModel,
  DOSSIER_ID,
  DOSSIER_PARAMS,
  DOSSIER_VERSION
} from './model'
import { buildDossierScene, drawDossierScene } from './scene'

/** An explicitly draft dossier derived from the supplied M1 drawing, not
 * a shape inferred from a standards document. */
export const abutmentDossierTemplate: AcTpTemplate = {
  meta: {
    id: DOSSIER_ID,
    version: DOSSIER_VERSION,
    name: 'Hồ sơ mố M1 — 6 tờ bản nháp từ BTC mo_2',
    category: 'Hồ sơ mố',
    description:
      'Một mô hình sinh mặt chính, A–A/B–B/C–C, mặt bằng mố/cọc, cao độ, ba tờ thép tham chiếu và thống kê. Thép chỉ áp dụng tại hình học mẫu. Chưa phát hành thi công.'
  },
  params: DOSSIER_PARAMS,
  placement: 'world',
  validate(values) {
    const model = buildDossierModel(values)
    const errors = model.issues
      .filter(i => i.level === 'error')
      .map(i => i.message)
    if (!errors.length) {
      try {
        buildDossierScene(model)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }
    return errors
  },
  generate(ctx, values) {
    drawDossierScene(ctx, buildDossierScene(buildDossierModel(values)))
  }
}
