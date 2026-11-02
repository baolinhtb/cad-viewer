<template>
  <div id="app-root">
    <!-- Upload screen when no drawing is open -->
    <div v-if="!showViewer" class="upload-screen">
      <FileUpload
        @file-select="handleFileSelect"
        @new-drawing="handleNewDrawing"
        @open-drawing="handleOpenDrawing"
      />
    </div>

    <!-- CAD viewer when a file is selected or a new drawing is created -->
    <div v-else>
      <MlCadViewer
        locale="default"
        :local-file="store.selectedFile ?? undefined"
        :mode="selectedMode"
        :use-main-thread-draw="useMainThreadDraw"
        :draw-no-plot-layers="drawNoPlotLayers"
        :progressive-rendering="progressiveRendering"
        :open-view-mode="openViewMode"
        @create="onViewerCreate"
        :base-url="BASE_URL"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
// import { AcApSettingManager } from '@mlightcad/cad-simple-viewer'
import {
  AcApDocManager,
  AcApOpenViewMode,
  AcEdCommandStack,
  AcEdOpenMode
} from '@mlightcad/cad-simple-viewer'
import { attachDrawing } from '@mlightcad/cad-storage-plugin'
import { MlCadViewer } from '@mlightcad/cad-viewer'
import { log } from '@mlightcad/data-model'
import { computed, nextTick, ref } from 'vue'

import { AcApQuitCmd } from './commands'
import FileUpload from './components/FileUpload.vue'
import { initializeLocale } from './locale'
import { store } from './store'

// Runs at setup, not on viewer create: the upload screen is shown before any
// viewer exists and it now reads its own strings from the locale, so merging
// them later would render raw key paths on the first screen anyone sees.
initializeLocale()

const initialize = () => {
  if (import.meta.env.DEV) {
    ;(
      window as Window & { AcApDocManager?: typeof AcApDocManager }
    ).AcApDocManager = AcApDocManager
  }
  const register = AcApDocManager.instance.commandManager
  register.addCommand(
    AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
    'quit',
    'quit',
    new AcApQuitCmd()
  )
  register.addCommand(
    AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
    'exit',
    'exit',
    new AcApQuitCmd()
  )
}

// Decide whether to show command line vertical toolbar at the right side,
// performance stats, coordinates in status bar, etc.
// AcApSettingManager.instance.isShowCommandLine = false
// AcApSettingManager.instance.isShowToolbar = false
// AcApSettingManager.instance.isShowStats = false
// AcApSettingManager.instance.isShowCoordinate = false

const BASE_URL = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/'

const showViewer = computed(
  () => store.selectedFile != null || store.isNewDrawing
)

const selectedMode = ref<AcEdOpenMode>(AcEdOpenMode.Write)
const useMainThreadDraw = ref(false)
const drawNoPlotLayers = ref(false)
const progressiveRendering = ref(false)
const openViewMode = ref<AcApOpenViewMode | undefined>(undefined)

/**
 * Identity of a drawing reopened from the server.
 *
 * Held until the viewer exists, then handed to the auto-saver. Without it the
 * next save would create a second row instead of updating the one just
 * opened, and the drawing would fork every time it was reopened.
 */
const reopened = ref<
  | { id: string; revision: number; name: string; templateId?: string | null }
  | undefined
>()

/**
 * Template for new drawings, served from this app rather than the shared CDN.
 *
 * It is the stock `acadiso.dxf` with its two paper-space layouts renamed from
 * 布局1 / 布局2 to Layout1 / Layout2 — the upstream file ships Chinese names,
 * which then became the tab labels of every new drawing here. Renaming after
 * the fact does not work: the tab list snapshots the names when the document
 * activates, and nothing re-reads them. Fixing the template is the only place
 * the change actually lands.
 *
 * Resolved against `document.baseURI` so it follows the app wherever it is
 * mounted.
 */
const NEW_DRAWING_TEMPLATE = new URL('templates/acadiso.dxf', document.baseURI)
  .href

