import type { AcTpTemplate } from '@mlightcad/cad-template-sdk'

import {
  buildDossierModel,
  DOSSIER_ID,
  DOSSIER_NEW_LABEL_MODE,
  DOSSIER_PARAMS,
  DOSSIER_VERSION,
  DOSSIER_VERSIONS
} from './model'
import { buildDossierScene, drawDossierScene } from './scene'

/** An explicitly draft dossier derived from the supplied M1 drawing, not
 * a shape inferred from a standards document. One template per generator
 * version, so a run regenerates with the generator that made it. */
function dossierTemplate(version: string): AcTpTemplate {
  return {
    meta: {
      id: DOSSIER_ID,
      version,
      name: 'Hồ sơ mố M1 — 6 tờ bản nháp từ BTC mo_2',
      category: 'Hồ sơ mố',
      description:
        'Một mô hình sinh mặt chính, A–A/B–B/C–C, mặt bằng mố/cọc, cao độ, ba tờ thép tham chiếu và thống kê. Thép chỉ áp dụng tại hình học mẫu. Chưa phát hành thi công.'
    },
    // A dossier started from the dialog is a new one: numbers on its
    // dimensions by default (DOSSIER_NEW_LABEL_MODE).
    params:
      version === DOSSIER_VERSION
        ? DOSSIER_PARAMS.map(p =>
            p.key === 'nhanKichThuoc'
              ? { ...p, default: DOSSIER_NEW_LABEL_MODE }
              : p
          )
        : DOSSIER_PARAMS,
    placement: 'world',
    validate(values) {
      const model = buildDossierModel(values)
      const errors = model.issues
        .filter(i => i.level === 'error')
        .map(i => i.message)
      if (!errors.length) {
        try {
          buildDossierScene(model, version)
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error))
        }
      }
      return errors
    },
    generate(ctx, values) {
      drawDossierScene(
        ctx,
        buildDossierScene(buildDossierModel(values), version)
      )
    }
  }
}

/** The current dossier generator: offered in the dialog and to the agent. */
export const abutmentDossierTemplate: AcTpTemplate =
  dossierTemplate(DOSSIER_VERSION)

/**
 * Older generators, kept only so their runs regenerate unchanged (0.1.0: the
 * original border; 0.2.0: the A1 title block). Never offered for new dossiers.
 */
export const abutmentDossierLegacyTemplates: readonly AcTpTemplate[] =
  DOSSIER_VERSIONS.filter(v => v !== DOSSIER_VERSION).map(dossierTemplate)
