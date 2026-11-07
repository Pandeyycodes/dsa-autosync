import { describe, expect, it } from 'vitest';
import { connect, REPO, setup, syncRequest } from './helpers';

async function ready(opts: { push?: boolean; empty?: boolean } = {}) {
  const ctx = await setup();
  const { code } = ctx.gh.addUser('octocat', 1);
  ctx.gh.addRepo('octocat/dsa', 10, { installedFor: ['octocat'], ...opts });
  const token = await connect(ctx.app, code);
  return { ...ctx, auth: { authorization: `Bearer ${token}` } };
}
type Ctx = Awaited<ReturnType<typeof ready>>;
const post = (c: Ctx, url: string, payload: object) => c.app.inject({ method: 'POST', url, headers: c.auth, payload });

describe('repository selection', () => {
  it('lists installed repositories and branches, validates the target and tests write access', async () => {
    const c = await ready();
    const repos = await c.app.inject({ method: 'GET', url: '/v1/repos', headers: c.auth });
    expect(repos.json().repositories).toEqual([{ id: '10', fullName: 'octocat/dsa', private: true, defaultBranch: 'main', canPush: true }]);
    expect(repos.json().installUrl).toBe('https://github.com/apps/codesync-test/installations/new');
    expect((await c.app.inject({ method: 'GET', url: '/v1/repos/10/branches', headers: c.auth })).json().branches).toEqual(['main']);

    const v = await post(c, '/v1/repo-config/validate', { ...REPO, rootFolder: '/DSA/' });
    expect(v.json()).toEqual({ repositoryId: '10', fullName: 'octocat/dsa', branch: 'main', rootFolder: 'DSA', layout: 'platform/topic/problem' });
    expect((await post(c, '/v1/repo-config/test', REPO)).json()).toMatchObject({ ok: true });
  });

  it('rejects missing branches, invalid ids, unsafe root folders and repos without push', async () => {
    const c = await ready();
    expect((await post(c, '/v1/repo-config/validate', { ...REPO, branch: 'nope' })).json().error.code).toBe('BRANCH_NOT_FOUND');
    expect((await post(c, '/v1/repo-config/validate', { ...REPO, repositoryId: '../../etc' })).statusCode).toBe(400);
    expect((await post(c, '/v1/repo-config/validate', { ...REPO, rootFolder: '../escape' })).json().error.code).toBe('INVALID_ROOT_FOLDER');
    expect((await post(c, '/v1/repo-config/validate', { ...REPO, rootFolder: '.github/workflows' })).json().error.code).toBe('INVALID_ROOT_FOLDER');
    c.gh.repos[0]!.push = false;
    expect((await post(c, '/v1/repo-config/validate', REPO)).json().error.code).toBe('GITHUB_PERMISSION_DENIED');
  });
});

