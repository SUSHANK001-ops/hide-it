/**
 * Qwen Adapter
 *
 * Targets: chat.qwen.ai, qwen.ai
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

export const qwenAdapter: SiteAdapter = {
  siteId: 'qwen',
  siteName: 'Qwen',

  matches(hostname: string): boolean {
    return hostname.includes('chat.qwen.ai') || hostname.includes('qwen.ai')
  },

  getSidebarRoot(): Element | null {
    return (
      document.querySelector('[class*="sidebar"]') ??
      document.querySelector('[class*="history"]') ??
      document.querySelector('aside') ??
      document.querySelector('nav') ??
      document.body
    )
  },

  getChatRows(): Element[] {
    const root = this.getSidebarRoot() ?? document

    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="/chat/"], a[href*="/c/"]'))
    if (links.length > 0) return links

    const items = Array.from(root.querySelectorAll('[class*="conversation"], [class*="chat-item"], [data-session-id]'))
    if (items.length > 0) return items

    return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/chat"]'))
  },

  getChatId(row: Element): string | null {
    const href = row.getAttribute('href') ?? row.closest('a')?.getAttribute('href')
    if (href) {
      const match = href.match(/\/(?:chat|c)\/([a-zA-Z0-9_-]+)/i)
      if (match && match[1] !== 'new') return match[1]
    }
    return row.getAttribute('data-session-id') ?? row.getAttribute('data-chat-id') ?? null
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
