import { createHash } from 'node:crypto';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { GitHubClient } from '../src/github/client';
import type { SyncRequest } from '../../src/shared/schemas';

export const EXT_ID = 'abcdefghijklmnopabcdefghijklmnop';
export const REDIRECT = `https://${EXT_ID}.chromiumapp.org/github`;

export const config = loadConfig({
  NODE_ENV: 'test',
  PUBLIC_URL: 'https://api.codesync.test',
  GITHUB_APP_CLIENT_ID: 'Iv1.testclient',
  GITHUB_APP_CLIENT_SECRET: 'test-client-secret-value',
  GITHUB_APP_SLUG: 'codesync-test',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  ALLOWED_EXTENSION_IDS: EXT_ID,
  LOG_LEVEL: 'silent',
});

interface FakeFile { content: string; sha: string }
interface FakeRepo { id: number; full_name: string; private: boolean; default_branch: string; push: boolean; branches: Map<string, string>; commits: Map<string, { tree: Map<string, FakeFile> }>; installedFor: Set<string> }

const blobSha = (c: string) => {
  const b = Buffer.from(c, 'utf8');
  return createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
};
let seq = 0;
const nextSha = () => createHash('sha1').update(String(++seq)).digest('hex');

/**
 * In-memory GitHub: OAuth token endpoint, user, installations, repos,
 * contents and the Git Data API. Supports fault injection.
 */
export class FakeGitHub {
  users = new Map<string, { id: number; login: string }>(); // token -> user
  codes = new Map<string, string>(); // oauth code -> token
  refreshTokens = new Map<string, string>(); // refresh -> login
  repos: FakeRepo[] = [];
  revokedGrants: string[] = [];
  calls: { method: string; url: string; auth?: string; body?: string }[] = [];
  /** Return a Response (or throw) to inject a failure for matching requests. */
  fault: ((method: string, url: string) => Response | 'network' | null) | null = null;
  tokenExpiresIn = 28800;
  failRefresh = false;

  addUser(login: string, id: number) {
    const token = `ghu_${login}_token`;
    const code = `code-${login}`;
    this.users.set(token, { id, login });
    this.codes.set(code, token);
    this.refreshTokens.set(`ghr_${login}`, login);
    return { token, code };
  }

  addRepo(fullName: string, id: number, opts: { push?: boolean; installedFor?: string[]; empty?: boolean } = {}) {
    const repo: FakeRepo = {
      id, full_name: fullName, private: true, default_branch: 'main', push: opts.push ?? true,
      branches: new Map(), commits: new Map(), installedFor: new Set(opts.installedFor ?? []),
    };
    if (!opts.empty) {
      const sha = nextSha();
      repo.commits.set(sha, { tree: new Map() });
      repo.branches.set('main', sha);
    }
    this.repos.push(repo);
    return repo;
  }

  files(fullName: string, branch = 'main') {
    const r = this.repos.find((x) => x.full_name === fullName)!;
    const head = r.branches.get(branch);
    return head ? r.commits.get(head)!.tree : new Map<string, FakeFile>();
  }

  private json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? init.body : undefined;
    this.calls.push({ method, url: url.toString(), auth: headers.get('authorization') ?? undefined, body });
    const injected = this.fault?.(method, url.pathname);
    if (injected === 'network') throw new TypeError('fetch failed');
    if (injected) return injected;

    if (url.hostname === 'github.com' && url.pathname === '/login/oauth/access_token') {
      const p = JSON.parse(body ?? '{}');
      if (p.client_secret !== config.GITHUB_APP_CLIENT_SECRET) return this.json(200, { error: 'incorrect_client_credentials' });
      if (p.grant_type === 'refresh_token') {
        const login = this.refreshTokens.get(p.refresh_token);
        if (!login || this.failRefresh) return this.json(200, { error: 'bad_refresh_token' });
        const token = `ghu_${login}_refreshed_${++seq}`;
        const u = [...this.users.values()].find((x) => x.login === login)!;
        this.users.set(token, u);
        return this.json(200, { access_token: token, expires_in: this.tokenExpiresIn, refresh_token: p.refresh_token, refresh_token_expires_in: 15897600 });
      }
      const token = this.codes.get(p.code);
      if (!token) return this.json(200, { error: 'bad_verification_code' });
      this.codes.delete(p.code);
      const login = this.users.get(token)!.login;
      return this.json(200, { access_token: token, expires_in: this.tokenExpiresIn, refresh_token: `ghr_${login}`, refresh_token_expires_in: 15897600, token_type: 'bearer' });
    }

