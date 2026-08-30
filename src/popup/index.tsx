import { useEffect, useRef, useState } from 'react'
import type { ExtensionSettings, LockedChatEntry } from '~/core/types'
import {
  getLockedChats,
  unlockChat,
  hasPassword,
  setPasswordHash,
  getPasswordHash,
  getSettings,
  updateSettings
} from '~/core/storage'
import { hashPassword, verifyPassword } from '~/core/crypto'
import './popup.css'

// ─── Utility ────────────────────────────────────────────────────────────────

/** Mask title — first letter of each word visible, rest asterisks */
function maskTitle(title: string): string {
  if (!title || !title.trim()) return '🔒 L****'
  return title
    .split(' ')
    .filter((w) => w.length > 0)
    .map((word) => word[0] + '*'.repeat(Math.max(0, word.length - 1)))
    .join(' ')
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function Popup() {
  const [activeTab, setActiveTab] = useState<'vault' | 'settings'>('vault')
  const [lockedChats, setLockedChats] = useState<LockedChatEntry[]>([])
  const [isVaultOpen, setIsVaultOpen] = useState(false)
  const [vaultPw, setVaultPw] = useState('')
  const [passwordExists, setPasswordExists] = useState(false)
  const [vaultError, setVaultError] = useState('')

  // Per-chat inline unlock state
  const [unlockingChatId, setUnlockingChatId] = useState<string | null>(null)
  const [unlockPw, setUnlockPw] = useState('')
  const [unlockError, setUnlockError] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const unlockInputRef = useRef<HTMLInputElement>(null)

  // Settings
  const [settings, setSettingsState] = useState<ExtensionSettings>({
    autoRelockEnabled: true,
    autoRelockMinutes: 5
  })
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwChangeError, setPwChangeError] = useState('')
  const [pwChangeSuccess, setPwChangeSuccess] = useState(false)

  useEffect(() => { loadInitialData() }, [])

  // Focus unlock input when it appears
  useEffect(() => {
    if (unlockingChatId) {
      setTimeout(() => unlockInputRef.current?.focus(), 50)
    }
  }, [unlockingChatId])

  async function loadInitialData() {
    const pwSet = await hasPassword()
    setPasswordExists(pwSet)
    const chats = await getLockedChats()
    setLockedChats(chats)
    const s = await getSettings()
    setSettingsState(s)
  }

  // ── Vault auth ────────────────────────────────────────────────────────────

  async function handleVaultSubmit(e: React.FormEvent) {
    e.preventDefault()
    setVaultError('')

    if (!passwordExists) {
      if (vaultPw.length < 4) {
        setVaultError('Password must be at least 4 characters')
        return
      }
      const hash = await hashPassword(vaultPw)
      await setPasswordHash(hash)
      setPasswordExists(true)
      setIsVaultOpen(true)
      setVaultPw('')
      return
    }

    const storedHash = await getPasswordHash()
    if (!storedHash) return
    const valid = await verifyPassword(vaultPw, storedHash)
    if (valid) {
      setIsVaultOpen(true)
      setVaultPw('')
    } else {
      setVaultError('Incorrect password')
    }
  }

  // ── Per-chat unlock ────────────────────────────────────────────────────────

  function startUnlock(chat: LockedChatEntry) {
    setUnlockingChatId(`${chat.siteId}:${chat.chatId}`)
    setUnlockPw('')
    setUnlockError('')
  }

  function cancelUnlock() {
    setUnlockingChatId(null)
    setUnlockPw('')
    setUnlockError('')
  }

  async function confirmUnlock(e: React.FormEvent, chat: LockedChatEntry) {
    e.preventDefault()
    setUnlockError('')
    setUnlocking(true)

    try {
      const storedHash = await getPasswordHash()
      if (!storedHash) { setUnlockError('No password set'); return }

      const valid = await verifyPassword(unlockPw, storedHash)
      if (!valid) {
        setUnlockError('Incorrect password')
        setUnlockPw('')
        return
      }

      await unlockChat(chat.siteId, chat.chatId)
      const updated = await getLockedChats()
      setLockedChats(updated)
      setUnlockingChatId(null)
      setUnlockPw('')
    } finally {
      setUnlocking(false)
    }
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  async function handleSettingsChange(partial: Partial<ExtensionSettings>) {
    const updated = await updateSettings(partial)
    setSettingsState(updated)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwChangeError('')
    setPwChangeSuccess(false)

    if (newPassword.length < 4) { setPwChangeError('At least 4 characters'); return }
    if (newPassword !== confirmPassword) { setPwChangeError('Passwords do not match'); return }

    const hash = await hashPassword(newPassword)
    await setPasswordHash(hash)
    setNewPassword('')
    setConfirmPassword('')
    setPwChangeSuccess(true)
    setPasswordExists(true)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="popup-container">
      {/* Header */}
      <div className="header">
        <div className="logo-group">
          <span className="logo-icon">🔒</span>
          <h1 className="title">AI Chat Lock</h1>
        </div>
        <div className="tab-nav">
          <button className={`tab-btn ${activeTab === 'vault' ? 'active' : ''}`}
            onClick={() => setActiveTab('vault')}>Vault</button>
          <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}>Settings</button>
        </div>
      </div>

      {/* Vault tab */}
      {activeTab === 'vault' && (
        <div className="card">
          {!isVaultOpen ? (
            /* ── Auth gate ── */
            <form onSubmit={handleVaultSubmit} className="vault-auth-box">
              <p>
                {passwordExists
                  ? 'Enter master password to view locked chats'
                  : 'Create a master password to get started'}
              </p>
              <input
                type="password"
                className="input-field"
                placeholder="Master password"
                value={vaultPw}
                onChange={(e) => setVaultPw(e.target.value)}
                autoFocus
              />
              {vaultError && <div className="error-text">{vaultError}</div>}
              <button type="submit" className="btn-primary">
                {passwordExists ? 'Open Vault' : 'Set Master Password'}
              </button>
            </form>
          ) : (
            /* ── Vault contents ── */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                  LOCKED CHATS ({lockedChats.length})
                </span>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--primary-accent)', cursor: 'pointer', fontSize: 12 }}
                  onClick={() => { setIsVaultOpen(false); setUnlockingChatId(null) }}>
                  Lock Vault
                </button>
              </div>

              {lockedChats.length === 0 ? (
                <div className="empty-state">No locked chats across any site</div>
              ) : (
                <div className="chat-list">
                  {lockedChats.map((chat) => {
                    const key = `${chat.siteId}:${chat.chatId}`
                    const isBeingUnlocked = unlockingChatId === key
                    return (
                      <div key={key} className="chat-item-wrapper">
                        <div className="chat-item">
                          <div className="chat-info">
                            <span className="chat-site-badge">{chat.siteId}</span>
                            <span className="chat-title">{maskTitle(chat.title)}</span>
                          </div>
                          {!isBeingUnlocked ? (
                            <button
                              className="unlock-btn"
                              title="Unlock this chat"
                              onClick={() => startUnlock(chat)}>
                              🔓
                            </button>
                          ) : (
                            <button
                              className="cancel-btn"
                              onClick={cancelUnlock}>
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Inline password entry for this specific chat */}
                        {isBeingUnlocked && (
                          <form
                            className="unlock-form"
                            onSubmit={(e) => confirmUnlock(e, chat)}>
                            <input
                              ref={unlockInputRef}
                              type="password"
                              className="input-field"
                              placeholder="Enter password to unlock"
                              value={unlockPw}
                              onChange={(e) => setUnlockPw(e.target.value)}
                              disabled={unlocking}
                            />
                            {unlockError && <div className="error-text">{unlockError}</div>}
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={cancelUnlock}
                                disabled={unlocking}>
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="btn-primary"
                                disabled={unlocking}>
                                {unlocking ? 'Checking…' : 'Confirm Unlock'}
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Settings tab */}
      {activeTab === 'settings' && (
        <div className="card settings-group">
          <div className="setting-row">
            <span className="setting-label">Auto re-lock on idle</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.autoRelockEnabled}
                onChange={(e) => handleSettingsChange({ autoRelockEnabled: e.target.checked })}
              />
              <span className="slider"></span>
            </label>
          </div>

          {settings.autoRelockEnabled && (
            <div className="setting-row">
              <span className="setting-label">Idle timeout (minutes)</span>
              <select
                className="input-field"
                style={{ width: '80px', padding: '4px 8px' }}
                value={settings.autoRelockMinutes}
                onChange={(e) => handleSettingsChange({ autoRelockMinutes: parseInt(e.target.value, 10) })}>
                <option value={1}>1 min</option>
                <option value={5}>5 min</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
              </select>
            </div>
          )}

          <hr style={{ borderColor: 'var(--card-border)', margin: '8px 0' }} />

          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="setting-label">
              {passwordExists ? 'Change Master Password' : 'Set Master Password'}
            </span>
            <input
              type="password" className="input-field" placeholder="New password"
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              type="password" className="input-field" placeholder="Confirm new password"
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {pwChangeError && <div className="error-text">{pwChangeError}</div>}
            {pwChangeSuccess && <div style={{ color: 'var(--success)', fontSize: 12 }}>Password updated!</div>}
            <button type="submit" className="btn-primary" style={{ marginTop: 4 }}>
              Update Password
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
