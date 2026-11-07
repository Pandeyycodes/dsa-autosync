import { ArrowUpRight, ChevronRight, FolderGit2, GitBranch, Github, Loader2, Settings2, Zap } from 'lucide-react';
import { APP_VERSION, PLATFORM_IDS, PLATFORMS } from '@/shared/constants';
import { ActivityList } from '@/ui/components/ActivityList';
import { Badge, PlatformMark, StatusDot } from '@/ui/components/Badges';
import { Button, IconButton } from '@/ui/components/Button';
import { LogoMark } from '@/ui/components/Logo';
import { Switch } from '@/ui/components/Switch';
import { useAction } from '@/ui/hooks/useAction';
import { useSettings } from '@/ui/hooks/useSettings';
import { cn, openDashboard } from '@/ui/lib/utils';

export function Popup() {
  const { settings, update, account, jobs, ready } = useSettings();
  const { run, pending } = useAction();
  const connected = !!account?.githubAuthorized;
  const needsReauth = !!account && !account.githubAuthorized;
  const pendingCount = jobs.filter((j) => ['verifying', 'queued', 'uploading'].includes(j.status)).length;

  return (
    <div className={cn('flex min-h-[520px] flex-col', !ready && 'opacity-0')}>
      <header className="flex items-center justify-between px-4 pb-3 pt-3.5">
        <div className="flex items-center gap-2.5">
          <LogoMark size={22} />
          <span className="text-[14px] font-semibold tracking-[-0.01em]">CodeSync</span>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton label="Open dashboard" onClick={() => openDashboard('overview')}>
            <ArrowUpRight size={15} />
          </IconButton>
          <IconButton label="Settings" onClick={() => openDashboard('general')}>
            <Settings2 size={15} />
          </IconButton>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-3 px-3 pb-3">
        <section className="card p-3" aria-label="GitHub connection">
          <div className="flex items-center gap-3">
            {account?.user.avatarUrl ? (
              <img src={account.user.avatarUrl} alt="" className="h-9 w-9 rounded-lg border border-line-strong" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-surface-raised">
                <Github size={17} className="text-fg-muted" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StatusDot tone={connected ? 'ok' : needsReauth ? 'warn' : 'idle'} />
                <p className="truncate text-sm font-medium text-fg" data-testid="connection-status">
                  {connected ? account.user.login : needsReauth ? 'Reconnect required' : 'Not connected'}
                </p>
              </div>
              <p className="mt-0.5 text-xs text-fg-subtle">
                {connected ? 'GitHub connected' : needsReauth ? 'GitHub authorization expired or was revoked.' : 'Link GitHub to start syncing solutions.'}
              </p>
            </div>
          </div>
          {!connected && (
            <Button
              variant="primary"
              className="mt-3 w-full"
              icon={pending === 'ui/connect' ? <Loader2 size={14} className="animate-spin" /> : <Github size={14} />}
              disabled={pending === 'ui/connect'}
              onClick={() => run({ type: 'ui/connect' }, { success: 'GitHub connected' })}
            >
              {needsReauth ? 'Reconnect GitHub' : 'Connect GitHub'}
            </Button>
          )}

          <div className="hairline my-3" />

          <button
            type="button"
            onClick={() => openDashboard('repository')}
            className="focus-ring -mx-1 flex w-[calc(100%+8px)] items-center gap-2.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-surface-hover"
          >
            <FolderGit2 size={14} className="shrink-0 text-fg-subtle" />
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Repository</p>
              <p className="truncate font-mono text-xs text-fg-muted" data-testid="repo-name">
                {account?.repo?.fullName ?? 'No repository selected'}
              </p>
            </div>
            {account?.repo && (
              <span className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-[1px] font-mono text-2xs text-fg-subtle">
                <GitBranch size={10} />
                {account.repo.branch}
              </span>
            )}
            <ChevronRight size={14} className="text-fg-faint" />
          </button>
        </section>

        <section className="card flex items-center gap-3 px-3 py-2.5" aria-label="Automatic sync">
          <div className={cn('flex h-7 w-7 items-center justify-center rounded-md border transition-colors', settings.autoSync ? 'border-accent/20 bg-accent-soft text-accent' : 'border-line-strong bg-surface-raised text-fg-subtle')}>
            <Zap size={13} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Automatic sync</p>
            <p className="text-xs text-fg-subtle">{settings.autoSync ? 'Accepted solutions push automatically' : 'Paused — accepted solutions are held'}</p>
          </div>
          <Switch label="Automatic sync" checked={settings.autoSync} onChange={(v) => update({ autoSync: v })} />
        </section>

        <section aria-label="Supported platforms">
          <p className="eyebrow mb-1.5 px-1">Platforms</p>
          <div className="card divide-y divide-line">
            {PLATFORM_IDS.map((id) => {
              const enabled = settings.platforms[id];
              return (
                <div key={id} className="flex items-center gap-2.5 px-3 py-2">
                  <PlatformMark platform={id} size="sm" muted={!enabled} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{PLATFORMS[id].name}</p>
                    <p className={cn('text-2xs', enabled ? 'text-fg-subtle' : 'text-fg-faint')}>{enabled ? `Watching ${PLATFORMS[id].host}` : 'Paused'}</p>
                  </div>
                  <Switch size="sm" label={`Sync ${PLATFORMS[id].name}`} checked={enabled} onChange={(v) => update((s) => ({ ...s, platforms: { ...s.platforms, [id]: v } }))} />
                </div>
              );
            })}
          </div>
        </section>

        <section className="card overflow-hidden" aria-label="Recent activity section">
          <header className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-sm font-medium">Recent activity</p>
            {pendingCount > 0 && <Badge tone="warn">{pendingCount} in progress</Badge>}
          </header>
          <ActivityList items={jobs.slice(0, 3)} />
        </section>
      </main>

      <footer className="flex items-center justify-between border-t border-line px-4 py-2.5">
        <span className="font-mono text-2xs text-fg-faint">v{APP_VERSION}</span>
        <button type="button" onClick={() => openDashboard('overview')} className="focus-ring inline-flex items-center gap-1 rounded text-xs font-medium text-fg-muted transition-colors hover:text-fg">
          Open dashboard <ArrowUpRight size={12} />
        </button>
      </footer>
    </div>
  );
}
