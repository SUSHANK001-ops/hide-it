/**
 * crypto.ts — Web Crypto API wrapper for password hashing.
 *
 * Uses PBKDF2 with a random salt for proper password hashing.
 * Never stores or transmits plaintext.
 * This module has ZERO DOM dependencies — pure crypto operations.
 */

const PBKDF2_ITERATIONS = 100_000
const SALT_LENGTH = 16
const HASH_LENGTH = 32

/** Convert ArrayBuffer to hex string */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Convert hex string to Uint8Array */
function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

/**
 * Hash a plaintext password using PBKDF2 with a random salt.
 * Returns a string in the format "salt_hex:hash_hex"
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    HASH_LENGTH * 8
  )

  return `${bufToHex(salt.buffer)}:${bufToHex(hashBuffer)}`
}

/**
 * Verify a plaintext password against a stored "salt_hex:hash_hex" string.
 * Also supports legacy plain SHA-256 hex hashes (64 chars, no colon)
 * so existing users aren't locked out after the upgrade.
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  // Legacy support: plain SHA-256 (64 hex chars, no colon)
  if (!storedHash.includes(':')) {
    return verifyLegacySHA256(password, storedHash)
  }

  const [saltHex, hashHex] = storedHash.split(':')
  if (!saltHex || !hashHex) return false

  const salt = hexToBuf(saltHex)
  const encoder = new TextEncoder()

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    HASH_LENGTH * 8
  )

  const computedHex = bufToHex(hashBuffer)

  // Constant-time comparison
  if (computedHex.length !== hashHex.length) return false
  let result = 0
  for (let i = 0; i < computedHex.length; i++) {
    result |= computedHex.charCodeAt(i) ^ hashHex.charCodeAt(i)
  }
  return result === 0
}

/**
 * Legacy SHA-256 verification for backward compatibility.
 * Will be used only for hashes stored before the PBKDF2 migration.
 */
async function verifyLegacySHA256(
  password: string,
  storedHash: string
): Promise<boolean> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const inputHash = bufToHex(hashBuffer)

  if (inputHash.length !== storedHash.length) return false
  let result = 0
  for (let i = 0; i < inputHash.length; i++) {
    result |= inputHash.charCodeAt(i) ^ storedHash.charCodeAt(i)
  }
  return result === 0
}

// ─── Rate Limiting ────────────────────────────────────────────────

/** Tracks failed password attempts for rate limiting */
export class RateLimiter {
  private failedAttempts = 0
  private lockoutUntil = 0

  /** Returns remaining lockout ms, or 0 if not locked */
  getLockoutRemaining(): number {
    if (this.failedAttempts < 3) return 0
    const now = Date.now()
    return Math.max(0, this.lockoutUntil - now)
  }

  /** Record a failed attempt and calculate next lockout */
  recordFailure(): number {
    this.failedAttempts++
    if (this.failedAttempts >= 3) {
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped at 30s)
      const delaySec = Math.min(
        30,
        Math.pow(2, this.failedAttempts - 3)
      )
      this.lockoutUntil = Date.now() + delaySec * 1000
      return delaySec * 1000
    }
    return 0
  }

  /** Reset on successful auth */
  reset(): void {
    this.failedAttempts = 0
    this.lockoutUntil = 0
  }
}

/** Singleton rate limiter for global use */
export const rateLimiter = new RateLimiter()
