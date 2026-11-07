import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '../src/lib/crypto';
import { seal } from '../src/lib/seal';
import { config, connect, EXT_ID, REPO, setup, syncRequest } from './helpers';

describe('security', () => {
  it('rejects unauthenticated, malformed and forged tokens on every user route', async () => {
    const { app } = await setup();
    const forgedWithOtherKey = seal({ v: 1, gid: '1', login: 'x', avatar: null, at: 'ghu_x', atExp: null, rt: null, rtExp: null, exp: Date.now() + 1e9 }, Buffer.alloc(32, 5), 'session');
    const stateAsSession = seal({ c: 'x', r: 'y', exp: Date.now() + 1e9, n: 'z' }, config.encryptionKey, 'state');
    const routes: [string, string][] = [
      ['GET', '/v1/me'], ['GET', '/v1/repos'], ['GET', '/v1/repos/1/branches'], ['POST', '/v1/repo-config/validate'],
      ['POST', '/v1/repo-config/test'], ['POST', '/v1/sync'], ['POST', '/v1/auth/disconnect'],
    ];
    for (const [method, url] of routes) {
      for (const authorization of [undefined, 'Bearer nope', `Bearer ${forgedWithOtherKey}`, `Bearer ${stateAsSession}`, 'Basic abc']) {
        const res = await app.inject({ method: method as 'GET', url, headers: authorization ? { authorization } : {} });
        expect(res.statusCode, `${method} ${url}`).toBe(401);
      }
    }
  });

  it('prevents cross-user access to repositories', async () => {
    const { app, gh } = await setup();
    const alice = await connect(app, gh.addUser('alice', 1).code);
    const bob = await connect(app, gh.addUser('bob', 2).code);
    gh.addRepo('alice/private-dsa', 100, { installedFor: ['alice'] });
    const bobAuth = { authorization: `Bearer ${bob}` };
    const target = { ...REPO, repositoryId: '100' };

    expect((await app.inject({ method: 'GET', url: '/v1/repos', headers: bobAuth })).json().repositories).toEqual([]);
    expect((await app.inject({ method: 'GET', url: '/v1/repos/100/branches', headers: bobAuth })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/v1/repo-config/validate', headers: bobAuth, payload: target })).statusCode).toBe(403);
    // Bob naming Alice's repository id in a sync request is refused by GitHub-side access checks.
    expect((await app.inject({ method: 'POST', url: '/v1/sync', headers: bobAuth, payload: syncRequest({}, { repo: target }) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/v1/sync', headers: { authorization: `Bearer ${alice}` }, payload: syncRequest({}, { repo: target }) })).statusCode).toBe(200);
    expect(gh.files('alice/private-dsa').size).toBe(2);
  });

  it('never leaks GitHub tokens or app secrets in responses', async () => {
    const { app, gh } = await setup();
    const { code } = gh.addUser('octocat', 1);
    gh.addRepo('octocat/dsa', 10, { installedFor: ['octocat'] });
    const token = await connect(app, code);
    const auth = { authorization: `Bearer ${token}` };
    const bodies: string[] = [];
    for (const [method, url, payload] of [
      ['GET', '/v1/me'], ['GET', '/v1/repos'], ['POST', '/v1/repo-config/validate', REPO], ['POST', '/v1/sync', syncRequest()],
    ] as [string, string, object?][]) {
      const r = await app.inject({ method: method as 'GET', url, headers: auth, payload });
      bodies.push(r.body, JSON.stringify(r.headers));
    }
    const all = bodies.join('\n');
    expect(all).not.toMatch(/ghu_|ghr_/);
    expect(all).not.toContain(config.GITHUB_APP_CLIENT_SECRET);
  });

  it('rejects malicious filenames, paths and spoofed metadata', async () => {
    const { app, gh } = await setup();
    const { code } = gh.addUser('octocat', 1);
    gh.addRepo('octocat/dsa', 10, { installedFor: ['octocat'] });
    const auth = { authorization: `Bearer ${await connect(app, code)}` };
    const p = syncRequest().capture.problem;
    const bad = [
      syncRequest({ problem: { ...p, slug: '../../.github/workflows/x' } }),
      syncRequest({ submissionId: '../1' }),
      syncRequest({ problem: { ...p, url: 'https://evil.example/problems/two-sum' } }),
      syncRequest({ problem: { ...p, url: 'javascript:alert(1)' } }),
      syncRequest({}, { repo: { ...REPO, rootFolder: '../../etc' } }),
      syncRequest({}, { repo: { ...REPO, repositoryId: 'octocat/dsa' } }),
      { ...syncRequest(), codeSha256: 'f'.repeat(64) },
      { ...syncRequest(), verdict: 'WRONG_ANSWER' },
      { ...syncRequest(), capture: { ...syncRequest().capture, language: 'bash' } },
    ];
    for (const payload of bad) {
      const res = await app.inject({ method: 'POST', url: '/v1/sync', headers: auth, payload });
      expect(res.statusCode, JSON.stringify(payload).slice(0, 120)).toBe(400);
    }
    const res = await app.inject({
      method: 'POST', url: '/v1/sync', headers: auth,
      payload: syncRequest({ problem: { ...p, topics: ['../../..', 'x'], title: '<script>alert(1)</script>' } }),
    });
    expect(res.statusCode).toBe(200);
    for (const path of res.json().paths as string[]) {
      expect(path.startsWith('DSA/LeetCode/')).toBe(true);
      expect(path.split('/')).not.toContain('..');
    }
    expect(gh.files('octocat/dsa').get(res.json().paths[1])!.content).not.toContain('<script>');
  });

  it('rejects invalid repository identifiers', async () => {
    const { app, gh } = await setup();
    const auth = { authorization: `Bearer ${await connect(app, gh.addUser('octocat', 1).code)}` };
    for (const id of ['abc', '1;DROP', '..%2F..', '99999999999999999999999']) {
      expect([400, 403]).toContain((await app.inject({ method: 'GET', url: `/v1/repos/${id}/branches`, headers: auth })).statusCode);
    }
  });

  it('rejects invalid authorization callbacks', async () => {
    const { app } = await setup();
    for (const q of ['', '?code=x', '?state=short', `?state=${'A'.repeat(43)}&code=x`, '?state=%3Cscript%3E']) {
      const res = await app.inject({ method: 'GET', url: `/v1/auth/callback${q}` });
      expect(res.statusCode).toBe(400);
      expect(res.body).not.toContain('<script>');
    }
    const ex = await app.inject({ method: 'POST', url: '/v1/auth/exchange', payload: { code: 'A'.repeat(43), verifier: 'B'.repeat(43) } });
    expect(ex.statusCode).toBe(400);
  });

  it('applies secure headers, restrictive CORS and rate limits', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/healthz', headers: { origin: `chrome-extension://${EXT_ID}` } });
    expect(res.headers['strict-transport-security']).toContain('max-age');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBe(`chrome-extension://${EXT_ID}`);
    expect((await app.inject({ method: 'GET', url: '/healthz', headers: { origin: 'https://evil.example' } })).headers['access-control-allow-origin']).toBeUndefined();
    let limited = 0;
    for (let i = 0; i < 25; i++) if ((await app.inject({ method: 'POST', url: '/v1/auth/exchange', payload: {} })).statusCode === 429) limited++;
    expect(limited).toBeGreaterThan(0);
  });

  it('binds ciphertexts to their context (AAD)', () => {
    const key = Buffer.alloc(32, 1);
    const ct = encrypt('secret', key, 'access:1');
    expect(decrypt(ct, key, 'access:1')).toBe('secret');
    expect(() => decrypt(ct, key, 'access:2')).toThrow();
    expect(() => decrypt(ct, Buffer.alloc(32, 2), 'access:1')).toThrow();
  });
});
