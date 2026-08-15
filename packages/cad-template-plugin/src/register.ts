import type { AcApPluginManager } from '@mlightcad/cad-simple-viewer'

import { TEMPLATE_PLUGIN_NAME } from './AcApTemplatePlugin'

/** Commands that pull this plugin in. */
export const TEMPLATE_PLUGIN_TRIGGERS = ['template'] as const

/**
 * Registers the template plugin for lazy loading.
 *
 * Import from `@mlightcad/cad-template-plugin/register` so the plugin body
 * stays out of the application entry chunk until a template is actually run.
 */
export function registerLazyTemplatePlugin(
  pluginManager: AcApPluginManager
): void {
  pluginManager.registerLazyPlugin({
    name: TEMPLATE_PLUGIN_NAME,
    triggers: [...TEMPLATE_PLUGIN_TRIGGERS],
    loader: async () => {
      const { createTemplatePlugin } = await import('./createTemplatePlugin')
      return createTemplatePlugin()
    }
  })
}

export { TEMPLATE_PLUGIN_NAME }
