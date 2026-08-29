/**
 * Gemini Adapter
 *
 * Targets: gemini.google.com
 *
 * DOM Selectors (as of Aug 2026 — likely to change):
 *   Sidebar root: Side navigation / recent conversations panel
 *   Chat rows:    Links/buttons in the conversation list
 *   Chat ID:      Extracted from URL or data attributes
 *
 * Gemini may use Angular Material / Web Components.
 * If Gemini changes its UI, ONLY this file needs updating.
 */

import type { SiteAdapter } from '~/core/types'

const LOCKED_ATTR = 'data-acl-locked'
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
      null
    )
  },

  getChatRows(): Element[] {
    const root = this.getSidebarRoot()
    if (!root) return []

    const links = root.querySelectorAll('a[href*="/app/"], a[href*="/chat/"]')
    if (links.length > 0) return Array.from(links)

    const items = root.querySelectorAll('[role="listitem"] a, [role="option"], button[data-conversation-id]')
    return Array.from(items)
  },

  getChatId(row: Element): string | null {
    const href = row.getAttribute('href')
    if (href) {
      const match = href.match(/\/(?:app|chat)\/([a-f0-9]+)/i)
      if (match) return match[1]
    }

    const dataId = row.getAttribute('data-conversation-id')
    if (dataId) return dataId

    const link = row.closest('a') || row.querySelector('a')
    if (link) {
      const linkHref = link.getAttribute('href')
      if (linkHref) {
        const parts = linkHref.split('/').filter(Boolean)
        return parts[parts.length - 1] ?? null
      }
    }

    return null
  },

  getChatTitle(row: Element): string {
    const saved = originalTitles.get(row)
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
        originalTitles.set(row, originalTitle)
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
    originalTitles.delete(row)
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
      opacity: ${isLocked ? '0.6' : '0'};
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
    if (getComputedStyle(rowEl).position === 'static') {
      rowEl.style.position = 'relative'
    }

    if (!rowEl.hasAttribute('data-acl-hover-bound')) {
      rowEl.setAttribute('data-acl-hover-bound', 'true')
      rowEl.addEventListener('mouseenter', () => {
        const b = rowEl.querySelector('[data-acl-btn]') as HTMLElement | null
        if (b) b.style.opacity = '1'
      })
      rowEl.addEventListener('mouseleave', () => {
        const b = rowEl.querySelector('[data-acl-btn]') as HTMLElement | null
        if (b) {
          const isL = rowEl.getAttribute(LOCKED_ATTR) === 'true'
          b.style.opacity = isL ? '0.6' : '0'
        }
      })
    }

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
  const candidates = row.querySelectorAll('div, span, p, mat-label')
  for (const el of candidates) {
    if (el.querySelector('button') || el.querySelector('svg') || el.querySelector('mat-icon')) continue
    if (el.getAttribute('data-acl-btn') !== null) continue
    const text = el.textContent?.trim()
    if (text && text.length > 0 && text.length < 200 && el.childElementCount <= 1) {
      return el
    }
  }
  return row
}
