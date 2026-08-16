<script setup lang="ts">
import { attachDrawing } from '@mlightcad/cad-storage-plugin'
import type {
  AcTpParamSpec,
  AcTpTemplate
} from '@mlightcad/cad-template-plugin'
import {
  type AcApTemplatePreview,
  defaultValues,
  listTemplates,
  refreshTemplateLibrary,
  renderTemplatePreview,
  runTemplate,
  uploadTemplateModule
} from '@mlightcad/cad-template-plugin'
// Imported explicitly, like every other component here. Without it Vue cannot
// resolve `<el-dialog>` and friends, and renders nothing at all — in a
// production build the "Failed to resolve component" warning is stripped, so
// the dialog fails in complete silence: the command runs, the manager toggles
// it visible, and no element ever reaches the DOM.
import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElOption,
  ElSelect
} from 'element-plus'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useDialogManager } from '../../composable'

const { t } = useI18n()
const { getDialogByName, toggleDialog } = useDialogManager()

const dialog = computed(() => getDialogByName('TemplateDlg'))
const visible = computed({
  get: () => dialog.value?.visible ?? false,
  set: (value: boolean) => toggleDialog('TemplateDlg', value)
})

/**
 * Templates offered by the picker.
 *
 * Read into a ref rather than a plain const: the library loads over the
 * network after the dialog component is created, so a value captured at setup
 * shows only the built-in templates forever — which is exactly how an
 * uploaded template stayed invisible until this was found.
 */
const templates = ref<readonly AcTpTemplate[]>(listTemplates())
const selectedId = ref<string>(templates.value[0]?.meta.id ?? '')
const selected = computed<AcTpTemplate | undefined>(() =>
  templates.value.find(item => item.meta.id === selectedId.value)
)

/**
 * Re-reads the registry, then refetches the library behind it.
 *
 * The synchronous read makes the picker correct immediately; the refetch is
 * what makes a template uploaded during this session appear without a reload.
 * Ordering them this way keeps opening the dialog instant even on a slow link.
 */
const syncTemplates = async () => {
  templates.value = listTemplates()
  if (!selectedId.value) selectedId.value = templates.value[0]?.meta.id ?? ''
  await refreshTemplateLibrary()
  templates.value = listTemplates()
  if (!selectedId.value) selectedId.value = templates.value[0]?.meta.id ?? ''
}

watch(visible, isOpen => {
  if (isOpen) {
    void syncTemplates()
    void checkRole()
  }
})

/** Structure categories present in the library, plus an "all" entry. */
const category = ref<string>('')
const categories = computed(() => {
  const present = [
    ...new Set(templates.value.map(item => item.meta.category).filter(Boolean))
  ]
  return present.length > 1
    ? [{ value: '', label: t('dialog.templateDlg.allCategories') }].concat(
        present.map(value => ({ value, label: value }))
      )
    : []
})

const visibleTemplates = computed(() =>
  category.value
    ? templates.value.filter(item => item.meta.category === category.value)
    : templates.value
)

/**
 * Thumbnails, computed once per template.
 *
 * Rendering runs the template, so doing it inside the card's render would
 * redraw every cross-section on every keystroke in the form.
 */
const previews = new Map<string, AcApTemplatePreview>()
const previewOf = (item: AcTpTemplate): AcApTemplatePreview => {
  const key = `${item.meta.id}@${item.meta.version}`
  const cached = previews.get(key)
  if (cached) return cached
  const preview = renderTemplatePreview(item, 72)
  previews.set(key, preview)
  return preview
}

/**
 * The parameter ranges a card shows.
 *
 * Only the bounded numeric ones, and only the first few: the point is to let
 * an engineer rule a template out before opening it, not to reproduce the
 * form on the card.
 */
/**
 * Whether this member may upload templates.
 *
 * Asked of the server rather than assumed. Hiding the control is a courtesy to
 * members who cannot use it, not a permission — the route refuses them
 * regardless, which is where the actual boundary lives.
 */
const canUpload = ref(false)
const uploading = ref(false)
const uploadNote = ref('')
const uploadError = ref('')

const checkRole = async () => {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' })
    if (!response.ok) return
    const me = (await response.json()) as { role?: string }
    canUpload.value = me.role === 'author' || me.role === 'admin'
  } catch {
    canUpload.value = false
  }
}

