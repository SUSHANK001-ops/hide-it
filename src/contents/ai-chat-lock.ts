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
    'https://kimi.ai/*',
    'https://www.kimi.ai/*',
    'https://kimi.com/*',
    'https://kimi.moonshot.cn/*'
  ],
  run_at: 'document_idle'
}

/** Whether the extension context is still valid */
let contextValid = true

function init() {
  const hostname = window.location.hostname
  const adapter = getAdapterForHost(hostname)

  if (!adapter) {
    console.log('[AI Chat Lock] No adapter for hostname:', hostname)
    return
  }

  console.log(`[AI Chat Lock] Initialized for: ${adapter.siteName}`)

  const runApplyLocks = () => {
    if (!contextValid) return
    applyLocks(adapter).catch((err) => {
      if (String(err).includes('Extension context')) {
        contextValid = false
        console.warn('[AI Chat Lock] Extension was reloaded — please refresh the page.')
      } else {
        console.error('[AI Chat Lock] Error applying locks:', err)
      }
    })
  }

  // Watch the sidebar for DOM mutations
  createSidebarObserver(adapter, runApplyLocks)

  // Also re-apply whenever chrome.storage changes (e.g. lock toggled from popup)
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (!contextValid || area !== 'local') return
      const hasLockChange = Object.keys(changes).some(
        (k) => k.startsWith('locked:') || k === 'settings'
      )
      if (hasLockChange) {
        // Small delay so the storage write fully commits first
        setTimeout(runApplyLocks, 50)
      }
    })
  } catch {
    // chrome APIs unavailable — ignore
  }
}

// Execute when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
