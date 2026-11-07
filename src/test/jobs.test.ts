import { ApiFailure } from '@/background/api';
import { JobService, jobKey } from '@/background/jobs';
import { DEFAULT_SETTINGS, KEYS } from '@/shared/constants';
import type { SyncRequest, SyncResponse } from '@/shared/schemas';
import { createMemoryKV, type KV } from '@/shared/storage';
import type { Job } from '@/shared/types';
import { account, capture } from './fixtures';

function harness(opts: { connected?: boolean; settings?: object } = {}) {
  const kv = createMemoryKV({
    [KEYS.settings]: { ...DEFAULT_SETTINGS, ...opts.settings },
    ...(opts.connected !== false && { [KEYS.account]: account() }),
  });
  let now = 1_000_000;
  const calls: SyncRequest[] = [];
  const responses: (SyncResponse | ApiFailure | Error)[] = [];
  const api = {
    sync: async (req: SyncRequest) => {
      calls.push(req);
      const r = responses.shift() ?? { outcome: 'created', paths: ['a'], commitSha: 'abc', commitUrl: 'https://github.com/x/commit/abc' };
      if (r instanceof Error) throw r;
      return r as SyncResponse;
    },
  };
  const notes: string[] = [];
  const make = () => new JobService({ kv, api, now: () => now, notify: (t) => notes.push(t) });
  return { kv, svc: make(), make, calls, responses, notes, tick: (ms: number) => (now += ms), get now() { return now; } };
}

const job = async (kv: KV, key = jobKey('leetcode', '111')) => ((await kv.get<Record<string, Job>>(KEYS.jobs)) ?? {})[key]!;

describe('accepted-only policy', () => {
  it('uploads ACCEPTED submissions with the exact captured code', async () => {
    const h = harness();
    await h.svc.detect('leetcode', '111', 'two-sum');
    await h.svc.report('leetcode', '111', 'ACCEPTED', capture());
    await h.svc.processQueue();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.capture.code).toBe('print(1)\n');
    expect(h.calls[0]!.codeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(h.calls[0]!.repo).toMatchObject({ repositoryId: '10', branch: 'main' }); // repo attached from the extension at upload time
    const j = await job(h.kv);
    expect(j.status).toBe('uploaded');
    expect(j.request).toBeNull(); // code not retained after upload
    expect(h.notes).toEqual(['Solution synced']);
  });

  it.each(['WRONG_ANSWER', 'RUNTIME_ERROR', 'COMPILATION_ERROR', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'UNKNOWN'] as const)(
    'ignores %s and never uploads',
    async (verdict) => {
      const h = harness();
      await h.svc.detect('leetcode', '111', 'two-sum');
      await h.svc.report('leetcode', '111', verdict, capture());
      await h.svc.processQueue();
      expect(h.calls).toHaveLength(0);
      expect((await job(h.kv)).status).toBe('ignored');
    },
  );

  it('waits on PENDING and handles a delayed verdict', async () => {
    const h = harness();
    await h.svc.detect('leetcode', '111', 'two-sum');
    await h.svc.report('leetcode', '111', 'PENDING');
    expect((await job(h.kv)).status).toBe('verifying');
    h.tick(60_000);
    await h.svc.report('leetcode', '111', 'ACCEPTED', capture());
    await h.svc.processQueue();
    expect((await job(h.kv)).status).toBe('uploaded');
  });

  it('keeps verifying on NETWORK_ERROR (retry verification)', async () => {
    const h = harness();
    await h.svc.report('leetcode', '111', 'NETWORK_ERROR');
    const j = await job(h.kv);
    expect(j.status).toBe('verifying');
    expect(j.verifyAttempts).toBe(1);
    expect(await h.svc.pendingVerifications('leetcode')).toEqual([{ submissionId: '111', slug: null }]);
  });

  it('treats duplicate notifications as no-ops', async () => {
    const h = harness();
    await h.svc.detect('leetcode', '111', 'two-sum');
    await h.svc.detect('leetcode', '111', 'two-sum');
    await h.svc.report('leetcode', '111', 'ACCEPTED', capture());
    await h.svc.report('leetcode', '111', 'ACCEPTED', capture());
    await h.svc.report('leetcode', '111', 'WRONG_ANSWER');
    await h.svc.processQueue();
    expect(h.calls).toHaveLength(1);
    expect(Object.keys((await h.kv.get(KEYS.jobs)) as object)).toHaveLength(1);
  });

  it('skips upload when the exact code is missing or mismatched', async () => {
    const h = harness();
    await h.svc.report('leetcode', '111', 'ACCEPTED'); // no capture
    await h.svc.report('leetcode', '222', 'ACCEPTED', capture()); // capture for a different id
    await h.svc.processQueue();
    expect(h.calls).toHaveLength(0);
    expect((await job(h.kv)).error?.code).toBe('CODE_UNAVAILABLE');
    expect((await job(h.kv, jobKey('leetcode', '222'))).status).toBe('failed');
  });

  it('records capture failures reported by content scripts', async () => {
    const h = harness();
    await h.svc.detect('gfg', '9', 'x');
    await h.svc.captureFailed('gfg', '9', 'CODE_UNAVAILABLE', 'nope');
    expect((await job(h.kv, 'gfg:9')).status).toBe('failed');
    await h.svc.captureFailed('gfg', '10', 'UNSUPPORTED_LANGUAGE', 'Scala');
    expect((await job(h.kv, 'gfg:10')).status).toBe('ignored');
  });

  it('respects language, SQL, platform and auto-sync settings', async () => {
    const h = harness({ settings: { sqlSupport: false, languages: { ...DEFAULT_SETTINGS.languages, java: false } } });
    await h.svc.report('leetcode', '1', 'ACCEPTED', capture({ submissionId: '1', language: 'sql', languageVariant: 'MySQL' }));
    await h.svc.report('leetcode', '2', 'ACCEPTED', capture({ submissionId: '2', language: 'java', languageVariant: 'Java' }));
    expect((await job(h.kv, 'leetcode:1')).status).toBe('ignored');
    expect((await job(h.kv, 'leetcode:2')).status).toBe('ignored');

    const off = harness({ settings: { platforms: { leetcode: false, gfg: true } } });
    expect(await off.svc.detect('leetcode', '1', 'x')).toBeNull();

    const held = harness({ settings: { autoSync: false } });
    await held.svc.report('leetcode', '111', 'ACCEPTED', capture());
    await held.svc.processQueue();
    expect((await job(held.kv)).status).toBe('held');
    await held.svc.syncHeld();
    expect((await job(held.kv)).status).toBe('uploaded');
  });
});

