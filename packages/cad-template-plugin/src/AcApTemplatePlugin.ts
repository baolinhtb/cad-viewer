import {
  AcApContext,
  AcApPlugin,
  AcEdCommandStack
} from '@mlightcad/cad-simple-viewer'

import packageJson from '../package.json'
import { AcApTemplateCmd } from './command/AcApTemplateCmd'
import { TemplateDialogOpener } from './dialogIntegration'
import { refreshTemplateLibrary } from './remoteTemplates'

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

    // Fetch the library as soon as the plugin loads, so a template uploaded a
    // minute ago is usable in this session without a reload — that is the
    // whole point of uploading rather than deploying. Deliberately not
    // awaited: the built-in templates already work, and blocking the command
    // on a network round trip would make a company with no uploads pay for a
    // library it does not have.
    void refreshTemplateLibrary()
  }

  onUnload(_context: AcApContext, commandManager: AcEdCommandStack): void {
    for (const cmd of this.registered) {
      commandManager.removeCmd(cmd.group, cmd.name)
    }
    this.registered = []
  }
}
