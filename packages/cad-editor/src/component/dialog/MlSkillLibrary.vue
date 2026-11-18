<script setup lang="ts">
import {
  type AcApSkill,
  type AcApSkillDraft,
  type AcApSkillSummary,
  deleteSkill,
  listSkills,
  packSkillFolder,
  publishSkill,
  readSkill,
  saveSkillDraft,
  splitSkillMarkdown,
  uploadSkillFiles
} from '@mlightcad/cad-template-plugin'
// Imported explicitly, like every other dialog here: an unresolved
// `<el-button>` renders nothing and warns only in development.
import { ElAlert, ElButton, ElInput } from 'element-plus'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * The guide library, as a panel inside the template dialog.
 *
 * A guide is instructions for everyone's assistant, so this panel does what
 * the template library does and nothing more: list, upload as a draft, try,
 * publish, delete. The server decides who may write; `canEdit` only hides
 * controls that would be refused anyway.
 */
const props = defineProps<{
  /** Whether this member holds the author role. */
  canEdit: boolean
  /** True while the panel is the one on screen; the list loads on that edge. */
  active: boolean
}>()

const { t } = useI18n()

const skills = ref<AcApSkillSummary[]>([])
const loading = ref(false)
const uploading = ref(false)
/** Guide an action is running on, so only its buttons show a spinner. */
const busy = ref('')
const note = ref('')
const error = ref('')
/** Guides whose contents are unfolded on screen. */
const opened = ref<Record<string, AcApSkill>>({})
/** Guide whose delete button is waiting for a second click. */
const confirming = ref('')

const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause)

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    skills.value = await listSkills()
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.active,
  isActive => {
    if (isActive) void refresh()
  },
  { immediate: true }
)

/**
 * One handler for both pickers.
 *
 * A folder pick carries `webkitRelativePath`; a multi-file pick does not. The
 * packing step understands both, so the two inputs differ only in what the
 * browser lets the person choose.
 */
async function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const list = Array.from(input.files ?? [])
  input.value = ''
  if (!list.length) return

  uploading.value = true
  note.value = ''
  error.value = ''
  try {
    const picked = await Promise.all(
      list.map(async file => ({
        name: file.name,
        relativePath: file.webkitRelativePath || '',
        content: await file.text()
      }))
    )
    const { files, ignored } = packSkillFolder(picked)
    const { skill, changed } = await uploadSkillFiles(files)
    note.value =
      (changed
        ? t('dialog.skillLibrary.uploaded', { id: skill.skillId })
        : t('dialog.skillLibrary.unchanged', { id: skill.skillId })) +
      (ignored.length
        ? ` ${t('dialog.skillLibrary.ignored', { files: ignored.join(', ') })}`
        : '')
    await refresh()
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    uploading.value = false
  }
}

async function publish(skillId: string) {
  busy.value = skillId
  note.value = ''
  error.value = ''
  try {
    await publishSkill(skillId)
    note.value = t('dialog.skillLibrary.published', { id: skillId })
    await refresh()
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    busy.value = ''
  }
}

/**
 * Two clicks to delete, on the same button.
 *
 * A confirm dialog would do, but it stacks a modal on a modal; turning the
 * button into its own confirmation keeps the decision where the eye already
 * is, and any other click cancels it.
 */
async function remove(skillId: string) {
  if (confirming.value !== skillId) {
    confirming.value = skillId
    return
  }
  confirming.value = ''
  busy.value = skillId
  note.value = ''
  error.value = ''
  try {
    await deleteSkill(skillId)
    delete opened.value[skillId]
    note.value = t('dialog.skillLibrary.deleted', { id: skillId })
    await refresh()
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    busy.value = ''
  }
}

async function toggleView(skillId: string) {
  confirming.value = ''
  if (opened.value[skillId]) {
    delete opened.value[skillId]
    return
  }
  busy.value = skillId
  error.value = ''
  try {
    opened.value[skillId] = await readSkill(skillId)
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    busy.value = ''
  }
}

