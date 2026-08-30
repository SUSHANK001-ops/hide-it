/**
 * dom-utils.ts — Shared DOM manipulation and protection utilities.
 *
 * Provides bulletproof title masking, tooltip scrubbing, double-click/event interception,
 * and button injection across all site adapters.
 */

const LOCKED_ATTR = 'data-acl-locked'

/** Stores original attributes (title, aria-label) for restoration upon unlock */
const originalAttributes = new WeakMap<Element, {
  rowTitle?: string
  rowAria?: string
  titleElTitle?: string
  titleElAria?: string
}>()

/**
 * Locate the primary title text element inside a chat row container.
 */
export function findBestTitleElement(row: Element): Element {
  // First, check for common class names or attributes used for titles
  const candidates = row.querySelectorAll('div, span, p, h3, h4, [class*="title"], [class*="name"], [class*="label"], [class*="text"]')
  
  for (const el of candidates) {
    if (el.querySelector('button') || el.querySelector('svg')) continue
    if (el.getAttribute('data-acl-btn') !== null) continue
    if (el.closest('[data-acl-btn]')) continue

    const text = el.textContent?.trim()
    // A title is non-empty, reasonably concise, and leaf-ish
    if (text && text.length > 0 && text.length < 300) {
      if (el.childElementCount === 0 || (el.childElementCount === 1 && !el.firstElementChild?.querySelector('button, svg'))) {
        return el
      }
    }
  }

  // Fallback to searching all non-button/svg elements with text
  const allElements = row.querySelectorAll('*')
  for (const el of allElements) {
    if (['BUTTON', 'SVG', 'PATH', 'INPUT', 'TEXTAREA'].includes(el.tagName)) continue
    if (el.getAttribute('data-acl-btn') !== null) continue
    const text = el.textContent?.trim()
    if (text && text.length > 0 && el.childElementCount === 0) {
      return el
    }
  }

  return row
}

/**
 * Mask the chat title and tooltips so the real title is nowhere in the DOM.
 * Continuously reapplies even if React re-renders on double-click/hover.
 */
export function maskChatTitle(
  row: Element,
  lockedLabel: string,
  originalTitles: WeakMap<Element, string>
): void {
  const titleEl = findBestTitleElement(row)

  // 1. Save original text if not already masked
  const currentText = titleEl.textContent?.trim() ?? ''
  if (currentText && currentText !== lockedLabel) {
    originalTitles.set(row, currentText)
  }

  // 2. Enforce masked label
  if (titleEl.textContent !== lockedLabel) {
    titleEl.textContent = lockedLabel
  }

  // 3. Remove/cancel any inline editing inputs (prevent double-click rename reveals)
  const inputs = row.querySelectorAll('input, textarea')
  for (const input of inputs) {
    if (!input.closest('#ai-chat-lock-modal')) {
      input.remove()
    }
  }

  // 4. Save and scrub native tooltips and aria labels that could leak the title
  if (!originalAttributes.has(row)) {
    originalAttributes.set(row, {
      rowTitle: row.getAttribute('title') ?? undefined,
      rowAria: row.getAttribute('aria-label') ?? undefined,
      titleElTitle: titleEl.getAttribute('title') ?? undefined,
      titleElAria: titleEl.getAttribute('aria-label') ?? undefined
    })
  }

  if (row.getAttribute('title')) row.setAttribute('title', lockedLabel)
  if (row.getAttribute('aria-label')) row.setAttribute('aria-label', lockedLabel)
  if (titleEl.getAttribute('title')) titleEl.setAttribute('title', lockedLabel)
  if (titleEl.getAttribute('aria-label')) titleEl.setAttribute('aria-label', lockedLabel)

  // 5. Visual styling
  row.setAttribute(LOCKED_ATTR, 'true')
  const rowEl = row as HTMLElement
  rowEl.style.userSelect = 'none'
  rowEl.style.webkitUserSelect = 'none'
  rowEl.style.opacity = '0.65'
}

/**
 * Restore the original title and tooltips when unlocked.
 */