    if (url.pathname.startsWith('/applications/') && method === 'DELETE') {
      this.revokedGrants.push(JSON.parse(body ?? '{}').access_token);
      const user = this.users.get(JSON.parse(body ?? '{}').access_token);
      if (user) for (const [t, u] of this.users) if (u === user) this.users.delete(t);
      return this.json(204, null);
    }

    const token = headers.get('authorization')?.replace('Bearer ', '') ?? '';
    const user = this.users.get(token);
    if (!user) return this.json(401, { message: 'Bad credentials' });
    const visible = this.repos.filter((r) => r.installedFor.has(user.login));
    const path = url.pathname;
    let m: RegExpMatchArray | null;

    if (path === '/user') return this.json(200, { id: user.id, login: user.login, avatar_url: `https://avatars.test/${user.login}` });
    if (path === '/user/installations') return this.json(200, { installations: visible.length ? [{ id: 1 }] : [] });
    if ((m = path.match(/^\/user\/installations\/\d+\/repositories$/)))
      return this.json(200, { total_count: visible.length, repositories: visible.map((r) => this.repoJson(r)) });
    if ((m = path.match(/^\/repositories\/(\d+)$/))) {
      const r = visible.find((x) => String(x.id) === m![1]);
      return r ? this.json(200, this.repoJson(r)) : this.json(404, { message: 'Not Found' });
    }
    if ((m = path.match(/^\/repos\/([^/]+\/[^/]+)\/(.*)$/))) {
      const r = visible.find((x) => x.full_name === m![1]);
      if (!r) return this.json(404, { message: 'Not Found' });
      return this.repoRoute(r, method, decodeURIComponent(m[2]!), url, body);
    }
    return this.json(404, { message: 'Not Found' });
  };

  private repoJson(r: FakeRepo) {
    return { id: r.id, full_name: r.full_name, private: r.private, default_branch: r.default_branch, permissions: { push: r.push } };
  }

  private repoRoute(r: FakeRepo, method: string, rest: string, url: URL, body?: string): Response {
    const b = body ? JSON.parse(body) : {};
    const write = () => (r.push ? null : this.json(403, { message: 'Resource not accessible by integration' }));
    if (rest === 'branches') return this.json(200, [...r.branches.keys()].map((name) => ({ name })));
    if (rest.startsWith('branches/')) {
      const sha = r.branches.get(rest.slice(9));
      return sha ? this.json(200, { name: rest.slice(9), commit: { sha } }) : this.json(404, { message: 'Branch not found' });
    }
    if (rest === 'git/blobs' && method === 'POST') return write() ?? (r.branches.size ? this.json(201, { sha: blobSha(b.content) }) : this.json(409, { message: 'Git Repository is empty.' }));
    if (rest.startsWith('git/ref/heads/')) {
      if (!r.branches.size) return this.json(409, { message: 'Git Repository is empty.' });
      const sha = r.branches.get(rest.slice(14));
      return sha ? this.json(200, { object: { sha } }) : this.json(404, { message: 'Not Found' });
    }
    if (rest.startsWith('git/commits/') && method === 'GET') return this.json(200, { sha: rest.slice(12), tree: { sha: `tree-${rest.slice(12)}` } });
    if (rest.startsWith('git/trees/') && method === 'GET') {
      if (!r.branches.size) return this.json(409, { message: 'Git Repository is empty.' });
      const head = r.branches.get(rest.slice(10));
      if (!head) return this.json(404, { message: 'Not Found' });
      const entries = new Map<string, string>();
      for (const p of r.commits.get(head)!.tree.keys()) {
        const segs = p.split('/');
        for (let i = 1; i < segs.length; i++) entries.set(segs.slice(0, i).join('/'), 'tree');
        entries.set(p, 'blob');
      }
      return this.json(200, { tree: [...entries].map(([path, type]) => ({ path, type })), truncated: false });
    }
    if (rest === 'git/trees' && method === 'POST') {
      const err = write(); if (err) return err;
      const base = String(b.base_tree).replace('tree-', '');
      const tree = new Map(r.commits.get(base)!.tree);
      for (const f of b.tree) tree.set(f.path, { content: f.content, sha: blobSha(f.content) });
      const sha = nextSha();
      r.commits.set(`pending-${sha}`, { tree });
      return this.json(201, { sha });
    }
    if (rest === 'git/commits' && method === 'POST') {
      const sha = nextSha();
      r.commits.set(sha, r.commits.get(`pending-${b.tree}`)!);
      return this.json(201, { sha, html_url: `https://github.com/${r.full_name}/commit/${sha}` });
    }
    if (rest.startsWith('git/refs/heads/') && method === 'PATCH') {
      r.branches.set(rest.slice(15), b.sha);
      return this.json(200, { object: { sha: b.sha } });
    }
    if (rest.startsWith('contents/')) {
      const p = rest.slice(9);
      if (method === 'PUT') {
        const err = write(); if (err) return err;
        const head = r.branches.get(b.branch);
        const tree = new Map(head ? r.commits.get(head)!.tree : []);
        const content = Buffer.from(b.content, 'base64').toString('utf8');
        tree.set(p, { content, sha: blobSha(content) });
        const sha = nextSha();
        r.commits.set(sha, { tree });
        r.branches.set(b.branch, sha);
        return this.json(201, { commit: { sha, html_url: `https://github.com/${r.full_name}/commit/${sha}` } });
      }
      const ref = url.searchParams.get('ref') ?? 'main';
      const tree = this.files(r.full_name, ref);
      const file = tree.get(p);
      if (file) return this.json(200, { type: 'file', name: p.split('/').pop(), path: p, sha: file.sha });
      const children = new Map<string, string>();
      for (const k of tree.keys()) if (k.startsWith(p + '/')) {
        const rest2 = k.slice(p.length + 1);
        children.set(rest2.split('/')[0]!, rest2.includes('/') ? 'dir' : 'file');
      }
      if (children.size) return this.json(200, [...children].map(([name, type]) => ({ name, type, path: `${p}/${name}`, sha: 'x' })));
      return this.json(404, { message: 'Not Found' });
    }
    return this.json(404, { message: 'Not Found' });
  }
}

