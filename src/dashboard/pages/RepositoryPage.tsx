import { ExternalLink, Folder, Github, Loader2, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { buildSolutionPaths, normalizeRootFolder, type FolderLayout } from '@/shared/repo-paths';
import type { RepoConfig, RepositorySummary } from '@/shared/schemas';
import { StatusDot } from '@/ui/components/Badges';
import { Button } from '@/ui/components/Button';
import { SettingRow, SettingsCard, TextInput } from '@/ui/components/Fields';
import { useAction } from '@/ui/hooks/useAction';
import { useSettings } from '@/ui/hooks/useSettings';
import { cn } from '@/ui/lib/utils';

const selectCls =
  'focus-ring h-8 w-64 rounded-md border border-line-strong bg-canvas px-2.5 font-mono text-sm text-fg transition-colors hover:border-[#36363e] disabled:cursor-not-allowed disabled:opacity-50';

function folderError(v: string): string | null {
  try {
    normalizeRootFolder(v);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export function RepositoryPage() {
  const { account, settings, update } = useSettings();
  const { run, pending } = useAction();
  const connected = !!account?.githubAuthorized;

  const [repos, setRepos] = useState<RepositorySummary[] | null>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [repoId, setRepoId] = useState(account?.repo?.repositoryId ?? '');
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState(account?.repo?.branch ?? '');
  const [emptyRepo, setEmptyRepo] = useState(false);
  const [folder, setFolder] = useState(account?.repo?.rootFolder ?? settings.repository.rootFolder);
  const [layout, setLayout] = useState<FolderLayout>(account?.repo?.layout ?? settings.repository.layout);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const fErr = folderError(folder);

  const loadRepos = async () => {
    const data = await run<{ repositories: RepositorySummary[]; installUrl: string }>({ type: 'ui/repos' });
    if (data) {
      setRepos(data.repositories);
      setInstallUrl(data.installUrl);
    }
  };

  useEffect(() => {
    if (connected) void loadRepos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
    if (!repoId || !connected) return setBranches([]);
    void run<{ branches: string[] }>({ type: 'ui/branches', repositoryId: repoId }).then((d) => {
      if (!d) return;
      const repo = repos?.find((r) => r.id === repoId);
      // An empty repository has no branches yet: offer its default branch (created on first sync).
      const list = d.branches.length ? d.branches : repo ? [repo.defaultBranch] : [];
      setEmptyRepo(d.branches.length === 0);
      setBranches(list);
      setBranch((b) => (list.includes(b) ? b : repo && list.includes(repo.defaultBranch) ? repo.defaultBranch : list[0] ?? ''));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId, connected, repos]);

  const save = async () => {
    const saved = await run<RepoConfig>({ type: 'ui/save-repo', repositoryId: repoId, branch, rootFolder: folder, layout }, { success: 'Repository settings saved' });
    if (saved) update((s) => ({ ...s, repository: { rootFolder: saved.rootFolder, layout: saved.layout } }));
  };

  const dirty =
    !account?.repo || account.repo.repositoryId !== repoId || account.repo.branch !== branch || account.repo.rootFolder !== folder.trim().replace(/^\/+|\/+$/g, '') || account.repo.layout !== layout;
  const saveBlocker = !connected
    ? 'Connect GitHub first.'
    : !repoId
      ? 'Select a repository.'
      : !branch
        ? 'Waiting for branches to load…'
        : fErr
          ? 'Fix the root folder.'
          : !dirty
            ? 'Saved.'
            : null;
  const preview = fErr ? null : buildSolutionPaths(folder, layout, { platform: 'leetcode', problemId: '1', slug: 'two-sum', title: 'Two Sum', topics: ['Array'], language: 'python' });

  return (
    <div className="space-y-4">
      <SettingsCard title="GitHub account" description="CodeSync uses a GitHub App with access only to repositories you install it on. Your GitHub token stays on the CodeSync server, encrypted.">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            {account?.user.avatarUrl ? (
              <img src={account.user.avatarUrl} alt="" className="h-10 w-10 rounded-full border border-line-strong" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-line-strong bg-surface-raised">
                <Github size={18} className="text-fg-muted" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <StatusDot tone={connected ? 'ok' : account ? 'warn' : 'idle'} />
                <p className="text-base font-medium" data-testid="github-user">{account ? `@${account.user.login}` : 'Not connected'}</p>
              </div>
              <p className="text-sm text-fg-subtle">{connected ? 'Authorized' : account ? 'Authorization expired or revoked — reconnect.' : 'Sign in with GitHub to pick a repository.'}</p>
            </div>
          </div>
          {connected ? (
            <Button variant="ghost" icon={<LogOut size={13} />} disabled={pending === 'ui/disconnect'} onClick={() => run({ type: 'ui/disconnect' }, { success: 'GitHub disconnected' })}>
              Disconnect
            </Button>
          ) : (
            <Button variant="primary" icon={pending === 'ui/connect' ? <Loader2 size={14} className="animate-spin" /> : <Github size={14} />} disabled={pending === 'ui/connect'} onClick={() => run({ type: 'ui/connect' }, { success: 'GitHub connected' })}>
              {account ? 'Reconnect GitHub' : 'Connect GitHub'}
            </Button>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Destination"
        description="Where accepted solutions are committed."
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-2 truncate font-mono text-xs text-fg-subtle">
              <span className="text-fg-faint">preview</span>
              {preview?.solutionFile ?? '—'}
            </p>
            <div className="flex items-center gap-2">
              {saveBlocker && <span className="text-xs text-fg-subtle" data-testid="save-hint">{saveBlocker}</span>}
              <Button size="sm" variant="ghost" icon={pending === 'ui/test-repo' ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />} disabled={!account?.repo || dirty || !!pending}
                onClick={async () => setTestResult(await run<{ ok: boolean; message: string }>({ type: 'ui/test-repo' }))}>
                Test write access
              </Button>
              <Button size="sm" variant="primary" disabled={!!saveBlocker || pending === 'ui/save-repo'} onClick={save}>
                {pending === 'ui/save-repo' ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        }
      >
        <SettingRow title="Repository" description={connected ? 'Only repositories where the CodeSync app is installed are listed.' : 'Available after connecting GitHub.'} htmlFor="repo">
          <div className="flex items-center gap-1.5">
            <select id="repo" className={selectCls} value={repoId} disabled={!connected || !repos} onChange={(e) => setRepoId(e.target.value)}>
              <option value="">{repos ? (repos.length ? 'Select a repository…' : 'No repositories available') : connected ? 'Loading…' : 'Connect GitHub first'}</option>
              {repos?.map((r) => (
                <option key={r.id} value={r.id} disabled={!r.canPush}>
                  {r.fullName}{r.canPush ? '' : ' (read-only)'}
                </option>
              ))}
            </select>
            <button type="button" aria-label="Reload repositories" disabled={!connected} onClick={loadRepos} className="focus-ring rounded p-1.5 text-fg-subtle hover:text-fg disabled:opacity-40">
              <RefreshCw size={13} className={cn(pending === 'ui/repos' && 'animate-spin')} />
            </button>
          </div>
        </SettingRow>
        {installUrl && (
          <div className="px-5 py-2.5 text-xs text-fg-subtle">
            Missing a repository?{' '}
            <a href={installUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fg-muted underline-offset-2 hover:text-fg hover:underline">
              Install CodeSync on it <ExternalLink size={11} />
            </a>
          </div>
        )}
        <SettingRow title="Branch" description="Commits are pushed to this branch." htmlFor="branch">
          <select id="branch" className={selectCls} value={branch} disabled={!branches.length} onChange={(e) => setBranch(e.target.value)}>
            {!branches.length && <option value="">{repoId ? 'Loading…' : '—'}</option>}
            {branches.map((b) => <option key={b} value={b}>{b}{emptyRepo ? ' (new — created on first sync)' : ''}</option>)}
          </select>
        </SettingRow>
        {emptyRepo && (
          <p className="px-5 py-2.5 text-xs text-fg-subtle">This repository is empty. CodeSync will create the first commit on <span className="font-mono">{branch}</span>.</p>
        )}
        <SettingRow title="Root folder" description="Leave empty to write at the repository root." htmlFor="root-folder">
          <div className="w-64">
            <TextInput id="root-folder" value={folder} placeholder="/" prefix={<Folder size={13} />} error={fErr} onChange={(e) => setFolder(e.target.value)} />
          </div>
        </SettingRow>
        <SettingRow title="Folder structure" description="Group problems by topic, or keep a flat list per platform.">
          <div role="radiogroup" aria-label="Folder structure" className="flex rounded-md border border-line bg-canvas p-0.5">
            {([['platform/topic/problem', 'By topic'], ['platform/problem', 'Flat']] as const).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={layout === id} onClick={() => setLayout(id)}
                className={cn('focus-ring h-6 rounded-[5px] px-2.5 text-xs font-medium transition-colors', layout === id ? 'bg-surface-active text-fg' : 'text-fg-subtle hover:text-fg-muted')}>
                {label}
              </button>
            ))}
          </div>
        </SettingRow>
        {testResult && (
          <p role="status" className={cn('px-5 py-3 text-sm', testResult.ok ? 'text-accent' : 'text-danger')}>{testResult.message}</p>
        )}
      </SettingsCard>
    </div>
  );
}
