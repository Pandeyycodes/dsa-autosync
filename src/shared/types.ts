/** Extension-side domain types (popup, dashboard, service worker, content scripts). */
import type { LanguageId } from './languages';
import type { FolderLayout } from './repo-paths';
import type { MeResponse, SyncOutcome, SyncRequest } from './schemas';
import type { Verdict } from './verdict';

export type PlatformId = 'leetcode' | 'gfg';

/** How to handle a solution file that already exists with different content. */
export type DuplicateStrategy = 'skip' | 'overwrite' | 'version';

export interface PlatformInfo {
  id: PlatformId;
  name: string;
  shortName: string;
  host: string;
}

export interface Settings {
  autoSync: boolean;
  platforms: Record<PlatformId, boolean>;
  sqlSupport: boolean;
  languages: Record<LanguageId, boolean>;
  duplicateStrategy: DuplicateStrategy;
  readme: { includeStatement: boolean; includeExamples: boolean; includeConstraints: boolean };
  notifications: { onSuccess: boolean; onFailure: boolean };
  /** Local draft of repository settings; the backend copy is authoritative once saved. */
  repository: { rootFolder: string; layout: FolderLayout };
}

/** Signed-in account as cached by the service worker (never contains GitHub tokens). */
export type Account = MeResponse;

export type JobStatus =
  | 'verifying' // waiting for the platform's final verdict
  | 'ignored' // non-accepted verdict / unsupported / disabled — never uploaded
  | 'held' // accepted, auto-sync off — waits for manual sync
  | 'queued' // accepted, waiting to upload (or to retry)
  | 'uploading'
  | 'uploaded'
  | 'failed';

export interface JobError {
  code: string;
  message: string;
}

export interface Job {
  key: string; // `${platform}:${submissionId}`
  platform: PlatformId;
  submissionId: string;
  slug: string | null;
  status: JobStatus;
  verdict: Verdict;
  detectedAt: number;
  updatedAt: number;
  verifyAttempts: number;
  attempts: number;
  nextAttemptAt: number | null;
  error: JobError | null;
  problem: { title: string; id: string | null; difficulty: string | null; topics: string[] } | null;
  language: LanguageId | null;
  languageVariant: string | null;
  outcome: SyncOutcome | null;
  commitUrl: string | null;
  paths: string[];
  /** Upload payload; removed once uploaded so code is not kept longer than needed. */
  request: Omit<SyncRequest, 'repo'> | null;
  /** GitHub account the job belongs to (dedupe is per user). */
  githubId: string | null;
}