describe('GitHub synchronization', () => {
  it('creates solution + README in one commit at the deterministic path', async () => {
    const c = await ready();
    const res = await post(c, '/v1/sync', syncRequest());
    expect(res.statusCode).toBe(200);
    expect(res.json().outcome).toBe('created');
    const files = c.gh.files('octocat/dsa');
    expect([...files.keys()].sort()).toEqual(['DSA/LeetCode/Array/0001-two-sum/README.md', 'DSA/LeetCode/Array/0001-two-sum/solution.py']);
    expect(files.get('DSA/LeetCode/Array/0001-two-sum/solution.py')!.content).toBe(syncRequest().capture.code);
    expect(files.get('DSA/LeetCode/Array/0001-two-sum/README.md')!.content).toContain('# 1. Two Sum');
    expect(c.gh.calls.filter((x) => x.url.endsWith('/git/commits') && x.method === 'POST')).toHaveLength(1);
  });

  it('is idempotent for repeated sends of the same submission', async () => {
    const c = await ready();
    await post(c, '/v1/sync', syncRequest());
    const dup = await post(c, '/v1/sync', syncRequest());
    expect(dup.json().outcome).toBe('duplicate');
    expect(c.gh.calls.filter((x) => x.url.endsWith('/git/commits') && x.method === 'POST')).toHaveLength(1);
  });

  it('detects unchanged content (new submission, same code) via the git content hash — even after a server restart', async () => {
    const c = await ready();
    await post(c, '/v1/sync', syncRequest());
    const res = await post(c, '/v1/sync', syncRequest({ submissionId: '999' }));
    expect(res.json().outcome).toBe('unchanged');
  });

  it('updates, skips or versions changed code according to the duplicate strategy', async () => {
    const c = await ready();
    await post(c, '/v1/sync', syncRequest());
    const changed = (id: string, strategy: 'skip' | 'overwrite' | 'version') => post(c, '/v1/sync', syncRequest({ submissionId: id, code: `# v${id}\n` }, { duplicateStrategy: strategy }));
    expect((await changed('2', 'skip')).json().outcome).toBe('skipped_exists');
    expect((await changed('3', 'overwrite')).json().outcome).toBe('updated');
    expect(c.gh.files('octocat/dsa').get('DSA/LeetCode/Array/0001-two-sum/solution.py')!.content).toBe('# v3\n');
    expect((await changed('4', 'version')).json().paths[0]).toBe('DSA/LeetCode/Array/0001-two-sum/solution-4.py');
  });

  it('preserves multiple languages and lists them in the README', async () => {
    const c = await ready();
    await post(c, '/v1/sync', syncRequest());
    await post(c, '/v1/sync', syncRequest({ submissionId: '77', language: 'cpp', languageVariant: 'C++', code: 'class Solution {};\n' }));
    const files = c.gh.files('octocat/dsa');
    expect(files.has('DSA/LeetCode/Array/0001-two-sum/solution.py')).toBe(true);
    expect(files.has('DSA/LeetCode/Array/0001-two-sum/solution.cpp')).toBe(true);
    const readme = files.get('DSA/LeetCode/Array/0001-two-sum/README.md')!.content;
    expect(readme).toContain('[Python](solution.py)');
    expect(readme).toContain('[C++](solution.cpp)');
  });

  it('stores SQL solutions as .sql in a topic folder based on the SQL concept used', async () => {
    const c = await ready();
    const req = syncRequest({
      submissionId: '55', language: 'sql', languageVariant: 'MySQL', code: 'SELECT MAX(salary) AS SecondHighestSalary FROM Employee;\n',
      problem: { id: '177', title: 'Nth Highest Salary', slug: 'nth-highest-salary', url: 'https://leetcode.com/problems/nth-highest-salary/', difficulty: 'Medium', topics: ['Database'], statementMarkdown: null, examples: [], constraints: [] },
    });
    expect((await post(c, '/v1/sync', req)).statusCode).toBe(200);
    expect(c.gh.files('octocat/dsa').has('DSA/LeetCode/Aggregation/0177-nth-highest-salary/solution.sql')).toBe(true);
  });

  it('accepts the default branch of an empty repository, but not other branches', async () => {
    const c = await ready({ empty: true });
    expect((await post(c, '/v1/repo-config/validate', REPO)).json()).toMatchObject({ fullName: 'octocat/dsa', branch: 'main' });
    expect((await post(c, '/v1/repo-config/validate', { ...REPO, branch: 'dev' })).json().error.code).toBe('BRANCH_NOT_FOUND');
  });

  it('creates the first commit in an empty repository', async () => {
    const c = await ready({ empty: true });
    const res = await post(c, '/v1/sync', syncRequest({}, { repo: { ...REPO, rootFolder: '', layout: 'platform/problem' } }));
    expect(res.json().outcome).toBe('created');
    expect(c.gh.files('octocat/dsa').has('LeetCode/0001-two-sum/solution.py')).toBe(true);
  });

  it('returns 429 with retry-after on GitHub rate limiting, then succeeds on retry', async () => {
    const c = await ready();
    c.gh.fault = (_m, path) => (path.includes('/contents/') ? new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 120) } }) : null);
    const res = await post(c, '/v1/sync', syncRequest());
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('GITHUB_RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    c.gh.fault = null;
    expect((await post(c, '/v1/sync', syncRequest())).json().outcome).toBe('created');
  });

  it('retries transient network failures and reports persistent ones as retryable', async () => {
    const c = await ready();
    let failures = 1;
    c.gh.fault = (_m, path) => (path.includes('/git/trees') && failures-- > 0 ? 'network' : null);
    expect((await post(c, '/v1/sync', syncRequest())).json().outcome).toBe('created');
    c.gh.fault = (_m, path) => (path.includes('/contents/') ? 'network' : null);
    const res = await post(c, '/v1/sync', syncRequest({ submissionId: '2', code: 'x\n' }));
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatchObject({ code: 'GITHUB_UNAVAILABLE', retryable: true });
  });

  it('reports missing repository permissions as non-retryable', async () => {
    const c = await ready();
    c.gh.repos[0]!.push = false;
    const res = await post(c, '/v1/sync', syncRequest());
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({ code: 'GITHUB_PERMISSION_DENIED', retryable: false });
  });

  it('requires a repository target', async () => {
    const c = await ready();
    const { repo: _omit, ...noRepo } = syncRequest();
    expect((await post(c, '/v1/sync', noRepo)).statusCode).toBe(400);
  });
});

describe('stable problem folders', () => {
  it('keeps an SQL problem in its first folder when re-solved with a different approach', async () => {
    const c = await ready();
    const sql = (id: string, code: string) => syncRequest({
      submissionId: id, language: 'sql', languageVariant: 'MySQL', code,
      problem: { id: '177', title: 'Nth Highest Salary', slug: 'nth-highest-salary', url: 'https://leetcode.com/problems/nth-highest-salary/', difficulty: 'Medium', topics: ['Database'], statementMarkdown: null, examples: [], constraints: [] },
    });
    await post(c, '/v1/sync', sql('1', 'SELECT MAX(salary) AS SecondHighestSalary FROM Employee;\n'));
    const second = await post(c, '/v1/sync', sql('2', 'SELECT (SELECT DISTINCT salary FROM (SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) r FROM Employee) t WHERE r = 2) AS SecondHighestSalary;\n'));
    expect(second.json().outcome).toBe('updated');
    const files = [...c.gh.files('octocat/dsa').keys()].filter((p) => p.includes('nth-highest-salary'));
    expect(files.sort()).toEqual(['DSA/LeetCode/Aggregation/0177-nth-highest-salary/README.md', 'DSA/LeetCode/Aggregation/0177-nth-highest-salary/solution.sql']);
  });
});
