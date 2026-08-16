import {
  AcApContext,
  AcApPlugin,
  AcEdCommandStack
} from '@mlightcad/cad-simple-viewer'

import packageJson from '../package.json'
import { AcApTemplateCmd } from './command/AcApTemplateCmd'
import { TemplateDialogOpener } from './dialogIntegration'

/** Registered name of the template plugin in the plugin manager. */
export const TEMPLATE_PLUGIN_NAME = 'TemplatePlugin'

/**
 * Runs standardised bridge templates: pick one, fill in its parameters, get a
 * drawing.
 */
export class AcApTemplatePlugin implements AcApPlugin {
  name = TEMPLATE_PLUGIN_NAME
  version = packageJson.version
  description = 'Sinh bản vẽ cầu đường từ template chuẩn hóa'

  private registered: Array<{ group: string; name: string }> = []

  /**
   * @param openDialog - Supplied by the host when the plugin is created. The
   * plugin owns the command and the run logic; the host owns the UI.
   */
  constructor(private readonly openDialog: TemplateDialogOpener) {}

  onLoad(_context: AcApContext, commandManager: AcEdCommandStack): void {
    const group = AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME
    commandManager.addCommand(
      group,
      'template',
      'template',
      new AcApTemplateCmd(this.openDialog)
    )
    this.registered.push({ group, name: 'template' })
  }

  onUnload(_context: AcApContext, commandManager: AcEdCommandStack): void {
    for (const cmd of this.registered) {
      commandManager.removeCmd(cmd.group, cmd.name)
    }
    this.registered = []
  }
}
