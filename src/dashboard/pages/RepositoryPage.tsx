import { Database, ExternalLink, Folder, Github, Loader2, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RepoTargetKind } from '@/shared/messages';
import { buildSolutionPaths, normalizeRootFolder, type FolderLayout, type PathInput } from '@/shared/repo-paths';
import type { RepoConfig, RepositorySummary } from '@/shared/schemas';
import { StatusDot } from '@/ui/components/Badges';
import { Button } from '@/ui/components/Button';
import { SettingRow, SettingsCard, TextInput } from '@/ui/components/Fields';
import { Switch } from '@/ui/components/Switch';
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

/** Preview problems used to show where a file will land. */
const SAMPLE: Record<RepoTargetKind, PathInput> = {
  main: { platform: 'leetcode', problemId: '1', slug: 'two-sum', title: 'Two Sum', topics: ['Array'], language: 'python', difficulty: 'Easy' },
  sql: { platform: 'leetcode', problemId: '176', slug: 'second-highest-salary', title: 'Second Highest Salary', topics: ['Database'], language: 'sql', difficulty: 'Medium', code: 'SELECT MAX(salary) FROM Employee WHERE salary < (SELECT MAX(salary) FROM Employee);' },
};

interface EditorProps {
  kind: RepoTargetKind;
  saved: RepoConfig | null;
  repos: RepositorySummary[] | null;
  installUrl: string | null;
  onReload: () => void;
}

/** Repository + branch + folder editor. Used for the main destination and the optional SQL one. */
function DestinationEditor({ kind, saved, repos, installUrl, onReload }: EditorProps) {
  const { account, settings, update } = useSettings();
  const { run, pending } = useAction();
  const connected = !!account?.githubAuthorized;
  const sql = kind === 'sql';
  const p = sql ? 'SQL ' : '';
  const id = (s: string) => (sql ? `sql-${s}` : s);

  const [repoId, setRepoId] = useState(saved?.repositoryId ?? '');
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState(saved?.branch ?? '');
  const [emptyRepo, setEmptyRepo] = useState(false);
  const [folder, setFolder] = useState(saved?.rootFolder ?? (sql ? '' : settings.repository.rootFolder));
  // An SQL-only repository holds one platform, so sections sit at its root by default (no LeetCode/ folder).
  const [layout, setLayout] = useState<FolderLayout>(saved?.layout ?? (sql ? 'topic/problem' : settings.repository.layout));
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const fErr = folderError(folder);

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
    const result = await run<RepoConfig>(
      { type: 'ui/save-repo', repositoryId: repoId, branch, rootFolder: folder, layout, ...(sql && { target: 'sql' as const }) },
      { success: sql ? 'SQL repository saved' : 'Repository settings saved' },
    );
    if (result && !sql) update((s) => ({ ...s, repository: { rootFolder: result.rootFolder, layout: result.layout } }));
  };

  const dirty =
    !saved || saved.repositoryId !== repoId || saved.branch !== branch || saved.rootFolder !== folder.trim().replace(/^\/+|\/+$/g, '') || saved.layout !== layout;
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
  const preview = fErr ? null : buildSolutionPaths(folder, layout, sql ? SAMPLE.sql : SAMPLE.main);
  const testAction = sql ? 'ui/test-repo' : 'ui/test-repo';

  return (
    <>
      <SettingRow title={`${p}Repository`.replace('SQL Repository', 'SQL repository')} description={connected ? 'Only repositories where the CodeSync app is installed are listed.' : 'Available after connecting GitHub.'} htmlFor={id('repo')}>
        <div className="flex items-center gap-1.5">
          <select id={id('repo')} className={selectCls} value={repoId} disabled={!connected || !repos} onChange={(e) => setRepoId(e.target.value)}>
            <option value="">{repos ? (repos.length ? 'Select a repository…' : 'No repositories available') : connected ? 'Loading…' : 'Connect GitHub first'}</option>
            {repos?.map((r) => (
              <option key={r.id} value={r.id} disabled={!r.canPush}>
                {r.fullName}{r.canPush ? '' : ' (read-only)'}
              </option>
            ))}
          </select>
          <button type="button" aria-label={`Reload ${p.toLowerCase()}repositories`} disabled={!connected} onClick={onReload} className="focus-ring rounded p-1.5 text-fg-subtle hover:text-fg disabled:opacity-40">
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
      <SettingRow title={sql ? 'SQL branch' : 'Branch'} description="Commits are pushed to this branch." htmlFor={id('branch')}>
        <select id={id('branch')} className={selectCls} value={branch} disabled={!branches.length} onChange={(e) => setBranch(e.target.value)}>
          {!branches.length && <option value="">{repoId ? 'Loading…' : '—'}</option>}
          {branches.map((b) => <option key={b} value={b}>{b}{emptyRepo ? ' (new — created on first sync)' : ''}</option>)}
        </select>
      </SettingRow>
      {emptyRepo && (
        <p className="px-5 py-2.5 text-xs text-fg-subtle">This repository is empty. CodeSync will create the first commit on <span className="font-mono">{branch}</span>.</p>
      )}
      <SettingRow title={sql ? 'SQL root folder' : 'Root folder'} description="Leave empty to write at the repository root." htmlFor={id('root-folder')}>
        <div className="w-64">
          <TextInput id={id('root-folder')} value={folder} placeholder="/" prefix={<Folder size={13} />} error={fErr} onChange={(e) => setFolder(e.target.value)} />
        </div>
      </SettingRow>
      <SettingRow
        title={sql ? 'SQL folder structure' : 'Folder structure'}
        description={
          sql
            ? 'Sections at root: SQL 50 sections (01-Select …) straight in the repository, no LeetCode/ folder. Other SQL problems go by the concept used (Joins, Aggregation …).'
            : 'By topic (Array, Tree …; SQL by concept used), by difficulty, or a flat list per platform.'
        }
      >
        <div role="radiogroup" aria-label={sql ? 'SQL folder structure' : 'Folder structure'} className="flex rounded-md border border-line bg-canvas p-0.5">
          {(sql
            ? ([['topic/problem', 'Sections at root'], ['platform/topic/problem', 'Inside LeetCode/'], ['platform/difficulty/problem', 'By difficulty']] as const)
            : ([['platform/topic/problem', 'By topic'], ['platform/difficulty/problem', 'By difficulty'], ['platform/problem', 'Flat']] as const)
          ).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={layout === value} onClick={() => setLayout(value)}
              className={cn('focus-ring h-6 rounded-[5px] px-2.5 text-xs font-medium transition-colors', layout === value ? 'bg-surface-active text-fg' : 'text-fg-subtle hover:text-fg-muted')}>
              {label}
            </button>
          ))}
        </div>
      </SettingRow>
      {testResult && <p role="status" className={cn('px-5 py-3 text-sm', testResult.ok ? 'text-accent' : 'text-danger')}>{testResult.message}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-raised/40 px-5 py-3">
        <p className="flex min-w-0 items-center gap-2 truncate font-mono text-xs text-fg-subtle">
          <span className="text-fg-faint">preview</span>
          {preview?.solutionFile ?? '—'}
        </p>
        <div className="flex items-center gap-2">
          {saveBlocker && <span className="text-xs text-fg-subtle" data-testid={id('save-hint')}>{saveBlocker}</span>}
          <Button size="sm" variant="ghost" aria-label={sql ? 'Test SQL write access' : 'Test write access'}
            icon={pending === testAction ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />} disabled={!saved || dirty || !!pending}
            onClick={async () => setTestResult(await run<{ ok: boolean; message: string }>({ type: 'ui/test-repo', ...(sql && { target: 'sql' as const }) }))}>
            Test write access
          </Button>
          <Button size="sm" variant="primary" aria-label={sql ? 'Save SQL repository' : 'Save'} disabled={!!saveBlocker || pending === 'ui/save-repo'} onClick={save}>
            {pending === 'ui/save-repo' ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </>
  );
}

