/**
 * Callback that opens the template dialog in the host application.
 *
 * Only the type lives here now. It used to also hold the registered callback
 * in a module-level variable, which does not survive a lazy chunk boundary
 * reliably — the host set it in one copy of the module and the command read
 * `undefined` from another, so the command ran and nothing happened. The
 * opener is passed through {@link createTemplatePlugin} instead.
 */
export type TemplateDialogOpener = () => void
