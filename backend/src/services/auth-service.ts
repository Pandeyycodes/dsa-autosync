import type { Config } from '../config';
import { GitHubError, type GitHubClient, type OAuthTokens } from '../github/client';
import { randomToken, safeEqual, sha256Base64Url, sha256Hex } from '../lib/crypto';
import { AppError, Errors } from '../lib/errors';
import { seal, unseal, UsedOnce } from '../lib/seal';

const STATE_TTL_MS = 10 * 60_000;
const HANDOFF_TTL_MS = 2 * 60_000;
const REFRESH_SKEW_MS = 5 * 60_000;

/** Everything the server needs about a user, sealed inside their session token. No database. */
export interface SessionData {
  v: 1;
  gid: string; // GitHub user id
  login: string;
  avatar: string | null;
  at: string; // GitHub access token
  atExp: number | null;
  rt: string | null; // GitHub refresh token (only when token expiration is enabled)
  rtExp: number | null;
  exp: number; // CodeSync session expiry
}

export interface AuthContext {
  session: SessionData;
  /** Set when GitHub tokens were refreshed during this request — returned to the client. */
  renewed?: string;
}

interface StateData { c: string; r: string; exp: number; n: string }
interface HandoffData { c: string; s: Omit<SessionData, 'exp'>; exp: number; n: string }

export type CallbackResult = { kind: 'redirect'; location: string } | { kind: 'error'; status: number; message: string };

export class AuthService {
  private usedStates = new UsedOnce();
  private usedHandoffs = new UsedOnce();
  private refreshing = new Map<string, { p: Promise<OAuthTokens>; at: number }>();