export function RepositoryPage() {
  const { account } = useSettings();
  const { run, pending } = useAction();
  const connected = !!account?.githubAuthorized;
  const [repos, setRepos] = useState<RepositorySummary[] | null>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [sqlOn, setSqlOn] = useState(!!account?.sqlRepo);

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

  const toggleSql = async (on: boolean) => {
    setSqlOn(on);
    if (!on && account?.sqlRepo) await run({ type: 'ui/clear-sql-repo' }, { success: 'SQL solutions will go to the main repository' });
  };

  return (
    <div className="space-y-4">
      <SettingsCard title="GitHub account" description="CodeSync uses a GitHub App with access only to repositories you install it on. Your GitHub token is sealed by the CodeSync server; the extension can't read it.">
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

      <SettingsCard title="Destination" description="Where accepted solutions are committed.">
        <DestinationEditor kind="main" saved={account?.repo ?? null} repos={repos} installUrl={installUrl} onReload={loadRepos} />
      </SettingsCard>

      <SettingsCard title="SQL repository" description="Optional. Send SQL solutions to their own repository, grouped by difficulty. When off, SQL goes to the main repository.">
        <SettingRow
          title="Separate repository for SQL"
          description={sqlOn ? 'SQL solutions (MySQL, PostgreSQL, MS SQL, Oracle) go to the repository below.' : 'SQL solutions currently go to the main repository.'}
          icon={<span className="flex h-7 w-7 items-center justify-center rounded-md border border-line-strong bg-surface-raised text-fg-muted"><Database size={13} /></span>}
        >
          <Switch label="Separate repository for SQL" checked={sqlOn} disabled={!connected} onChange={toggleSql} />
        </SettingRow>
        {sqlOn && <DestinationEditor kind="sql" saved={account?.sqlRepo ?? null} repos={repos} installUrl={null} onReload={loadRepos} />}
      </SettingsCard>
    </div>
  );
}
