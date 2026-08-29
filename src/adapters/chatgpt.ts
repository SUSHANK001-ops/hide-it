/**
 * ChatGPT Adapter
 *
 * Targets: chatgpt.com, chat.openai.com
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

export const chatgptAdapter: SiteAdapter = {
  siteId: 'chatgpt',
  siteName: 'ChatGPT',

  matches(hostname: string): boolean {
    return (
      hostname.includes('chatgpt.com') ||
      hostname.includes('chat.openai.com')
    )
  },

  getSidebarRoot(): Element | null {
    return (
      document.querySelector('nav[aria-label="Chat history"]') ??
      document.querySelector('nav') ??
      document.querySelector('aside') ??
      document.body
    )
  },

  getChatRows(): Element[] {
    const root = this.getSidebarRoot() ?? document
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="/c/"], a[href*="/g/"]'))
    return links.filter((a) => {
      const href = a.getAttribute('href') ?? ''
      return href.includes('/c/')
    })
  },

  getChatId(row: Element): string | null {
    const href = row.getAttribute('href') ?? row.closest('a')?.getAttribute('href')
    if (!href) return null

    const match = href.match(/\/c\/([a-zA-Z0-9-]+)/i)
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
    // ChatGPT sidebar has action dots on hover on the far right, position at 34px
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
