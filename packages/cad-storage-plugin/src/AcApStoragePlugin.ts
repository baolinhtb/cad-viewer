import {
  AcApContext,
  AcApDocManager,
  AcApPlugin,
  AcEdCommandStack,
  eventBus
} from '@mlightcad/cad-simple-viewer'

import {
  type AcApAutoSaver,
  type AcApAutoSaveState,
  createAutoSaver
} from './autoSave'
import { createStorageApi } from './storageApi'

/** Registered name of the storage plugin. */
export const STORAGE_PLUGIN_NAME = 'StoragePlugin'

let saver: AcApAutoSaver | undefined

/**
 * The auto-saver for this session, created on first use.
 *
 * Reading the drawing goes through the document manager rather than being
 * passed in, so callers never have to hold a database reference just to save.
 */
export function getAutoSaver(): AcApAutoSaver {
  saver ??= createAutoSaver({
    api: createStorageApi(),
    readDxf: () => {
      const doc = AcApDocManager.instance?.curDocument
      if (!doc) return undefined
      const dxf = doc.database.dxfOut()
      return typeof dxf === 'string' ? dxf : undefined
    }
  })
  return saver
}

/**
 * Binds the auto-saver to a drawing.
 *
 * Called by the host after a template run or after opening a stored drawing —
 * the plugins stay unaware of each other and the host does the composing.
 */
export function attachDrawing(state: AcApAutoSaveState) {
  getAutoSaver().attach(state)
}

/**
 * Keeps the open drawing saved.
 *
 * Resident rather than lazy-by-trigger: there is no command to wait for, since
 * the whole point is that the user never has to ask. This is the one named
 * exception to the lazy plugin rule.
 */
export class AcApStoragePlugin implements AcApPlugin {
  name = STORAGE_PLUGIN_NAME
  version = '1.5.11'
  description = 'Tự lưu bản vẽ lên hệ thống'

  private stop: (() => void) | undefined

  onLoad(_context: AcApContext, _commandManager: AcEdCommandStack): void {
    // The save point is the close of an undo mark, not each entity change:
    // one template run then produces one upload rather than hundreds.
    const handler = () => getAutoSaver().onEditCompleted()
    eventBus.on('undo-stack-changed', handler)
    this.stop = () => eventBus.off('undo-stack-changed', handler)
  }

  onUnload(): void {
    this.stop?.()
    this.stop = undefined
  }
}
