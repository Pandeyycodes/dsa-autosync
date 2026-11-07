import { describe, expect, it } from 'vitest';
import { SESSION_HEADER } from '../src/app';
import { decrypt } from '../src/lib/crypto';
import { config, connect, EXT_ID, REDIRECT, setup, verifierPair } from './helpers';

const stateOf = (authorizeUrl: string) => new URL(authorizeUrl).searchParams.get('state')!;

describe('GitHub App authentication (stateless)', () => {
  it('completes the full flow: start → GitHub → callback → one-time handoff → sealed session', async () => {
    const { app, gh } = await setup();
    const { code } = gh.addUser('octocat', 1);
    gh.addRepo('octocat/dsa', 10, { installedFor: ['octocat'] });
    const { verifier, challenge } = verifierPair();

    const start = await app.inject({ method: 'POST', url: '/v1/auth/start', payload: { challenge, redirectUri: REDIRECT } });
    expect(start.statusCode).toBe(200);
    const authorize = new URL(start.json().authorizeUrl);
    expect(authorize.origin + authorize.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(authorize.searchParams.get('redirect_uri')).toBe('https://api.codesync.test/v1/auth/callback');

    const cb = await app.inject({ method: 'GET', url: `/v1/auth/callback?code=${code}&state=${stateOf(start.json().authorizeUrl)}` });
    expect(cb.statusCode).toBe(302);
    const loc = new URL(cb.headers.location as string);
    expect(loc.origin).toBe(`https://${EXT_ID}.chromiumapp.org`);
    expect(loc.toString()).not.toContain('ghu_'); // token only travels sealed

    const ex = await app.inject({ method: 'POST', url: '/v1/auth/exchange', payload: { code: loc.searchParams.get('code'), verifier } });
    expect(ex.statusCode).toBe(200);
    const { token, user } = ex.json();
    expect(user.login).toBe('octocat');
    expect(token).not.toContain('ghu_');

    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${token}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ user: { login: 'octocat' }, githubAuthorized: true });
  });

  it('rejects invalid, tampered, replayed or expired OAuth state', async () => {
    let now = new Date('2026-11-07T10:00:00Z');
    const { app, gh } = await setup({ now: () => now });
    const { code } = gh.addUser('octocat', 1);
    const { challenge } = verifierPair();

    for (const bad of ['A'.repeat(43), 'v1.aaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaaaaaaa.aaaaaaaaaaaa']) {
      expect((await app.inject({ method: 'GET', url: `/v1/auth/callback?code=${code}&state=${bad}` })).statusCode).toBe(400);
    }
    const state = stateOf((await app.inject({ method: 'POST', url: '/v1/auth/start', payload: { challenge, redirectUri: REDIRECT } })).json().authorizeUrl);
    const flipped = state.slice(0, -2) + (state.endsWith('A') ? 'BB' : 'AA');
    expect((await app.inject({ method: 'GET', url: `/v1/auth/callback?code=${code}&state=${flipped}` })).statusCode).toBe(400);

    expect((await app.inject({ method: 'GET', url: `/v1/auth/callback?code=${code}&state=${state}` })).statusCode).toBe(302);
    expect((await app.inject({ method: 'GET', url: `/v1/auth/callback?code=${code}&state=${state}` })).statusCode).toBe(400); // replay

    const state2 = stateOf((await app.inject({ method: 'POST', url: '/v1/auth/start', payload: { challenge, redirectUri: REDIRECT } })).json().authorizeUrl);
    now = new Date(now.getTime() + 11 * 60_000);
    expect((await app.inject({ method: 'GET', url: `/v1/auth/callback?code=${code}&state=${state2}` })).statusCode).toBe(400);
  });

  it('rejects redirect URIs that are not our extension', async () => {
    const { app } = await setup();
    const { challenge } = verifierPair();
    for (const redirectUri of [
      'https://evil.example/',
      'https://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.chromiumapp.org/',
      `http://${EXT_ID}.chromiumapp.org/`,
      `https://${EXT_ID}.chromiumapp.org.evil.com/`,
      `https://${EXT_ID}.chromiumapp.org/github?next=https://evil`,
    ]) {
      expect((await app.inject({ method: 'POST', url: '/v1/auth/start', payload: { challenge, redirectUri } })).statusCode, redirectUri).toBe(400);
    }
  });

  it('handoff is single-use, short-lived and bound to the PKCE verifier', async () => {
    let now = new Date('2026-11-07T10:00:00Z');
    const { app, gh } = await setup({ now: () => now });
    const handoffFor = async (login: string, id: number, challenge: string) => {
      const { code } = gh.addUser(login, id);
      const s = stateOf((await app.inject({ method: 'POST', url: '/v1/auth/start', payload: { challenge, redirectUri: REDIRECT } })).json().authorizeUrl);
      const cb = await app.inject({ method: 'GET', url: `/v1/auth/callback?code=${code}&state=${s}` });
      return new URL(cb.headers.location as string).searchParams.get('code')!;
    };
    const p = verifierPair();
    const h = await handoffFor('octocat', 1, p.challenge);
    expect((await app.inject({ method: 'POST', url: '/v1/auth/exchange', payload: { code: h, verifier: verifierPair().verifier } })).json().error.code).toBe('INVALID_HANDOFF');
    expect((await app.inject({ method: 'POST', url: '/v1/auth/exchange', payload: { code: h, verifier: p.verifier } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/v1/auth/exchange', payload: { code: h, verifier: p.verifier } })).statusCode).toBe(400); // reuse

    const p2 = verifierPair();
    const h2 = await handoffFor('hubot', 2, p2.challenge);
    now = new Date(now.getTime() + 3 * 60_000);
    expect((await app.inject({ method: 'POST', url: '/v1/auth/exchange', payload: { code: h2, verifier: p2.verifier } })).statusCode).toBe(400);
  });

  it('propagates user denial and failed code exchange back to the extension', async () => {
    const { app } = await setup();
    const { challenge } = verifierPair();
    const s1 = stateOf((await app.inject({ method: 'POST', url: '/v1/auth/start', payload: { challenge, redirectUri: REDIRECT } })).json().authorizeUrl);
    const denied = await app.inject({ method: 'GET', url: `/v1/auth/callback?error=access_denied&state=${s1}` });
    expect(new URL(denied.headers.location as string).searchParams.get('error')).toBe('access_denied');
    const s2 = stateOf((await app.inject({ method: 'POST', url: '/v1/auth/start', payload: { challenge, redirectUri: REDIRECT } })).json().authorizeUrl);
    const bad = await app.inject({ method: 'GET', url: `/v1/auth/callback?code=forged-code&state=${s2}` });
    expect(new URL(bad.headers.location as string).searchParams.get('error')).toBe('exchange_failed');
  });

  it('seals GitHub tokens with AES-GCM: unreadable without the server key, bound to purpose', async () => {
    const { app, gh } = await setup();
    const token = await connect(app, gh.addUser('octocat', 1).code);
    expect(token).toMatch(/^v1\./);
    expect(Buffer.from(token.split('.')[3]!, 'base64url').toString()).not.toContain('ghu_');
    expect(decrypt(token, config.encryptionKey, 'codesync:session')).toContain('ghu_octocat_token');
    expect(() => decrypt(token, config.encryptionKey, 'codesync:state')).toThrow();
    expect(() => decrypt(token, Buffer.alloc(32, 9), 'codesync:session')).toThrow();
  });

  it('expires sessions and disconnect revokes the GitHub grant (all sessions stop working)', async () => {
    let now = new Date('2026-11-07T10:00:00Z');
    const { app, gh } = await setup({ now: () => now });
    const { code } = gh.addUser('octocat', 1);
    gh.addRepo('octocat/dsa', 10, { installedFor: ['octocat'] });
    const token = await connect(app, code);
    const auth = { authorization: `Bearer ${token}` };

    expect((await app.inject({ method: 'POST', url: '/v1/auth/disconnect', headers: auth })).statusCode).toBe(200);
    expect(gh.revokedGrants).toContain('ghu_octocat_token');
    const after = await app.inject({ method: 'GET', url: '/v1/repos', headers: auth });
    expect(after.statusCode).toBe(401);
    expect(after.json().error.code).toBe('GITHUB_REAUTH_REQUIRED');

    const token2 = await connect(app, gh.addUser('octocat', 1).code);
    now = new Date(now.getTime() + 31 * 864e5);
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${token2}` } })).statusCode).toBe(401);
  });

  it('refreshes expiring GitHub tokens and returns the re-sealed session; revoked refresh → reauth', async () => {
    let now = new Date('2026-11-07T10:00:00Z');
    const { app, gh } = await setup({ now: () => now });
    const { code } = gh.addUser('octocat', 1);
    gh.addRepo('octocat/dsa', 10, { installedFor: ['octocat'] });
    const token = await connect(app, code);

    now = new Date(now.getTime() + 9 * 3600_000);
    const res = await app.inject({ method: 'GET', url: '/v1/repos', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const renewed = res.headers[SESSION_HEADER] as string;
    expect(renewed).toMatch(/^v1\./);
    expect(renewed).not.toBe(token);
    expect((await app.inject({ method: 'GET', url: '/v1/repos', headers: { authorization: `Bearer ${renewed}` } })).headers[SESSION_HEADER]).toBeUndefined();

    now = new Date(now.getTime() + 9 * 3600_000);
    gh.failRefresh = true;
    const r2 = await app.inject({ method: 'GET', url: '/v1/repos', headers: { authorization: `Bearer ${renewed}` } });
    expect(r2.statusCode).toBe(401);
    expect(r2.json().error.code).toBe('GITHUB_REAUTH_REQUIRED');
  });

  it('works with non-expiring tokens (expiration disabled in the GitHub App)', async () => {
    let now = new Date('2026-11-07T10:00:00Z');
    const { app, gh } = await setup({ now: () => now });
    gh.tokenExpiresIn = 0;
    const { code } = gh.addUser('octocat', 1);
    gh.addRepo('octocat/dsa', 10, { installedFor: ['octocat'] });
    const token = await connect(app, code);
    now = new Date(now.getTime() + 20 * 864e5);
    const res = await app.inject({ method: 'GET', url: '/v1/repos', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(gh.calls.some((c) => c.body?.includes('refresh_token'))).toBe(false);
  });

  it('detects authorization revoked on GitHub (401 from API)', async () => {
    const { app, gh } = await setup();
    const { code, token: ghToken } = gh.addUser('octocat', 1);
    const token = await connect(app, code);
    gh.users.delete(ghToken);
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('GITHUB_REAUTH_REQUIRED');
  });
});