const onPickModule = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''

  uploading.value = true
  uploadError.value = ''
  uploadNote.value = ''
  try {
    const outcome = await uploadTemplateModule(await file.text())
    const gaps = [
      ...outcome.missingRoles.map(role => `vai trò ${role}`),
      ...outcome.missingLayers.map(gap => `layer ${gap.layer}`)
    ]
    uploadNote.value =
      t('dialog.templateDlg.uploaded', {
        name: outcome.templateId,
        version: outcome.version,
        count: outcome.entityCount
      }) +
      (gaps.length
        ? ` ${t('dialog.templateDlg.uploadGaps', { gaps: gaps.join(', ') })}`
        : '')
    templates.value = listTemplates()
    selectedId.value = outcome.templateId
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    uploading.value = false
  }
}

const rangeSummary = (item: AcTpTemplate): string =>
  item.params
    .filter(spec => spec.min !== undefined && spec.max !== undefined)
    .slice(0, 3)
    .map(
      spec =>
        `${spec.label} ${spec.min}–${spec.max}${spec.unit ? ' ' + spec.unit : ''}`
    )
    .join(' · ')

const values = ref<Record<string, number | string | boolean>>({})
const errors = ref<string[]>([])
const running = ref(false)
const result = ref<{ entityCount: number; layers: string[] } | undefined>()

/** Groups declared by the template, in declaration order. */
const groups = computed(() => {
  const spec = selected.value
  if (!spec) return []
  const seen: string[] = []
  for (const param of spec.params) {
    const group = param.group ?? ''
    if (!seen.includes(group)) seen.push(group)
  }
  return seen.map(group => ({
    name: group,
    params: spec.params.filter(
      (item: AcTpParamSpec) => (item.group ?? '') === group
    )
  }))
})

const showAllOnOnePage = ref(false)
const step = ref(0)
/** Built as one string so the separator is not loose text in the template. */
const stepLabel = computed(() => `${step.value + 1}/${groups.value.length}`)
const visibleGroups = computed(() =>
  showAllOnOnePage.value
    ? groups.value
    : groups.value.slice(step.value, step.value + 1)
)

watch(
  selected,
  template => {
    values.value = template ? { ...defaultValues(template) } : {}
    errors.value = []
    result.value = undefined
    step.value = 0
  },
  { immediate: true }
)

/**
 * Range hint shown next to a numeric field.
 *
 * The unit is not repeated here — it is already displayed against the input,
 * and printing both renders as "m 4–20 m".
 */
function rangeHint(param: AcTpParamSpec): string {
  const { min, max } = param
  if (min === undefined && max === undefined) return ''
  if (min !== undefined && max !== undefined) return `${min}–${max}`
  if (min !== undefined) return `≥ ${min}`
  return `≤ ${max}`
}

