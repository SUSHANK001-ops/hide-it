/**
 * DeepSeek Adapter
 *
 * Targets: chat.deepseek.com
 *
 * DeepSeek uses a sidebar with chat links. The sidebar root is typically
 * an element with class containing "sidebar". Chat rows are `a` elements
 * whose href matches `/a/<chat-id>` (NOT `/chat/` — that's the main page).
 *
 * CRITICAL: DeepSeek's sidebar may contain many `a` elements that are NOT
 * chat rows (e.g. settings links, branding links, etc.). We MUST be strict
 * about which elements are treated as chat rows to avoid false positives.
 */

import type { SiteAdapter } from '~/core/types'
import {
  findBestTitleElement,
  maskChatTitle,
  unmaskChatTitle,
  interceptRowEvents,
  injectStandardLockButton
} from '~/core/dom-utils'

const originalTitles = new WeakMap<Element, string>()

/** UUID pattern for chat IDs */
const DEEPSEEK_CHAT_ID_RE = /\/(?:a|chat(?:\/s)?)\/([a-f0-9]{8,}[-]?[a-f0-9-]*)/i

export const deepseekAdapter: SiteAdapter = {
  siteId: 'deepseek',
  siteName: 'DeepSeek',

  matches(hostname: string): boolean {
    return hostname.includes('chat.deepseek.com')
  },

  getSidebarRoot(): Element | null {
    // DeepSeek uses a specific sidebar container; avoid body fallback
    // to prevent matching the entire page
    return (
      document.querySelector('.ds-sidebar') ??
      document.querySelector('[class*="sidebar"][class*="container"]') ??
      document.querySelector('[class*="sidebar"][class*="list"]') ??
      document.querySelector('aside') ??
      document.querySelector('nav[role="navigation"]') ??
      null
    )
  },

  getChatRows(): Element[] {
    const root = this.getSidebarRoot()
    if (!root) return []

    // Collect all anchor elements that have an href with a valid chat ID
    const allLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))
    
    return allLinks.filter((a) => {
      const href = a.getAttribute('href') ?? ''
      // Must match a valid UUID-based chat path
      const match = href.match(DEEPSEEK_CHAT_ID_RE)
      if (!match) return false
      // Exclude links that are clearly not chat rows (too short text, no text, etc.)
      const text = a.textContent?.trim()
      return text && text.length > 0
    })
  },

  getChatId(row: Element): string | null {
    const href = row.getAttribute('href') ?? row.closest('a')?.getAttribute('href')
    if (!href) return null
    const match = href.match(DEEPSEEK_CHAT_ID_RE)
    return match?.[1] ?? null
  },

  getChatTitle(row: Element): string {
    const saved = originalTitles.get(row)
    if (saved) return saved
    const titleEl = findBestTitleElement(row)
    return titleEl?.textContent?.trim() ?? 'Untitled chat'
  },

  hideChatTitle(row: Element, lockedLabel: string): void {
    maskChatTitle(row, lockedLabel, originalTitles)
  },

  restoreChatTitle(row: Element, originalTitle: string): void {
    unmaskChatTitle(row, originalTitle, originalTitles)
  },

  injectLockButton(
    row: Element,
    chatId: string,
    isLocked: boolean,
    onToggle: () => void
  ): void {
    injectStandardLockButton(row, chatId, isLocked, onToggle, '30px')
  },

  interceptNavigation(
    row: Element,
    _chatId: string,
    onAttempt: () => void
  ): (() => void) | null {
    return interceptRowEvents(row, onAttempt)
  }
}
