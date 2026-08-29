import type { PlasmoCSConfig } from 'plasmo'
import { getAdapterForHost } from '~/adapters'
import { applyLocks } from '~/core/lock-engine'
import { createSidebarObserver } from '~/core/observer'

export const config: PlasmoCSConfig = {
  matches: [
    'https://chatgpt.com/*',
    'https://chat.openai.com/*',
    'https://claude.ai/*',
    'https://gemini.google.com/*',
    'https://chat.deepseek.com/*',
    'https://chat.qwen.ai/*',
    'https://kimi.com/*',
    'https://kimi.moonshot.cn/*'
  ],
  run_at: 'document_idle'
}

function init() {
  const hostname = window.location.hostname
  const adapter = getAdapterForHost(hostname)

  if (!adapter) {
    console.log('[AI Chat Lock] No adapter matching hostname:', hostname)
    return
  }

  console.log(`[AI Chat Lock] Initialized adapter: ${adapter.siteName}`)

  // Create observer and bind to lock-engine
  createSidebarObserver(adapter, () => {
    applyLocks(adapter).catch((err) => {
      console.error('[AI Chat Lock] Error applying locks:', err)
    })
  })
}

// Execute when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
