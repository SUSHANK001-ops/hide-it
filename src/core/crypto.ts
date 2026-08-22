/**
 * crypto.ts — Web Crypto API wrapper for password hashing.
 *
 * Uses SHA-256 via crypto.subtle. Never stores or transmits plaintext.
 * This module has ZERO DOM dependencies — pure crypto operations.
 */

/** Hash a plaintext password to a hex-encoded SHA-256 string */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Verify a plaintext password against a stored SHA-256 hex hash */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const inputHash = await hashPassword(password)
  // Constant-time-ish comparison (good enough for client-side)
  if (inputHash.length !== storedHash.length) return false
  let result = 0
  for (let i = 0; i < inputHash.length; i++) {
    result |= inputHash.charCodeAt(i) ^ storedHash.charCodeAt(i)
  }
  return result === 0
}
