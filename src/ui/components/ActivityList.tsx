import { PLATFORMS } from '@/shared/constants';
import type { Job } from '@/shared/types';
import { VERDICT_LABELS } from '@/shared/verdict';
import { timeAgo } from '../lib/utils';
import { JobStatusLabel, PlatformMark } from './Badges';

export const jobTitle = (j: Job) => j.problem?.title ?? j.slug?.replace(/-/g, ' ') ?? `Submission ${j.submissionId}`;

/** Compact activity rows (popup). */
export function ActivityList({ items }: { items: Job[] }) {
  if (!items.length) {
    return <p className="px-3 py-6 text-center text-xs text-fg-subtle">No submissions yet. Solve a problem on LeetCode or GeeksforGeeks to see it here.</p>;
  }
  return (
    <ul className="divide-y divide-line-subtle" aria-label="Recent activity">
      {items.map((j) => (
        <li key={j.key} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover">
          <PlatformMark platform={j.platform} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium capitalize-first text-fg">
              {j.problem?.id && j.platform === 'leetcode' && <span className="mr-1 font-mono text-fg-subtle">{j.problem.id}.</span>}
              {jobTitle(j)}
            </p>
            <p className="mt-0.5 truncate text-2xs text-fg-subtle">
              {PLATFORMS[j.platform].name} · {j.languageVariant ?? VERDICT_LABELS[j.verdict]} · {timeAgo(new Date(j.updatedAt).toISOString())}
            </p>
          </div>
          <JobStatusLabel job={j} compact />
        </li>
      ))}
    </ul>
  );
}
