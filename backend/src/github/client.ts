/**
 * Minimal GitHub client (OAuth for GitHub Apps + REST). `fetch` and `sleep`
 * are injected so every path — including rate limits and network failures —
 * is testable with fixtures.
 */
export type GitHubErrorKind =
  | 'rate_limited' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict'
  | 'unprocessable' | 'server' | 'network' | 'oauth';

export class GitHubError extends Error {
  constructor(
    public readonly kind: GitHubErrorKind,
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export interface OAuthTokens {
  accessToken: string;
  expiresAt: Date | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: Date | null;
}

export interface GitHubClientOptions {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  now?: () => Date;
}

const API = 'https://api.github.com';
const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export class GitHubClient {
  private readonly f: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly now: () => Date;

  constructor(private readonly opts: GitHubClientOptions) {
    this.f = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = opts.maxRetries ?? 2;
    this.now = opts.now ?? (() => new Date());
  }

  // ---------- OAuth (user-to-server tokens) ----------

  private async oauthToken(params: Record<string, string>): Promise<OAuthTokens> {
    const res = await this.raw('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: this.opts.clientId, client_secret: this.opts.clientSecret, ...params }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof body.error === 'string' || typeof body.access_token !== 'string') {
      // Never include the response body in the message: it may echo secrets.
      throw new GitHubError('oauth', res.status, `OAuth error: ${typeof body.error === 'string' ? body.error : res.status}`);
    }
    const now = this.now().getTime();
    const secs = (v: unknown) => (typeof v === 'number' && v > 0 ? new Date(now + v * 1000) : null);
    return {
      accessToken: body.access_token,
      expiresAt: secs(body.expires_in),
      refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null,
      refreshTokenExpiresAt: secs(body.refresh_token_expires_in),
    };
  }

  exchangeCode(code: string, redirectUri: string) {
    return this.oauthToken({ code, redirect_uri: redirectUri });
  }

  refresh(refreshToken: string) {
    return this.oauthToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  /** Revoke the user's authorization of the app (best effort). */
  async revokeGrant(accessToken: string): Promise<void> {
    const basic = Buffer.from(`${this.opts.clientId}:${this.opts.clientSecret}`).toString('base64');
    await this.raw(`${API}/applications/${encodeURIComponent(this.opts.clientId)}/grant`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${basic}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken }),
    });
  }

  // ---------- REST ----------

  private async raw(url: string, init: RequestInit): Promise<Response> {
    let attempt = 0;
    for (;;) {
      let res: Response;
      try {
        res = await this.f(url, init);
      } catch {
        if (attempt++ < this.maxRetries) {
          await this.sleep(250 * 2 ** attempt);
          continue;
        }
        throw new GitHubError('network', 0, 'Could not reach GitHub.');
      }
      if (res.status >= 500 && attempt++ < this.maxRetries) {
        await this.sleep(250 * 2 ** attempt);
        continue;
      }
      return res;
    }
  }

  async request<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
    const res = await this.raw(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'CodeSync',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
    throw this.toError(res);
  }

  private toError(res: Response): GitHubError {
    const remaining = res.headers.get('x-ratelimit-remaining');
    const retryAfter = res.headers.get('retry-after');
    const reset = res.headers.get('x-ratelimit-reset');
    if (res.status === 429 || (res.status === 403 && (remaining === '0' || retryAfter))) {
      const secs = retryAfter
        ? Number(retryAfter)
        : reset
          ? Math.max(1, Number(reset) - Math.floor(this.now().getTime() / 1000))
          : 60;
      return new GitHubError('rate_limited', res.status, 'GitHub rate limit reached.', Number.isFinite(secs) ? secs : 60);
    }
    const kinds: Record<number, GitHubErrorKind> = { 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 422: 'unprocessable' };
    return new GitHubError(kinds[res.status] ?? 'server', res.status, `GitHub API error ${res.status}`);
  }

  getUser(token: string) {
    return this.request<{ id: number; login: string; avatar_url: string | null }>('GET', '/user', token);
  }

  listInstallations(token: string) {
    return this.request<{ installations: { id: number }[] }>('GET', '/user/installations?per_page=100', token);
  }

  listInstallationRepos(token: string, installationId: number, page = 1) {
    return this.request<{ total_count: number; repositories: RepoPayload[] }>(
      'GET', `/user/installations/${installationId}/repositories?per_page=100&page=${page}`, token,
    );
  }

  getRepositoryById(token: string, id: string) {
    return this.request<RepoPayload>('GET', `/repositories/${encodeURIComponent(id)}`, token);
  }

  listBranches(token: string, fullName: string) {
    return this.request<{ name: string }[]>('GET', `/repos/${fullName}/branches?per_page=100`, token);
  }

  getBranch(token: string, fullName: string, branch: string) {
    return this.request<{ name: string; commit: { sha: string } }>('GET', `/repos/${fullName}/branches/${encodeURIComponent(branch)}`, token);
  }

  async getContent(token: string, fullName: string, path: string, ref: string): Promise<ContentEntry | ContentEntry[] | null> {
    try {
      return await this.request<ContentEntry | ContentEntry[]>('GET', `/repos/${fullName}/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`, token);
    } catch (e) {
      if (e instanceof GitHubError && e.kind === 'not_found') return null;
      throw e;
    }
  }

  createBlob(token: string, fullName: string, content: string) {
    return this.request<{ sha: string }>('POST', `/repos/${fullName}/git/blobs`, token, { content, encoding: 'utf-8' });
  }

  getRef(token: string, fullName: string, branch: string) {
    return this.request<{ object: { sha: string } }>('GET', `/repos/${fullName}/git/ref/heads/${enc(branch)}`, token);
  }

  getCommit(token: string, fullName: string, sha: string) {
    return this.request<{ sha: string; tree: { sha: string } }>('GET', `/repos/${fullName}/git/commits/${sha}`, token);
  }

  createTree(token: string, fullName: string, baseTree: string, files: { path: string; content: string }[]) {
    return this.request<{ sha: string }>('POST', `/repos/${fullName}/git/trees`, token, {
      base_tree: baseTree,
      tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })),
    });
  }

  createCommit(token: string, fullName: string, message: string, tree: string, parent: string) {
    return this.request<{ sha: string; html_url: string }>('POST', `/repos/${fullName}/git/commits`, token, { message, tree, parents: [parent] });
  }

  updateRef(token: string, fullName: string, branch: string, sha: string) {
    return this.request<unknown>('PATCH', `/repos/${fullName}/git/refs/heads/${enc(branch)}`, token, { sha, force: false });
  }

  /** Used only for empty repositories, which have no ref to build a tree on. */
  putContent(token: string, fullName: string, path: string, branch: string, message: string, content: string) {
    return this.request<{ commit: { sha: string; html_url: string } }>('PUT', `/repos/${fullName}/contents/${enc(path)}`, token, {
      message,
      branch,
      content: Buffer.from(content, 'utf8').toString('base64'),
    });
  }
}

export interface RepoPayload {
  id: number;
  full_name: string;
  private: boolean;
  default_branch: string;
  permissions?: { push?: boolean; admin?: boolean };
}

export interface ContentEntry {
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  name: string;
  path: string;
  sha: string;
}
