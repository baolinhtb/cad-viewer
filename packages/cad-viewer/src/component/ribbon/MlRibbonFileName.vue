<template>
  <div
    v-if="displayName && overlayStyle"
    class="ml-ribbon-file-name"
    :style="overlayStyle"
  >
    <span class="ml-ribbon-file-name__text">{{ displayName }}</span>
  </div>
</template>

<script setup lang="ts">
import { type CSSProperties, onUnmounted, ref, watchEffect } from 'vue'

import { useDocument } from '../../composable'

interface Props {
  containerEl?: HTMLElement | null
}

const props = defineProps<Props>()

const { displayName } = useDocument()

const overlayStyle = ref<CSSProperties>()

let resizeObserver: ResizeObserver | undefined
let rafId = 0
let layoutRetryCount = 0
const MAX_LAYOUT_RETRIES = 30

/**
 * Below this the overlay is dropped rather than drawn.
 *
 * The name sits in whatever gap is left between the tab strip and the language
 * selector, and on a phone that gap closes to almost nothing — at 360 px it
 * measured 16 px against a name 73 px wide, so what reached the screen was a
 * 16 px slice out of the middle of "Cầu bản BTCT.dxf" reading `n B`. A stray
 * fragment of a word is worse than no name at all: it looks like a rendering
 * fault, and it tells the reader nothing. Roughly four characters plus an
 * ellipsis is the point below which there is nothing worth showing.
 */
const MIN_LEGIBLE_WIDTH = 56

const updatePosition = () => {
  const container = props.containerEl
  if (!container) {
    overlayStyle.value = undefined
    layoutRetryCount = 0
    return
  }

  const header = container.querySelector('.ml-ribbon__header')
  const headLeft = container.querySelector('.ml-ribbon__head-left')
  const headRight = container.querySelector('.ml-ribbon__head-right')
  if (
    !(header instanceof HTMLElement) ||
    !(headLeft instanceof HTMLElement) ||
    !(headRight instanceof HTMLElement)
  ) {
    overlayStyle.value = undefined
    if (displayName.value && layoutRetryCount < MAX_LAYOUT_RETRIES) {
      layoutRetryCount += 1
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(updatePosition)
    }
    return
  }

  layoutRetryCount = 0

  const containerRect = container.getBoundingClientRect()
  const headerRect = header.getBoundingClientRect()
  const leftRect = headLeft.getBoundingClientRect()
  const rightRect = headRight.getBoundingClientRect()
  const gapLeft = leftRect.right - containerRect.left
  const gapWidth = Math.max(0, rightRect.left - leftRect.right)

  if (gapWidth < MIN_LEGIBLE_WIDTH) {
    overlayStyle.value = undefined
    return
  }

  overlayStyle.value = {
    top: `${headerRect.top - containerRect.top}px`,
    left: `${gapLeft}px`,
    width: `${gapWidth}px`,
    height: `${headerRect.height}px`
  }
}

const scheduleUpdate = () => {
  cancelAnimationFrame(rafId)
  layoutRetryCount = 0
  rafId = requestAnimationFrame(updatePosition)
}

watchEffect(onCleanup => {
  const container = props.containerEl
  if (!container) {
    overlayStyle.value = undefined
    return
  }

  scheduleUpdate()

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(container)
    for (const selector of [
      '.ml-ribbon__header',
      '.ml-ribbon__head-left',
      '.ml-ribbon__head-right'
    ]) {
      const element = container.querySelector(selector)
      if (element) resizeObserver.observe(element)
    }
  }

  onCleanup(() => {
    cancelAnimationFrame(rafId)
    resizeObserver?.disconnect()
    resizeObserver = undefined
  })
})

watchEffect(() => {
  displayName.value
  scheduleUpdate()
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  resizeObserver?.disconnect()
})
</script>

<style scoped>
.ml-ribbon-file-name {
  position: absolute;
  z-index: 11;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0 8px;
  color: var(--el-text-color-regular);
  font-size: var(--el-font-size-small);
  line-height: 1.2;
  text-align: center;
  pointer-events: none;
  overflow: hidden;
}

/*
 * The ellipsis belongs on this inner span, not on the flex box around it:
 * `text-overflow` applies to block containers, so on the flex parent it was
 * inert and a long name was simply sliced off at both edges. `min-width: 0`
 * is what allows a flex child to shrink below its content width at all.
 */
.ml-ribbon-file-name__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
