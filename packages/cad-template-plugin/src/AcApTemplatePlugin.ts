import {
  AcApContext,
  AcApPlugin,
  AcEdCommandStack
} from '@mlightcad/cad-simple-viewer'

import packageJson from '../package.json'
import { AcApTemplateCmd } from './command/AcApTemplateCmd'

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

  onLoad(_context: AcApContext, commandManager: AcEdCommandStack): void {
    const group = AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME
    commandManager.addCommand(
      group,
      'template',
      'template',
      new AcApTemplateCmd()
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