/** The main file's text, which is what "view" means for a guide. */
const mainText = (skill: AcApSkill) =>
  skill.files.find(file => file.path === 'SKILL.md')?.content ?? ''

const referencePaths = (skill: AcApSkillSummary) =>
  skill.paths.filter(path => path !== 'SKILL.md')

/**
 * The guide being written in the panel: a new one, or an existing one whose
 * SKILL.md was split back into fields. The frontmatter is generated from the
 * fields on save, so nobody has to type YAML; saving is always a draft.
 */
const editing = ref<{ draft: AcApSkillDraft; existing?: AcApSkill } | null>(
  null
)
const saving = ref(false)

function compose() {
  confirming.value = ''
  note.value = ''
  error.value = ''
  editing.value = {
    draft: { skillId: '', title: '', description: '', body: '' }
  }
}

async function edit(skillId: string) {
  confirming.value = ''
  busy.value = skillId
  error.value = ''
  try {
    const existing = await readSkill(skillId)
    editing.value = { draft: splitSkillMarkdown(mainText(existing)), existing }
    // The id is the guide's; a hand-written SKILL.md may spell it otherwise.
    editing.value.draft.skillId = skillId
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    busy.value = ''
  }
}

async function saveDraft() {
  if (!editing.value) return
  saving.value = true
  note.value = ''
  error.value = ''
  try {
    const { skill, changed } = await saveSkillDraft(
      editing.value.draft,
      editing.value.existing
    )
    note.value = changed
      ? t('dialog.skillLibrary.saved', { id: skill.skillId })
      : t('dialog.skillLibrary.unchanged', { id: skill.skillId })
    delete opened.value[skill.skillId]
    editing.value = null
    await refresh()
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="ml-skill-lib" data-testid="skill-library">
    <p class="ml-skill-lib__intro">{{ t('dialog.skillLibrary.intro') }}</p>

    <div class="ml-skill-lib__toolbar">
      <template v-if="canEdit">
        <label class="ml-skill-lib__pick">
          <input
            type="file"
            webkitdirectory
            multiple
            :disabled="uploading"
            data-testid="skill-folder-input"
            @change="onPick"
          />
          {{
            uploading
              ? t('dialog.skillLibrary.uploading')
              : t('dialog.skillLibrary.upload')
          }}
        </label>
        <label class="ml-skill-lib__pick ml-skill-lib__pick--quiet">
          <input
            type="file"
            multiple
            accept=".md,text/markdown"
            :disabled="uploading"
            data-testid="skill-files-input"
            @change="onPick"
          />
          {{ t('dialog.skillLibrary.uploadFiles') }}
        </label>
      </template>
      <el-button
        v-if="canEdit"
        size="small"
        type="primary"
        plain
        data-testid="skill-compose"
        @click="compose"
      >
        {{ t('dialog.skillLibrary.compose') }}
      </el-button>
      <span v-if="!canEdit" class="ml-skill-lib__readonly">
        {{ t('dialog.skillLibrary.readOnly') }}
      </span>
      <el-button size="small" :loading="loading" @click="refresh">
        {{ t('dialog.skillLibrary.refresh') }}
      </el-button>
    </div>

    <p v-if="note" class="ml-skill-lib__ok" data-testid="skill-note">
      {{ note }}
    </p>
    <el-alert
      v-if="error"
      type="error"
      :closable="false"
      class="ml-skill-lib__error"
      data-testid="skill-error"
    >
      {{ error }}
    </el-alert>

    <form
      v-if="editing"
      class="ml-skill-lib__editor"
      data-testid="skill-editor"
      @submit.prevent="saveDraft"
    >
      <label class="ml-skill-lib__field">
        <span>{{ t('dialog.skillLibrary.fieldId') }}</span>
        <el-input
          v-model="editing.draft.skillId"
          size="small"
          :disabled="!!editing.existing"
          :placeholder="t('dialog.skillLibrary.fieldIdHint')"
          data-testid="skill-field-id"
        />
      </label>
      <label class="ml-skill-lib__field">
        <span>{{ t('dialog.skillLibrary.fieldTitle') }}</span>
        <el-input
          v-model="editing.draft.title"
          size="small"
          data-testid="skill-field-title"
        />
      </label>
      <label class="ml-skill-lib__field">
        <span>{{ t('dialog.skillLibrary.fieldDescription') }}</span>
        <el-input
          v-model="editing.draft.description"
          type="textarea"
          :rows="2"
          :placeholder="t('dialog.skillLibrary.fieldDescriptionHint')"
          data-testid="skill-field-description"
        />
      </label>
      <label class="ml-skill-lib__field">
        <span>{{ t('dialog.skillLibrary.fieldBody') }}</span>
        <el-input
          v-model="editing.draft.body"
          type="textarea"
          :rows="10"
          class="ml-skill-lib__markdown"
          data-testid="skill-field-body"
        />
      </label>
      <div class="ml-skill-lib__actions">
        <el-button
          size="small"
          type="primary"
          native-type="submit"
          :loading="saving"
          data-testid="skill-save"
        >
          {{ t('dialog.skillLibrary.saveDraft') }}
        </el-button>
        <el-button size="small" @click="editing = null">
          {{ t('dialog.skillLibrary.cancel') }}
        </el-button>
      </div>
    </form>

    <p v-if="!loading && !skills.length" class="ml-skill-lib__empty">
      {{ t('dialog.skillLibrary.empty') }}
    </p>

    <ul class="ml-skill-lib__list">
      <li
        v-for="skill in skills"
        :key="skill.skillId"
        class="ml-skill-lib__item"
        :data-skill="skill.skillId"
      >
        <div class="ml-skill-lib__head">
          <span class="ml-skill-lib__title">{{ skill.title }}</span>
          <code class="ml-skill-lib__id">{{ skill.skillId }}</code>
          <span
            class="ml-skill-lib__status"
            :class="{ 'is-published': skill.status === 'published' }"
          >
            {{
              skill.status === 'published'
                ? t('dialog.skillLibrary.statusPublished')
                : t('dialog.skillLibrary.statusDraft')
            }}
          </span>
          <span class="ml-skill-lib__files">
            {{ t('dialog.skillLibrary.files', { count: skill.paths.length }) }}
          </span>
        </div>
        <p class="ml-skill-lib__desc">{{ skill.description }}</p>
        <div class="ml-skill-lib__actions">
          <el-button
            size="small"
            :loading="busy === skill.skillId && !opened[skill.skillId]"
            @click="toggleView(skill.skillId)"
          >
            {{
              opened[skill.skillId]
                ? t('dialog.skillLibrary.hide')
                : t('dialog.skillLibrary.view')
            }}
          </el-button>
          <el-button
            v-if="canEdit"
            size="small"
            :loading="busy === skill.skillId"
            :data-testid="`skill-edit-${skill.skillId}`"
            @click="edit(skill.skillId)"
          >
            {{ t('dialog.skillLibrary.edit') }}
          </el-button>
          <el-button
            v-if="canEdit && skill.status !== 'published'"
            size="small"
            type="primary"
            :loading="busy === skill.skillId"
            @click="publish(skill.skillId)"
          >
            {{ t('dialog.skillLibrary.publish') }}
          </el-button>
          <el-button
            v-if="canEdit"
            size="small"
            type="danger"
            plain
            :loading="busy === skill.skillId"
            @click="remove(skill.skillId)"
          >
            {{
              confirming === skill.skillId
                ? t('dialog.skillLibrary.confirmDelete')
                : t('dialog.skillLibrary.delete')
            }}
          </el-button>
        </div>
        <div v-if="opened[skill.skillId]" class="ml-skill-lib__body">
          <pre class="ml-skill-lib__content">{{
            mainText(opened[skill.skillId])
          }}</pre>
          <p v-if="referencePaths(skill).length" class="ml-skill-lib__refs">
            {{ referencePaths(skill).join(' · ') }}
          </p>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* Spacing, colour and type come from the design tokens, as in the template
   dialog this panel sits inside. */
.ml-skill-lib__intro {
  margin: 0 0 var(--cv-space-3);
  font-size: 12px;
  color: var(--cv-ink-secondary);
}

.ml-skill-lib__toolbar {
  display: flex;
  align-items: center;
  gap: var(--cv-space-3);
  padding-bottom: var(--cv-space-3);
  border-bottom: 1px solid var(--cv-border-hairline);
}

.ml-skill-lib__pick {
  padding: 4px 12px;
  border: 1px solid var(--cv-border-hairline);
  border-radius: var(--cv-radius-md);
  color: var(--cv-ink-secondary);
  font-size: 12px;
  cursor: pointer;
}

.ml-skill-lib__pick:hover {
  border-color: var(--cv-accent);
  color: var(--cv-accent);
}

.ml-skill-lib__pick--quiet {
  border-color: transparent;
}

.ml-skill-lib__pick input {
  display: none;
}

.ml-skill-lib__readonly,
.ml-skill-lib__empty,
.ml-skill-lib__ok {
  font-size: 12px;
  color: var(--cv-ink-secondary);
}

.ml-skill-lib__ok {
  margin: var(--cv-space-2) 0 0;
  color: var(--cv-accent);
}

.ml-skill-lib__error {
  margin-top: var(--cv-space-2);
}

.ml-skill-lib__empty {
  margin: var(--cv-space-3) 0 0;
}

.ml-skill-lib__list {
  margin: var(--cv-space-3) 0 0;
  padding: 0;
  list-style: none;
  max-height: 360px;
  overflow-y: auto;
}

.ml-skill-lib__item {
  padding: var(--cv-space-3);
  border: 1px solid var(--cv-border-hairline);
  border-radius: var(--cv-radius-lg);
  background: var(--cv-surface-panel);
}

.ml-skill-lib__item + .ml-skill-lib__item {
  margin-top: var(--cv-space-2);
}

.ml-skill-lib__head {
  display: flex;
  align-items: baseline;
  gap: var(--cv-space-3);
  flex-wrap: wrap;
}

.ml-skill-lib__title {
  font-weight: 600;
  font-size: 13px;
  color: var(--cv-ink-primary);
}

/* Ids and file counts are exact values, so they read in the mono face. */
.ml-skill-lib__id,
.ml-skill-lib__files,
.ml-skill-lib__refs {
  font-family: var(--cv-font-mono);
  font-size: 11px;
  color: var(--cv-ink-secondary);
}

.ml-skill-lib__status {
  padding: 1px 8px;
  border: 1px solid var(--cv-border-hairline);
  border-radius: var(--cv-radius-sm);
  font-size: 11px;
  color: var(--cv-ink-secondary);
}

.ml-skill-lib__status.is-published {
  border-color: var(--cv-accent);
  color: var(--cv-accent);
}

.ml-skill-lib__desc {
  margin: var(--cv-space-1) 0 var(--cv-space-2);
  font-size: 12px;
  color: var(--cv-ink-secondary);
}

.ml-skill-lib__actions {
  display: flex;
  gap: var(--cv-space-2);
}

.ml-skill-lib__body {
  margin-top: var(--cv-space-2);
}

.ml-skill-lib__content {
  max-height: 240px;
  margin: 0;
  padding: var(--cv-space-3);
  overflow: auto;
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-canvas);
  font-family: var(--cv-font-mono);
  font-size: 11px;
  line-height: 1.5;
  color: var(--cv-ink-primary);
  white-space: pre-wrap;
}

.ml-skill-lib__refs {
  margin: var(--cv-space-2) 0 0;
}

.ml-skill-lib__editor {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-2);
  margin-top: var(--cv-space-3);
  padding: var(--cv-space-3);
  border: 1px solid var(--cv-border-hairline);
  border-radius: var(--cv-radius-lg);
  background: var(--cv-surface-panel);
}

.ml-skill-lib__field {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-1);
  font-size: 12px;
  color: var(--cv-ink-secondary);
}

/* The guide body is markdown the assistant reads verbatim. */
.ml-skill-lib__markdown :deep(textarea) {
  font-family: var(--cv-font-mono);
  font-size: 12px;
}
</style>
