/**
 * storage.ts — Typed wrapper over chrome.storage.local.
 *
 * All keys are namespaced per site:
 *   locked:<siteId>:<chatId>  → LockedChatEntry
 *   password_hash             → string (SHA-256 hex)
 *   settings                  → ExtensionSettings
 *
 * This module has ZERO DOM dependencies and ZERO site-specific logic.
 */

import type { ExtensionSettings, LockedChatEntry } from './types'

// ─── Key Helpers ────────────────────────────────────────────────

function lockedKey(siteId: string, chatId: string): string {
  return `locked:${siteId}:${chatId}`
}

const PASSWORD_KEY = 'password_hash'
const SETTINGS_KEY = 'settings'

// ─── Locked Chats ───────────────────────────────────────────────

/** Lock a chat — store its title encrypted-at-rest via storage */
export async function lockChat(entry: LockedChatEntry): Promise<void> {
  const key = lockedKey(entry.siteId, entry.chatId)
  await chrome.storage.local.set({ [key]: entry })
}

/** Unlock a chat — remove it from storage */
export async function unlockChat(
  siteId: string,
  chatId: string
): Promise<void> {
  const key = lockedKey(siteId, chatId)
  await chrome.storage.local.remove(key)
}

/** Check if a specific chat is locked */
export async function isLocked(
  siteId: string,
  chatId: string
): Promise<boolean> {
  const key = lockedKey(siteId, chatId)
  const result = await chrome.storage.local.get(key)
  return key in result
}

/** Get the locked entry for a specific chat, or null */
export async function getLockedChat(
  siteId: string,
  chatId: string
): Promise<LockedChatEntry | null> {
  const key = lockedKey(siteId, chatId)
  const result = await chrome.storage.local.get(key)
  return (result[key] as LockedChatEntry) ?? null
}

/** Get all locked chats, optionally filtered by siteId */
export async function getLockedChats(
  siteId?: string
): Promise<LockedChatEntry[]> {
  const all = await chrome.storage.local.get(null)
  const prefix = siteId ? `locked:${siteId}:` : 'locked:'
  const entries: LockedChatEntry[] = []

  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(prefix)) {
      entries.push(value as LockedChatEntry)
    }
  }

  return entries.sort((a, b) => b.lockedAt - a.lockedAt)
}

/** Get locked chat IDs as a Set for fast lookup (used by lock-engine) */
export async function getLockedChatIds(
  siteId: string
): Promise<Set<string>> {
  const chats = await getLockedChats(siteId)
  return new Set(chats.map((c) => c.chatId))
}

// ─── Password ───────────────────────────────────────────────────

/** Store the SHA-256 hash of the user's password */
export async function setPasswordHash(hash: string): Promise<void> {
  await chrome.storage.local.set({ [PASSWORD_KEY]: hash })
}

/** Get the stored password hash, or null if not set */
export async function getPasswordHash(): Promise<string | null> {
  const result = await chrome.storage.local.get(PASSWORD_KEY)
  return (result[PASSWORD_KEY] as string) ?? null
}

/** Check if a password has been set */
export async function hasPassword(): Promise<boolean> {
  const hash = await getPasswordHash()
  return hash !== null
}

// ─── Settings ───────────────────────────────────────────────────

const DEFAULT_SETTINGS: ExtensionSettings = {
  autoRelockEnabled: true,
  autoRelockMinutes: 5
}

/** Get extension settings (with defaults) */
export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY)
  const stored = result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined
  return { ...DEFAULT_SETTINGS, ...stored }
}

/** Update extension settings (partial merge) */
export async function updateSettings(
  partial: Partial<ExtensionSettings>
): Promise<ExtensionSettings> {
  const current = await getSettings()
  const updated = { ...current, ...partial }
  await chrome.storage.local.set({ [SETTINGS_KEY]: updated })
  return updated
}
