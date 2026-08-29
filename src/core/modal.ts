/**
 * modal.ts — Pure-DOM password prompt overlay.
 *
 * This is the ONLY DOM creation code in the core engine.
 * It's a self-contained, site-agnostic floating modal.
 * No React dependency — keeps content script lightweight.
 *
 * Security: Uses DOM element creation (no innerHTML) and
 * enforces rate limiting on failed password attempts.
 */

import { rateLimiter } from './crypto'

const MODAL_ID = 'ai-chat-lock-modal'

/** Remove existing modal if present */
function removeModal(): void {
  document.getElementById(MODAL_ID)?.remove()
}

/** Inject the modal's styles into a shadow-safe <style> element */
function createModalStyles(isSetMode: boolean): HTMLStyleElement {
  const style = document.createElement('style')
  style.textContent = `
    @keyframes aclFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes aclSlideUp {
      from { opacity: 0; transform: translateY(20px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    #acl-card {
      background: linear-gradient(145deg, rgba(30, 30, 40, 0.95), rgba(20, 20, 30, 0.98));
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 32px;
      width: 380px;
      max-width: 90vw;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
      animation: aclSlideUp 0.3s ease-out;
      color: #e4e4e7;
    }
    #acl-card h2 {
      margin: 0 0 6px 0;
      font-size: 20px;
      font-weight: 700;
      color: #f4f4f5;
      letter-spacing: -0.02em;
    }
    #acl-card .acl-subtitle {
      margin: 0 0 20px 0;
      font-size: 13px;
      color: #a1a1aa;
      line-height: 1.5;
    }
    #acl-card input {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.05);
      color: #f4f4f5;
      font-size: 15px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
      box-sizing: border-box;
    }
    #acl-card input:focus {
      border-color: rgba(139, 92, 246, 0.5);
      box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
    }
    #acl-card input::placeholder {
      color: #71717a;
    }
    #acl-confirm-row {
      margin-top: 12px;
      display: ${isSetMode ? 'block' : 'none'};
    }
    .acl-btn-row {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }
    .acl-btn {
      flex: 1;
      padding: 11px 0;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.2s;
    }
    .acl-btn-primary {
      background: linear-gradient(135deg, #8b5cf6, #6d28d9);
      color: white;
      box-shadow: 0 4px 14px rgba(139, 92, 246, 0.3);
    }
    .acl-btn-primary:hover:not(:disabled) {
      background: linear-gradient(135deg, #7c3aed, #5b21b6);
      box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
      transform: translateY(-1px);
    }
    .acl-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    .acl-btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      color: #a1a1aa;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .acl-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #e4e4e7;
    }
    #acl-error {
      color: #f87171;
      font-size: 13px;
      margin-top: 10px;
      min-height: 18px;
      text-align: center;
    }
    #acl-spinner {
      display: none;
      text-align: center;
      margin-top: 10px;
      color: #a1a1aa;
      font-size: 13px;
    }
    #acl-cooldown {
      display: none;
      text-align: center;
      margin-top: 6px;
      color: #fbbf24;
      font-size: 12px;
    }
  `
  return style
}

/** Create the modal DOM structure safely (no innerHTML) */
function createModalDOM(
  isSetMode: boolean,
  title: string,
  subtitle: string,
  btnLabel: string
): {
  card: HTMLDivElement
  pwInput: HTMLInputElement
  confirmInput: HTMLInputElement
  errorEl: HTMLDivElement
  spinnerEl: HTMLDivElement
  cooldownEl: HTMLDivElement
  submitBtn: HTMLButtonElement
  cancelBtn: HTMLButtonElement
} {
  const card = document.createElement('div')
  card.id = 'acl-card'

  // Title
  const h2 = document.createElement('h2')
  h2.textContent = title
  card.appendChild(h2)

  // Subtitle
  const sub = document.createElement('p')
  sub.className = 'acl-subtitle'
  sub.textContent = subtitle
  card.appendChild(sub)

  // Password input
  const pwInput = document.createElement('input')
  pwInput.type = 'password'
  pwInput.id = 'acl-password'
  pwInput.placeholder = 'Password'
  pwInput.autocomplete = 'off'
  card.appendChild(pwInput)

  // Confirm row
  const confirmRow = document.createElement('div')
  confirmRow.id = 'acl-confirm-row'
  const confirmInput = document.createElement('input')
  confirmInput.type = 'password'
  confirmInput.id = 'acl-confirm'
  confirmInput.placeholder = 'Confirm password'
  confirmInput.autocomplete = 'off'
  confirmRow.appendChild(confirmInput)
  card.appendChild(confirmRow)

  // Error
  const errorEl = document.createElement('div')
  errorEl.id = 'acl-error'
  card.appendChild(errorEl)

  // Spinner
  const spinnerEl = document.createElement('div')
  spinnerEl.id = 'acl-spinner'
  spinnerEl.textContent = 'Verifying...'
  card.appendChild(spinnerEl)

  // Cooldown
  const cooldownEl = document.createElement('div')
  cooldownEl.id = 'acl-cooldown'
  card.appendChild(cooldownEl)

  // Button row
  const btnRow = document.createElement('div')
  btnRow.className = 'acl-btn-row'

  const cancelBtn = document.createElement('button')
  cancelBtn.className = 'acl-btn acl-btn-secondary'
  cancelBtn.id = 'acl-cancel'
  cancelBtn.textContent = 'Cancel'

  const submitBtn = document.createElement('button')
  submitBtn.className = 'acl-btn acl-btn-primary'
  submitBtn.id = 'acl-submit'
  submitBtn.textContent = btnLabel

  btnRow.appendChild(cancelBtn)
  btnRow.appendChild(submitBtn)
  card.appendChild(btnRow)

  return { card, pwInput, confirmInput, errorEl, spinnerEl, cooldownEl, submitBtn, cancelBtn }
}

