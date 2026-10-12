import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLayoutStore } from '../stores/layout.js'

const MARGIN = 8 // what stays between the panel and the edge of the window

/**
 * A panel that floats over the page and is dragged by its header. It only floats where its CSS
 * makes it `position: fixed` (wide windows); in one column it is part of the page.
 * @param {string} name  the panel's key in the layout store
 * @returns panel ref, inline style, dragging flag and the pointerdown handler for the header
 */
export function useFloating(name) {
  const layout = useLayoutStore()
  const panel = ref(null)
  const dragging = ref(false)
  let grip = null

  const floats = () => panel.value && getComputedStyle(panel.value).position === 'fixed'
  const style = computed(() => {
    const at = layout.positions[name]
    return at ? { left: `${at.x}px`, top: `${at.y}px`, right: 'auto', bottom: 'auto' } : null
  })

  // A position that keeps the panel inside the window.
  function inWindow(x, y) {
    const rect = panel.value.getBoundingClientRect()
    return {
      x: Math.round(Math.min(Math.max(MARGIN, x), Math.max(MARGIN, window.innerWidth - rect.width - MARGIN))),
      y: Math.round(Math.min(Math.max(MARGIN, y), Math.max(MARGIN, window.innerHeight - rect.height - MARGIN))),
    }
  }

  function startDrag(event) {
    if (event.button || event.target.closest('button, input, label, a') || !floats()) return
    const rect = panel.value.getBoundingClientRect()
    grip = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    dragging.value = true
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.addEventListener('pointermove', drag)
    event.currentTarget.addEventListener('pointerup', endDrag)
    event.currentTarget.addEventListener('pointercancel', endDrag)
    event.preventDefault()
  }

  function drag(event) {
    layout.positions[name] = inWindow(event.clientX - grip.x, event.clientY - grip.y)
  }

  function endDrag(event) {
    event.currentTarget.removeEventListener('pointermove', drag)
    event.currentTarget.removeEventListener('pointerup', endDrag)
    event.currentTarget.removeEventListener('pointercancel', endDrag)
    dragging.value = false
    layout.persist()
  }

  // A smaller window, or a panel that has grown, must not leave it outside the window.
  function keepInWindow() {
    const at = layout.positions[name]
    if (at && floats()) layout.positions[name] = inWindow(at.x, at.y)
  }
  // The panel may come and go (v-if): checked whenever it appears.
  watch(panel, (el) => el && keepInWindow(), { flush: 'post' })
  onMounted(() => window.addEventListener('resize', keepInWindow))
  onBeforeUnmount(() => window.removeEventListener('resize', keepInWindow))

  return { panel, style, dragging, startDrag, floats }
}
