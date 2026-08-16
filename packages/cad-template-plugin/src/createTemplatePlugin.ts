import { AcApTemplatePlugin } from './AcApTemplatePlugin'
import { TemplateDialogOpener } from './dialogIntegration'

/**
 * Factory used by the lazy plugin loader.
 *
 * @param openDialog - Opens the template dialog in the host application.
 */
export function createTemplatePlugin(openDialog: TemplateDialogOpener) {
  return new AcApTemplatePlugin(openDialog)
}
