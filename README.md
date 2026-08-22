# 🔒 AI Chat Lock — Browser Extension

A Manifest V3 browser extension built with **Plasmo**, **React**, and **TypeScript** that allows users to password-lock individual AI chat conversations across **6 major AI chat web applications**.

---

## 🌟 Supported Sites

1. **ChatGPT** (`chatgpt.com` / `chat.openai.com`)
2. **Claude** (`claude.ai`)
3. **Gemini** (`gemini.google.com`)
4. **DeepSeek** (`chat.deepseek.com`)
5. **Qwen** (`chat.qwen.ai`)
6. **Kimi** (`kimi.com` / `kimi.moonshot.cn`)

---

## 🏗️ Architecture & Isolation Constraint

The extension strictly decouples DOM targeting from business logic:

```
/src
  /adapters           <-- ONLY site-specific DOM selectors live here
    /chatgpt.ts
    /claude.ts
    /gemini.ts
    /deepseek.ts
    /qwen.ts
    /kimi.ts
    /types.ts         <-- SiteAdapter interface implemented by all 6
    /index.ts         <-- Adapter registry
  /core               <-- ZERO DOM logic
    /lock-engine.ts   <-- Site-agnostic state & password flow
    /storage.ts       <-- chrome.storage.local wrapper
    /observer.ts      <-- MutationObserver factory
    /crypto.ts       <-- Web Crypto API SHA-256 wrapper
    /modal.ts        <-- Pure-DOM password prompt overlay
  /contents
    /ai-chat-lock.ts  <-- Entry point injected on all 6 sites
  /popup
    /index.tsx        <-- React Vault View popup
    /popup.css
  /background.ts       <-- Idle timer & badge management
```

> **Note on UI Updates**: When any of the 6 sites updates its layout or CSS classes in the future, **ONLY edit the corresponding `/src/adapters/<site>.ts` file**. None of the core engine, content script, or popup files will need modifications.

---

## 🎯 Per-Site DOM Selectors Reference

| Site | Site ID | Adapter File | Sidebar Root Selectors | Chat Row Selectors | Chat ID Extraction Pattern |
|---|---|---|---|---|---|
| **ChatGPT** | `chatgpt` | [`chatgpt.ts`](file:///d:/webdevstuff/extension/src/adapters/chatgpt.ts) | `nav[aria-label="Chat history"]`, `nav` | `a[href*="/c/"]` | UUID regex `/c/([a-f0-9-]+)` from `href` |
| **Claude** | `claude` | [`claude.ts`](file:///d:/webdevstuff/extension/src/adapters/claude.ts) | `[data-testid="chat-history"]`, `nav[aria-label*="chat"]` | `a[href*="/chat/"]` | UUID regex `/chat/([a-f0-9-]+)` from `href` |
| **Gemini** | `gemini` | [`gemini.ts`](file:///d:/webdevstuff/extension/src/adapters/gemini.ts) | `div[role="navigation"]`, `mat-sidenav` | `a[href*="/app/"]`, `[role="listitem"] a` | Regex `/(?:app\|chat)\/([a-f0-9]+)` or `data-conversation-id` |
| **DeepSeek**| `deepseek` | [`deepseek.ts`](file:///d:/webdevstuff/extension/src/adapters/deepseek.ts)| `[class*="sidebar"]`, `aside`, `nav[role="navigation"]` | `a[href*="/chat/"]`, `[data-chat-id]` | Regex `/chat/([a-zA-Z0-9_-]+)` or `data-chat-id` |
| **Qwen** | `qwen` | [`qwen.ts`](file:///d:/webdevstuff/extension/src/adapters/qwen.ts) | `[class*="sidebar"]`, `aside`, `nav` | `a[href*="/chat/"]`, `a[href*="/c/"]` | Regex `/(?:chat\|c)\/([a-zA-Z0-9_-]+)` |
| **Kimi** | `kimi` | [`kimi.ts`](file:///d:/webdevstuff/extension/src/adapters/kimi.ts) | `[class*="sidebar"]`, `aside`, `nav` | `a[href*="/chat/"]`, `[data-chat-id]` | Regex `/(?:chat\|c)\/([a-zA-Z0-9_-]+)` or `data-chat-id` |

---

## 🚀 Development & Loading into Chrome

### Prerequisites
- Node.js (v18+)
- `npm` or `pnpm`

### Setup & Run
```bash
# Install dependencies
npm install

# Run Plasmo development server
npm run dev
```

### Loading into Chrome
1. Open Google Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top right corner)
3. Click **Load unpacked**
4. Select the `build/chrome-mv3-dev` directory created by Plasmo inside this project folder

---

## 🛡️ Security Features
- **Zero Plaintext Storage**: Passwords are hashed using SHA-256 via Web Crypto API (`crypto.subtle`) before saving to `chrome.storage.local`.
- **Title DOM Sanitization**: When a chat is locked, its real title string is completely replaced with `🔒 Locked chat` in DOM text nodes, preventing DOM inspection or background reading.
- **Session Auto Re-Lock**: Configurable idle timeout (default 5 min) automatically locks open sessions when user is away.
