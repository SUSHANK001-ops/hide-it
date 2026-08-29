/**
 * Claude Adapter
 *
 * Targets: claude.ai
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

export const claudeAdapter: SiteAdapter = {
  siteId: 'claude',
  siteName: 'Claude',

  matches(hostname: string): boolean {
    return hostname.includes('claude.ai')
  },

  getSidebarRoot(): Element | null {
    return (
      document.querySelector('[data-testid="chat-history"]') ??
      document.querySelector('nav[aria-label*="conversation"]') ??
      document.querySelector('nav[aria-label*="chat"]') ??
      document.querySelector('aside nav') ??
      document.querySelector('aside') ??
      document.querySelector('nav') ??
      document.querySelector('[class*="sidebar"]') ??
      document.body
    )
  },

  getChatRows(): Element[] {
    const root = this.getSidebarRoot() ?? document
    // Find all links referencing a chat session
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="/chat/"], a[href^="/chat/"]'))
    
    // Filter out "/chat/new" or other action buttons
    return links.filter((a) => {
      const href = a.getAttribute('href') ?? ''
      const match = href.match(/\/chat\/([a-zA-Z0-9_-]+)/i)
      return match && match[1] !== 'new'
    })
  },

  getChatId(row: Element): string | null {
    const href = row.getAttribute('href') ?? row.closest('a')?.getAttribute('href')
    if (!href) return null
    const match = href.match(/\/chat\/([a-zA-Z0-9_-]+)/i)
    if (match && match[1] !== 'new') {
      return match[1]
    }
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
    // Claude has a 3-dots menu button on the far right (~8px), so position lock button at 36px
    injectStandardLockButton(row, chatId, isLocked, onToggle, '34px')
  },

  interceptNavigation(
    row: Element,
    _chatId: string,
    onAttempt: () => void
  ): (() => void) | null {
    return interceptRowEvents(row, onAttempt)
  }
}
