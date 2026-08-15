/** Callback that opens the template dialog in the host application. */
export type TemplateDialogOpener = () => void

let opener: TemplateDialogOpener | undefined

/**
 * Registers the function the host calls when the `template` command runs.
 *
 * The plugin owns the command and the run logic; the host owns the UI. Keeping
 * the two connected by a callback is what lets the plugin stay free of Vue.
 */
export function setTemplateDialogOpener(fn: TemplateDialogOpener | undefined) {
  opener = fn
}

/** Opens the dialog. Returns false when the host registered no opener. */
export function openTemplateDialog(): boolean {
  if (!opener) return false
  opener()
  return true
}
