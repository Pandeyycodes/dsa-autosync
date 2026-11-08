/**
 * Persistent submission job queue. All state lives in storage, so a service
 * worker restart loses nothing: `recover()` resumes interrupted uploads and
 * content scripts resume pending verifications.
 */
import { GFG_VERIFY_TIMEOUT_MS, KEYS, MAX_JOBS, RETRY, VERIFY_TIMEOUT_MS } from '@/shared/constants';
import { CaptureSchema, type RepoConfig, type SubmissionCapture, type SyncRequest } from '@/shared/schemas';
import { loadSettings, type KV } from '@/shared/storage';
import type { Account, Job, PlatformId } from '@/shared/types';
import { actionFor, type Verdict } from '@/shared/verdict';
import { ApiFailure, type SyncApi } from './api';

export interface JobDeps {
  kv: KV;
  api: SyncApi;
  now?: () => number;
  notify?: (title: string, message: string) => void;
  sha256?: (text: string) => Promise<string>;
}

export const jobKey = (platform: PlatformId, submissionId: string) => `${platform}:${submissionId}`;

/**
 * SQL solutions go to the SQL repository when one is configured; everything
 * else to the main repository. The SQL repository holds only LeetCode SQL, so
 * it never gets a LeetCode/ folder: sections always sit at its root,
 * whatever layout an older version saved.
 */
export function destinationFor(account: Account, job: Pick<Job, 'request'>): RepoConfig | null {
  if (job.request?.capture.language === 'sql' && account.sqlRepo) return { ...account.sqlRepo, layout: 'topic/problem' };
  return account.repo;
}

