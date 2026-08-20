import { AcApDocManager, eventBus } from '@mlightcad/cad-simple-viewer'
import { AcEdBaseView, AcEdMouseEventArgs } from '@mlightcad/cad-simple-viewer'
import { AcGePoint2d } from '@mlightcad/data-model'
import { computed, onMounted, onUnmounted, ref } from 'vue'

function formatCoordinatePair(x: number, y: number): string {
  const db = AcApDocManager.instance.curDocument?.database
  if (!db) {
    return `${x.toFixed(3)}, ${y.toFixed(3)}`
  }
  return db.formatter.formatPoint2d(new AcGePoint2d(x, y))
}

/**
 * Reads the cursor position in the drawing's working coordinate system.
 *
 * A survey-based drawing puts its structure at coordinates like x = 311088, and
 * the engineer checking the screen against the paper is reading against a site
 * datum. A readout that ignores the datum is a readout nobody can check, so
 * once a UCS is current the numbers shown are its numbers, with its name beside
 * them to say which. In world coordinates nothing is appended and the readout
 * is exactly what it always was.
 */
function inCurrentUcs(x: number, y: number): { x: number; y: number; ten: string } {
  const doc = AcApDocManager.instance.curDocument
  const ucs = doc?.ucsService
  if (!ucs || ucs.isWorld) return { x, y, ten: '' }
  const local = ucs.toUcs({ x, y })
  return { x: local.x, y: local.y, ten: ucs.current.name }
}

export function useCurrentPos(view: AcEdBaseView) {
  const x = ref(0)
  const y = ref(0)

  function update(event: AcEdMouseEventArgs) {
    x.value = event.x
    y.value = event.y
  }

  onMounted(() => view.events.mouseMove.addEventListener(update))
  onUnmounted(() => view.events.mouseMove.removeEventListener(update))

  // Bumped whenever the working system changes, so a readout sitting still
  // while the mouse does not move still updates the moment a datum is set.
  const ucsTick = ref(0)
  const onUcsChanged = () => {
    ucsTick.value += 1
  }
  onMounted(() => eventBus.on('ucs-changed', onUcsChanged))
  onUnmounted(() => eventBus.off('ucs-changed', onUcsChanged))

  const text = computed(() => {
    void ucsTick.value
    const local = inCurrentUcs(x.value, y.value)
    const base = formatCoordinatePair(local.x, local.y)
    return local.ten ? `${base}  [${local.ten}]` : base
  })

  return { x, y, text }
}
