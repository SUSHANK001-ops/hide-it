/**
 * observer.ts — Generic MutationObserver factory.
 *
 * Takes any SiteAdapter and a callback, observes the sidebar for mutations,
 * and re-invokes the callback whenever the DOM changes.
 *
 * Contains ZERO site-specific selectors or DOM logic.
 */

import type { SiteAdapter } from './types'

export interface ObserverHandle {
  /** Stop observing */
  disconnect(): void
  /** Force a re-check (e.g. after manual unlock) */
  forceUpdate(): void
}

/**
 * Create and start a MutationObserver that watches the adapter's sidebar root.
 *
 * @param adapter - The site adapter providing getSidebarRoot()
 * @param onMutation - Callback to invoke on every sidebar mutation (debounced)
 * @returns A handle to disconnect or force-update
 */
export function createSidebarObserver(
  adapter: SiteAdapter,
  onMutation: () => void
): ObserverHandle {
  let observer: MutationObserver | null = null
  let bodyObserver: MutationObserver | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let currentRoot: Element | null = null
  let destroyed = false

  /** Debounced callback — coalesces rapid mutations into one call */
  const debouncedCallback = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      if (!destroyed) onMutation()
    }, 16) // ~1 animation frame
  }

  /** Attach the observer to the sidebar root */
  const attach = () => {
    if (destroyed) return

    const root = adapter.getSidebarRoot()

    if (!root) {
      // Sidebar not in DOM yet — retry
      retryTimer = setTimeout(attach, 500)
      return
    }

    // If we're already observing this exact element, skip
    if (root === currentRoot && observer) return

    // Disconnect previous observers
    observer?.disconnect()
    bodyObserver?.disconnect()
    currentRoot = root

    observer = new MutationObserver((_mutations) => {
      // Check if the root has been replaced (React re-mount)
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
      attributeFilter: ['class', 'style', 'aria-label', 'href']
    })

    // Also observe the body for complete sidebar replacements
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

    // Trigger initial application
    debouncedCallback()
  }

  // Start
  attach()

  return {
    disconnect() {
      destroyed = true
      observer?.disconnect()
      bodyObserver?.disconnect()
      if (debounceTimer) clearTimeout(debounceTimer)
      if (retryTimer) clearTimeout(retryTimer)
    },
    forceUpdate() {
      if (!destroyed) onMutation()
    }
  }
}
