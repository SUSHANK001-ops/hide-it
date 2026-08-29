/**
 * observer.ts — Generic MutationObserver factory.
 *
 * Takes any SiteAdapter and a callback, observes the sidebar for mutations,
 * and re-invokes the callback whenever the DOM changes or route changes.
 */

import type { SiteAdapter } from './types'

export interface ObserverHandle {
  /** Stop observing */
  disconnect(): void
  /** Force a re-check */
  forceUpdate(): void
}

/**
 * Create and start a MutationObserver that watches the adapter's sidebar root.
 */
export function createSidebarObserver(
  adapter: SiteAdapter,
  onMutation: () => void
): ObserverHandle {
  let observer: MutationObserver | null = null
  let bodyObserver: MutationObserver | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let periodicInterval: ReturnType<typeof setInterval> | null = null
  let currentRoot: Element | null = null
  let lastUrl = window.location.href
  let destroyed = false

  /** Debounced callback — coalesces rapid mutations into one call */
  const debouncedCallback = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      if (!destroyed) onMutation()
    }, 16)
  }

  /** Attach the observer to the sidebar root */
  const attach = () => {
    if (destroyed) return

    const root = adapter.getSidebarRoot() ?? document.body

    // If we're already observing this exact element, skip
    if (root === currentRoot && observer) return

    // Disconnect previous observers
    observer?.disconnect()
    bodyObserver?.disconnect()
    currentRoot = root

    observer = new MutationObserver((_mutations) => {
      if (!document.contains(currentRoot)) {
        observer?.disconnect()
        currentRoot = null
        retryTimer = setTimeout(attach, 200)
        return
      }
      debouncedCallback()
    })

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-label', 'href', 'title']
    })

    // Also observe the body for complete sidebar replacements
    if (root !== document.body) {
      bodyObserver = new MutationObserver(() => {
        if (currentRoot && !document.contains(currentRoot)) {
          observer?.disconnect()
          bodyObserver?.disconnect()
          currentRoot = null
          attach()
        }
      })

      bodyObserver.observe(document.body, {
        childList: true,
        subtree: false
      })
    }

    // Trigger initial application immediately
    debouncedCallback()
  }

  // Handle SPA history navigation
  const onPopState = () => {
    debouncedCallback()
  }
  window.addEventListener('popstate', onPopState)

  // Periodic heartbeat backup (every 1s) to handle lazy loading & URL changes
  periodicInterval = setInterval(() => {
    if (destroyed) return
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      debouncedCallback()
    } else {
      debouncedCallback()
    }
  }, 1000)

  // Start
  attach()

  return {
    disconnect() {
      destroyed = true
      observer?.disconnect()
      bodyObserver?.disconnect()
      window.removeEventListener('popstate', onPopState)
      if (debounceTimer) clearTimeout(debounceTimer)
      if (retryTimer) clearTimeout(retryTimer)
      if (periodicInterval) clearInterval(periodicInterval)
    },
    forceUpdate() {
      if (!destroyed) onMutation()
    }
  }
}
