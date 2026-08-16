<template>
  <div class="file-upload-container">
    <div class="upload-panel">
      <div class="upload-main">
        <section class="upload-hero">
          <div class="upload-icon">
            <el-icon :size="20">
              <UploadFilled />
            </el-icon>
          </div>
          <div class="upload-hero-text">
            <h1 class="upload-title">{{ t('fileUpload.title') }}</h1>
            <p class="upload-subtitle">
              {{ t('fileUpload.subtitle') }}
            </p>
          </div>
        </section>

        <div class="upload-actions">
          <button
            type="button"
            class="new-drawing-button"
            @click="handleNewDrawing"
          >
            {{ t('fileUpload.newDrawing') }}
          </button>

          <p class="upload-divider" aria-hidden="true">
            <span>{{ t('fileUpload.or') }}</span>
          </p>

          <el-upload
            class="upload-dropzone"
            drag
            :auto-upload="false"
            accept=".dwg,.dxf"
            :on-change="handleFileChange"
            :before-upload="beforeUpload"
          >
            <div class="dropzone-content">
              <p class="dropzone-title">
                {{ t('fileUpload.dropFile') }}
                <span class="dropzone-link">{{ t('fileUpload.browse') }}</span>
              </p>
              <div class="format-tags">
                <span class="format-tag">DWG</span>
                <span class="format-tag">DXF</span>
              </div>
            </div>
          </el-upload>
        </div>
      </div>

      <section class="settings-section">
        <header class="settings-header">
          <h2 class="settings-title">{{ t('fileUpload.openOptions') }}</h2>
        </header>

        <div class="settings-grid">
          <div class="setting-block setting-block--full">
            <h3 class="setting-label">{{ t('fileUpload.initialView') }}</h3>
            <div
              class="pill-segment"
              role="radiogroup"
              aria-label="Initial view"
            >
              <button
                v-for="option in openViewModes"
                :key="option.value"
                type="button"
                class="pill-option"
                :class="{ 'is-active': selectedOpenViewMode === option.value }"
                role="radio"
                :aria-checked="selectedOpenViewMode === option.value"
                :title="t(option.description)"
                @click="selectedOpenViewMode = option.value"
              >
                {{ t(option.label) }}
              </button>
            </div>
          </div>

          <div class="setting-block setting-block--full">
            <h3 class="setting-label">{{ t('fileUpload.accessMode') }}</h3>
            <div
              class="pill-segment"
              role="radiogroup"
              aria-label="Access mode"
            >
              <button
                v-for="mode in accessModes"
                :key="mode.value"
                type="button"
                class="pill-option"
                :class="{ 'is-active': selectedMode === mode.value }"
                role="radio"
                :aria-checked="selectedMode === mode.value"
                :title="t(mode.description)"
                @click="selectedMode = mode.value"
              >
                {{ t(mode.label) }}
              </button>
            </div>
          </div>

          <div class="setting-block">
            <h3 class="setting-label">{{ t('fileUpload.textRendering') }}</h3>
            <div
              class="pill-segment"
              role="radiogroup"
              aria-label="Text rendering"
            >
              <button
                type="button"
                class="pill-option"
                :class="{ 'is-active': !useMainThreadDraw }"
                role="radio"
                :aria-checked="!useMainThreadDraw"
                :title="t('fileUpload.workerHint')"
                @click="useMainThreadDraw = false"
              >
                {{ t('fileUpload.worker') }}
              </button>
              <button
                type="button"
                class="pill-option"
                :class="{ 'is-active': useMainThreadDraw }"
                role="radio"
                :aria-checked="useMainThreadDraw"
                :title="t('fileUpload.mainThreadHint')"
                @click="useMainThreadDraw = true"
              >
                {{ t('fileUpload.mainThread') }}
              </button>
            </div>
          </div>

          <div class="setting-block">
            <h3 class="setting-label">{{ t('fileUpload.progressive') }}</h3>
            <div
              class="pill-segment"
              role="radiogroup"
              aria-label="Progressive rendering"
            >
              <button
                type="button"
                class="pill-option"
                :class="{ 'is-active': progressiveRendering }"
                role="radio"
                :aria-checked="progressiveRendering"
                :title="t('fileUpload.onHint')"
                @click="progressiveRendering = true"
              >
                {{ t('fileUpload.on') }}
              </button>
              <button
                type="button"
                class="pill-option"
                :class="{ 'is-active': !progressiveRendering }"
                role="radio"
                :aria-checked="!progressiveRendering"
                :title="t('fileUpload.offHint')"
                @click="progressiveRendering = false"
              >
                {{ t('fileUpload.off') }}
              </button>
            </div>
          </div>

          <div class="setting-block">
            <h3 class="setting-label">{{ t('fileUpload.nonPlottable') }}</h3>
            <div
              class="pill-segment"
              role="radiogroup"
              aria-label="Non-plottable layers"
            >
              <button
                type="button"
                class="pill-option"
                :class="{ 'is-active': !drawNoPlotLayers }"
                role="radio"
                :aria-checked="!drawNoPlotLayers"
                :title="t('fileUpload.hideHint')"
                @click="drawNoPlotLayers = false"
              >
                {{ t('fileUpload.hide') }}
              </button>
              <button
                type="button"
                class="pill-option"
                :class="{ 'is-active': drawNoPlotLayers }"
                role="radio"
                :aria-checked="drawNoPlotLayers"
                :title="t('fileUpload.showHint')"
                @click="drawNoPlotLayers = true"
              >
                {{ t('fileUpload.show') }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { UploadFilled } from '@element-plus/icons-vue'
import { AcApOpenViewMode, AcEdOpenMode } from '@mlightcad/cad-simple-viewer'
import { log } from '@mlightcad/data-model'
import type { UploadFile, UploadProps } from 'element-plus'
import { ElIcon, ElUpload } from 'element-plus'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  onFileSelect: (
    file: File,
    mode: AcEdOpenMode,
    useMainThreadDraw: boolean,
    drawNoPlotLayers: boolean,
    progressiveRendering: boolean,
    openViewMode: AcApOpenViewMode | undefined
  ) => void
  onNewDrawing?: (
    mode: AcEdOpenMode,
    useMainThreadDraw: boolean,
    drawNoPlotLayers: boolean,
    progressiveRendering: boolean,
    openViewMode: AcApOpenViewMode | undefined
  ) => void
}

