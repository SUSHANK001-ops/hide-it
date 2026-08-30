/**
 * lock-engine.ts — Site-agnostic orchestrator.
 *
 * Password flow:
 *   - FIRST TIME: When user clicks lock with no master password set,
 *     prompts ONCE to create a password. Saves it permanently.
 *   - LOCKING: If password already exists, locks IMMEDIATELY (zero prompts).
 *   - UNLOCKING: ALWAYS prompts for password (every single time).
 *   - When a chat is locked while it's currently open, navigates away.
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

/**
 * Mask a chat title: first letter of each word visible, rest replaced with *.
 * Example: "Hello World" → "H**** W****"
 */
export function maskTitle(title: string): string {
  if (!title || title.trim().length === 0) return '🔒 Locked chat'
  return title
    .split(' ')
    .map((word) => {
      if (word.length === 0) return word
      return word[0] + '*'.repeat(Math.max(0, word.length - 1))
    })
    .join(' ')
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
      // Get the stored real title to build the masked label
      const entry = await getLockedChat(adapter.siteId, chatId)
      const maskedLabel = entry ? maskTitle(entry.title) : '🔒 *** ****'

      // Continuously enforce masked title
      adapter.hideChatTitle(row, maskedLabel)

      // Intercept navigation
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

    // Re-inject button so the isLocked state is always current
    adapter.injectLockButton(row, chatId, isLocked, () => {
      // Re-query isLocked at click time so it's always fresh
      handleLockToggle(adapter, row, chatId, isLocked)
    })
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

  // Always require password to open a locked chat
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
 * Navigate away from the current chat to the site's home/new-chat page.
 */
function navigateAway(adapter: SiteAdapter, chatId: string): void {
  const currentPath = window.location.pathname + window.location.search
  const currentHref = window.location.href

  const isViewingLockedChat = (
    currentPath.includes(chatId) ||
    currentHref.includes(chatId)
  )

  if (!isViewingLockedChat) return

  const homeUrls: Record<string, string> = {
    chatgpt: 'https://chatgpt.com/',
    claude: 'https://claude.ai/new',
    gemini: 'https://gemini.google.com/app',
    deepseek: 'https://chat.deepseek.com/',
    qwen: 'https://chat.qwen.ai/',
    kimi: window.location.origin + '/'
  }

  const homeUrl = homeUrls[adapter.siteId] ?? window.location.origin + '/'
  window.location.href = homeUrl
}

/**
 * Handle the lock/unlock toggle button click:
 * - Locking: instant if password exists, else asks to set password once.
 * - Unlocking: ALWAYS asks for password.
 */
async function handleLockToggle(
  adapter: SiteAdapter,
  row: Element,
  chatId: string,
  currentlyLocked: boolean
): Promise<void> {
  if (currentlyLocked) {
    // ── UNLOCKING — Always prompt for password ──
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
          if (entry) {
            adapter.restoreChatTitle(row, entry.title)
          }
          await applyLocks(adapter)
        }
        return valid
      }
    })
  } else {
    // ── LOCKING ──
    const passwordExists = await hasPassword()

    if (!passwordExists) {
      // First time only: set master password then lock
      showPasswordModal({
        mode: 'set',
        async onSubmit(password: string) {
          const hash = await hashPassword(password)
          await setPasswordHash(hash)
          const title = adapter.getChatTitle(row)
          await lockChat({
            siteId: adapter.siteId,
            chatId,
            title,
            lockedAt: Date.now()
          })
          await applyLocks(adapter)
          navigateAway(adapter, chatId)
          return true
        }
      })
      return
    }

    // Password already set: LOCK IMMEDIATELY — no prompt needed
    const title = adapter.getChatTitle(row)
    await lockChat({
      siteId: adapter.siteId,
      chatId,
      title,
      lockedAt: Date.now()
    })
    await applyLocks(adapter)
    navigateAway(adapter, chatId)
  }
}

/** Force dismiss any open modal */
export function relockSession(): void {
  dismissModal()
}

/** Clear injection tracking (call when the sidebar is fully replaced) */
export function resetInjectionState(): void {
  for (const cleanup of interceptCleanups.values()) {
    cleanup()
  }
  interceptCleanups.clear()
}
