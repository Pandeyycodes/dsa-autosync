import { normalizeRootFolder, PathValidationError } from '../../../src/shared/repo-paths';
import type { RepoConfig, RepositorySummary, RepoTarget } from '../../../src/shared/schemas';
import type { Config } from '../config';
import { GitHubError, type GitHubClient, type RepoPayload } from '../github/client';
import { AppError } from '../lib/errors';
import type { AuthContext, AuthService } from './auth-service';
import { withGitHub } from './github-errors';

const toSummary = (r: RepoPayload): RepositorySummary => ({
  id: String(r.id),
  fullName: r.full_name,
  private: r.private,
  defaultBranch: r.default_branch,
  canPush: !!r.permissions?.push,
});

/**
 * Repository config lives in the extension and is sent with each request.
 * The server never trusts it: every call re-resolves the repo *with the
 * user's own token* and re-validates branch and folder.
 */
export class RepoService {
  constructor(
    private readonly config: Config,
    private readonly github: GitHubClient,
    private readonly auth: AuthService,
  ) {}

  get installUrl() {
    return `https://github.com/apps/${this.config.GITHUB_APP_SLUG}/installations/new`;
  }

  listRepositories(ctx: AuthContext) {
    return withGitHub(this.auth, ctx, async (token) => {
      const { installations } = await this.github.listInstallations(token);
      const repos: RepositorySummary[] = [];
      for (const inst of installations.slice(0, 20)) {
        for (let page = 1; page <= 5; page++) {
          const res = await this.github.listInstallationRepos(token, inst.id, page);
          repos.push(...res.repositories.map(toSummary));
          if (res.repositories.length < 100) break;
        }
      }
      const unique = [...new Map(repos.map((r) => [r.id, r])).values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
      return { repositories: unique, installUrl: this.installUrl };
    });
  }

  /** Resolve a repo by numeric id with the user's token — GitHub enforces access. */
  async resolve(token: string, repositoryId: string) {
    if (!/^\d{1,20}$/.test(repositoryId)) throw new AppError(400, 'INVALID_REPOSITORY', 'Invalid repository identifier.');
    return this.github.getRepositoryById(token, repositoryId);
  }

  listBranches(ctx: AuthContext, repositoryId: string) {
    return withGitHub(this.auth, ctx, async (token) => {
      const repo = await this.resolve(token, repositoryId);
      const branches = await this.github.listBranches(token, repo.full_name);
      return { branches: branches.map((b) => b.name) };
    });
  }

  /** Validate a target and return the canonical config (server-resolved full name, normalised folder). */
  async validateTarget(ctx: AuthContext, input: RepoTarget, opts: { checkBranch: boolean } = { checkBranch: true }): Promise<RepoConfig> {
    let rootFolder: string;
    try {
      rootFolder = normalizeRootFolder(input.rootFolder);
    } catch (e) {
      if (e instanceof PathValidationError) throw new AppError(400, 'INVALID_ROOT_FOLDER', e.message);
      throw e;
    }
    if (!/^[A-Za-z0-9._/-]{1,200}$/.test(input.branch) || input.branch.includes('..')) {
      throw new AppError(400, 'INVALID_BRANCH', 'Invalid branch name.');
    }
    return withGitHub(this.auth, ctx, async (token) => {
      const repo = await this.resolve(token, input.repositoryId);
      if (!repo.permissions?.push) throw new AppError(403, 'GITHUB_PERMISSION_DENIED', 'You do not have write access to this repository.', { retryable: false });
      if (opts.checkBranch) {
        try {
          await this.github.getBranch(token, repo.full_name, input.branch);
        } catch (e) {
          if (!(e instanceof GitHubError && e.kind === 'not_found')) throw e;
          // A brand-new empty repository has no branches yet: allow its default branch —
          // the first sync creates it.
          const empty = (await this.github.listBranches(token, repo.full_name)).length === 0;
          if (!(empty && input.branch === repo.default_branch)) {
            throw new AppError(400, 'BRANCH_NOT_FOUND', `Branch "${input.branch}" does not exist.`);
          }
        }
      }
      return { repositoryId: String(repo.id), fullName: repo.full_name, branch: input.branch, rootFolder, layout: input.layout };
    });
  }

  /** Real write check: creates an unreferenced git blob (no visible change to the repo). */
  async testWrite(ctx: AuthContext, input: RepoTarget) {
    const cfg = await this.validateTarget(ctx, input, { checkBranch: false });
    return withGitHub(this.auth, ctx, async (token) => {
      try {
        await this.github.createBlob(token, cfg.fullName, `CodeSync write-access check ${new Date().toISOString()}\n`);
        return { ok: true, message: `CodeSync can write to ${cfg.fullName}.` };
      } catch (e) {
        if (e instanceof GitHubError && e.kind === 'conflict') {
          return { ok: true, message: `${cfg.fullName} is empty; write permission confirmed. The first sync will create the initial commit.` };
        }
        if (e instanceof GitHubError && (e.kind === 'forbidden' || e.kind === 'not_found')) {
          return { ok: false, message: 'Write access denied. Make sure the CodeSync GitHub App is installed on this repository with Contents: Read & write.' };
        }
        throw e;
      }
    });
  }
}
