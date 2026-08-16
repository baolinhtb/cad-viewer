import { AcApContext, AcEdCommand } from '@mlightcad/cad-simple-viewer'

import { TemplateDialogOpener } from '../dialogIntegration'

/**
 * `template` — opens the dialog for choosing a template and entering its
 * parameters.
 *
 * The opener is injected rather than read from module state. Module-level
 * state is not reliably shared across a lazy chunk boundary: the host sets it
 * from the entry chunk while the command reads it from the asynchronously
 * loaded one, and if the bundler emits two copies of the module the command
 * sees `undefined` and the dialog silently never opens. Passing the function
 * down removes the possibility.
 *
 * Records no undo mark of its own: the drawing it produces is grouped by
 * {@link runTemplate}, which owns the single mark for the whole run.
 */
export class AcApTemplateCmd extends AcEdCommand {
  override readonly recordsUndoStack = false

  constructor(private readonly openDialog: TemplateDialogOpener) {
    super()
  }

  async execute(_context: AcApContext) {
    this.openDialog()
  }
}
