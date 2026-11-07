/**
 * Deterministic, traversal-safe repository paths. Used by the backend (the
 * authority — it never trusts client paths) and by the UI for previews.
 */
import { LANGUAGES, type LanguageId } from './languages';
import { sqlTopic } from './sql-topics';

export type Platform = 'leetcode' | 'gfg';
export type FolderLayout = 'platform/topic/problem' | 'platform/difficulty/problem' | 'platform/problem';

export const PLATFORM_FOLDERS: Record<Platform, string> = { leetcode: 'LeetCode', gfg: 'GeeksForGeeks' };

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** Hash-free FNV-1a for short deterministic fallbacks (not security relevant). */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (const ch of input) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Reduce arbitrary text to a single safe path segment: ASCII letters,
 * digits, '.', '_', '-'. Never returns '', '.', '..' or a reserved name.
 */
export function safeSegment(input: string, fallbackPrefix = 'item', maxLength = 80): string {
  const ascii = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, maxLength)
    .replace(/[-.]+$/g, '');
  if (!ascii || WINDOWS_RESERVED.test(ascii) || /^\.+$/.test(ascii)) {
    return `${fallbackPrefix}-${fnv1a(input)}`;
  }
  return ascii;
}

export class PathValidationError extends Error {}

/** Validate & normalise a user-supplied root folder ("" means repo root). */
export function normalizeRootFolder(input: string): string {
  const trimmed = input.trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) return '';
  if (trimmed.includes('\\')) throw new PathValidationError('Use forward slashes in the root folder.');
  if (/[\u0000-\u001f<>:"|?*]/.test(trimmed)) throw new PathValidationError('Root folder contains invalid characters.');
  const parts = trimmed.split('/');
  if (parts.length > 5) throw new PathValidationError('Root folder can be at most 5 levels deep.');
  for (const p of parts) {
    if (!p || p === '.' || p === '..') throw new PathValidationError('Root folder cannot contain empty, "." or ".." segments.');
    if (p.startsWith('.')) throw new PathValidationError('Root folder segments cannot start with "." (e.g. .git, .github).');
    if (safeSegment(p, 'x') !== p) throw new PathValidationError(`"${p}" is not a safe folder name (use letters, numbers, ".", "_" or "-").`);
  }
  return parts.join('/');
}

export interface PathInput {
  platform: Platform;
  problemId: string | null;
  slug: string;
  title: string;
  topics: string[];
  language: LanguageId;
  difficulty?: string | null;
  /** The submitted code — used to classify SQL solutions by concept. */
  code?: string;
}

export function primaryTopic(topics: string[], language: LanguageId): string {
  if (language === 'sql' && !topics.length) return 'Database';
  return topics[0] ?? 'Uncategorized';
}

export function difficultyFolder(difficulty: string | null | undefined): string {
  const d = difficulty?.trim();
  return d ? d.charAt(0).toUpperCase() + d.slice(1).toLowerCase() : 'Uncategorized';
}

/**
 * Topic folder inside a platform. Platforms tag every SQL problem just
 * "Database", so SQL is grouped by the SQL concept its solution uses
 * (Joins, Aggregation, Window-Functions …); everything else by its primary
 * platform topic (Array, Tree, Graph …).
 */
export function groupFolder(input: Pick<PathInput, 'topics' | 'language' | 'code'>): string {
  if (input.language === 'sql') {
    const specific = input.topics.find((t) => !/^(database|sql)$/i.test(t));
    if (specific) return specific; // a platform that does tag SQL topics wins
    return input.code ? sqlTopic(input.code) : 'Database';
  }
  return primaryTopic(input.topics, input.language);
}

export function problemFolderName(input: Pick<PathInput, 'platform' | 'problemId' | 'slug' | 'title'>): string {
  const base = safeSegment(input.slug || input.title, 'problem', 100).toLowerCase();
  if (input.platform === 'leetcode' && input.problemId && /^\d+$/.test(input.problemId)) {
    return `${input.problemId.padStart(4, '0')}-${base}`;
  }
  return base;
}

export interface SolutionPaths {
  problemDir: string;
  solutionFile: string;
  readme: string;
}

/**
 * <root>/<Platform>/<Topic>/<problem>/solution.<ext> + README.md
 * Each language is just a different extension in the same folder
 * (solution.py, solution.cpp, solution.sql …), so they never collide.
 */
export function buildSolutionPaths(rootFolder: string, layout: FolderLayout, input: PathInput, fileName = 'solution'): SolutionPaths {
  const root = normalizeRootFolder(rootFolder);
  const segments = [root, PLATFORM_FOLDERS[input.platform]];
  if (layout === 'platform/topic/problem') segments.push(safeSegment(groupFolder(input), 'group'));
  if (layout === 'platform/difficulty/problem') segments.push(safeSegment(difficultyFolder(input.difficulty), 'group'));
  segments.push(problemFolderName(input));
  return pathsInDir(segments.filter(Boolean).join('/'), input.language, fileName);
}

/** Solution + README paths inside a given (already safe) problem directory. */
export function pathsInDir(problemDir: string, language: LanguageId, fileName = 'solution'): SolutionPaths {
  const safeName = safeSegment(fileName, 'solution');
  return {
    problemDir,
    solutionFile: `${problemDir}/${safeName}.${LANGUAGES[language].extension}`,
    readme: `${problemDir}/README.md`,
  };
}

/** Recognise CodeSync solution files ("solution.py", "solution-123.cpp") → language. */
export function languageOfSolutionFile(name: string): LanguageId | null {
  const m = /^solution(?:-[A-Za-z0-9_-]+)?\.([a-z]+)$/.exec(name);
  if (!m) return null;
  return (Object.values(LANGUAGES).find((l) => l.extension === m[1])?.id as LanguageId | undefined) ?? null;
}
