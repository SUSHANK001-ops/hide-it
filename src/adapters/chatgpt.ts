/**
 * ChatGPT Adapter — Reference implementation.
 *
 * Targets: chatgpt.com, chat.openai.com
 *
 * DOM Selectors (as of Aug 2026 — likely to change):
 *   Sidebar root: nav element containing chat history
 *   Chat rows:    <a> elements with href matching /c/<uuid>
 *   Chat ID:      UUID extracted from href /c/<uuid>
 *   Title:        Inner text content of the link (usually in a <div> child)
 *
 * If ChatGPT changes its UI, ONLY this file needs updating.
 */

import type { SiteAdapter } from '~src/core/types'

/** Data attribute we use to mark rows we've processed */
const PROCESSED_ATTR = 'data-acl-processed'
const ORIGINAL_TITLE_ATTR = 'data-acl-original-title'
const LOCKED_ATTR = 'data-acl-locked'

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
    // Try stable selectors first, then fall back
    return (
      document.querySelector('nav[aria-label="Chat history"]') ??
      document.querySelector('nav') ??
      null
    )
  },

  getChatRows(): Element[] {
    const root = this.getSidebarRoot()
    if (!root) return []

    // ChatGPT chat links follow the pattern /c/<uuid>
    const links = root.querySelectorAll('a[href*="/c/"]')
    return Array.from(links)
  },

  getChatId(row: Element): string | null {
    const href = row.getAttribute('href')
    if (!href) return null

    // Extract UUID from /c/<uuid>
    const match = href.match(/\/c\/([a-f0-9-]+)/i)
    return match?.[1] ?? null
  },

  getChatTitle(row: Element): string {
    // The title is typically inside a nested div or span
    // Save it before hiding
    const saved = row.getAttribute(ORIGINAL_TITLE_ATTR)
    if (saved) return saved

    // Find the deepest text-containing element
    const titleEl = findTitleElement(row)
    return titleEl?.textContent?.trim() ?? 'Untitled chat'
  },

  hideChatTitle(row: Element, lockedLabel: string): void {
    if (row.getAttribute(LOCKED_ATTR) === 'true') return

    // Save original title before replacing
    const titleEl = findTitleElement(row)
    if (titleEl) {
      const originalTitle = titleEl.textContent?.trim() ?? ''
      if (originalTitle && originalTitle !== lockedLabel) {
        row.setAttribute(ORIGINAL_TITLE_ATTR, originalTitle)
      }
      // Replace with locked label — removes real title from DOM entirely
      titleEl.textContent = lockedLabel
    }

    row.setAttribute(LOCKED_ATTR, 'true')

    // Dim the row visually
    ;(row as HTMLElement).style.opacity = '0.6'
  },

  restoreChatTitle(row: Element, originalTitle: string): void {
    const titleEl = findTitleElement(row)
    if (titleEl) {
      titleEl.textContent = originalTitle
    }

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
    // Remove existing button if any
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

    // Ensure the row is relatively positioned for absolute button
    const rowEl = row as HTMLElement
    const currentPosition = getComputedStyle(rowEl).position
    if (currentPosition === 'static') {
      rowEl.style.position = 'relative'
    }

    // Show button on hover
    rowEl.addEventListener('mouseenter', () => {
      btn.style.opacity = '1'
    })
    rowEl.addEventListener('mouseleave', () => {
      btn.style.opacity = isLocked ? '0.6' : '0'
    })

    // Keep locked icon slightly visible
    if (isLocked) {
      btn.style.opacity = '0.6'
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

    return () => {
      row.removeEventListener('click', handler, true)
    }
  }
}

/**
 * Find the element that contains the chat title text within a row.
 * ChatGPT typically nests the title in a div inside the <a> link.
 */
function findTitleElement(row: Element): Element | null {
  // Look for the first text-containing element that isn't a button or icon
  // ChatGPT uses <div class="...">Title text</div> inside the <a>
  const candidates = row.querySelectorAll('div, span, p')

  for (const el of candidates) {
    // Skip if it's a button container, icon, or our injected button
    if (el.querySelector('button') || el.querySelector('svg')) continue
    if (el.getAttribute('data-acl-btn') !== null) continue
    if (el.children.length > 2) continue

    const text = el.textContent?.trim()
    if (text && text.length > 0 && text.length < 200) {
      // Prefer elements that are direct text containers (no deeply nested children)
      if (el.childElementCount === 0 || el.children.length <= 1) {
        return el
      }
    }
  }

  // Fallback — return the row itself
  return row
}
