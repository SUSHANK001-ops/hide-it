/**
 * Kimi Adapter
 *
 * Targets: kimi.com, kimi.moonshot.cn
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

export const kimiAdapter: SiteAdapter = {
  siteId: 'kimi',
  siteName: 'Kimi',

  matches(hostname: string): boolean {
    return (
      hostname.includes('kimi.com') ||
      hostname.includes('kimi.moonshot.cn')
    )
  },

  getSidebarRoot(): Element | null {
    return (
      document.querySelector('aside') ??
      document.querySelector('nav') ??
      document.querySelector('[class*="sidebar"]') ??
      document.querySelector('[class*="history"]') ??
      document.querySelector('[class*="conversation-list"]') ??
      document.body
    )
  },

  getChatRows(): Element[] {
    const root = this.getSidebarRoot() ?? document

    // Collect candidates
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="/chat/"], a[href*="/chat?"], a[href*="/c/"]'))
    if (links.length > 0) return links

    const items = Array.from(root.querySelectorAll('[data-chat-id], [data-conversation-id], [data-id], [class*="chat-item"], [class*="history-item"], [class*="chatItem"], [class*="historyItem"]'))
    if (items.length > 0) return items

    return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/chat"]'))
  },

  getChatId(row: Element): string | null {
    const href = row.getAttribute('href') ?? row.closest('a')?.getAttribute('href') ?? row.querySelector('a')?.getAttribute('href')
    if (href) {
      const match = href.match(/\/(?:chat|c)\/([a-zA-Z0-9_-]+)/i)
      if (match && match[1] !== 'new') return match[1]

      // Check query param if /chat?id=...
      try {
        const url = new URL(href, window.location.origin)
        const idParam = url.searchParams.get('id') || url.searchParams.get('chatId')
        if (idParam) return idParam
      } catch {
        // Ignore URL parse error
      }
    }

    return (
      row.getAttribute('data-chat-id') ??
      row.getAttribute('data-conversation-id') ??
      row.getAttribute('data-id') ??
      null
    )
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
    injectStandardLockButton(row, chatId, isLocked, onToggle, '8px')
  },

  interceptNavigation(
    row: Element,
    _chatId: string,
    onAttempt: () => void
  ): (() => void) | null {
    return interceptRowEvents(row, onAttempt)
  }
}
