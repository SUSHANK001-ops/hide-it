/**
 * lock-engine.ts — Site-agnostic orchestrator.
 *
 * Given any SiteAdapter, this engine:
 *  1. Scans chat rows and applies lock state (hide titles, inject buttons)
 *  2. Manages password prompt flow:
 *     - If no password exists yet: prompts ONCE to create password before locking.
 *     - If password exists: locks immediately with 0 prompts.
 *     - When unlocking (clicking chat row or toggle button): ALWAYS prompts for password.
 *  3. Intercepts navigation on locked chats.
 *
 * Contains ZERO site-specific selectors or DOM logic.
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
 * Handle clicking a locked chat — ALWAYS prompts for password to view
 */
async function handleLockedChatClick(
  adapter: SiteAdapter,
  row: Element,
  chatId: string
): Promise<void> {
  const passwordExists = await hasPassword()

  if (!passwordExists) {
    // If somehow no password was set, prompt to create one
    showPasswordModal({
      mode: 'set',
      async onSubmit(password: string) {
        const hash = await hashPassword(password)
        await setPasswordHash(hash)
        navigateRow(row)
        return true
      }
    })
    return
  }

  // Always require password to unlock and open chat
  showPasswordModal({
    mode: 'verify',
    async onSubmit(password: string) {
      const storedHash = await getPasswordHash()
      if (!storedHash) return false
      const valid = await verifyPassword(password, storedHash)
      if (valid) {
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
 * Handle the lock/unlock toggle button click:
 * - When locking: if password is set, locks IMMEDIATELY (no prompt). If not set, asks to create password ONCE.
 * - When unlocking: ALWAYS asks for password to unlock.
 */
async function handleLockToggle(
  adapter: SiteAdapter,
  row: Element,
  chatId: string,
  currentlyLocked: boolean
): Promise<void> {
  if (currentlyLocked) {
    // UNLOCKING — Always prompt for password
    const passwordExists = await hasPassword()
    if (!passwordExists) return

    showPasswordModal({
      mode: 'verify',
      async onSubmit(password: string) {
        const storedHash = await getPasswordHash()
        if (!storedHash) return false
        const valid = await verifyPassword(password, storedHash)
        if (valid) {
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
  } else {
    // LOCKING — Check if password exists
    const passwordExists = await hasPassword()

    if (!passwordExists) {
      // First time only: ask user to set a master password
      showPasswordModal({
        mode: 'set',
        async onSubmit(password: string) {
          const hash = await hashPassword(password)
          await setPasswordHash(hash)
          // Lock the chat immediately
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

    // Password already exists: LOCK IMMEDIATELY without asking for password!
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

/**
 * Force dismiss any open modal
 */
export function relockSession(): void {
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
