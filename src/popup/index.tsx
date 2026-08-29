import { useEffect, useState } from 'react'
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

export default function Popup() {
  const [activeTab, setActiveTab] = useState<'vault' | 'settings'>('vault')
  const [lockedChats, setLockedChats] = useState<LockedChatEntry[]>([])
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordExists, setPasswordExists] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Settings
  const [settings, setSettingsState] = useState<ExtensionSettings>({
    autoRelockEnabled: true,
    autoRelockMinutes: 5
  })
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwChangeSuccess, setPwChangeSuccess] = useState(false)

  useEffect(() => {
    loadInitialData()
  }, [])

  async function loadInitialData() {
    const pwSet = await hasPassword()
    setPasswordExists(pwSet)

    const chats = await getLockedChats()
    setLockedChats(chats)

    const s = await getSettings()
    setSettingsState(s)

    // Check background for active session state
    try {
      chrome.runtime.sendMessage({ type: 'IS_SESSION_UNLOCKED' }, (res) => {
        if (res?.unlocked) {
          setIsUnlocked(true)
        }
      })
    } catch {
      // Ignore fallback
    }
  }

  async function handleUnlockVault(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')

    if (!passwordExists) {
      if (passwordInput.length < 4) {
        setErrorMsg('Password must be at least 4 characters')
        return
      }
      const hash = await hashPassword(passwordInput)
      await setPasswordHash(hash)
      setPasswordExists(true)
      setIsUnlocked(true)
      chrome.runtime.sendMessage({ type: 'SESSION_UNLOCKED' })
      return
    }

    const storedHash = await getPasswordHash()
    if (!storedHash) return

    const valid = await verifyPassword(passwordInput, storedHash)
    if (valid) {
      setIsUnlocked(true)
      setPasswordInput('')
      chrome.runtime.sendMessage({ type: 'SESSION_UNLOCKED' })
    } else {
      setErrorMsg('Incorrect password')
    }
  }

  async function handleUnlockSingleChat(siteId: string, chatId: string) {
    await unlockChat(siteId, chatId)
    const updated = await getLockedChats()
    setLockedChats(updated)
  }

  async function handleSettingsChange(newS: Partial<ExtensionSettings>) {
    const updated = await updateSettings(newS)
    setSettingsState(updated)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setPwChangeSuccess(false)

    if (newPassword.length < 4) {
      setErrorMsg('Password must be at least 4 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match')
      return
    }

    const hash = await hashPassword(newPassword)
    await setPasswordHash(hash)
    setNewPassword('')
    setConfirmPassword('')
    setPwChangeSuccess(true)
    setPasswordExists(true)
  }

  return (
    <div className="popup-container">
      <div className="header">
        <div className="logo-group">
          <span className="logo-icon">🔒</span>
          <h1 className="title">AI Chat Lock</h1>
        </div>

        <div className="tab-nav">
          <button
            className={`tab-btn ${activeTab === 'vault' ? 'active' : ''}`}
            onClick={() => setActiveTab('vault')}>
            Vault
          </button>
          <button
            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}>
            Settings
          </button>
        </div>
      </div>

      {activeTab === 'vault' ? (
        <div className="card">
          {!isUnlocked ? (
            <form onSubmit={handleUnlockVault} className="vault-auth-box">
              <p>
                {passwordExists
                  ? 'Enter master password to reveal locked chats'
                  : 'Set master password to get started'}
              </p>

              <input
                type="password"
                className="input-field"
                placeholder="Master password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoFocus
              />

              {errorMsg && <div className="error-text">{errorMsg}</div>}

              <button type="submit" className="btn-primary">
                {passwordExists ? 'Unlock Vault' : 'Set Master Password'}
              </button>
            </form>
          ) : (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12
                }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-muted)'
                  }}>
                  LOCKED CHATS ({lockedChats.length})
                </span>
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary-accent)',
                    cursor: 'pointer',
                    fontSize: 12
                  }}
                  onClick={() => setIsUnlocked(false)}>
                  Lock Vault
                </button>
              </div>

              {lockedChats.length === 0 ? (
                <div className="empty-state">No locked chats across any site</div>
              ) : (
                <div className="chat-list">
                  {lockedChats.map((chat) => (
                    <div key={`${chat.siteId}:${chat.chatId}`} className="chat-item">
                      <div className="chat-info">
                        <span className="chat-site-badge">{chat.siteId}</span>
                        <span className="chat-title">{chat.title}</span>
                      </div>
                      <button
                        className="unlock-btn"
                        title="Unlock chat"
                        onClick={() =>
                          handleUnlockSingleChat(chat.siteId, chat.chatId)
                        }>
                        🔓
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="card settings-group">
          <div className="setting-row">
            <span className="setting-label">Auto re-lock on idle</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.autoRelockEnabled}
                onChange={(e) =>
                  handleSettingsChange({ autoRelockEnabled: e.target.checked })
                }
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
                onChange={(e) =>
                  handleSettingsChange({
                    autoRelockMinutes: parseInt(e.target.value, 10)
                  })
                }>
                <option value={1}>1 min</option>
                <option value={5}>5 min</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
              </select>
            </div>
          )}

          <hr style={{ borderColor: 'var(--card-border)', margin: '8px 0' }} />

          <form
            onSubmit={handleChangePassword}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="setting-label">
              {passwordExists ? 'Change Password' : 'Set Password'}
            </span>

            <input
              type="password"
              className="input-field"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            <input
              type="password"
              className="input-field"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            {errorMsg && <div className="error-text">{errorMsg}</div>}
            {pwChangeSuccess && (
              <div style={{ color: 'var(--success)', fontSize: 12 }}>
                Password updated successfully!
              </div>
            )}

            <button type="submit" className="btn-primary" style={{ marginTop: 4 }}>
              Update Password
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
