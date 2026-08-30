# Hide-it 🔒

**Hide-it** is a privacy-focused browser extension that allows you to password-protect individual chat conversations across popular AI platforms. Whether you're working on sensitive code, personal writing, or confidential business strategies, Hide-it ensures that your private chats remain for your eyes only.

## Features

- **Per-Chat Locking:** Secure individual conversations, not just the entire website.
- **Master Password:** Use a single, secure master password to manage all your locked chats.
- **Cross-Platform Vault:** View and manage all your locked chats across different AI platforms in one central popup vault.
- **Privacy Masking:** 
  - In the sidebar of the website, locked chats simply display as `🔒 Locked chat` so the topic is hidden.
  - In the extension vault, titles are masked for extra privacy (e.g., `Write social media captions` becomes `W**** s***** m**** c*******`).
- **Auto Re-lock:** Automatically locks your chats after a period of inactivity.

## Supported Platforms

Currently, Hide-it officially supports securing chats on:
- **ChatGPT** (chatgpt.com, chat.openai.com)
- **Claude** (claude.ai)
- **Gemini** (gemini.google.com)
- **Kimi** (kimi.ai)

*(Note: Additional AI platforms may be supported under the hood.)*

---

## How It Works: A Step-by-Step Guide

### 1. Setting Your Master Password
The very first time you try to lock a chat, Hide-it will prompt you to create a **Master Password**. This password is encrypted and stored locally on your device. You will use this password to unlock your chats in the future. 

### 2. Locking a Chat
Once your master password is set, locking a chat is **instant**:
- Hover over a chat in the sidebar of your favorite AI platform.
- Click the sleek `🔓` (Unlock) icon to lock it.
- If you were currently viewing that chat, Hide-it will instantly navigate you away to the homepage to hide the content.
- The chat's title in the sidebar will instantly change to `🔒 Locked chat`, ensuring no one can see what the chat was about.

### 3. Unlocking a Chat
When you want to resume a locked conversation:
- Click the `🔒` (Lock) icon next to the chat in the sidebar.
- A secure prompt will appear asking for your master password.
- Enter your password. If correct, the original chat title will be restored, and you will be able to click on the chat to view it.

### 4. Using the Vault
Click on the Hide-it extension icon in your browser toolbar to open the Vault.
- You must enter your master password to access the Vault.
- Inside the Vault, you will see a list of every locked chat across all supported platforms.
- **Title Masking:** In the vault, titles are obfuscated. Only the first letter of each word is shown (e.g. `S***** p******`), keeping your topics discreet even when the vault is open.
- **Inline Unlock:** Click the `🔓` icon next to any chat in the Vault. An inline password field will slide out. Enter your password to unlock the chat directly from the Vault.

### 5. Settings & Auto-Relock
In the extension popup, switch to the **Settings** tab.
- **Auto re-lock on idle:** Enable this to automatically lock all your unlocked chats if your browser is idle for a specified number of minutes (e.g., 5 minutes).
- **Change Password:** You can change your Master Password securely from this menu at any time.

---

## Technical Details

- **Security:** Hide-it uses PBKDF2 with SHA-256 and a random salt for secure password hashing. 
- **Storage:** All data (including the password hash and the list of locked chats) is stored entirely locally on your machine using `chrome.storage.local`. Nothing is ever sent to a server.
- **Framework:** Built with React, TypeScript, and Plasmo.