const props = defineProps<Props>()
const { t } = useI18n()

type OpenViewModeChoice = 'auto' | AcApOpenViewMode

const selectedMode = ref<AcEdOpenMode>(AcEdOpenMode.Write)
const selectedOpenViewMode = ref<OpenViewModeChoice>('auto')
const useMainThreadDraw = ref(false)
const drawNoPlotLayers = ref(false)
const progressiveRendering = ref(false)

// Labels are resolved through `t` in the template rather than baked in here,
// so switching language re-renders them instead of needing a reload.
const openViewModes = [
  {
    value: 'auto' as const,
    label: 'fileUpload.auto',
    description: 'fileUpload.autoHint'
  },
  {
    value: AcApOpenViewMode.Extents,
    label: 'fileUpload.extents',
    description: 'fileUpload.extentsHint'
  },
  {
    value: AcApOpenViewMode.Saved,
    label: 'fileUpload.saved',
    description: 'fileUpload.savedHint'
  }
] as const

const resolveOpenViewMode = (): AcApOpenViewMode | undefined =>
  selectedOpenViewMode.value === 'auto' ? undefined : selectedOpenViewMode.value

const accessModes = [
  {
    value: AcEdOpenMode.Read,
    label: 'fileUpload.read',
    description: 'fileUpload.readHint'
  },
  {
    value: AcEdOpenMode.Review,
    label: 'fileUpload.review',
    description: 'fileUpload.reviewHint'
  },
  {
    value: AcEdOpenMode.Write,
    label: 'fileUpload.write',
    description: 'fileUpload.writeHint'
  }
] as const

const handleFileChange: UploadProps['onChange'] = (uploadFile: UploadFile) => {
  if (uploadFile.raw) {
    if (isValidFile(uploadFile.raw)) {
      props.onFileSelect(
        uploadFile.raw,
        selectedMode.value,
        useMainThreadDraw.value,
        drawNoPlotLayers.value,
        progressiveRendering.value,
        resolveOpenViewMode()
      )
    }
  }
}

const handleNewDrawing = () => {
  props.onNewDrawing?.(
    selectedMode.value,
    useMainThreadDraw.value,
    drawNoPlotLayers.value,
    progressiveRendering.value,
    resolveOpenViewMode()
  )
}

const beforeUpload: UploadProps['beforeUpload'] = (rawFile: File) => {
  if (!isValidFile(rawFile)) {
    log.warn(t('fileUpload.invalidFile'))
    return false
  }
  return true
}

const isValidFile = (file: File): boolean => {
  const validExtensions = ['.dwg', '.dxf']
  const fileName = file.name.toLowerCase()
  return validExtensions.some(ext => fileName.endsWith(ext))
}
</script>

<style scoped>
.file-upload-container {
  display: flex;
  justify-content: center;
  width: 100%;
  max-width: 820px;
  padding: 12px 16px;
  box-sizing: border-box;
}

