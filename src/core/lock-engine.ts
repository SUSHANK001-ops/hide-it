/**
 * lock-engine.ts — Site-agnostic orchestrator.
 *
 * Given any SiteAdapter, this engine:
 *  1. Scans chat rows and applies lock state (hide titles, inject buttons)
 *  2. Manages password prompt flow (first-run set / verify to unlock)
 *  3. Intercepts navigation on locked chats
 *
 * Contains ZERO site-specific selectors or DOM logic.
 * The only DOM it touches is the password modal (from modal.ts).
 */

import type { SiteAdapter } from './types'
import {
  lockChat,
  unlockChat,
  getLockedChatIds,
  getLockedChat,
  hasPassword,
  setPasswordHash,
  getPasswordHash
} from './storage'
import { hashPassword, verifyPassword } from './crypto'
import { showPasswordModal, dismissModal } from './modal'

/** Tracks which chats have had their navigation intercepted (cleanup fns) */
const interceptCleanups = new Map<string, () => void>()

/** Tracks which rows already have lock buttons injected */
const injectedButtons = new Set<string>()

/** Whether the user has authenticated this session */
let sessionUnlocked = false

/** Listen for session lock/unlock messages from background */
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SESSION_LOCKED') {
      sessionUnlocked = false
    }
  })
}

/** Check if user has authenticated this session */
export function isSessionUnlocked(): boolean {
  return sessionUnlocked
}

/**
 * Apply lock state to all visible chat rows.
 * Called by the MutationObserver callback on every sidebar change.
 */
export async function applyLocks(adapter: SiteAdapter): Promise<void> {
  const lockedIds = await getLockedChatIds(adapter.siteId)
  const rows = adapter.getChatRows()

  for (const row of rows) {
    const chatId = adapter.getChatId(row)
    if (!chatId) continue

    const isLocked = lockedIds.has(chatId)
    const rowKey = `${adapter.siteId}:${chatId}`

    if (isLocked) {
      // Continuously enforce masked title
      adapter.hideChatTitle(row, '🔒 Locked chat')

      // Intercept navigation and interactions
      if (!interceptCleanups.has(rowKey)) {
        const cleanup = adapter.interceptNavigation(row, chatId, () => {
          handleLockedChatClick(adapter, row, chatId)
        })
        if (cleanup) {
          interceptCleanups.set(rowKey, cleanup)
        }
      }
    } else {
      // Clean up any navigation intercept
      const cleanup = interceptCleanups.get(rowKey)
      if (cleanup) {
        cleanup()
        interceptCleanups.delete(rowKey)
      }
    }

    // Inject/refresh lock/unlock toggle button
    adapter.injectLockButton(row, chatId, isLocked, () => {
      handleLockToggle(adapter, row, chatId, isLocked)
    })
    injectedButtons.add(rowKey)
  }
}

/**
 * Handle clicking a locked chat — prompt for password and navigate upon success
 */
async function handleLockedChatClick(
  adapter: SiteAdapter,
  row: Element,
  chatId: string
): Promise<void> {
  if (sessionUnlocked) {
    // Already authenticated this session — allow navigation
    navigateRow(row)
    return
  }

  const passwordExists = await hasPassword()

  if (!passwordExists) {
    showPasswordModal({
      mode: 'set',
      async onSubmit(password: string) {
        const hash = await hashPassword(password)
        await setPasswordHash(hash)
        sessionUnlocked = true
        notifySessionState(true)
        navigateRow(row)
        return true
      }
    })
    return
  }

  showPasswordModal({
    mode: 'verify',
    async onSubmit(password: string) {
      const storedHash = await getPasswordHash()
      if (!storedHash) return false
      const valid = await verifyPassword(password, storedHash)
      if (valid) {
        sessionUnlocked = true
        notifySessionState(true)
        setTimeout(() => navigateRow(row), 100)
      }
      return valid
    }
  })
}

/**
 * Trigger navigation on an unlocked row
 */
function navigateRow(row: Element): void {
  const link = (row.tagName === 'A' ? row : row.querySelector('a')) as HTMLAnchorElement | null
  if (link && link.href) {
    link.click()
  } else if ((row as HTMLElement).click) {
    (row as HTMLElement).click()
  }
}

