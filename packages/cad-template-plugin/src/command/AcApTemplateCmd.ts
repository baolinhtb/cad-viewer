import { AcApContext, AcEdCommand } from '@mlightcad/cad-simple-viewer'

import { openTemplateDialog } from '../dialogIntegration'

/**
 * `template` — opens the dialog for choosing a template and entering its
 * parameters.
 *
 * Records no undo mark of its own: the drawing it produces is grouped by
 * {@link runTemplate}, which owns the single mark for the whole run.
 */
export class AcApTemplateCmd extends AcEdCommand {
  override readonly recordsUndoStack = false

  async execute(_context: AcApContext) {
    openTemplateDialog()
  }
}
