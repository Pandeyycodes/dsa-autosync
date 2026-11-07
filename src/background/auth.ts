import { KEYS } from '@/shared/constants';
import { SEALED_TOKEN_RE } from '@/shared/schemas';
import type { KV } from '@/shared/storage';
import type { Account } from '@/shared/types';
import { ApiFailure, type BackendClient } from './api';

export interface StoredAuth {
  token: string;
  expiresAt: string;
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function pkcePair() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

export interface AuthDeps {
  kv: KV;
  api: BackendClient;
  /** chrome.identity.launchWebAuthFlow wrapper — returns the final redirect URL. */
  launchWebAuthFlow: (url: string) => Promise<string>;
  redirectUri: string;
}

export class AuthManager {
  constructor(private readonly d: AuthDeps) {}

  async token(): Promise<string | null> {
    const a = await this.d.kv.get<StoredAuth>(KEYS.auth);
    if (!a) return null;
    if (new Date(a.expiresAt).getTime() <= Date.now()) {
      await this.clear();
      return null;
    }
    return a.token;
  }

  /** GitHub App sign-in. The extension never sees a GitHub token — only a CodeSync session. */
  async connect(): Promise<Account> {
    const { verifier, challenge } = await pkcePair();
    const { authorizeUrl } = await this.d.api.startAuth(challenge, this.d.redirectUri);
    const finalUrl = new URL(await this.d.launchWebAuthFlow(authorizeUrl));
    const expected = new URL(this.d.redirectUri);
    if (finalUrl.origin !== expected.origin || finalUrl.pathname !== expected.pathname) {
      throw new ApiFailure(400, 'INVALID_CALLBACK', 'Unexpected authorization callback.', false);
    }
    const error = finalUrl.searchParams.get('error');
    if (error) throw new ApiFailure(400, error === 'access_denied' ? 'ACCESS_DENIED' : 'AUTH_FAILED', error === 'access_denied' ? 'GitHub authorization was cancelled.' : 'GitHub authorization failed.', false);
    const code = finalUrl.searchParams.get('code');
    if (!code || !SEALED_TOKEN_RE.test(code)) throw new ApiFailure(400, 'INVALID_CALLBACK', 'Malformed authorization callback.', false);
    const session = await this.d.api.exchange(code, verifier);
    await this.d.kv.set<StoredAuth>(KEYS.auth, { token: session.token, expiresAt: session.expiresAt });
    return this.refresh();
  }

  async refresh(): Promise<Account> {
    try {
      const me = await this.d.api.me();
      // Repository choice lives only in the extension (the backend is stateless).
      const prev = await this.d.kv.get<Account>(KEYS.account);
      const account: Account = { ...me, repo: prev?.user.githubId === me.user.githubId ? prev.repo : null };
      await this.d.kv.set<Account>(KEYS.account, account);
      return account;
    } catch (e) {
      if (e instanceof ApiFailure && e.status === 401) await this.clear();
      throw e;
    }
  }

  async disconnect() {
    try {
      await this.d.api.disconnect();
    } finally {
      await this.clear();
    }
  }

  /** Nothing is stored server-side: revoke the GitHub grant and wipe local data. */
  async deleteAccount() {
    await this.disconnect();
  }

  async saveSession(token: string) {
    const a = await this.d.kv.get<StoredAuth>(KEYS.auth);
    if (a) await this.d.kv.set<StoredAuth>(KEYS.auth, { ...a, token });
  }

  async clear() {
    await this.d.kv.remove(KEYS.auth);
    await this.d.kv.remove(KEYS.account);
  }
}
