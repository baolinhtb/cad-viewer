<template>
  <div class="ml-ribbon-language-switch">
    <el-select
      v-model="language"
      :disabled="props.disabled"
      size="small"
      class="ml-ribbon-language-switch__select"
    >
      <el-option
        v-for="option in languageOptions"
        :key="option.value"
        :value="option.value"
        :label="option.label"
      />
    </el-select>
  </div>
</template>

<script setup lang="ts">
import { AcApLocale } from '@mlightcad/cad-simple-viewer'
import { ElOption, ElSelect } from 'element-plus'
import { computed } from 'vue'

import { isSupportedLocale, LOCALE_OPTIONS, useLocale } from '../../composable'
import { LocaleProp } from '../../locale'

interface Props {
  currentLocale?: LocaleProp
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  currentLocale: undefined,
  disabled: false
})

const { effectiveLocale, setLocale } = useLocale(props.currentLocale)

const language = computed<AcApLocale>({
  get: () =>
    isSupportedLocale(effectiveLocale.value) ? effectiveLocale.value : 'en',
  set: value => {
    if (isSupportedLocale(value)) {
      setLocale(value)
    }
  }
})

const languageOptions = LOCALE_OPTIONS.map(option => ({
  value: option.locale,
  label: option.label
}))
</script>

<style scoped>
.ml-ribbon-language-switch {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

/*
 * `width` alone is a floor as well as a ceiling: the header shrinks its two
 * halves to fit a phone, and a rigid 110 px select simply carried on past the
 * right edge of the screen — that is what was cutting "English" in half at
 * 360 px. Making the width a maximum lets the select give way with everything
 * else, while a minimum keeps the label readable before the flex box gives up.
 */
.ml-ribbon-language-switch__select {
  width: 110px;
  max-width: 100%;
  min-width: 72px;
}
</style>
