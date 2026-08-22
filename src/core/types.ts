/**
 * SiteAdapter — the contract every site adapter MUST implement.
 *
 * ALL site-specific DOM selectors and logic are contained within adapters.
 * The core engine (lock-engine.ts, observer.ts, storage.ts) never touches
 * site-specific DOM — only this interface bridges them.
 */

export interface SiteAdapter {
  /** Unique site identifier, e.g. "chatgpt", "claude" */
  readonly siteId: string

  /** Human-readable site name for the popup vault view */
  readonly siteName: string

  /** Return true if this adapter handles the given hostname */
  matches(hostname: string): boolean

  /** Return the scrollable sidebar container that holds chat rows, or null */
  getSidebarRoot(): Element | null

  /** Return all currently-visible chat row elements in the sidebar */
  getChatRows(): Element[]

  /** Extract the unique chat ID from a sidebar row element, or null */
  getChatId(row: Element): string | null

  /** Extract the visible title text from a sidebar row element */
  getChatTitle(row: Element): string

  /**
   * Replace the visible title of a locked chat row.
   * MUST ensure the real title is not present anywhere in the DOM
   * (not just visually hidden — actually removed from text nodes).
   */
  hideChatTitle(row: Element, lockedLabel: string): void

  /**
   * Restore the original title of an unlocked chat row.
   */
  restoreChatTitle(row: Element, originalTitle: string): void

  /**
   * Inject a lock/unlock toggle button into or near the chat row.
   * The button should match the site's visual style as closely as possible.
   * @param isLocked - current lock state of this chat
   * @param onToggle - callback to invoke when the button is clicked
   */
  injectLockButton(
    row: Element,
    chatId: string,
    isLocked: boolean,
    onToggle: () => void
  ): void

  /**
   * Attach a click interceptor to a locked chat row that prevents navigation.
   * Returns a cleanup function to remove the interceptor, or null.
   */
  interceptNavigation(
    row: Element,
    chatId: string,
    onAttempt: () => void
  ): (() => void) | null
}

/** Stored data for a single locked chat */
export interface LockedChatEntry {
  siteId: string
  chatId: string
  title: string
  lockedAt: number
}

/** Extension-wide settings */
export interface ExtensionSettings {
  autoRelockEnabled: boolean
  autoRelockMinutes: number
}

/** Messages between content script ↔ background ↔ popup */
export type ExtensionMessage =
  | { type: 'GET_LOCKED_CHATS' }
  | { type: 'LOCKED_CHATS_RESPONSE'; chats: LockedChatEntry[] }
  | { type: 'LOCK_CHAT'; siteId: string; chatId: string; title: string }
  | { type: 'UNLOCK_CHAT'; siteId: string; chatId: string }
  | { type: 'VERIFY_PASSWORD'; password: string }
  | { type: 'PASSWORD_RESULT'; valid: boolean }
  | { type: 'SET_PASSWORD'; password: string }
  | { type: 'PASSWORD_SET'; success: boolean }
  | { type: 'HAS_PASSWORD' }
  | { type: 'HAS_PASSWORD_RESULT'; exists: boolean }
  | { type: 'GET_SETTINGS' }
  | { type: 'SETTINGS_RESPONSE'; settings: ExtensionSettings }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<ExtensionSettings> }
  | { type: 'SESSION_UNLOCKED' }
  | { type: 'SESSION_LOCKED' }
  | { type: 'IS_SESSION_UNLOCKED' }
  | { type: 'SESSION_STATUS'; unlocked: boolean }
  | { type: 'RELOCK_ALL' }
