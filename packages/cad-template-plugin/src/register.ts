import type { AcApPluginManager } from '@mlightcad/cad-simple-viewer'

import { TEMPLATE_PLUGIN_NAME } from './AcApTemplatePlugin'
import type { TemplateDialogOpener } from './dialogIntegration'

/** Commands that pull this plugin in. */
export const TEMPLATE_PLUGIN_TRIGGERS = ['template'] as const

/**
 * Registers the template plugin for lazy loading.
 *
 * Import from `@mlightcad/cad-template-plugin/register` so the plugin body
 * stays out of the application entry chunk until a template is actually run.
 */
export function registerLazyTemplatePlugin(
  pluginManager: AcApPluginManager,
  openDialog: TemplateDialogOpener
): void {
  pluginManager.registerLazyPlugin({
    name: TEMPLATE_PLUGIN_NAME,
    triggers: [...TEMPLATE_PLUGIN_TRIGGERS],
    loader: async () => {
      // Import the package entry, not './createTemplatePlugin'. Every other
      // lazy plugin does the same, and the difference is not cosmetic: a
      // relative dynamic import from this subpath entry builds into a chunk
      // reference that resolves to `undefined` at runtime, so the destructure
      // below throws and the plugin silently never loads. The failure is
      // swallowed by `loadByTrigger` into a console error, which is why it
      // survived unit tests and a green build.
      const { createTemplatePlugin } =
        await import('@mlightcad/cad-template-plugin')
      return createTemplatePlugin(openDialog)
    }
  })
}

export { TEMPLATE_PLUGIN_NAME }
