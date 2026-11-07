import { Github, Loader2 } from 'lucide-react';
import { APP_VERSION } from '@/shared/constants';
import { StatusDot } from '@/ui/components/Badges';
import { Button } from '@/ui/components/Button';
import { Wordmark } from '@/ui/components/Logo';
import { useAction } from '@/ui/hooks/useAction';
import { useSettings } from '@/ui/hooks/useSettings';
import { cn } from '@/ui/lib/utils';
import { ActivityPage } from './pages/ActivityPage';
import { GeneralPage } from './pages/GeneralPage';
import { OverviewPage } from './pages/OverviewPage';
import { PlatformsPage } from './pages/PlatformsPage';
import { RepositoryPage } from './pages/RepositoryPage';
import { ROUTES, useHashRoute, type RouteId } from './routes';

const PAGES: Record<RouteId, () => JSX.Element> = {
  overview: OverviewPage,
  activity: ActivityPage,
  repository: RepositoryPage,
  platforms: PlatformsPage,
  general: GeneralPage,
};

export function Dashboard() {
  const [route, navigate] = useHashRoute();
  const { settings, ready, account, jobs } = useSettings();
  const { run, pending } = useAction();
  const current = ROUTES.find((r) => r.id === route)!;
  const Page = PAGES[route];
  const connected = !!account?.githubAuthorized;
  const failed = jobs.filter((j) => j.status === 'failed').length;

  return (
    <div className={cn('flex h-screen overflow-hidden bg-canvas', !ready && 'opacity-0')}>
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-line bg-[#0B0B0E]">
        <div className="px-4 pb-5 pt-4">
          <Wordmark size={26} sub="Solutions → GitHub" />
        </div>

        <nav aria-label="Dashboard" className="flex-1 space-y-5 overflow-y-auto px-2">
          {(['Workspace', 'Settings'] as const).map((group) => (
            <div key={group}>
              <p className="eyebrow mb-1 px-2">{group}</p>
              <ul className="space-y-px">
                {ROUTES.filter((r) => r.group === group).map((r) => {
                  const active = r.id === route;
                  const Icon = r.icon;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => navigate(r.id)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'focus-ring group flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm transition-colors duration-150',
                          active ? 'bg-surface-active text-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
                        )}
                      >
                        <Icon size={15} className={cn('shrink-0', active ? 'text-fg' : 'text-fg-subtle group-hover:text-fg-muted')} />
                        <span className="flex-1 text-left">{r.label}</span>
                        {r.id === 'activity' && failed > 0 && (
                          <span aria-hidden="true" className="rounded bg-danger-soft px-1.5 font-mono text-2xs text-danger">{failed}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="m-3 rounded-lg border border-line bg-surface p-3">
          <div className="flex items-center gap-2">
            <StatusDot tone={connected && settings.autoSync ? 'ok' : 'warn'} />
            <span className="text-xs font-medium text-fg">{!connected ? 'Not connected' : settings.autoSync ? 'Auto-sync on' : 'Auto-sync paused'}</span>
          </div>
          <p className="mt-1 truncate text-2xs text-fg-subtle">
            {connected ? `@${account.user.login}` : 'GitHub not connected'} · v{APP_VERSION}
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-6">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-fg-subtle">{current.group}</span>
            <span className="text-fg-faint">/</span>
            <span className="font-medium text-fg">{current.label}</span>
          </div>
          {connected ? (
            <span className="flex items-center gap-2 text-xs text-fg-muted">
              {account.user.avatarUrl && <img src={account.user.avatarUrl} alt="" className="h-5 w-5 rounded-full" />}
              {account.user.login}
            </span>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              icon={pending === 'ui/connect' ? <Loader2 size={13} className="animate-spin" /> : <Github size={13} />}
              disabled={pending === 'ui/connect'}
              onClick={() => run({ type: 'ui/connect' }, { success: 'GitHub connected' })}
            >
              {account ? 'Reconnect GitHub' : 'Connect GitHub'}
            </Button>
          )}
        </header>

        <main className="flex-1 overflow-y-auto">
          <div key={route} className="mx-auto w-full max-w-[1000px] px-6 pb-16 pt-8">
            <div className="mb-6 animate-fade-up">
              <h1 className="text-2xl font-semibold text-fg">{current.title}</h1>
              <p className="mt-1 text-base text-fg-subtle">{current.description}</p>
            </div>
            <Page />
          </div>
        </main>
      </div>
    </div>
  );
}