async function generate() {
  const template = selected.value
  if (!template) return

  running.value = true
  errors.value = []
  result.value = undefined
  try {
    const outcome = await runTemplate(template, values.value)
    if (outcome.errors.length > 0) {
      errors.value = outcome.errors
      return
    }
    result.value = { entityCount: outcome.entityCount, layers: outcome.layers }

    // Hand the drawing to auto-save with its recipe, so it can be regenerated
    // or adjusted later without re-entering every parameter.
    attachDrawing({
      name: template.meta.name,
      templateId: template.meta.id,
      templateVersion: template.meta.version,
      params: { ...values.value }
    })

    visible.value = false
  } catch (error) {
    errors.value = [String((error as Error)?.message ?? error)]
  } finally {
    running.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('dialog.templateDlg.title')"
    width="640px"
    class="ml-template-dlg"
  >
    <el-form label-position="top" @submit.prevent>
      <el-form-item :label="t('dialog.templateDlg.template')">
        <div class="ml-template-dlg__library">
          <div v-if="categories.length > 1" class="ml-template-dlg__filters">
            <button
              v-for="option in categories"
              :key="option.value"
              type="button"
              class="ml-template-dlg__filter"
              :class="{ 'is-active': category === option.value }"
              @click="category = option.value"
            >
              {{ option.label }}
            </button>
          </div>

          <ul class="ml-template-dlg__cards">
            <li v-for="item in visibleTemplates" :key="item.meta.id">
              <button
                type="button"
                class="ml-template-dlg__card"
                :class="{ 'is-active': item.meta.id === selectedId }"
                :aria-pressed="item.meta.id === selectedId"
                @click="selectedId = item.meta.id"
              >
                <span class="ml-template-dlg__thumb" aria-hidden="true">
                  <span
                    v-if="previewOf(item).svg"
                    class="ml-template-dlg__thumb-svg"
                    v-html="previewOf(item).svg"
                  />
                  <span v-else class="ml-template-dlg__thumb-empty">—</span>
                </span>
                <span class="ml-template-dlg__card-body">
                  <span class="ml-template-dlg__card-name">{{
                    item.meta.name
                  }}</span>
                  <span class="ml-template-dlg__card-cat">{{
                    item.meta.category
                  }}</span>
                  <span class="ml-template-dlg__card-ranges">{{
                    rangeSummary(item)
                  }}</span>
                </span>
              </button>
            </li>
          </ul>

          <div v-if="canUpload" class="ml-template-dlg__upload">
            <label class="ml-template-dlg__upload-btn">
              <input
                type="file"
                accept=".js,.mjs,text/javascript"
                :disabled="uploading"
                @change="onPickModule"
              />
              {{
                uploading
                  ? t('dialog.templateDlg.uploading')
                  : t('dialog.templateDlg.upload')
              }}
            </label>
            <span class="ml-template-dlg__upload-hint">
              {{ t('dialog.templateDlg.uploadHint') }}
            </span>
          </div>
          <p v-if="uploadNote" class="ml-template-dlg__upload-ok">
            {{ uploadNote }}
          </p>
          <p v-if="uploadError" class="ml-template-dlg__upload-err">
            {{ uploadError }}
          </p>
        </div>
      </el-form-item>

      <p v-if="selected?.meta.description" class="ml-template-dlg__desc">
        {{ selected.meta.description }}
      </p>

      <div class="ml-template-dlg__toolbar">
        <span
          v-if="!showAllOnOnePage && groups.length > 1"
          class="ml-template-dlg__step"
        >
          {{ stepLabel }}
        </span>
        <el-checkbox v-model="showAllOnOnePage">
          {{ t('dialog.templateDlg.showAll') }}
        </el-checkbox>
      </div>

      <div v-for="group in visibleGroups" :key="group.name">
        <h4 v-if="group.name" class="ml-template-dlg__group">
          {{ group.name }}
        </h4>
        <el-form-item
          v-for="param in group.params"
          :key="param.key"
          :label="param.label"
        >
          <div class="ml-template-dlg__field">
            <el-input-number
              v-if="param.type === 'number' || param.type === 'integer'"
              v-model="values[param.key] as number"
              :min="param.min"
              :max="param.max"
              :step="param.type === 'integer' ? 1 : 0.1"
              :precision="param.type === 'integer' ? 0 : 2"
              controls-position="right"
            />
            <el-select
              v-else-if="param.type === 'choice'"
              v-model="values[param.key] as string"
            >
              <el-option
                v-for="choice in param.choices ?? []"
                :key="choice.value"
                :label="choice.label"
                :value="choice.value"
              />
            </el-select>
            <el-input v-else v-model="values[param.key] as string" />

            <span class="ml-template-dlg__unit">{{ param.unit }}</span>
            <span class="ml-template-dlg__range">{{ rangeHint(param) }}</span>
          </div>
          <div v-if="param.hint" class="ml-template-dlg__hint">
            {{ param.hint }}
          </div>
        </el-form-item>
      </div>

      <el-alert
        v-if="errors.length"
        type="error"
        :closable="false"
        class="ml-template-dlg__errors"
      >
        <ul>
          <li v-for="message in errors" :key="message">{{ message }}</li>
        </ul>
      </el-alert>
    </el-form>

    <template #footer>
      <div class="ml-template-dlg__footer">
        <el-button v-if="!showAllOnOnePage && step > 0" @click="step -= 1">
          {{ t('dialog.templateDlg.back') }}
        </el-button>
        <el-button
          v-if="!showAllOnOnePage && step < groups.length - 1"
          type="primary"
          @click="step += 1"
        >
          {{ t('dialog.templateDlg.next') }}
        </el-button>
        <el-button v-else type="primary" :loading="running" @click="generate">
          {{ t('dialog.templateDlg.generate') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
/* Spacing, colour and type all come from the design tokens; nothing here
   hard-codes a value that DESIGN.md owns. */
.ml-template-dlg__select {
  width: 100%;
}
.ml-template-dlg__desc {
  margin: 0 0 var(--cv-space-4);
  font-size: 13px;
  color: var(--cv-ink-secondary);
}
.ml-template-dlg__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--cv-space-3);
  padding-bottom: var(--cv-space-3);
  /* Depth by hairline, not by shadow. */
  border-bottom: 1px solid var(--cv-border-hairline);
}
.ml-template-dlg__step {
  font-family: var(--cv-font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: var(--cv-ink-secondary);
}
.ml-template-dlg__group {
  margin: var(--cv-space-4) 0 var(--cv-space-2);
  font-size: 13px;
  color: var(--cv-ink-primary);
}
.ml-template-dlg__field {
  display: flex;
  align-items: center;
  gap: var(--cv-space-3);
}
/* Units and ranges are exact values, so they read in the mono face. */
.ml-template-dlg__unit,
.ml-template-dlg__range {
  font-family: var(--cv-font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: var(--cv-ink-secondary);
}
/* The row is a flex line; without this the hint sits on it and runs straight
   into the range, reading as one unbroken string. */
:deep(.el-form-item__content) {
  flex-wrap: wrap;
}
.ml-template-dlg__hint {
  flex-basis: 100%;
  margin-top: var(--cv-space-1);
  font-size: 12px;
  color: var(--cv-ink-secondary);
}
.ml-template-dlg__errors ul {
  margin: 0;
  padding-left: 18px;
}
.ml-template-dlg__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--cv-space-3);
}

/* --- Template library ---------------------------------------------------
   DESIGN.md: card carries name, thumbnail and parameter ranges in mono;
   hover draws an accent border. Cards are buttons rather than clickable divs
   so the whole library is reachable from the keyboard, which the generate
   flow requires. */
.ml-template-dlg__filters {
  display: flex;
  gap: var(--cv-space-2);
  margin-bottom: var(--cv-space-3);
  flex-wrap: wrap;
}

.ml-template-dlg__filter {
  padding: 3px 10px;
  border: 1px solid var(--cv-border-hairline);
  border-radius: var(--cv-radius-sm);
  background: transparent;
  color: var(--cv-ink-secondary);
  font-size: 12px;
  cursor: pointer;
}

.ml-template-dlg__filter.is-active {
  border-color: var(--cv-accent);
  color: var(--cv-accent);
}

.ml-template-dlg__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--cv-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 260px;
  overflow-y: auto;
}

.ml-template-dlg__card {
  display: flex;
  gap: var(--cv-space-4);
  width: 100%;
  padding: var(--cv-space-3);
  border: 1px solid var(--cv-border-hairline);
  border-radius: var(--cv-radius-lg);
  background: var(--cv-surface-panel);
  color: var(--cv-ink-primary);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.ml-template-dlg__card:hover,
.ml-template-dlg__card.is-active {
  border-color: var(--cv-accent);
  background: var(--cv-surface-raised);
}

.ml-template-dlg__thumb {
  flex: 0 0 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-canvas);
  color: var(--cv-ink-secondary);
}

.ml-template-dlg__card.is-active .ml-template-dlg__thumb,
.ml-template-dlg__card:hover .ml-template-dlg__thumb {
  color: var(--cv-ink-primary);
}

.ml-template-dlg__thumb-svg {
  display: flex;
}

.ml-template-dlg__thumb-empty {
  font-size: 18px;
  color: var(--cv-ink-disabled);
}

.ml-template-dlg__card-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ml-template-dlg__card-name {
  font-weight: 600;
  font-size: 13px;
}

.ml-template-dlg__card-cat {
  font-size: 11px;
  color: var(--cv-ink-secondary);
}

/* Ranges are exact values, so they read in the mono face. */
.ml-template-dlg__card-ranges {
  font-family: var(--cv-font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: var(--cv-ink-secondary);
}

/* --- Uploading a template ------------------------------------------------
   Author-only, and only as a courtesy: the route refuses everyone else
   regardless, which is where the boundary actually lives. */
.ml-template-dlg__upload {
  display: flex;
  align-items: center;
  gap: var(--cv-space-3);
  margin-top: var(--cv-space-3);
  padding-top: var(--cv-space-3);
  border-top: 1px solid var(--cv-border-hairline);
}

.ml-template-dlg__upload-btn {
  padding: 4px 12px;
  border: 1px solid var(--cv-border-hairline);
  border-radius: var(--cv-radius-md);
  color: var(--cv-ink-secondary);
  font-size: 12px;
  cursor: pointer;
}

.ml-template-dlg__upload-btn:hover {
  border-color: var(--cv-accent);
  color: var(--cv-accent);
}

.ml-template-dlg__upload-btn input {
  display: none;
}

.ml-template-dlg__upload-hint,
.ml-template-dlg__upload-ok,
.ml-template-dlg__upload-err {
  font-size: 12px;
  color: var(--cv-ink-secondary);
}

.ml-template-dlg__upload-ok {
  margin: var(--cv-space-2) 0 0;
  color: var(--cv-accent);
}

/* Amber, not red: the upload worked, something in the standards is missing. */
.ml-template-dlg__upload-err {
  margin: var(--cv-space-2) 0 0;
  color: var(--cv-warning);
}
</style>
