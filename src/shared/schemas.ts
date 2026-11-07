/**
 * Zod schemas for every payload that crosses a trust boundary
 * (content script → service worker → backend → extension UI).
 */
import { z } from 'zod';
import { LANGUAGE_IDS } from './languages';

export const PlatformSchema = z.enum(['leetcode', 'gfg']);
export const LanguageIdSchema = z.enum(LANGUAGE_IDS);
export const DuplicateStrategySchema = z.enum(['skip', 'overwrite', 'version']);
export const FolderLayoutSchema = z.enum(['platform/topic/problem', 'platform/problem']);

/** Submission ids are numeric on both platforms today; allow a safe superset. */
export const SubmissionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'invalid submission id');
export const SlugSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/, 'invalid problem slug');

const PLATFORM_HOSTS: Record<z.infer<typeof PlatformSchema>, RegExp> = {
  leetcode: /^(www\.)?leetcode\.com$/,
  gfg: /^(www\.|practice\.)?geeksforgeeks\.org$/,
};

const text = (max: number) => z.string().max(max);

export const ProblemSchema = z.object({
  /** Platform-visible identifier (LeetCode frontend id, GFG numeric id). */
  id: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).nullable(),
  title: z.string().trim().min(1).max(300),
  slug: SlugSchema,
  url: z.string().url().max(500),
  difficulty: z.string().trim().max(32).nullable(),
  topics: z.array(z.string().trim().min(1).max(80)).max(30),
  statementMarkdown: text(60_000).nullable(),
  examples: z.array(text(10_000)).max(30),
  constraints: z.array(text(2_000)).max(60),
});

export const CaptureSchema = z
  .object({
    platform: PlatformSchema,
    submissionId: SubmissionIdSchema,
    problem: ProblemSchema,
    language: LanguageIdSchema,
    languageVariant: z.string().trim().min(1).max(40),
    code: z.string().min(1).max(256_000),
    submittedAt: z.string().datetime(),
  })
  .superRefine((c, ctx) => {
    let host = '';
    try {
      const u = new URL(c.problem.url);
      host = u.protocol === 'https:' ? u.hostname : '';
    } catch {
      /* handled below */
    }
    if (!PLATFORM_HOSTS[c.platform].test(host)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['problem', 'url'], message: 'URL does not belong to platform' });
    }
  });

export type SubmissionCapture = z.infer<typeof CaptureSchema>;

export const ReadmePrefsSchema = z.object({
  includeStatement: z.boolean(),
  includeExamples: z.boolean(),
  includeConstraints: z.boolean(),
});
export type ReadmePrefs = z.infer<typeof ReadmePrefsSchema>;

/** Where to commit — kept by the extension, re-validated by the server on every request. */
export const RepoTargetSchema = z.object({
  repositoryId: z.string().regex(/^\d{1,20}$/),
  branch: z.string().min(1).max(200),
  rootFolder: z.string().max(200),
  layout: FolderLayoutSchema,
});
export type RepoTarget = z.infer<typeof RepoTargetSchema>;

export const SyncRequestSchema = z.object({
  capture: CaptureSchema,
  repo: RepoTargetSchema,
  codeSha256: z.string().regex(/^[a-f0-9]{64}$/),
  verdict: z.literal('ACCEPTED'),
  readme: ReadmePrefsSchema,
  duplicateStrategy: DuplicateStrategySchema,
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export const SyncOutcomeSchema = z.enum(['created', 'updated', 'unchanged', 'duplicate', 'skipped_exists']);
export type SyncOutcome = z.infer<typeof SyncOutcomeSchema>;

export const SyncResponseSchema = z.object({
  outcome: SyncOutcomeSchema,
  paths: z.array(z.string()),
  commitSha: z.string().nullable(),
  commitUrl: z.string().nullable(),
});
export type SyncResponse = z.infer<typeof SyncResponseSchema>;

// ---------- API shapes ----------

export const GitHubUserSchema = z.object({ login: z.string(), avatarUrl: z.string().nullable(), githubId: z.string() });

export const RepoConfigSchema = z.object({
  repositoryId: z.string().regex(/^\d{1,20}$/),
  fullName: z.string().regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/),
  branch: z.string().min(1).max(200),
  rootFolder: z.string().max(200),
  layout: FolderLayoutSchema,
});
export type RepoConfig = z.infer<typeof RepoConfigSchema>;

export const MeResponseSchema = z.object({
  user: GitHubUserSchema,
  repo: RepoConfigSchema.nullable(),
  githubAuthorized: z.boolean(),
  sessionExpiresAt: z.string(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const RepositorySummarySchema = z.object({
  id: z.string(),
  fullName: z.string(),
  private: z.boolean(),
  defaultBranch: z.string(),
  canPush: z.boolean(),
});
export type RepositorySummary = z.infer<typeof RepositorySummarySchema>;

export const ReposResponseSchema = z.object({ repositories: z.array(RepositorySummarySchema), installUrl: z.string() });
export const BranchesResponseSchema = z.object({ branches: z.array(z.string()) });
export const WriteTestResponseSchema = z.object({ ok: z.boolean(), message: z.string() });

export const AuthStartRequestSchema = z.object({
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'challenge must be base64url sha256'),
  redirectUri: z.string().url().max(200),
});
export const AuthStartResponseSchema = z.object({ authorizeUrl: z.string().url() });
/** Sealed, server-encrypted one-time handoff code. */
export const SEALED_TOKEN_RE = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{8,6000}$/;

export const AuthExchangeRequestSchema = z.object({
  code: z.string().regex(SEALED_TOKEN_RE),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
});
export const AuthExchangeResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  user: GitHubUserSchema,
});

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean().optional(), retryAfterSeconds: z.number().optional() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>['error'];