/**
 * Handle the lock/unlock toggle button click
 */
async function handleLockToggle(
  adapter: SiteAdapter,
  row: Element,
  chatId: string,
  currentlyLocked: boolean
): Promise<void> {
  if (currentlyLocked) {
    // Unlocking — need password
    if (!sessionUnlocked) {
      const passwordExists = await hasPassword()
      if (!passwordExists) return

      showPasswordModal({
        mode: 'verify',
        async onSubmit(password: string) {
          const storedHash = await getPasswordHash()
          if (!storedHash) return false
          const valid = await verifyPassword(password, storedHash)
          if (valid) {
            sessionUnlocked = true
            notifySessionState(true)
            const entry = await getLockedChat(adapter.siteId, chatId)
            await unlockChat(adapter.siteId, chatId)
            const cleanup = interceptCleanups.get(`${adapter.siteId}:${chatId}`)
            if (cleanup) {
              cleanup()
              interceptCleanups.delete(`${adapter.siteId}:${chatId}`)
            }
            injectedButtons.delete(`${adapter.siteId}:${chatId}`)
            if (entry) {
              adapter.restoreChatTitle(row, entry.title)
            }
            await applyLocks(adapter)
          }
          return valid
        }
      })
      return
    }

    // Already authenticated — unlock directly
    const entry = await getLockedChat(adapter.siteId, chatId)
    await unlockChat(adapter.siteId, chatId)
    const cleanup = interceptCleanups.get(`${adapter.siteId}:${chatId}`)
    if (cleanup) {
      cleanup()
      interceptCleanups.delete(`${adapter.siteId}:${chatId}`)
    }
    injectedButtons.delete(`${adapter.siteId}:${chatId}`)
    if (entry) {
      adapter.restoreChatTitle(row, entry.title)
    }
    await applyLocks(adapter)
  } else {
    // Locking — need password set first
    const passwordExists = await hasPassword()

    if (!passwordExists) {
      showPasswordModal({
        mode: 'set',
        async onSubmit(password: string) {
          const hash = await hashPassword(password)
          await setPasswordHash(hash)
          sessionUnlocked = true
          notifySessionState(true)
          const title = adapter.getChatTitle(row)
          await lockChat({
            siteId: adapter.siteId,
            chatId,
            title,
            lockedAt: Date.now()
          })
          injectedButtons.delete(`${adapter.siteId}:${chatId}`)
          await applyLocks(adapter)
          return true
        }
      })
      return
    }

    // If not authenticated this session, require password first
    if (!sessionUnlocked) {
      showPasswordModal({
        mode: 'verify',
        async onSubmit(password: string) {
          const storedHash = await getPasswordHash()
          if (!storedHash) return false
          const valid = await verifyPassword(password, storedHash)
          if (valid) {
            sessionUnlocked = true
            notifySessionState(true)
            const title = adapter.getChatTitle(row)
            await lockChat({
              siteId: adapter.siteId,
              chatId,
              title,
              lockedAt: Date.now()
            })
            injectedButtons.delete(`${adapter.siteId}:${chatId}`)
            await applyLocks(adapter)
          }
          return valid
        }
      })
      return
    }

    // Authenticated — lock directly
    const title = adapter.getChatTitle(row)
    await lockChat({
      siteId: adapter.siteId,
      chatId,
      title,
      lockedAt: Date.now()
    })
    injectedButtons.delete(`${adapter.siteId}:${chatId}`)
    await applyLocks(adapter)
  }
}

/** Notify background of session state change */
function notifySessionState(unlocked: boolean): void {
  try {
    chrome.runtime.sendMessage({
      type: unlocked ? 'SESSION_UNLOCKED' : 'SESSION_LOCKED'
    })
  } catch {
    // Extension context may be invalidated
  }
}

/**
 * Force re-lock the session (called from background on idle timeout)
 */
export function relockSession(): void {
  sessionUnlocked = false
  dismissModal()
}

/**
 * Clear injection tracking (call when the sidebar is fully replaced)
 */
export function resetInjectionState(): void {
  injectedButtons.clear()
  for (const cleanup of interceptCleanups.values()) {
    cleanup()
  }
  interceptCleanups.clear()
}
