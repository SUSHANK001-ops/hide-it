/**
 * Adapter Registry — combined exports of all 6 site adapters.
 */

import type { SiteAdapter } from '~src/core/types'
import { chatgptAdapter } from './chatgpt'
import { claudeAdapter } from './claude'
import { geminiAdapter } from './gemini'
import { deepseekAdapter } from './deepseek'
import { qwenAdapter } from './qwen'
import { kimiAdapter } from './kimi'

export const adapters: SiteAdapter[] = [
  chatgptAdapter,
  claudeAdapter,
  geminiAdapter,
  deepseekAdapter,
  qwenAdapter,
  kimiAdapter
]

/** Find matching adapter for a given hostname */
export function getAdapterForHost(hostname: string): SiteAdapter | null {
  return adapters.find((adapter) => adapter.matches(hostname)) ?? null
}
