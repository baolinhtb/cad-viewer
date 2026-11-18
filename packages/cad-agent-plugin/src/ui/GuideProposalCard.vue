<script setup lang="ts">
import type { AcApSkillDraft } from '@mlightcad/cad-template-plugin'
import { onMounted, onUnmounted, ref } from 'vue'

import { useAgentI18n } from '../i18n/useAgentI18n'
import { guideProposals } from '../tools/guideProposal'

/**
 * The confirmation card of `de_xuat_huong_dan`.
 *
 * The assistant's draft is shown as editable fields; nothing is saved until
 * the person presses "save draft", and what is saved is what they left in
 * the fields. While this card is mounted the store knows someone can be
 * asked; without it the tool refuses rather than saving unseen.
 */
const { labels } = useAgentI18n()
const draft = ref<AcApSkillDraft | null>(null)
let unsubscribe: (() => void) | undefined

onMounted(() => {
  unsubscribe = guideProposals.subscribe(proposal => {
    draft.value = proposal ? { ...proposal.draft } : null
  })
})
onUnmounted(() => {
  unsubscribe?.()
  // Nobody left to answer: decline rather than leave the tool waiting.
  guideProposals.answer(null)
})

const save = () => draft.value && guideProposals.answer({ ...draft.value })
const decline = () => guideProposals.answer(null)
</script>

<template>
  <div v-if="draft" class="cad-agent-guide-card" data-testid="guide-proposal">
    <div class="cad-agent-guide-title">{{ labels.guideProposalTitle }}</div>
    <p class="cad-agent-guide-note">{{ labels.guideProposalNote }}</p>
    <label>
      {{ labels.guideFieldId }}
      <input v-model="draft.skillId" data-testid="guide-proposal-id" />
    </label>
    <label>
      {{ labels.guideFieldTitle }}
      <input v-model="draft.title" />
    </label>
    <label>
      {{ labels.guideFieldDescription }}
      <textarea v-model="draft.description" rows="2" />
    </label>
    <label>
      {{ labels.guideFieldBody }}
      <textarea
        v-model="draft.body"
        rows="8"
        class="cad-agent-guide-body"
        data-testid="guide-proposal-body"
      />
    </label>
    <div class="cad-agent-guide-actions">
      <button
        type="button"
        class="cad-agent-guide-save"
        data-testid="guide-proposal-save"
        @click="save"
      >
        {{ labels.guideSaveDraft }}
      </button>
      <button
        type="button"
        data-testid="guide-proposal-decline"
        @click="decline"
      >
        {{ labels.guideDecline }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.cad-agent-guide-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px;
  padding: 10px;
  border: 1px solid var(--cv-accent, #3b82f6);
  border-radius: 8px;
  font-size: 12px;
}

.cad-agent-guide-title {
  font-weight: 600;
}

.cad-agent-guide-note {
  margin: 0;
  opacity: 0.8;
}

.cad-agent-guide-card label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cad-agent-guide-body {
  font-family: var(--cv-font-mono, monospace);
}

.cad-agent-guide-actions {
  display: flex;
  gap: 8px;
}

.cad-agent-guide-save {
  font-weight: 600;
}
</style>
