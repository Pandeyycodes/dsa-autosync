import { ExternalLink, RotateCw } from 'lucide-react';
import { PLATFORMS } from '@/shared/constants';
import type { Job } from '@/shared/types';
import { VERDICT_LABELS } from '@/shared/verdict';
import { jobTitle } from '@/ui/components/ActivityList';
import { DifficultyLabel, JobStatusLabel, PlatformMark } from '@/ui/components/Badges';
import { cn, timeAgo } from '@/ui/lib/utils';

export function ActivityTable({ items, onRetry, compact }: { items: Job[]; onRetry?: (key: string) => void; compact?: boolean }) {
  if (items.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-fg-subtle">Nothing here yet. Accepted submissions on LeetCode and GeeksforGeeks appear automatically.</p>;
  }
  return (
    <table className="w-full table-fixed text-left">
      <thead>
        <tr className="border-b border-line text-2xs uppercase tracking-[0.08em] text-fg-subtle">
          <th className="px-5 py-2.5 font-medium">Problem</th>
          {!compact && <th className="w-[92px] py-2.5 font-medium">Difficulty</th>}
          <th className="w-[110px] py-2.5 font-medium">Language</th>
          {!compact && <th className="w-[130px] py-2.5 font-medium">Verdict</th>}
          <th className="w-[112px] py-2.5 font-medium">Status</th>
          <th className="w-[96px] py-2.5 pr-5 text-right font-medium">When</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line-subtle">
        {items.map((j) => (
          <tr key={j.key} className="group transition-colors hover:bg-surface-hover">
            <td className="px-5 py-3">
              <div className="flex items-center gap-3">
                <PlatformMark platform={j.platform} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">
                    {j.problem?.id && j.platform === 'leetcode' && <span className="mr-1 font-mono text-fg-subtle">{j.problem.id}.</span>}
                    {jobTitle(j)}
                  </p>
                  <p className={cn('truncate text-2xs', j.error && j.status !== 'uploaded' ? (j.status === 'failed' ? 'text-danger/80' : 'text-fg-subtle') : 'text-fg-subtle')}>
                    {j.error && j.status !== 'uploaded' ? j.error.message : `${PLATFORMS[j.platform].name} · #${j.submissionId}`}
                  </p>
                </div>
              </div>
            </td>
            {!compact && <td className="py-3"><DifficultyLabel difficulty={j.problem?.difficulty ?? null} /></td>}
            <td className="truncate py-3 font-mono text-xs text-fg-muted">{j.languageVariant ?? '—'}</td>
            {!compact && <td className="py-3 text-xs text-fg-muted">{VERDICT_LABELS[j.verdict]}</td>}
            <td className="py-3">
              <div className="flex items-center gap-2">
                <JobStatusLabel job={j} />
                {j.commitUrl && (
                  <a href={j.commitUrl} target="_blank" rel="noreferrer" aria-label="View commit" className="text-fg-faint hover:text-fg">
                    <ExternalLink size={12} />
                  </a>
                )}
                {onRetry && j.request && (j.status === 'failed' || j.status === 'held' || (j.status === 'queued' && j.error)) && (
                  <button type="button" onClick={() => onRetry(j.key)} aria-label={`Retry ${jobTitle(j)}`} className="focus-ring rounded text-fg-subtle hover:text-fg">
                    <RotateCw size={12} />
                  </button>
                )}
              </div>
            </td>
            <td className="whitespace-nowrap py-3 pr-5 text-right text-xs tabular-nums text-fg-subtle">
              {j.status === 'queued' && j.nextAttemptAt && j.nextAttemptAt > Date.now() ? `retry ${timeAgo(new Date(2 * Date.now() - j.nextAttemptAt).toISOString()).replace(' ago', '')}` : timeAgo(new Date(j.updatedAt).toISOString())}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
