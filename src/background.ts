/**
 * background.ts — Service Worker for AI Chat Lock.
 *
 * Responsibilities:
 *  1. Auto re-lock timer when browser becomes idle
 *  2. Badge state tracking (shows lock status count)
 *  3. Relay messages between popup and content scripts
 */

import { getSettings, getLockedChats } from '~/core/storage'

// State tracking for current tab sessions
let activeTabUnlocked = false

/** Update extension icon badge count based on total locked chats */
async function updateBadge(): Promise<void> {
  try {
    const lockedChats = await getLockedChats()
    const count = lockedChats.length

    if (count > 0) {
      await chrome.action.setBadgeText({ text: count.toString() })
      await chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' }) // Violet badge
    } else {
      await chrome.action.setBadgeText({ text: '' })
    }
  } catch (err) {
    console.error('Failed to update badge:', err)
  }
}

// Initial badge check
updateBadge()

// Listen for storage changes to update badge dynamically
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    updateBadge()
  }
})

// Configure idle detection
async function setupIdleDetection(): Promise<void> {
  const settings = await getSettings()
  if (settings.autoRelockEnabled) {
    const seconds = Math.max(60, settings.autoRelockMinutes * 60)
    chrome.idle.setDetectionInterval(seconds)
  }
}

setupIdleDetection()

// Handle idle state changes
chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'idle' || newState === 'locked') {
    const settings = await getSettings()
    if (settings.autoRelockEnabled) {
      activeTabUnlocked = false

      // Broadcast SESSION_LOCKED to all tabs
      const tabs = await chrome.tabs.query({})
      for (const tab of tabs) {
        if (tab.id) {
          try {
            await chrome.tabs.sendMessage(tab.id, { type: 'SESSION_LOCKED' })
          } catch {
            // Tab might not have content script active
          }
        }
      }
    }
  }
})

// Message listener for popup / content script requests
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SESSION_UNLOCKED') {
    activeTabUnlocked = true
    sendResponse({ success: true })
  } else if (message.type === 'SESSION_LOCKED') {
    activeTabUnlocked = false
    sendResponse({ success: true })
  } else if (message.type === 'IS_SESSION_UNLOCKED') {
    sendResponse({ unlocked: activeTabUnlocked })
  }

  return true
})