export async function setup(opts: { now?: () => Date } = {}) {
  const gh = new FakeGitHub();
  const github = new GitHubClient({
    clientId: config.GITHUB_APP_CLIENT_ID,
    clientSecret: config.GITHUB_APP_CLIENT_SECRET,
    fetch: gh.fetch,
    sleep: async () => {},
    now: opts.now,
  });
  const app = await buildApp({ config, github, now: opts.now, logger: false });
  return { app, gh };
}

export const verifierPair = () => {
  const verifier = Buffer.from(`verifier-${Math.random()}-${Math.random()}-padpadpadpad`).toString('base64url').slice(0, 64);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
};

type App = Awaited<ReturnType<typeof setup>>['app'];

/** Full connect flow → session token. */
export async function connect(app: App, code: string) {
  const { verifier, challenge } = verifierPair();
  const start = await app.inject({ method: 'POST', url: '/v1/auth/start', payload: { challenge, redirectUri: REDIRECT } });
  const state = new URL(start.json().authorizeUrl).searchParams.get('state')!;
  const cb = await app.inject({ method: 'GET', url: `/v1/auth/callback?code=${code}&state=${state}` });
  const handoff = new URL(cb.headers.location as string).searchParams.get('code')!;
  const ex = await app.inject({ method: 'POST', url: '/v1/auth/exchange', payload: { code: handoff, verifier } });
  return ex.json().token as string;
}

export const REPO = { repositoryId: '10', branch: 'main', rootFolder: 'DSA', layout: 'platform/topic/problem' as const };

export function syncRequest(overrides: Partial<SyncRequest['capture']> = {}, extra: Partial<SyncRequest> = {}): SyncRequest {
  const capture = {
    platform: 'leetcode' as const,
    submissionId: '1234567',
    problem: {
      id: '1', title: 'Two Sum', slug: 'two-sum', url: 'https://leetcode.com/problems/two-sum/',
      difficulty: 'Easy', topics: ['Array', 'Hash Table'],
      statementMarkdown: 'Given an array `nums`…', examples: ['Input: nums = [2,7]\nOutput: [0,1]'], constraints: ['2 <= nums.length <= 10^4'],
    },
    language: 'python' as const,
    languageVariant: 'Python3',
    code: 'class Solution:\n    def twoSum(self, nums, target):\n        return []\n',
    submittedAt: '2026-11-07T10:00:00.000Z',
    ...overrides,
  };
  return {
    capture,
    codeSha256: createHash('sha256').update(capture.code).digest('hex'),
    verdict: 'ACCEPTED',
    readme: { includeStatement: true, includeExamples: true, includeConstraints: true },
    duplicateStrategy: 'overwrite',
    repo: REPO,
    ...extra,
  };
}
