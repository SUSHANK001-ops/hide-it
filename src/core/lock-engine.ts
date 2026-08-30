/**
 * lock-engine.ts — Site-agnostic orchestrator.
 *
 * Password rules:
 *   - LOCKING: Instant if password exists. Only asks for password ONCE (first time ever).
 *   - UNLOCKING: Always asks for password, every time.
 *   - Clicking a locked chat: Always asks for password.
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

/** Tracks intercepted navigation cleanup functions */
const interceptCleanups = new Map<string, () => void>()

/**
 * Mask a chat title: show first letter of each word, replace rest with *.
 * "Hello World" → "H**** W****"
 */
export function maskTitle(title: string): string {
  if (!title || !title.trim()) return '🔒 L****'
  return title
    .split(' ')
    .filter((w) => w.length > 0)
    .map((word) => word[0] + '*'.repeat(Math.max(0, word.length - 1)))
    .join(' ')
}

/** Guard against concurrent applyLocks calls */
let applyingLocks = false

/**
 * Apply lock state to all visible chat rows.
 */
export async function applyLocks(adapter: SiteAdapter): Promise<void> {
  if (applyingLocks) return
  applyingLocks = true

  try {
    const lockedIds = await getLockedChatIds(adapter.siteId)
    const rows = adapter.getChatRows()

    for (const row of rows) {
      const chatId = adapter.getChatId(row)
      if (!chatId) continue

      const isLocked = lockedIds.has(chatId)
      const rowKey = `${adapter.siteId}:${chatId}`

      if (isLocked) {
        // Fetch the stored original title for masking
        const entry = await getLockedChat(adapter.siteId, chatId)
        const maskedLabel = entry ? maskTitle(entry.title) : '🔒 L****'

        // Always enforce the masked title (in case React re-rendered the row)
        adapter.hideChatTitle(row, maskedLabel)

        // Set up navigation interception (idempotent)
        if (!interceptCleanups.has(rowKey)) {
          const cleanup = adapter.interceptNavigation(row, chatId, () => {
            handleLockedChatClick(adapter, row, chatId)
          })
          if (cleanup) interceptCleanups.set(rowKey, cleanup)
        }
      } else {
        // Remove stale navigation interception
        const cleanup = interceptCleanups.get(rowKey)
        if (cleanup) {
          cleanup()
          interceptCleanups.delete(rowKey)
        }
      }

      // Re-read lock state at click time to avoid stale closure bugs
      adapter.injectLockButton(row, chatId, isLocked, () => {
        handleLockToggleFromStorage(adapter, row, chatId)
      })
    }
  } finally {
    applyingLocks = false
  }
}

/**
 * Re-read lock state from storage at click time, then delegate to the
 * correct lock or unlock flow. This prevents stale-closure bugs where
 * the injected isLocked value no longer matches reality.
 */
async function handleLockToggleFromStorage(
  adapter: SiteAdapter,
  row: Element,
  chatId: string
): Promise<void> {
  const lockedIds = await getLockedChatIds(adapter.siteId)
  const currentlyLocked = lockedIds.has(chatId)
  handleLockToggle(adapter, row, chatId, currentlyLocked)
}

/**
 * Handle clicking a locked chat row — always prompts for password.
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

/** Programmatically click/navigate the row link */
function navigateRow(row: Element): void {
  const link = (row.tagName === 'A' ? row : row.querySelector('a')) as HTMLAnchorElement | null
  if (link?.href) {
    link.click()
  } else {
    ;(row as HTMLElement).click()
  }
}

/**
 * If the user is currently viewing the chat being locked, navigate away.
 */
function navigateAway(adapter: SiteAdapter, chatId: string): void {
  const path = window.location.pathname + window.location.search
  const href = window.location.href

  if (!path.includes(chatId) && !href.includes(chatId)) return

  const homeUrls: Record<string, string> = {
    chatgpt: 'https://chatgpt.com/',
    claude: 'https://claude.ai/new',
    gemini: 'https://gemini.google.com/app',
    deepseek: 'https://chat.deepseek.com/',
    qwen: 'https://chat.qwen.ai/',
    kimi: window.location.origin + '/'
  }

  window.location.href = homeUrls[adapter.siteId] ?? window.location.origin + '/'
}

/**
 * Handle the lock/unlock toggle:
 * - LOCKING: Instant (no prompt) if password is already set.
 *            Only asks to SET password on the very first lock ever.
 * - UNLOCKING: Always asks for password.
 */
async function handleLockToggle(
  adapter: SiteAdapter,
  row: Element,
  chatId: string,
  currentlyLocked: boolean
): Promise<void> {
  if (currentlyLocked) {
    // ── UNLOCKING — always verify password ──
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
      // First ever lock: ask user to create master password, then lock
      showPasswordModal({
        mode: 'set',
        async onSubmit(password: string) {
          const hash = await hashPassword(password)
          await setPasswordHash(hash)

          // Read the REAL title before we touch the DOM
          const title = adapter.getChatTitle(row)
          await lockChat({
            siteId: adapter.siteId,
            chatId,
            title: title || 'Untitled chat',
            lockedAt: Date.now()
          })
          await applyLocks(adapter)
          navigateAway(adapter, chatId)
          return true
        }
      })
      return
    }

    // Password already set — LOCK IMMEDIATELY, no prompt
    // Read the REAL title BEFORE hideChatTitle mutates the DOM
    const title = adapter.getChatTitle(row)
    await lockChat({
      siteId: adapter.siteId,
      chatId,
      title: title || 'Untitled chat',
      lockedAt: Date.now()
    })
    await applyLocks(adapter)
    navigateAway(adapter, chatId)
  }
}

/** Dismiss any open modal (called on idle timeout) */
export function relockSession(): void {
  dismissModal()
}

/** Clear all injection tracking */
export function resetInjectionState(): void {
  for (const cleanup of interceptCleanups.values()) cleanup()
  interceptCleanups.clear()
}
