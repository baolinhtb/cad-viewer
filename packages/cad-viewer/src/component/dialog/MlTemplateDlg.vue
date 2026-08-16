<script setup lang="ts">
import { attachDrawing } from '@mlightcad/cad-storage-plugin'
import type {
  AcTpParamSpec,
  AcTpTemplate
} from '@mlightcad/cad-template-plugin'
import {
  defaultValues,
  listTemplates,
  refreshTemplateLibrary,
  runTemplate
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
  if (isOpen) void syncTemplates()
})

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
        <el-select v-model="selectedId" class="ml-template-dlg__select">
          <el-option
            v-for="item in templates"
            :key="item.meta.id"
            :label="item.meta.name"
            :value="item.meta.id"
          />
        </el-select>
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
</style>
