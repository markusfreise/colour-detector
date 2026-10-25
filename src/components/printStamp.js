import { onBeforeUnmount, onMounted } from 'vue'
import { useAnalysisStore } from '../stores/analysis.js'
import { useText } from '../i18n/index.js'
import { printStamp, printStampRule } from '../lib/printStamp.js'

/** Writes the stamp of the picture on screen into the page margins whenever printing starts. */
export function usePrintStamp() {
  const analysis = useAnalysisStore()
  const { region } = useText()
  const stamp = () => {
    let style = document.getElementById('print-stamp')
    if (!style) {
      style = document.createElement('style')
      style.id = 'print-stamp'
      document.head.append(style)
    }
    style.textContent = printStampRule(printStamp(analysis.imageName, new Date(), region.value))
  }
  onMounted(() => window.addEventListener('beforeprint', stamp))
  onBeforeUnmount(() => window.removeEventListener('beforeprint', stamp))
}