export function unmaskChatTitle(
  row: Element,
  originalTitle: string,
  originalTitles: WeakMap<Element, string>
): void {
  const titleEl = findBestTitleElement(row)
  if (titleEl) {
    titleEl.textContent = originalTitle
  }

  const savedAttrs = originalAttributes.get(row)
  if (savedAttrs) {
    if (savedAttrs.rowTitle !== undefined) row.setAttribute('title', savedAttrs.rowTitle)
    else row.removeAttribute('title')

    if (savedAttrs.rowAria !== undefined) row.setAttribute('aria-label', savedAttrs.rowAria)
    else row.removeAttribute('aria-label')

    if (savedAttrs.titleElTitle !== undefined) titleEl.setAttribute('title', savedAttrs.titleElTitle)
    else titleEl.removeAttribute('title')

    if (savedAttrs.titleElAria !== undefined) titleEl.setAttribute('aria-label', savedAttrs.titleElAria)
    else titleEl.removeAttribute('aria-label')

    originalAttributes.delete(row)
  }

  row.removeAttribute(LOCKED_ATTR)
  originalTitles.delete(row)

  const rowEl = row as HTMLElement
  rowEl.style.userSelect = ''
  rowEl.style.webkitUserSelect = ''
  rowEl.style.opacity = ''
}

/**
 * Intercept all navigation and interaction events on a locked row.
 * Blocks single-click, double-click (rename), context menu, and keyboard navigation.
 */
export function interceptRowEvents(
  row: Element,
  onAttempt: () => void
): () => void {
  const handleInteraction = (e: Event) => {
    // Let clicks on the lock toggle button pass through to their own listener
    const target = e.target as Element | null
    if (target && (target.getAttribute('data-acl-btn') !== null || target.closest('[data-acl-btn]'))) {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()

    // Trigger unlock prompt for intentional activations (click, double click, Enter/Space)
    if (e.type === 'click' || e.type === 'dblclick') {
      onAttempt()
    } else if (e.type === 'keydown') {
      const ke = e as KeyboardEvent
      if (ke.key === 'Enter' || ke.key === ' ') {
        onAttempt()
      }
    }
  }

  const events: (keyof HTMLElementEventMap)[] = [
    'click',
    'dblclick',
    'mousedown',
    'pointerdown',
    'auxclick',
    'contextmenu',
    'keydown'
  ]

  for (const ev of events) {
    row.addEventListener(ev, handleInteraction, true)
  }

  return () => {
    for (const ev of events) {
      row.removeEventListener(ev, handleInteraction, true)
    }
  }
}

/**
 * Inject the sleek lock/unlock toggle button into a chat row.
 */
export function injectStandardLockButton(
  row: Element,
  chatId: string,
  isLocked: boolean,
  onToggle: () => void,
  rightOffset = '8px'
): void {
  const existing = row.querySelector('[data-acl-btn]')
  if (existing) {
    // If button exists with same lock state, don't recreate
    const currentBtnLocked = existing.getAttribute('data-acl-locked-state') === 'true'
    if (currentBtnLocked === isLocked) return
    existing.remove()
  }

  const btn = document.createElement('button')
  btn.setAttribute('data-acl-btn', chatId)
  btn.setAttribute('data-acl-locked-state', isLocked ? 'true' : 'false')
  btn.title = isLocked ? 'Unlock chat' : 'Lock chat'
  const lockSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
  const unlockSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`
  btn.innerHTML = isLocked ? lockSvg : unlockSvg
  btn.type = 'button'

  btn.setAttribute('style', `
    position: absolute;
    right: ${rightOffset};
    top: 50%;
    transform: translateY(-50%);
    background: ${isLocked ? 'rgba(124, 58, 237, 0.2)' : 'rgba(0, 0, 0, 0.25)'};
    border: 1px solid ${isLocked ? 'rgba(139, 92, 246, 0.4)' : 'rgba(255, 255, 255, 0.1)'};
    cursor: pointer;
    font-size: 13px;
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    opacity: ${isLocked ? '0.9' : '0'};
    transition: opacity 0.15s ease, background 0.15s ease, transform 0.15s ease;
    z-index: 999;
    line-height: 1;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    pointer-events: auto;
  `)

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'translateY(-50%) scale(1.1)'
    btn.style.background = isLocked ? 'rgba(124, 58, 237, 0.4)' : 'rgba(255, 255, 255, 0.25)'
  })

  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'translateY(-50%) scale(1)'
    btn.style.background = isLocked ? 'rgba(124, 58, 237, 0.2)' : 'rgba(0, 0, 0, 0.25)'
  })

  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    onToggle()
  })

  const rowEl = row as HTMLElement
  if (getComputedStyle(rowEl).position === 'static') {
    rowEl.style.position = 'relative'
  }

  // Ensure row hover shows button when unlocked
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
        b.style.opacity = isL ? '0.9' : '0'
      }
    })
  }

  rowEl.appendChild(btn)
}