const createNewDrawing = async () => {
  const success = await AcApDocManager.instance.newDocument({
    templateUrl: NEW_DRAWING_TEMPLATE,
    mode: selectedMode.value,
    drawNoPlotLayers: drawNoPlotLayers.value,
    progressiveRendering: progressiveRendering.value,
    ...(openViewMode.value != null ? { openViewMode: openViewMode.value } : {})
  })
  if (!success) {
    log.error('Failed to create new drawing')
  }
}

const onViewerCreate = async () => {
  initialize()
  if (store.isNewDrawing) {
    await nextTick()
    await createNewDrawing()
  }
  if (reopened.value) {
    await nextTick()
    attachDrawing({
      id: reopened.value.id,
      revision: reopened.value.revision,
      name: reopened.value.name,
      templateId: reopened.value.templateId ?? null
    })
  }
}

/** Opens a drawing already stored on the server. */
const handleOpenDrawing = async (
  id: string,
  mode: AcEdOpenMode,
  mainThreadDraw: boolean,
  showNoPlotLayers: boolean,
  enableProgressiveRendering: boolean,
  viewMode: AcApOpenViewMode | undefined
) => {
  try {
    const response = await fetch(`/api/drawings/${encodeURIComponent(id)}`, {
      credentials: 'same-origin'
    })
    if (!response.ok) throw new Error(String(response.status))
    const drawing = (await response.json()) as {
      id: string
      name: string
      revision: number
      templateId?: string | null
      dxf: string
    }

    // Reuses the ordinary open path rather than adding a second way to load a
    // drawing: the stored DXF becomes a File and goes through exactly what an
    // uploaded file goes through.
    reopened.value = {
      id: drawing.id,
      revision: drawing.revision,
      name: drawing.name,
      templateId: drawing.templateId
    }
    store.isNewDrawing = false
    store.selectedFile = new File([drawing.dxf], `${drawing.name}.dxf`, {
      type: 'image/vnd.dxf'
    })
    applyOpenOptions(
      mode,
      mainThreadDraw,
      showNoPlotLayers,
      enableProgressiveRendering,
      viewMode
    )
  } catch (error) {
    log.error('Failed to open stored drawing', error)
  }
}

const applyOpenOptions = (
  mode: AcEdOpenMode,
  mainThreadDraw: boolean,
  showNoPlotLayers: boolean,
  enableProgressiveRendering: boolean,
  viewMode: AcApOpenViewMode | undefined
) => {
  selectedMode.value = mode
  useMainThreadDraw.value = mainThreadDraw
  drawNoPlotLayers.value = showNoPlotLayers
  progressiveRendering.value = enableProgressiveRendering
  openViewMode.value = viewMode
}

// Handle file selection from upload component
const handleFileSelect = (
  file: File,
  mode: AcEdOpenMode,
  mainThreadDraw: boolean,
  showNoPlotLayers: boolean,
  enableProgressiveRendering: boolean,
  viewMode: AcApOpenViewMode | undefined
) => {
  store.isNewDrawing = false
  store.selectedFile = file
  applyOpenOptions(
    mode,
    mainThreadDraw,
    showNoPlotLayers,
    enableProgressiveRendering,
    viewMode
  )
}

const handleNewDrawing = (
  mode: AcEdOpenMode,
  mainThreadDraw: boolean,
  showNoPlotLayers: boolean,
  enableProgressiveRendering: boolean,
  viewMode: AcApOpenViewMode | undefined
) => {
  store.selectedFile = null
  store.isNewDrawing = true
  applyOpenOptions(
    mode,
    mainThreadDraw,
    showNoPlotLayers,
    enableProgressiveRendering,
    viewMode
  )
}
</script>

<style scoped>
#app-root {
  height: 100vh;
  position: fixed;
}

.upload-screen {
  height: 100vh;
  width: 100vw;
  display: flex;
  justify-content: center;
  align-items: safe center;
  overflow-y: auto;
  /* DESIGN.md: the canvas tone is the darkest layer and gradients are out.
     The splash sits where the drawing will be, so it uses the same tone. */
  background: var(--cv-surface-canvas, #0d0f12);
  margin: 0;
  padding: 16px;
  box-sizing: border-box;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1000;
  pointer-events: auto; /* Allow clicks on upload screen */
}
</style>
