/**
 * Programming languages CodeSync can store. SQL is a *language* (with dialect
 * variants), never a platform. Keep this list the single source of truth.
 */
export const LANGUAGE_IDS = [
  'c', 'cpp', 'python', 'java', 'javascript', 'typescript', 'go', 'rust',
  'csharp', 'kotlin', 'php', 'ruby', 'swift', 'sql',
] as const;

export type LanguageId = (typeof LANGUAGE_IDS)[number];

export interface LanguageInfo {
  id: LanguageId;
  label: string;
  /** Safe folder name used in the repository. */
  folder: string;
  extension: string;
}

export const LANGUAGES: Record<LanguageId, LanguageInfo> = {
  c: { id: 'c', label: 'C', folder: 'C', extension: 'c' },
  cpp: { id: 'cpp', label: 'C++', folder: 'Cpp', extension: 'cpp' },
  python: { id: 'python', label: 'Python', folder: 'Python', extension: 'py' },
  java: { id: 'java', label: 'Java', folder: 'Java', extension: 'java' },
  javascript: { id: 'javascript', label: 'JavaScript', folder: 'JavaScript', extension: 'js' },
  typescript: { id: 'typescript', label: 'TypeScript', folder: 'TypeScript', extension: 'ts' },
  go: { id: 'go', label: 'Go', folder: 'Go', extension: 'go' },
  rust: { id: 'rust', label: 'Rust', folder: 'Rust', extension: 'rs' },
  csharp: { id: 'csharp', label: 'C#', folder: 'CSharp', extension: 'cs' },
  kotlin: { id: 'kotlin', label: 'Kotlin', folder: 'Kotlin', extension: 'kt' },
  php: { id: 'php', label: 'PHP', folder: 'PHP', extension: 'php' },
  ruby: { id: 'ruby', label: 'Ruby', folder: 'Ruby', extension: 'rb' },
  swift: { id: 'swift', label: 'Swift', folder: 'Swift', extension: 'swift' },
  sql: { id: 'sql', label: 'SQL', folder: 'SQL', extension: 'sql' },
};

export interface ResolvedLanguage {
  id: LanguageId;
  /** Platform's own name for the language/dialect, e.g. "MySQL", "Python3". */
  variant: string;
}

/**
 * Map a platform language identifier/name to a LanguageId.
 * Returns null for languages CodeSync does not support (e.g. Scala, Bash).
 */
export function resolveLanguage(raw: string | null | undefined): ResolvedLanguage | null {
  if (!raw) return null;
  const variant = raw.trim();
  const key = variant.toLowerCase().replace(/\s+/g, '');
  const table: Record<string, LanguageId> = {
    c: 'c', gnuc: 'c',
    cpp: 'cpp', 'c++': 'cpp', 'c++14': 'cpp', 'c++17': 'cpp', 'c++20': 'cpp', 'g++': 'cpp',
    python: 'python', python2: 'python', python3: 'python', py: 'python', pypy3: 'python', pythondata: 'python', pandas: 'python',
    java: 'java',
    javascript: 'javascript', js: 'javascript', 'node.js': 'javascript', nodejs: 'javascript',
    typescript: 'typescript', ts: 'typescript',
    go: 'go', golang: 'go',
    rust: 'rust',
    csharp: 'csharp', 'c#': 'csharp', cs: 'csharp',
    kotlin: 'kotlin',
    php: 'php',
    ruby: 'ruby',
    swift: 'swift',
    sql: 'sql', mysql: 'sql', mssql: 'sql', 'mssqlserver': 'sql', 'sqlserver': 'sql', oraclesql: 'sql', oracle: 'sql', postgresql: 'sql', postgres: 'sql',
  };
  const id = table[key];
  return id ? { id, variant } : null;
}