async function webSha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class JobService {
  private processing: Promise<void> | null = null;
  private lock: Promise<unknown> = Promise.resolve();
  private readonly now: () => number;
  private readonly sha256: (t: string) => Promise<string>;

  constructor(private readonly deps: JobDeps) {
    this.now = deps.now ?? Date.now;
    this.sha256 = deps.sha256 ?? webSha256;
  }

  // ---------- storage ----------
  async all(): Promise<Record<string, Job>> {
    return (await this.deps.kv.get<Record<string, Job>>(KEYS.jobs)) ?? {};
  }

  /** Serialised read-modify-write so concurrent messages never clobber each other. */
  private mutate<T>(fn: (jobs: Record<string, Job>) => T | Promise<T>): Promise<T> {
    const run = this.lock.then(async () => {
      const jobs = await this.all();
      const result = await fn(jobs);
      await this.deps.kv.set(KEYS.jobs, prune(jobs));
      return result;
    });
    this.lock = run.catch(() => undefined);
    return run;
  }

  private blank(platform: PlatformId, submissionId: string, slug: string | null, githubId: string | null): Job {
    const t = this.now();
    return {
      key: jobKey(platform, submissionId), platform, submissionId, slug, status: 'verifying', verdict: 'PENDING',
      detectedAt: t, updatedAt: t, verifyAttempts: 0, attempts: 0, nextAttemptAt: null, error: null, problem: null,
      language: null, languageVariant: null, outcome: null, commitUrl: null, paths: [], request: null, githubId,
    };
  }

  private async account() {
    return (await this.deps.kv.get<Account>(KEYS.account)) ?? null;
  }

  // ---------- detection & verification ----------

  /** A submission identity was observed. Duplicate notifications are no-ops. */
  async detect(platform: PlatformId, submissionId: string, slug: string | null): Promise<Job | null> {
    const settings = await loadSettings(this.deps.kv);
    if (!settings.platforms[platform]) return null;
    const githubId = (await this.account())?.user.githubId ?? null;
    return this.mutate((jobs) => {
      const key = jobKey(platform, submissionId);
      jobs[key] ??= this.blank(platform, submissionId, slug, githubId);
      return jobs[key]!;
    });
  }

  /** The content script reports a (possibly final) verdict, with the exact code when ACCEPTED. */
  async report(platform: PlatformId, submissionId: string, verdict: Verdict, rawCapture?: unknown): Promise<Job | null> {
    const settings = await loadSettings(this.deps.kv);
    if (!settings.platforms[platform]) return null;
    const githubId = (await this.account())?.user.githubId ?? null;

    let request: Omit<SyncRequest, 'repo'> | null = null;
    let capture: SubmissionCapture | null = null;
    if (verdict === 'ACCEPTED') {
      const parsed = CaptureSchema.safeParse(rawCapture);
      if (parsed.success && parsed.data.platform === platform && parsed.data.submissionId === submissionId) {
        capture = parsed.data;
        request = {
          capture,
          codeSha256: await this.sha256(capture.code),
          verdict: 'ACCEPTED',
          readme: settings.readme,
          duplicateStrategy: settings.duplicateStrategy,
        };
      }
    }

    const job = await this.mutate((jobs) => {
      const key = jobKey(platform, submissionId);
      const j = (jobs[key] ??= this.blank(platform, submissionId, capture?.problem.slug ?? null, githubId));
      if (j.status !== 'verifying') return j; // already decided — duplicate notification
      const t = this.now();
      j.updatedAt = t;
      j.verdict = verdict;
      switch (actionFor(verdict)) {
        case 'wait':
          break;
        case 'retry_verification':
          j.verifyAttempts += 1;
          break;
        case 'ignore':
          j.status = 'ignored';
          break;
        case 'upload': {
          if (!capture || !request) {
            j.status = 'failed';
            j.error = { code: 'CODE_UNAVAILABLE', message: 'Accepted, but the exact submitted code could not be retrieved. Upload skipped.' };
            break;
          }
          j.problem = { title: capture.problem.title, id: capture.problem.id, difficulty: capture.problem.difficulty, topics: capture.problem.topics };
          j.slug = capture.problem.slug;
          j.language = capture.language;
          j.languageVariant = capture.languageVariant;
          const langOff = !settings.languages[capture.language] || (capture.language === 'sql' && !settings.sqlSupport);
          if (langOff) {
            j.status = 'ignored';
            j.error = { code: 'LANGUAGE_DISABLED', message: `${capture.languageVariant} syncing is turned off in settings.` };
            break;
          }
          j.request = request;
          j.status = settings.autoSync ? 'queued' : 'held';
          j.nextAttemptAt = settings.autoSync ? t : null;
        }
      }
      return j;
    });
    if (job?.status === 'queued') void this.processQueue();
    return job;
  }

  async captureFailed(platform: PlatformId, submissionId: string, code: string, message: string) {
    return this.mutate((jobs) => {
      const key = jobKey(platform, submissionId);
      const j = (jobs[key] ??= this.blank(platform, submissionId, null, null));
      if (j.status !== 'verifying') return j;
      j.status = code === 'UNSUPPORTED_LANGUAGE' ? 'ignored' : 'failed';
      j.verdict = code === 'VERDICT_MISMATCH' ? 'UNKNOWN' : j.verdict === 'PENDING' ? 'ACCEPTED' : j.verdict;
      j.error = { code, message };
      j.updatedAt = this.now();
      return j;
    });
  }

  async pendingVerifications(platform: PlatformId): Promise<{ submissionId: string; slug: string | null }[]> {
    return Object.values(await this.all())
      .filter((j) => j.platform === platform && j.status === 'verifying')
      .map((j) => ({ submissionId: j.submissionId, slug: j.slug }));
  }

  // ---------- upload queue ----------

  /** Service worker (re)start: resume interrupted uploads, expire stale verifications. */
  async recover() {
    await this.mutate((jobs) => {
      const t = this.now();
      for (const j of Object.values(jobs)) {
        if (j.status === 'uploading') {
          j.status = 'queued'; // backend dedupe makes the resend safe
          j.nextAttemptAt = t;
        }
        const timeout = j.platform === 'gfg' ? GFG_VERIFY_TIMEOUT_MS : VERIFY_TIMEOUT_MS;
        if (j.status === 'verifying' && t - j.detectedAt > timeout) {
          j.status = 'ignored';
          j.verdict = 'UNKNOWN';
          j.error = { code: 'VERIFY_TIMEOUT', message: 'No final verdict could be confirmed. Not uploaded.' };
        }
      }
    });
    return this.processQueue();
  }

  async retry(key: string) {
    await this.mutate((jobs) => {
      const j = jobs[key];
      if (!j || !j.request || !['failed', 'held', 'queued'].includes(j.status)) return;
      Object.assign(j, { status: 'queued', attempts: 0, nextAttemptAt: this.now(), error: null, updatedAt: this.now() });
    });
    return this.processQueue();
  }

  async syncHeld() {
    await this.mutate((jobs) => {
      for (const j of Object.values(jobs)) if (j.status === 'held') Object.assign(j, { status: 'queued', nextAttemptAt: this.now() });
    });
    return this.processQueue();
  }

  processQueue(): Promise<void> {
    if (!this.processing) {
      this.processing = this.drain().finally(() => {
        this.processing = null;
      });
    }
    return this.processing;
  }

  private async drain() {
    for (let guard = 0; guard < 100; guard++) {
      const account = await this.account();
      const next = await this.mutate((jobs) => {
        const t = this.now();
        const ready = Object.values(jobs)
          .filter((j) => j.status === 'queued' && j.request && (j.nextAttemptAt ?? Infinity) <= t)
          .sort((a, b) => a.detectedAt - b.detectedAt);
        if (!ready.length) return null;
        if (!account || !account.githubAuthorized) {
          for (const j of Object.values(jobs)) {
            if (j.status === 'queued') {
              j.nextAttemptAt = null; // wait until connected; connect() re-triggers
              j.error = { code: 'NOT_CONNECTED', message: 'Waiting for GitHub to be connected.' };
            }
          }
          return null;
        }
        // Each job goes to its destination: SQL → SQL repository (if set), otherwise the main one.
        let due: Job | undefined;
        for (const j of ready) {
          if (destinationFor(account, j)) {
            due = j;
            break;
          }
          j.nextAttemptAt = null; // waits until a repository is saved
          j.error = { code: 'REPO_NOT_CONFIGURED', message: 'Waiting for a repository to be selected.' };
        }
        if (!due) return null;
        due.status = 'uploading';
        due.updatedAt = t;
        return { key: due.key, request: { ...due.request!, repo: destinationFor(account, due)! } satisfies SyncRequest };
      });
      if (!next) return;

      try {
        const res = await this.deps.api.sync(next.request);
        await this.mutate((jobs) => {
          const j = jobs[next.key];
          if (!j) return;
          Object.assign(j, {
            status: 'uploaded', outcome: res.outcome, commitUrl: res.commitUrl, paths: res.paths,
            request: null, error: null, nextAttemptAt: null, updatedAt: this.now(),
          });
        });
        const settings = await loadSettings(this.deps.kv);
        if (settings.notifications.onSuccess && (res.outcome === 'created' || res.outcome === 'updated')) {
          this.deps.notify?.('Solution synced', `${next.request.capture.problem.title} → GitHub`);
        }
      } catch (e) {
        const f = e instanceof ApiFailure ? e : new ApiFailure(0, 'NETWORK_ERROR', 'Upload failed.', true);
        let finalFailure = false;
        await this.mutate((jobs) => {
          const j = jobs[next.key];
          if (!j) return;
          const t = this.now();
          j.updatedAt = t;
          j.error = { code: f.code, message: f.message };
          if (f.status === 401) {
            j.status = 'queued'; // session/GitHub auth problem: wait for reconnect, no attempt burned
            j.nextAttemptAt = null;
          } else if (f.retryable) {
            j.attempts += 1;
            if (j.attempts >= RETRY.maxAttempts) {
              j.status = 'failed';
              j.nextAttemptAt = null;
              finalFailure = true;
            } else {
              const backoff = Math.min(RETRY.maxDelayMs, RETRY.baseDelayMs * 2 ** (j.attempts - 1));
              j.status = 'queued';
              j.nextAttemptAt = t + Math.max(backoff, (f.retryAfterSeconds ?? 0) * 1000);
            }
          } else {
            j.status = 'failed';
            j.nextAttemptAt = null;
            finalFailure = true;
          }
        });
        if (f.status === 401) await this.deps.kv.set(KEYS.account, { ...(await this.account()), githubAuthorized: false });
        if (finalFailure && (await loadSettings(this.deps.kv)).notifications.onFailure) {
          this.deps.notify?.('Sync failed', `${next.request.capture.problem.title}: ${f.message}`);
        }
      }
    }
  }
}

/** Keep storage bounded: drop the oldest *finished* jobs beyond MAX_JOBS. */
function prune(jobs: Record<string, Job>): Record<string, Job> {
  const list = Object.values(jobs);
  if (list.length <= MAX_JOBS) return jobs;
  const removable = list
    .filter((j) => j.status === 'uploaded' || j.status === 'ignored')
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, list.length - MAX_JOBS);
  for (const j of removable) delete jobs[j.key];
  return jobs;
}