  constructor(
    private readonly config: Config,
    private readonly github: GitHubClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private get key() {
    return this.config.encryptionKey;
  }

  /** The only redirect targets allowed: chrome.identity redirect URLs of our extension(s). */
  isAllowedRedirect(uri: string): boolean {
    let u: URL;
    try {
      u = new URL(uri);
    } catch {
      return false;
    }
    const m = /^([a-p]{32})\.chromiumapp\.org$/.exec(u.hostname);
    return (
      u.protocol === 'https:' && !!m && this.config.ALLOWED_EXTENSION_IDS.includes(m[1]!) &&
      !u.username && !u.password && !u.port && !u.search && !u.hash &&
      (u.pathname === '/' || u.pathname === '/github')
    );
  }

  start(challenge: string, redirectUri: string): string {
    if (!this.isAllowedRedirect(redirectUri)) throw Errors.badRequest('Redirect URI is not allowed.', 'INVALID_REDIRECT');
    const state = seal({ c: challenge, r: redirectUri, exp: this.now().getTime() + STATE_TTL_MS, n: randomToken(16) } satisfies StateData, this.key, 'state');
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', this.config.GITHUB_APP_CLIENT_ID);
    url.searchParams.set('redirect_uri', this.config.callbackUrl);
    url.searchParams.set('state', state);
    url.searchParams.set('allow_signup', 'true');
    return url.toString();
  }

  /** GitHub redirects here. Validates the sealed state, exchanges the code server-side, hands off a one-time sealed code. */
  async callback(q: { code?: string; state?: string; error?: string }): Promise<CallbackResult> {
    const now = this.now().getTime();
    const state = unseal<StateData>(q.state, this.key, 'state');
    if (!state || state.exp <= now || !this.isAllowedRedirect(state.r) || !this.usedStates.use(state.n, state.exp, now)) {
      return { kind: 'error', status: 400, message: 'This sign-in link is invalid or has expired. Start again from the extension.' };
    }
    const back = (params: Record<string, string>) => {
      const u = new URL(state.r);
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
      return { kind: 'redirect', location: u.toString() } as const;
    };
    if (q.error) return back({ error: q.error === 'access_denied' ? 'access_denied' : 'authorization_failed' });
    if (!q.code || !/^[A-Za-z0-9_-]{1,100}$/.test(q.code)) return back({ error: 'invalid_callback' });

    let tokens: OAuthTokens;
    let user: { id: number; login: string; avatar_url: string | null };
    try {
      tokens = await this.github.exchangeCode(q.code, this.config.callbackUrl);
      user = await this.github.getUser(tokens.accessToken);
    } catch {
      return back({ error: 'exchange_failed' });
    }
    if (!Number.isSafeInteger(user.id) || !/^[A-Za-z0-9-]{1,39}$/.test(user.login)) return back({ error: 'invalid_user' });

    const handoff: HandoffData = {
      c: state.c,
      s: { v: 1, gid: String(user.id), login: user.login, avatar: user.avatar_url, ...this.tokenFields(tokens) },
      exp: now + HANDOFF_TTL_MS,
      n: randomToken(16),
    };
    return back({ code: seal(handoff, this.key, 'handoff') });
  }

  /** One-time handoff → session. The PKCE verifier proves this is the extension that started the flow. */
  exchange(code: string, verifier: string) {
    const now = this.now().getTime();
    const h = unseal<HandoffData>(code, this.key, 'handoff');
    if (!h || h.exp <= now || !safeEqual(sha256Base64Url(verifier), h.c) || !this.usedHandoffs.use(h.n, h.exp, now)) {
      throw new AppError(400, 'INVALID_HANDOFF', 'Authorization handoff is invalid or expired.');
    }
    const session: SessionData = { ...h.s, exp: now + this.config.SESSION_TTL_DAYS * 864e5 };
    return { token: seal(session, this.key, 'session'), session };
  }

  authenticate(authorization: string | undefined): AuthContext {
    const m = /^Bearer (\S{1,8000})$/.exec(authorization ?? '');
    const session = unseal<SessionData>(m?.[1], this.key, 'session');
    if (!session || session.v !== 1 || session.exp <= this.now().getTime()) throw Errors.unauthorized();
    return { session };
  }

  /** A valid GitHub token for server-side use. Refreshes (and re-seals the session) when near expiry. */
  async accessToken(ctx: AuthContext): Promise<string> {
    const s = ctx.session;
    const now = this.now().getTime();
    if (s.atExp === null || s.atExp - REFRESH_SKEW_MS > now) return s.at;
    if (!s.rt || (s.rtExp !== null && s.rtExp <= now)) throw Errors.reauth();

    // Concurrent requests with the same refresh token share one refresh (GitHub rotates refresh tokens).
    const key = sha256Hex(s.rt);
    const cached = this.refreshing.get(key);
    let p: Promise<OAuthTokens>;
    if (cached && now - cached.at < 60_000) {
      p = cached.p;
    } else {
      p = this.github.refresh(s.rt);
      this.refreshing.set(key, { p, at: now });
      for (const [k, v] of this.refreshing) if (now - v.at >= 60_000) this.refreshing.delete(k);
    }
    let tokens: OAuthTokens;
    try {
      tokens = await p;
    } catch (e) {
      if (e instanceof GitHubError && e.kind === 'oauth') throw Errors.reauth();
      throw new AppError(502, 'GITHUB_UNAVAILABLE', 'Could not refresh GitHub authorization.', { retryable: true });
    }
    ctx.session = { ...s, ...this.tokenFields(tokens) };
    ctx.renewed = seal(ctx.session, this.key, 'session');
    return tokens.accessToken;
  }

  /** Revoke CodeSync's authorization on GitHub; every sealed session for this user stops working. */
  async disconnect(ctx: AuthContext) {
    try {
      await this.github.revokeGrant(ctx.session.at);
    } catch {
      /* already revoked or expired */
    }
  }

  private tokenFields(t: OAuthTokens) {
    return {
      at: t.accessToken,
      atExp: t.expiresAt?.getTime() ?? null,
      rt: t.refreshToken,
      rtExp: t.refreshTokenExpiresAt?.getTime() ?? null,
    };
  }
}
