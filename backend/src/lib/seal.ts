import { decrypt, encrypt } from './crypto';

/**
 * Sealed tokens: AES-256-GCM-encrypted JSON that only this server can open.
 * The purpose is bound as AAD, so a sealed OAuth state can never be replayed
 * as a session (or vice versa). Format: v1.<iv>.<tag>.<ciphertext> (URL-safe).
 */
export const SEALED_RE = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{8,6000}$/;

export type SealPurpose = 'state' | 'handoff' | 'session';

export function seal(value: object, key: Buffer, purpose: SealPurpose): string {
  return encrypt(JSON.stringify(value), key, `codesync:${purpose}`);
}

export function unseal<T>(token: string | undefined | null, key: Buffer, purpose: SealPurpose): T | null {
  if (!token || !SEALED_RE.test(token)) return null;
  try {
    return JSON.parse(decrypt(token, key, `codesync:${purpose}`)) as T;
  } catch {
    return null; // tampered, wrong purpose, or wrong key
  }
}

/** Small in-memory TTL set for best-effort one-time use (single instance, personal deployment). */
export class UsedOnce {
  private seen = new Map<string, number>();
  /** Returns false if the id was already used. */
  use(id: string, expiresAt: number, now: number): boolean {
    for (const [k, exp] of this.seen) if (exp <= now) this.seen.delete(k);
    if (this.seen.has(id)) return false;
    this.seen.set(id, expiresAt);
    return true;
  }
}