/** Create and show the password modal. */
export function showPasswordModal(opts: {
  mode: 'set' | 'verify'
  onSubmit: (password: string) => Promise<boolean>
  onCancel?: () => void
}): void {
  removeModal()

  const isSetMode = opts.mode === 'set'
  const title = isSetMode ? '🔒 Set Your Password' : '🔒 Enter Password'
  const subtitle = isSetMode
    ? 'Create a password to protect your locked chats'
    : 'Enter your password to unlock'
  const btnLabel = isSetMode ? 'Set Password' : 'Unlock'

  // Build overlay
  const overlay = document.createElement('div')
  overlay.id = MODAL_ID
  overlay.setAttribute('style', `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: aclFadeIn 0.2s ease-out;
  `)

  // Add styles
  overlay.appendChild(createModalStyles(isSetMode))

  // Build DOM elements safely
  const {
    card, pwInput, confirmInput, errorEl, spinnerEl, cooldownEl, submitBtn, cancelBtn
  } = createModalDOM(isSetMode, title, subtitle, btnLabel)

  overlay.appendChild(card)
  document.body.appendChild(overlay)

  // Focus the password input
  setTimeout(() => pwInput?.focus(), 100)

  // Check initial rate-limiting state
  const initialLockout = rateLimiter.getLockoutRemaining()
  if (initialLockout > 0) {
    startCooldownTimer(submitBtn, cooldownEl, initialLockout)
  }

  // Cancel handler
  const cancel = () => {
    removeModal()
    opts.onCancel?.()
  }

  cancelBtn.addEventListener('click', cancel)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cancel()
  })

  // Submit handler
  const submit = async () => {
    const password = pwInput.value.trim()

    if (!password) {
      errorEl.textContent = 'Please enter a password'
      return
    }

    if (password.length < 4) {
      errorEl.textContent = 'Password must be at least 4 characters'
      return
    }

    if (isSetMode) {
      const confirm = confirmInput.value.trim()
      if (password !== confirm) {
        errorEl.textContent = 'Passwords do not match'
        return
      }
    }

    // Check rate limiting before attempting
    const lockout = rateLimiter.getLockoutRemaining()
    if (lockout > 0) {
      startCooldownTimer(submitBtn, cooldownEl, lockout)
      return
    }

    errorEl.textContent = ''
    spinnerEl.style.display = 'block'
    submitBtn.disabled = true

    try {
      const success = await opts.onSubmit(password)
      if (success) {
        rateLimiter.reset()
        removeModal()
      } else {
        const delayMs = rateLimiter.recordFailure()
        errorEl.textContent = 'Incorrect password'
        spinnerEl.style.display = 'none'
        submitBtn.disabled = false
        pwInput.value = ''
        pwInput.focus()

        if (delayMs > 0) {
          startCooldownTimer(submitBtn, cooldownEl, delayMs)
        }
      }
    } catch {
      errorEl.textContent = 'An error occurred'
      spinnerEl.style.display = 'none'
      submitBtn.disabled = false
    }
  }

  submitBtn.addEventListener('click', submit)

  // Enter key submits
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') cancel()
  }
  pwInput.addEventListener('keydown', onKeyDown)
  confirmInput.addEventListener('keydown', onKeyDown)
}

/** Show a countdown timer disabling the submit button */
function startCooldownTimer(
  submitBtn: HTMLButtonElement,
  cooldownEl: HTMLDivElement,
  durationMs: number
): void {
  submitBtn.disabled = true
  cooldownEl.style.display = 'block'

  const endTime = Date.now() + durationMs

  const tick = () => {
    const remaining = Math.max(0, endTime - Date.now())
    if (remaining <= 0) {
      submitBtn.disabled = false
      cooldownEl.style.display = 'none'
      cooldownEl.textContent = ''
      return
    }
    const secs = Math.ceil(remaining / 1000)
    cooldownEl.textContent = `Too many attempts. Try again in ${secs}s`
    requestAnimationFrame(tick)
  }

  tick()
}

/** Dismiss the modal programmatically */
export function dismissModal(): void {
  removeModal()
}

/** Check if the modal is currently visible */
export function isModalVisible(): boolean {
  return document.getElementById(MODAL_ID) !== null
}
