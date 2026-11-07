import { AuthManager } from '@/background/auth';
import { BackendClient } from '@/background/api';
import { JobService } from '@/background/jobs';
import { handleMessage, type RouterDeps } from '@/background/router';
import { DEFAULT_SETTINGS, KEYS } from '@/shared/constants';
import { createMemoryKV } from '@/shared/storage';
import { account, capture } from './fixtures';

const HANDOFF = `v1.${'a'.repeat(16)}.${'b'.repeat(22)}.${'c'.repeat(40)}`;
const EXT = 'abcdefghijklmnopabcdefghijklmnop';
const ORIGIN = `chrome-extension://${EXT}/`;

function deps(fetchImpl: typeof fetch = async () => new Response('{}', { status: 500 })) {
  const kv = createMemoryKV({ [KEYS.settings]: DEFAULT_SETTINGS, [KEYS.account]: account(), [KEYS.auth]: { token: 'T'.repeat(43), expiresAt: '2099-01-01T00:00:00Z' } });
  const api = new BackendClient('https://api.test', async () => 'T'.repeat(43), fetchImpl);
  const auth = new AuthManager({ kv, api, redirectUri: `https://${EXT}.chromiumapp.org/github`, launchWebAuthFlow: async () => '' });
  const jobs = new JobService({ kv, api: { sync: async () => ({ outcome: 'created', paths: [], commitSha: null, commitUrl: null }) } });
  const d: RouterDeps = { extensionId: EXT, extensionOrigin: ORIGIN, jobs, auth, api, kv };
  return { d, kv };
}

const lcTab = { id: EXT, url: 'https://leetcode.com/problems/two-sum/', tab: { id: 1 } };
const ui = { id: EXT, url: `${ORIGIN}dashboard.html` };