.upload-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: auto;
  width: 100%;
  border-radius: var(--cv-radius-lg, 6px);
  background: var(--cv-surface-panel, #14171c);
  border: 1px solid var(--cv-border-hairline, #262c35);
  overflow: hidden;
}

.upload-main {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 18px 20px;
}

.upload-hero {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.upload-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--cv-accent, #35e0a1);
  color: var(--cv-accent-foreground, #06130d);
}

.upload-hero-text {
  min-width: 0;
}

.upload-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--cv-ink-primary, #e8ecf1);
  line-height: 1.25;
}

.upload-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--cv-ink-secondary, #9aa3ae);
  line-height: 1.35;
}

.upload-actions {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.new-drawing-button {
  display: block;
  width: 100%;
  padding: 10px 14px;
  border: none;
  border-radius: 10px;
  background: var(--cv-accent, #35e0a1);
  color: var(--cv-accent-foreground, #06130d);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    filter 0.2s ease;
}

.new-drawing-button:hover {
  filter: brightness(1.03);
}

.new-drawing-button:active {
  transform: translateY(1px);
}

.upload-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--cv-ink-disabled, #6b7380);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.upload-divider::before,
.upload-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--cv-border-hairline, #262c35);
}

.upload-dropzone {
  width: 100%;
  box-sizing: border-box;
}

.upload-dropzone :deep(.el-upload) {
  display: block;
  width: 100%;
}

.upload-dropzone :deep(.el-upload-dragger) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  box-sizing: border-box;
  padding: 14px 12px;
  border: 1.5px dashed var(--cv-border-hairline, #262c35);
  border-radius: 10px;
  background: var(--cv-surface-raised, #1b2028);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.upload-dropzone :deep(.el-upload-dragger:hover) {
  border-color: var(--cv-accent, #35e0a1);
  background: var(--cv-surface-raised, #1b2028);
}

.dropzone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.dropzone-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--cv-ink-primary, #e8ecf1);
}

.dropzone-link {
  color: var(--cv-accent, #35e0a1);
  font-weight: 600;
}

.format-tags {
  display: flex;
  gap: 6px;
}

.format-tag {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--cv-surface-raised, #1b2028);
  color: var(--cv-accent, #35e0a1);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.settings-section {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 18px 20px;
  background: var(--cv-surface-raised, #1b2028);
  border-left: 1px solid var(--cv-border-hairline, #262c35);
}

.settings-header {
  margin-bottom: 10px;
}

.settings-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--cv-ink-primary, #e8ecf1);
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 12px;
}

.setting-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-block--full {
  grid-column: 1 / -1;
}

.setting-label {
  margin: 0;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--cv-ink-disabled, #6b7380);
}

.pill-segment {
  display: flex;
  gap: 0;
  /* DESIGN.md: hairlines are 1px and buttons are 4px. */
  border: 1px solid var(--cv-border-hairline, #262c35);
  border-radius: var(--cv-radius-md, 4px);
  background: var(--cv-surface-panel, #14171c);
  overflow: hidden;
}

.pill-option {
  flex: 1;
  padding: 6px 8px;
  border: none;
  background: transparent;
  font-size: 11px;
  font-weight: 600;
  color: var(--cv-ink-secondary, #9aa3ae);
  cursor: pointer;
  text-align: center;
  /* Vietnamese labels run longer than the English they replaced. With nowrap
     the segment clipped "Luồng chính" to "Luồn"; wrapping makes the row taller
     instead of eating the word, which holds for any language. */
  white-space: normal;
  line-height: 1.25;
  min-width: 0;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.pill-option:not(:last-child) {
  border-right: 1px solid var(--cv-border-hairline, #262c35);
}

.pill-option:hover:not(.is-active) {
  background: var(--cv-surface-raised, #1b2028);
  color: #475569;
}

.pill-option.is-active {
  background: var(--cv-surface-raised, #1b2028);
  color: var(--cv-accent, #35e0a1);
}

/* Narrow viewports: stack upload + settings as two vertical rows */
@media (max-width: 768px) {
  .file-upload-container {
    max-width: 100%;
    padding: 12px;
  }

  .upload-panel {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
  }

  .settings-section {
    border-left: none;
    border-top: 1px solid var(--cv-border-hairline, #262c35);
  }

  .settings-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .setting-block--full {
    grid-column: 1 / -1;
  }
}

@media (max-width: 400px) {
  .upload-main,
  .settings-section {
    padding-left: 14px;
    padding-right: 14px;
  }

  .settings-grid {
    grid-template-columns: 1fr;
  }

  .setting-block--full {
    grid-column: auto;
  }
}
</style>
