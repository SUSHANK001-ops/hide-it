/**
 * DeepSeek Adapter
 *
 * Targets: chat.deepseek.com
 *
 * DOM Selectors (as of Aug 2026 — likely to change):
 *   Sidebar root: Aside or nav panel with conversation history
 *   Chat rows:    Links or list items representing conversations
 *   Chat ID:      Extracted from URL or data attributes
 *
 * If DeepSeek changes its UI, ONLY this file needs updating.
 */

import type { SiteAdapter } from '~src/core/types'

const ORIGINAL_TITLE_ATTR = 'data-acl-original-title'
const LOCKED_ATTR = 'data-acl-locked'

export const deepseekAdapter: SiteAdapter = {
  siteId: 'deepseek',
  siteName: 'DeepSeek',

  matches(hostname: string): boolean {
    return hostname.includes('chat.deepseek.com')
  },

  getSidebarRoot(): Element | null {
    return (
      document.querySelector('[class*="sidebar"]') ??
      document.querySelector('aside') ??
      document.querySelector('nav[role="navigation"]') ??
      document.querySelector('div[role="navigation"]') ??
      // DeepSeek often uses a div as the sidebar container
      document.querySelector('.ds-sidebar') ??
      null
    )
  },

  getChatRows(): Element[] {
    const root = this.getSidebarRoot()
    if (!root) return []

    // DeepSeek chat links typically use /chat/<id> patterns
    const links = root.querySelectorAll('a[href*="/chat/"]')
    if (links.length > 0) return Array.from(links)

    // Fallback: look for clickable conversation items
    const items = root.querySelectorAll('[class*="conversation"], [class*="chat-item"], [data-chat-id]')
    if (items.length > 0) return Array.from(items)

    // Further fallback: links with any structure
    return Array.from(root.querySelectorAll('a[href]')).filter(
      (a) => a.getAttribute('href')?.includes('/chat') ?? false
    )
  },

  getChatId(row: Element): string | null {
    const href = row.getAttribute('href') ?? row.closest('a')?.getAttribute('href')
    if (href) {
      const match = href.match(/\/chat\/([a-zA-Z0-9_-]+)/i)
      if (match) return match[1]
    }
    return row.getAttribute('data-chat-id') ?? null
  },

  getChatTitle(row: Element): string {
    const saved = row.getAttribute(ORIGINAL_TITLE_ATTR)
    if (saved) return saved
    const titleEl = findTitleElement(row)
    return titleEl?.textContent?.trim() ?? 'Untitled chat'
  },

  hideChatTitle(row: Element, lockedLabel: string): void {
    if (row.getAttribute(LOCKED_ATTR) === 'true') return
    const titleEl = findTitleElement(row)
    if (titleEl) {
      const originalTitle = titleEl.textContent?.trim() ?? ''
      if (originalTitle && originalTitle !== lockedLabel) {
        row.setAttribute(ORIGINAL_TITLE_ATTR, originalTitle)
      }
      titleEl.textContent = lockedLabel
    }
    row.setAttribute(LOCKED_ATTR, 'true')
    ;(row as HTMLElement).style.opacity = '0.6'
  },

  restoreChatTitle(row: Element, originalTitle: string): void {
    const titleEl = findTitleElement(row)
    if (titleEl) titleEl.textContent = originalTitle
    row.removeAttribute(LOCKED_ATTR)
    row.removeAttribute(ORIGINAL_TITLE_ATTR)
    ;(row as HTMLElement).style.opacity = ''
  },

  injectLockButton(
    row: Element,
    chatId: string,
    isLocked: boolean,
    onToggle: () => void
  ): void {
    const existing = row.querySelector('[data-acl-btn]')
    if (existing) existing.remove()

    const btn = document.createElement('button')
    btn.setAttribute('data-acl-btn', chatId)
    btn.title = isLocked ? 'Unlock chat' : 'Lock chat'
    btn.textContent = isLocked ? '🔓' : '🔒'
    btn.setAttribute('style', `
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      cursor: pointer;
      font-size: 14px;
      padding: 4px 6px;
      border-radius: 6px;
      opacity: 0;
      transition: opacity 0.15s, background 0.15s;
      z-index: 10;
      line-height: 1;
    `)

    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onToggle()
    })

    const rowEl = row as HTMLElement
    if (getComputedStyle(rowEl).position === 'static') rowEl.style.position = 'relative'

    rowEl.addEventListener('mouseenter', () => { btn.style.opacity = '1' })
    rowEl.addEventListener('mouseleave', () => { btn.style.opacity = isLocked ? '0.6' : '0' })
    if (isLocked) btn.style.opacity = '0.6'

    rowEl.appendChild(btn)
  },

  interceptNavigation(
    row: Element,
    _chatId: string,
    onAttempt: () => void
  ): (() => void) | null {
    const handler = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      onAttempt()
    }
    row.addEventListener('click', handler, true)
    return () => row.removeEventListener('click', handler, true)
  }
}

function findTitleElement(row: Element): Element | null {
  const candidates = row.querySelectorAll('div, span, p')
  for (const el of candidates) {
    if (el.querySelector('button') || el.querySelector('svg')) continue
    if (el.getAttribute('data-acl-btn') !== null) continue
    const text = el.textContent?.trim()
    if (text && text.length > 0 && text.length < 200 && el.childElementCount <= 1) {
      return el
    }
  }
  return row
}