describe('service worker messaging', () => {
  it('accepts content messages only from the matching platform tab', async () => {
    const { d } = deps();
    const msg = { type: 'content/detected', platform: 'leetcode', submissionId: '111', slug: 'two-sum' };
    expect((await handleMessage(msg, lcTab, d)).ok).toBe(true);
    expect((await handleMessage(msg, { ...lcTab, url: 'https://evil.example/' }, d)).ok).toBe(false);
    expect((await handleMessage(msg, { ...lcTab, url: 'https://leetcode.com.evil.example/' }, d)).ok).toBe(false);
    expect((await handleMessage({ ...msg, platform: 'gfg' }, lcTab, d)).ok).toBe(false);
    expect((await handleMessage(msg, { ...lcTab, id: 'other-extension' }, d)).ok).toBe(false);
  });

  it('rejects malformed payloads', async () => {
    const { d } = deps();
    for (const bad of [null, 42, { type: 'content/detected', platform: 'leetcode', submissionId: '../x', slug: null }, { type: 'content/verdict', platform: 'leetcode', submissionId: '1', verdict: 'GREAT' }, { type: 'nope' }]) {
      const res = await handleMessage(bad, lcTab, d);
      expect(res.ok).toBe(false);
    }
  });

  it('routes verdicts end-to-end into the job queue', async () => {
    const { d, kv } = deps();
    await handleMessage({ type: 'content/detected', platform: 'leetcode', submissionId: '111', slug: 'two-sum' }, lcTab, d);
    const res = await handleMessage({ type: 'content/verdict', platform: 'leetcode', submissionId: '111', verdict: 'ACCEPTED', capture: capture() }, lcTab, d);
    expect(res.ok).toBe(true);
    await d.jobs.processQueue();
    const jobs = (await kv.get<Record<string, { status: string }>>(KEYS.jobs))!;
    expect(jobs['leetcode:111']!.status).toBe('uploaded');
  });

  it('only extension pages may send UI commands', async () => {
    const { d } = deps();
    expect(await handleMessage({ type: 'ui/ping' }, ui, d)).toEqual({ ok: true, data: 'pong' });
    expect((await handleMessage({ type: 'ui/ping' }, lcTab, d)).ok).toBe(false); // content script cannot drive UI actions
    expect((await handleMessage({ type: 'ui/disconnect' }, { id: EXT, url: 'https://leetcode.com/' }, d)).ok).toBe(false);
  });

  it('surfaces backend errors as safe messages', async () => {
    const { d } = deps(async () => new Response(JSON.stringify({ error: { code: 'GITHUB_PERMISSION_DENIED', message: 'No access.' } }), { status: 403 }));
    const res = await handleMessage({ type: 'ui/repos' }, ui, d);
    expect(res).toEqual({ ok: false, error: { code: 'GITHUB_PERMISSION_DENIED', message: 'No access.' } });
  });

  it('connect: validates the callback and stores only a CodeSync session', async () => {
    const kv = createMemoryKV({ [KEYS.settings]: DEFAULT_SETTINGS });
    const redirect = `https://${EXT}.chromiumapp.org/github`;
    const fetchImpl: typeof fetch = async (url) => {
      const u = String(url);
      if (u.endsWith('/v1/auth/start')) return Response.json({ authorizeUrl: 'https://github.com/login/oauth/authorize?x=1' });
      if (u.endsWith('/v1/auth/exchange')) return Response.json({ token: 'S'.repeat(43), expiresAt: '2099-01-01T00:00:00.000Z', user: { login: 'octocat', avatarUrl: null, githubId: '1' } });
      if (u.endsWith('/v1/me')) return Response.json(account());
      return new Response('{}', { status: 404 });
    };
    const api = new BackendClient('https://api.test', async () => (await kv.get<{ token: string }>(KEYS.auth))?.token ?? null, fetchImpl);

    const good = new AuthManager({ kv, api, redirectUri: redirect, launchWebAuthFlow: async () => `${redirect}?code=${HANDOFF}` });
    const acct = await good.connect();
    expect(acct.user.login).toBe('octocat');
    expect(await kv.get(KEYS.auth)).toEqual({ token: 'S'.repeat(43), expiresAt: '2099-01-01T00:00:00.000Z' });

    const spoofed = new AuthManager({ kv, api, redirectUri: redirect, launchWebAuthFlow: async () => `https://evil.example/github?code=${HANDOFF}` });
    await expect(spoofed.connect()).rejects.toMatchObject({ code: 'INVALID_CALLBACK' });
    const denied = new AuthManager({ kv, api, redirectUri: redirect, launchWebAuthFlow: async () => `${redirect}?error=access_denied` });
    await expect(denied.connect()).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
});

describe('stateless session renewal', () => {
  it('stores a re-sealed session returned by the backend after a GitHub token refresh', async () => {
    const kv = createMemoryKV({ [KEYS.auth]: { token: 'old', expiresAt: '2099-01-01T00:00:00.000Z' } });
    const renewed = `v1.${'r'.repeat(16)}.${'s'.repeat(22)}.${'t'.repeat(40)}`;
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ repositories: [], installUrl: 'https://x' }), { status: 200, headers: { 'x-codesync-session': renewed } });
    let auth!: AuthManager;
    const api = new BackendClient('https://api.test', async () => 'old', fetchImpl, (t) => auth.saveSession(t));
    auth = new AuthManager({ kv, api, redirectUri: 'https://x.chromiumapp.org/github', launchWebAuthFlow: async () => '' });
    await api.repos();
    expect(await kv.get(KEYS.auth)).toEqual({ token: renewed, expiresAt: '2099-01-01T00:00:00.000Z' });
  });

  it('ignores malformed renewal headers', async () => {
    const saved: string[] = [];
    const api = new BackendClient('https://api.test', async () => 't', async () => new Response('{"repositories":[],"installUrl":"https://x"}', { headers: { 'x-codesync-session': 'garbage<script>' } }), async (t) => void saved.push(t));
    await api.repos();
    expect(saved).toEqual([]);
  });
});
