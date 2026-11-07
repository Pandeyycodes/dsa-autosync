import { Play, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Job } from '@/shared/types';
import { Button } from '@/ui/components/Button';
import { useAction } from '@/ui/hooks/useAction';
import { useSettings } from '@/ui/hooks/useSettings';
import { cn } from '@/ui/lib/utils';
import { ActivityTable } from '../components/ActivityTable';

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'uploaded', label: 'Uploaded', test: (j: Job) => j.status === 'uploaded' },
  { id: 'pending', label: 'Pending', test: (j: Job) => ['verifying', 'queued', 'uploading', 'held'].includes(j.status) },
  { id: 'ignored', label: 'Ignored', test: (j: Job) => j.status === 'ignored' },
  { id: 'failed', label: 'Failed', test: (j: Job) => j.status === 'failed' },
] as const;
type FilterId = (typeof FILTERS)[number]['id'];

export function ActivityPage() {
  const { jobs } = useSettings();
  const { run } = useAction();
  const [filter, setFilter] = useState<FilterId>('all');
  const [query, setQuery] = useState('');
  const held = jobs.filter((j) => j.status === 'held').length;

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const f = FILTERS.find((x) => x.id === filter)!;
    return jobs.filter((j) => f.test(j) && (!q || [j.problem?.title, j.slug, j.languageVariant, j.submissionId].some((v) => v?.toLowerCase().includes(q))));
  }, [jobs, filter, query]);

  return (
    <section className="card animate-fade-up overflow-hidden" aria-label="Activity">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div role="tablist" aria-label="Filter activity" className="flex rounded-md border border-line bg-canvas p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn('focus-ring h-6 rounded-[5px] px-2.5 text-xs font-medium transition-colors', filter === f.id ? 'bg-surface-active text-fg shadow-card' : 'text-fg-subtle hover:text-fg-muted')}
            >
              {f.label}
              <span className="ml-1.5 font-mono text-2xs text-fg-faint">{jobs.filter(f.test).length}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {held > 0 && (
            <Button size="sm" variant="secondary" icon={<Play size={12} />} onClick={() => run({ type: 'ui/sync-held' })}>
              Sync {held} held
            </Button>
          )}
          <label className="flex h-7 w-56 items-center gap-2 rounded-md border border-line-strong bg-canvas px-2 focus-within:shadow-focus">
            <Search size={13} className="text-fg-subtle" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by problem or language" aria-label="Filter by problem or language" className="w-full bg-transparent text-xs text-fg placeholder:text-fg-faint focus:outline-none" />
          </label>
        </div>
      </header>
      <ActivityTable items={items} onRetry={(key) => run({ type: 'ui/retry', key }, { success: 'Retry scheduled' })} />
    </section>
  );
}
