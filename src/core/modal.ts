/**
 * modal.ts — Pure-DOM password prompt overlay.
 *
 * This is the ONLY DOM creation code in the core engine.
 * It's a self-contained, site-agnostic floating modal.
 * No React dependency — keeps content script lightweight.
 */

const MODAL_ID = 'ai-chat-lock-modal'

/** Remove existing modal if present */
function removeModal(): void {
  document.getElementById(MODAL_ID)?.remove()
}

/** Create and show the password modal. Returns a Promise that resolves with the password or null (cancelled). */
export function showPasswordModal(opts: {
  mode: 'set' | 'verify'
  onSubmit: (password: string) => Promise<boolean>
  onCancel?: () => void
}): void {
  removeModal()

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

  const isSetMode = opts.mode === 'set'
  const title = isSetMode ? '🔒 Set Your Password' : '🔒 Enter Password'
  const subtitle = isSetMode
    ? 'Create a password to protect your locked chats'
    : 'Enter your password to unlock'
  const btnLabel = isSetMode ? 'Set Password' : 'Unlock'

  overlay.innerHTML = `
    <style>
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
      #acl-card p {
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
      .acl-btn-primary:hover {
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
    </style>
    <div id="acl-card">
      <h2>${title}</h2>
      <p>${subtitle}</p>
      <input
        type="password"
        id="acl-password"
        placeholder="Password"
        autocomplete="off"
        autofocus
      />
      <div id="acl-confirm-row">
        <input
          type="password"
          id="acl-confirm"
          placeholder="Confirm password"
          autocomplete="off"
        />
      </div>
      <div id="acl-error"></div>
      <div id="acl-spinner">Verifying...</div>
      <div class="acl-btn-row">
        <button class="acl-btn acl-btn-secondary" id="acl-cancel">Cancel</button>
        <button class="acl-btn acl-btn-primary" id="acl-submit">${btnLabel}</button>
      </div>
    </div>
  `

  document.body.appendChild(overlay)

  // Focus the password input
  const pwInput = document.getElementById('acl-password') as HTMLInputElement
  const confirmInput = document.getElementById('acl-confirm') as HTMLInputElement
  const errorEl = document.getElementById('acl-error')!
  const spinnerEl = document.getElementById('acl-spinner')!
  const submitBtn = document.getElementById('acl-submit') as HTMLButtonElement

  setTimeout(() => pwInput?.focus(), 100)

  // Cancel handler
  const cancel = () => {
    removeModal()
    opts.onCancel?.()
  }

  document.getElementById('acl-cancel')!.addEventListener('click', cancel)
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

    errorEl.textContent = ''
    spinnerEl.style.display = 'block'
    submitBtn.disabled = true

    try {
      const success = await opts.onSubmit(password)
      if (success) {
        removeModal()
      } else {
        errorEl.textContent = 'Incorrect password'
        spinnerEl.style.display = 'none'
        submitBtn.disabled = false
        pwInput.value = ''
        pwInput.focus()
      }
    } catch {
      errorEl.textContent = 'An error occurred'
      spinnerEl.style.display = 'none'
      submitBtn.disabled = false
    }
  }

  document.getElementById('acl-submit')!.addEventListener('click', submit)

  // Enter key submits
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') cancel()
  }
  pwInput.addEventListener('keydown', onKeyDown)
  confirmInput?.addEventListener('keydown', onKeyDown)
}

/** Dismiss the modal programmatically */
export function dismissModal(): void {
  removeModal()
}

/** Check if the modal is currently visible */
export function isModalVisible(): boolean {
  return document.getElementById(MODAL_ID) !== null
}
