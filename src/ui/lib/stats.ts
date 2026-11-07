import { LANGUAGES, type LanguageId } from '@/shared/languages';
import type { Job } from '@/shared/types';

export interface Stats {
  total: number;
  leetcode: number;
  gfg: number;
  languages: number;
  languageDistribution: { label: string; count: number }[];
  topicDistribution: { label: string; count: number }[];
  pending: number;
  failed: number;
  ignored: number;
}

/** All dashboard statistics are derived from real job history — nothing hard-coded. */
export function computeStats(jobs: Job[]): Stats {
  const uploaded = jobs.filter((j) => j.status === 'uploaded' && j.problem);
  const problems = new Map<string, Job>();
  for (const j of uploaded) problems.set(`${j.platform}:${j.slug}`, j);

  const langCount = new Map<LanguageId, number>();
  const topicCount = new Map<string, number>();
  const seenLang = new Set<string>();
  for (const j of uploaded) {
    if (j.language && !seenLang.has(`${j.platform}:${j.slug}:${j.language}`)) {
      seenLang.add(`${j.platform}:${j.slug}:${j.language}`);
      langCount.set(j.language, (langCount.get(j.language) ?? 0) + 1);
    }
  }
  for (const j of problems.values()) {
    const topics = j.problem!.topics.length ? j.problem!.topics : [j.language === 'sql' ? 'Database' : 'Uncategorized'];
    for (const t of topics) topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
  }
  const sorted = <K,>(m: Map<K, number>, label: (k: K) => string) =>
    [...m].map(([k, count]) => ({ label: label(k), count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const all = [...problems.values()];
  return {
    total: all.length,
    leetcode: all.filter((j) => j.platform === 'leetcode').length,
    gfg: all.filter((j) => j.platform === 'gfg').length,
    languages: langCount.size,
    languageDistribution: sorted(langCount, (k) => LANGUAGES[k].label),
    topicDistribution: sorted(topicCount, (k) => k).slice(0, 10),
    pending: jobs.filter((j) => ['verifying', 'queued', 'uploading', 'held'].includes(j.status)).length,
    failed: jobs.filter((j) => j.status === 'failed').length,
    ignored: jobs.filter((j) => j.status === 'ignored').length,
  };
}
