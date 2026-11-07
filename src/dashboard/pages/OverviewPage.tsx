import { ArrowRight, Check, Code2, FileCode2, Folder, Layers } from 'lucide-react';
import type { ReactNode } from 'react';
import { buildSolutionPaths } from '@/shared/repo-paths';
import { PlatformMark } from '@/ui/components/Badges';
import { useSettings } from '@/ui/hooks/useSettings';
import { computeStats } from '@/ui/lib/stats';
import { cn } from '@/ui/lib/utils';
import { ActivityTable } from '../components/ActivityTable';

function StatTile({ label, value, icon, hint }: { label: string; value: number; icon: ReactNode; hint: string }) {
  return (
    <div className="card p-4 transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">{label}</p>
        <span className="text-fg-faint">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-fg">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-fg-subtle">{hint}</p>
    </div>
  );
}

/** Single-series horizontal bars: label + value in text ink, one neutral hue. */
function Distribution({ title, rows, empty }: { title: string; rows: { label: string; count: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="card p-4" aria-label={title}>
      <h2 className="text-base font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-fg-subtle">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[110px_1fr_32px] items-center gap-3 text-sm" title={`${r.label}: ${r.count}`}>
              <span className="truncate text-fg-muted">{r.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-active">
                <span className="block h-full rounded-full bg-fg-muted/70" style={{ width: `${(r.count / max) * 100}%` }} />
              </span>
              <span className="text-right font-mono text-xs tabular-nums text-fg">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function OverviewPage() {
  const { settings, account, jobs } = useSettings();
  const stats = computeStats(jobs);
  const steps = [
    { label: 'Connect your GitHub account', done: !!account?.githubAuthorized },
    { label: 'Choose a destination repository', done: !!account?.repo },
    { label: 'Enable at least one platform', done: settings.platforms.leetcode || settings.platforms.gfg },
    { label: 'Get your first solution accepted', done: stats.total > 0 },
  ];
  const completed = steps.filter((s) => s.done).length;
  const preview = buildSolutionPaths(account?.repo?.rootFolder ?? settings.repository.rootFolder, account?.repo?.layout ?? settings.repository.layout, {
    platform: 'leetcode', problemId: '1', slug: 'two-sum', title: 'Two Sum', topics: ['Array'], language: 'python',
  });

  return (
    <div className="space-y-6">
      <section aria-label="Statistics" className="grid animate-fade-up grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Problems synced" value={stats.total} icon={<Layers size={14} />} hint="Unique problems on GitHub" />
        <StatTile label="LeetCode" value={stats.leetcode} icon={<PlatformMark platform="leetcode" size="sm" />} hint="Problems synced" />
        <StatTile label="GeeksforGeeks" value={stats.gfg} icon={<PlatformMark platform="gfg" size="sm" />} hint="Problems synced" />
        <StatTile label="Languages" value={stats.languages} icon={<Code2 size={14} />} hint="Distinct languages used" />
      </section>

      <div className="grid animate-fade-up grid-cols-1 gap-3 xl:grid-cols-[1fr_300px]">
        <section className="card overflow-hidden" aria-label="Recent activity">
          <header className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-base font-semibold">Recent activity</h2>
            <span className="text-xs text-fg-subtle">{stats.pending} in progress · {stats.failed} failed</span>
          </header>
          <ActivityTable items={jobs.slice(0, 6)} compact />
          <a href="#/activity" className="focus-ring flex items-center justify-center gap-1 border-t border-line py-2.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg">
            View all activity <ArrowRight size={12} />
          </a>
        </section>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-1 xl:content-start">
          <section className="card p-4" aria-label="Setup">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Get set up</h2>
              <span className="font-mono text-xs text-fg-subtle">{completed}/{steps.length}</span>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-active">
              <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(completed / steps.length) * 100}%` }} />
            </div>
            <ul className="mt-3 space-y-2">
              {steps.map((s) => (
                <li key={s.label} className="flex items-center gap-2.5 text-sm">
                  <span className={cn('flex h-4 w-4 items-center justify-center rounded-full border', s.done ? 'border-accent bg-accent text-canvas' : 'border-line-strong')}>
                    {s.done && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className={s.done ? 'text-fg-subtle line-through decoration-fg-faint' : 'text-fg-muted'}>{s.label}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-4" aria-label="Repository layout">
            <h2 className="text-base font-semibold">Repository layout</h2>
            <p className="mt-0.5 text-xs text-fg-subtle">Where an accepted solution is written.</p>
            <div className="mt-3 space-y-1 rounded-md border border-line bg-canvas p-2.5 font-mono text-2xs text-fg-muted">
              {preview.solutionFile.split('/').map((part, i, all) => (
                <div key={i} className="flex items-center gap-1.5" style={{ paddingLeft: i * 10 }}>
                  {i === all.length - 1 ? <FileCode2 size={11} className="text-accent" /> : <Folder size={11} className="text-fg-subtle" />}
                  <span className={i === all.length - 1 ? 'text-fg' : undefined}>{part}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="grid animate-fade-up grid-cols-1 gap-3 md:grid-cols-2">
        <Distribution title="Languages" rows={stats.languageDistribution} empty="Language usage appears after your first sync." />
        <Distribution title="Topics" rows={stats.topicDistribution} empty="Topic breakdown appears after your first sync." />
      </div>
    </div>
  );
}
