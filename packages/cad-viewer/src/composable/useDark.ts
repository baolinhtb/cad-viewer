import { AcApDocManager, applyUiTheme } from '@mlightcad/cad-simple-viewer'
import {
  type AcDbColorTheme,
  AcDbDatabase,
  AcDbSystemVariables,
  AcDbSysVarManager
} from '@mlightcad/data-model'
import { computed, ref } from 'vue'

import {
  getColorThemeFromDatabase,
  setColorThemeForDatabase
} from './useSystemVars'

const currentTheme = ref<AcDbColorTheme>('dark')
let isThemeSyncInitialized = false

function applyThemeToDom(theme: AcDbColorTheme) {
  if (typeof document === 'undefined') return

  const html = document.documentElement
  html.classList.toggle('dark', theme === 'dark')

  // The command bar, floating input, rubber band and grips are plain DOM drawn
  // by the core editor, not Element Plus components — they read `--ml-ui-*`,
  // which nothing sets until this call. Without it they keep their light
  // fallbacks, which is why the command bar rendered as a white pill on the
  // dark canvas. `applyUiTheme` maps those onto the `--el-*` variables the
  // design tokens already own, so the bar inherits the theme rather than
  // needing a second palette.
  applyUiTheme(theme === 'dark' ? 'dark' : 'light', html)

  // `applyUiTheme` points the canvas cues at `--el-color-primary`, which the
  // design tokens map to the teal accent. On the canvas that would be wrong:
  // DESIGN.md reserves teal for "AI is working" and gives selection its own
  // blue, so that a rubber band never reads as something the AI did. These
  // are re-pointed after the call because it writes inline styles, which a
  // stylesheet cannot override without `!important`.
  const selection = 'var(--cv-selection, #54a9ff)'
  html.style.setProperty('--ml-ui-canvas-line', selection)
  html.style.setProperty('--ml-ui-grip-normal', selection)
  html.style.setProperty(
    '--ml-ui-canvas-fill',
    'color-mix(in srgb, var(--cv-selection, #54a9ff) 18%, transparent)'
  )
  html.style.setProperty(
    '--ml-ui-canvas-fill-mix',
    'color-mix(in srgb, var(--cv-selection, #54a9ff) 18%, transparent)'
  )
  // Hot grip: the one being dragged. Amber is DESIGN.md's "in progress".
  html.style.setProperty('--ml-ui-grip-hot', 'var(--cv-warning, #f5b942)')
}

function updateCurrentTheme(theme: AcDbColorTheme) {
  currentTheme.value = theme
  applyThemeToDom(theme)
}

function getExistingDocManager(): AcApDocManager | null {
  const singleton = AcApDocManager as unknown as {
    _instance?: AcApDocManager
  }
  return singleton._instance ?? null
}

function getCurrentDatabase(): AcDbDatabase | null {
  return getExistingDocManager()?.curDocument?.database ?? null
}

function syncThemeFromDatabase(database: AcDbDatabase | null) {
  if (!database) return
  updateCurrentTheme(getColorThemeFromDatabase(database))
}

export function ensureColorThemeSync() {
  if (isThemeSyncInitialized) return

  const docManager = getExistingDocManager()
  if (!docManager) return

  isThemeSyncInitialized = true
  syncThemeFromDatabase(getCurrentDatabase())

  AcDbSysVarManager.instance().events.sysVarChanged.addEventListener(args => {
    if (
      args.name.toLowerCase() !== AcDbSystemVariables.COLORTHEME.toLowerCase()
    ) {
      return
    }
    updateCurrentTheme(getColorThemeFromDatabase(args.database))
  })

  docManager.events.documentActivated.addEventListener(args => {
    syncThemeFromDatabase(args.doc.database)
  })
}

export function setColorTheme(
  theme: AcDbColorTheme,
  database?: AcDbDatabase | null
) {
  updateCurrentTheme(theme)

  ensureColorThemeSync()

  const targetDatabase = database ?? getCurrentDatabase()
  if (!targetDatabase) return

  if (getColorThemeFromDatabase(targetDatabase) === theme) return
  setColorThemeForDatabase(targetDatabase, theme)
}

export const isDark = computed<boolean>({
  get: () => currentTheme.value === 'dark',
  set: value => {
    setColorTheme(value ? 'dark' : 'light')
  }
})

export const toggleDark = () => {
  setColorTheme(isDark.value ? 'light' : 'dark')
}

applyThemeToDom(currentTheme.value)