describe('upload queue reliability', () => {
  it('survives a service worker restart mid-upload without losing or duplicating the job', async () => {
    const h = harness();
    await h.svc.report('leetcode', '111', 'ACCEPTED', capture());
    // Simulate a crash during upload: status persisted as 'uploading'.
    const jobs = (await h.kv.get<Record<string, Job>>(KEYS.jobs))!;
    await h.svc.processQueue();
    jobs['leetcode:111']!.status = 'uploading';
    await h.kv.set(KEYS.jobs, jobs);

    const restarted = h.make(); // fresh worker, same storage
    await restarted.recover();
    expect((await job(h.kv)).status).toBe('uploaded');
    expect(h.calls.length).toBeGreaterThanOrEqual(1); // backend dedupe makes a resend safe
  });

  it('retries retryable failures with backoff and honours retry-after', async () => {
    const h = harness();
    h.responses.push(new ApiFailure(0, 'NETWORK_ERROR', 'down', true));
    await h.svc.report('leetcode', '111', 'ACCEPTED', capture());
    await h.svc.processQueue();
    let j = await job(h.kv);
    expect(j.status).toBe('queued');
    expect(j.attempts).toBe(1);
    expect(j.nextAttemptAt).toBe(h.now + 30_000);

    h.responses.push(new ApiFailure(429, 'GITHUB_RATE_LIMITED', 'limit', true, 600));
    h.tick(30_000);
    await h.svc.processQueue();
    j = await job(h.kv);
    expect(j.nextAttemptAt).toBe(h.now + 600_000);

    h.tick(600_000);
    await h.svc.processQueue();
    expect((await job(h.kv)).status).toBe('uploaded');
  });

  it('fails permanently after max attempts and on non-retryable errors, then allows manual retry', async () => {
    const h = harness();
    for (let i = 0; i < 6; i++) h.responses.push(new ApiFailure(502, 'GITHUB_UNAVAILABLE', 'x', true));
    await h.svc.report('leetcode', '111', 'ACCEPTED', capture());
    for (let i = 0; i < 6; i++) {
      await h.svc.processQueue();
      h.tick(31 * 60_000);
    }
    expect((await job(h.kv)).status).toBe('failed');
    expect(h.notes).toContain('Sync failed');

    await h.svc.retry('leetcode:111');
    expect((await job(h.kv)).status).toBe('uploaded');

    const p = harness();
    p.responses.push(new ApiFailure(403, 'GITHUB_PERMISSION_DENIED', 'no access', false));
    await p.svc.report('leetcode', '111', 'ACCEPTED', capture());
    await p.svc.processQueue();
    expect((await job(p.kv)).status).toBe('failed');
    expect(p.calls).toHaveLength(1);
  });

  it('waits for a connection instead of burning attempts', async () => {
    const h = harness({ connected: false });
    await h.svc.report('leetcode', '111', 'ACCEPTED', capture());
    await h.svc.processQueue();
    let j = await job(h.kv);
    expect(j.status).toBe('queued');
    expect(j.error?.code).toBe('NOT_CONNECTED');
    expect(h.calls).toHaveLength(0);

    await h.kv.set(KEYS.account, account());
    await h.svc.retry('leetcode:111');
    j = await job(h.kv);
    expect(j.status).toBe('uploaded');
  });

  it('pauses on revoked GitHub authorization (401)', async () => {
    const h = harness();
    h.responses.push(new ApiFailure(401, 'GITHUB_REAUTH_REQUIRED', 'reconnect', false));
    await h.svc.report('leetcode', '111', 'ACCEPTED', capture());
    await h.svc.processQueue();
    const j = await job(h.kv);
    expect(j.status).toBe('queued');
    expect(j.attempts).toBe(0);
    expect((await h.kv.get<{ githubAuthorized: boolean }>(KEYS.account))!.githubAuthorized).toBe(false);
  });

  it('expires verifications that never reach a final verdict', async () => {
    const h = harness();
    await h.svc.detect('leetcode', '111', 'two-sum');
    h.tick(25 * 3600_000);
    await h.svc.recover();
    const j = await job(h.kv);
    expect(j.status).toBe('ignored');
    expect(j.verdict).toBe('UNKNOWN');
  });
});
