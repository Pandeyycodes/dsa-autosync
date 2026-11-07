import { LANGUAGE_IDS, type LanguageId } from './languages';
import type { DuplicateStrategy, PlatformId, PlatformInfo, Settings } from './types';

export const APP_NAME = 'CodeSync';
export const APP_VERSION = '1.0.0';

export const KEYS = {
  settings: 'codesync:settings',
  auth: 'codesync:auth',
  account: 'codesync:account',
  jobs: 'codesync:jobs',
} as const;
/** @deprecated kept for older imports */
export const STORAGE_KEY = KEYS.settings;

export const API_BASE_URL: string = (import.meta.env?.VITE_CODESYNC_API_URL as string | undefined) ?? 'http://localhost:8787';

export const PLATFORMS: Record<PlatformId, PlatformInfo> = {
  leetcode: { id: 'leetcode', name: 'LeetCode', shortName: 'LC', host: 'leetcode.com' },
  gfg: { id: 'gfg', name: 'GeeksforGeeks', shortName: 'GfG', host: 'geeksforgeeks.org' },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[];

export const DEFAULT_SETTINGS: Settings = {
  autoSync: true,
  platforms: { leetcode: true, gfg: true },
  sqlSupport: true,
  languages: Object.fromEntries(LANGUAGE_IDS.map((l) => [l, true])) as Record<LanguageId, boolean>,
  duplicateStrategy: 'overwrite',
  // Problem text is the platform's content: off by default, user opt-in.
  readme: { includeStatement: false, includeExamples: false, includeConstraints: false },
  notifications: { onSuccess: true, onFailure: true },
  repository: { rootFolder: 'DSA', layout: 'platform/topic/problem' },
};

export const DUPLICATE_STRATEGIES: { id: DuplicateStrategy; label: string; description: string }[] = [
  { id: 'overwrite', label: 'Update when changed', description: 'Replace the file only if your new accepted code differs. Identical code is never re-committed.' },
  { id: 'skip', label: 'Never overwrite', description: 'Keep the existing file untouched if one is already in the repository.' },
  { id: 'version', label: 'Keep every version', description: 'Store changed solutions as solution-<submission id> next to the original.' },
];

/** Upload retry policy for the persistent job queue. */
export const RETRY = { maxAttempts: 6, baseDelayMs: 30_000, maxDelayMs: 30 * 60_000 };
/** Verifying jobs older than this are closed as UNKNOWN (never uploaded). */
export const VERIFY_TIMEOUT_MS = 24 * 3600_000;
/** GfG verdicts can only be observed in the submitting tab (no lookup by id), so give up sooner. */
export const GFG_VERIFY_TIMEOUT_MS = 15 * 60_000;
export const MAX_JOBS = 500;
