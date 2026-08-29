/**
 * Gemini Adapter
 *
 * Targets: gemini.google.com
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

export const geminiAdapter: SiteAdapter = {
  siteId: 'gemini',
  siteName: 'Gemini',

  matches(hostname: string): boolean {
    return hostname.includes('gemini.google.com')
  },

  getSidebarRoot(): Element | null {
    return (
      document.querySelector('div[role="navigation"]') ??
      document.querySelector('mat-sidenav') ??
      document.querySelector('[aria-label*="Recent"]') ??
      document.querySelector('[aria-label*="conversation"]') ??
      document.querySelector('aside') ??
      document.querySelector('nav') ??
      document.body
    )
  },

  getChatRows(): Element[] {
    const root = this.getSidebarRoot() ?? document

    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"], a[href*="/chat/"]'))
    if (links.length > 0) return links

    const items = Array.from(root.querySelectorAll('[role="listitem"] a, [role="option"], button[data-conversation-id]'))
    if (items.length > 0) return items

    return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"]'))
  },

  getChatId(row: Element): string | null {
    const href = row.getAttribute('href') ?? row.closest('a')?.getAttribute('href')
    if (href) {
      const match = href.match(/\/(?:app|chat)\/([a-zA-Z0-9_-]+)/i)
      if (match) return match[1]
    }

    const dataId = row.getAttribute('data-conversation-id')
    if (dataId) return dataId

    return null
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
    injectStandardLockButton(row, chatId, isLocked, onToggle, '32px')
  },

  interceptNavigation(
    row: Element,
    _chatId: string,
    onAttempt: () => void
  ): (() => void) | null {
    return interceptRowEvents(row, onAttempt)
  }
}
