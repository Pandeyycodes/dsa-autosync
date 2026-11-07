import { LANGUAGES, type LanguageId } from '../../../src/shared/languages';
import { generateReadme, type ReadmeSolution } from '../../../src/shared/readme';
import { buildSolutionPaths } from '../../../src/shared/repo-paths';
import type { RepoConfig, SyncRequest, SyncResponse } from '../../../src/shared/schemas';
import { GitHubError, type ContentEntry, type GitHubClient } from '../github/client';
import { gitBlobSha, sha256Hex } from '../lib/crypto';
import { AppError } from '../lib/errors';
import type { AuthContext, AuthService } from './auth-service';
import { withGitHub } from './github-errors';
import type { RepoService } from './repo-service';

const PLATFORM_LABEL = { leetcode: 'LeetCode', gfg: 'GeeksForGeeks' } as const;
const RECENT_TTL_MS = 60 * 60_000;

/**
 * Idempotent upload with no database:
 *  - the extension's persistent job queue never resends a finished submission;
 *  - identical code is detected against GitHub itself (git blob SHA = content hash);
 *  - an in-memory window de-duplicates concurrent/rapid repeats per (user, platform, submission).
 */
export class SyncService {
  private inFlight = new Set<string>();
  private recent = new Map<string, { at: number; res: SyncResponse }>();

  constructor(
    private readonly github: GitHubClient,
    private readonly auth: AuthService,
    private readonly repos: RepoService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async sync(ctx: AuthContext, req: SyncRequest): Promise<SyncResponse> {
    const { capture } = req;
    if (sha256Hex(capture.code) !== req.codeSha256) throw new AppError(400, 'HASH_MISMATCH', 'Code hash does not match submitted code.');

    const key = `${ctx.session.gid}|${capture.platform}|${capture.submissionId}`;
    const t = this.now().getTime();
    for (const [k, v] of this.recent) if (t - v.at > RECENT_TTL_MS) this.recent.delete(k);
    const done = this.recent.get(key);
    if (done) return { ...done.res, outcome: 'duplicate' };
    if (this.inFlight.has(key)) throw new AppError(409, 'SYNC_IN_PROGRESS', 'This submission is already being synced.', { retryable: true, retryAfterSeconds: 30 });

    this.inFlight.add(key);
    try {
      const cfg = await this.repos.validateTarget(ctx, req.repo, { checkBranch: false });
      const res = await withGitHub(this.auth, ctx, (token) => this.upload(token, cfg, req));
      this.recent.set(key, { at: this.now().getTime(), res });
      return res;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async upload(token: string, cfg: RepoConfig, req: SyncRequest): Promise<SyncResponse> {
    const { capture } = req;
    const repo = cfg.fullName;
    const pathInput = {
      platform: capture.platform,
      problemId: capture.problem.id,
      slug: capture.problem.slug,
      title: capture.problem.title,
      topics: capture.problem.topics,
      language: capture.language,
    };
    let paths = buildSolutionPaths(cfg.rootFolder, cfg.layout, pathInput);

    const existing = await this.github.getContent(token, repo, paths.solutionFile, cfg.branch);
    let outcome: 'created' | 'updated' = 'created';
    if (existing && !Array.isArray(existing)) {
      if (existing.sha === gitBlobSha(capture.code)) {
        return { outcome: 'unchanged', paths: [paths.solutionFile], commitSha: null, commitUrl: null };
      }
      if (req.duplicateStrategy === 'skip') {
        return { outcome: 'skipped_exists', paths: [paths.solutionFile], commitSha: null, commitUrl: null };
      }
      if (req.duplicateStrategy === 'version') {
        paths = buildSolutionPaths(cfg.rootFolder, cfg.layout, pathInput, `solution-${capture.submissionId}`);
        const versioned = await this.github.getContent(token, repo, paths.solutionFile, cfg.branch);
        if (versioned && !Array.isArray(versioned) && versioned.sha === gitBlobSha(capture.code)) {
          return { outcome: 'unchanged', paths: [paths.solutionFile], commitSha: null, commitUrl: null };
        }
      } else {
        outcome = 'updated';
      }
    }

    const listing = await this.github.getContent(token, repo, paths.problemDir, cfg.branch);
    const solutions: ReadmeSolution[] = [];
    const langByFolder = new Map(Object.values(LANGUAGES).map((l) => [l.folder, l.id as LanguageId]));
    for (const entry of Array.isArray(listing) ? (listing as ContentEntry[]) : []) {
      const lang = entry.type === 'dir' ? langByFolder.get(entry.name) : undefined;
      if (lang && lang !== capture.language) solutions.push({ language: lang, relativePath: `${entry.name}/` });
    }
    solutions.push({ language: capture.language, relativePath: paths.solutionFile.slice(paths.problemDir.length + 1) });
    const readme = generateReadme(capture, req.readme, solutions);

    const label = `${PLATFORM_LABEL[capture.platform]} ${capture.problem.id ? capture.problem.id + ' ' : ''}${capture.problem.title}`.replace(/[\r\n]+/g, ' ').slice(0, 120);
    const message = `${outcome === 'created' ? 'Add' : 'Update'} ${label} (${LANGUAGES[capture.language].label})`;
    const files = [
      { path: paths.solutionFile, content: capture.code },
      { path: paths.readme, content: readme },
    ];
    const commit = await this.commit(token, repo, cfg.branch, message, files);
    return { outcome, paths: files.map((f) => f.path), commitSha: commit.sha, commitUrl: commit.url };
  }

  /** Single atomic commit via the Git Data API; retries if the branch moved meanwhile. */
  private async commit(token: string, repo: string, branch: string, message: string, files: { path: string; content: string }[]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let head: string;
      try {
        head = (await this.github.getRef(token, repo, branch)).object.sha;
      } catch (e) {
        if (e instanceof GitHubError && e.kind === 'conflict') return this.commitToEmptyRepo(token, repo, branch, message, files);
        if (e instanceof GitHubError && e.kind === 'not_found') {
          throw new AppError(409, 'BRANCH_NOT_FOUND', `Branch "${branch}" no longer exists. Update repository settings.`, { retryable: false });
        }
        throw e;
      }
      const base = await this.github.getCommit(token, repo, head);
      const tree = await this.github.createTree(token, repo, base.tree.sha, files);
      const created = await this.github.createCommit(token, repo, message, tree.sha, head);
      try {
        await this.github.updateRef(token, repo, branch, created.sha);
        return { sha: created.sha, url: created.html_url };
      } catch (e) {
        if (e instanceof GitHubError && e.kind === 'unprocessable' && attempt < 2) continue;
        throw e;
      }
    }
    throw new AppError(409, 'BRANCH_CONTENTION', 'Branch kept changing during sync.', { retryable: true, retryAfterSeconds: 30 });
  }

  private async commitToEmptyRepo(token: string, repo: string, branch: string, message: string, files: { path: string; content: string }[]) {
    let last = { sha: '', url: '' };
    for (const f of files) {
      const res = await this.github.putContent(token, repo, f.path, branch, message, f.content);
      last = { sha: res.commit.sha, url: res.commit.html_url };
    }
    return last;
  }
}
