import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256-bit URL-safe random token (43 chars). */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const sha256Hex = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export const sha256Base64Url = (value: string): string => createHash('sha256').update(value).digest('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Git blob object id for UTF-8 content — lets us compare with GitHub file SHAs. */
export function gitBlobSha(content: string): string {
  const body = Buffer.from(content, 'utf8');
  return createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex');
}

const VERSION = 'v1';

/**
 * AES-256-GCM authenticated encryption. `context` is bound as AAD so a
 * ciphertext copied to another user/column fails to decrypt.
 */
export function encrypt(plaintext: string, key: Buffer, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function decrypt(payload: string, key: Buffer, context: string): string {
  const [version, iv, tag, ct] = payload.split('.');
  if (version !== VERSION || !iv || !tag || !ct) throw new Error('Unsupported ciphertext format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}
