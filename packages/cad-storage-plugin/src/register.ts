import type { AcApPluginManager } from '@mlightcad/cad-simple-viewer'

import {
  AcApStoragePlugin,
  getAutoSaver,
  STORAGE_PLUGIN_NAME
} from './AcApStoragePlugin'

/**
 * Loads the storage plugin immediately.
 *
 * Unlike the export and template plugins there is no trigger command to wait
 * for: auto-save has to be listening before the first edit, not after the user
 * asks for it.
 */
export async function registerStoragePlugin(
  pluginManager: AcApPluginManager
): Promise<void> {
  await pluginManager.loadPlugin(new AcApStoragePlugin())
}

export { STORAGE_PLUGIN_NAME }

/**
 * The open drawing's server id, or `undefined` until it has been saved once.
 *
 * Exposed from the register entry so a host can label things by drawing —
 * AI calls, conversations — without importing the auto-saver itself.
 */
export function currentDrawingId(): string | undefined {
  return getAutoSaver().current?.id
}
