import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { Dashboard } from '@/dashboard/Dashboard';
import { parseHash } from '@/dashboard/routes';
import { Popup } from '@/popup/Popup';
import { DEFAULT_SETTINGS, KEYS } from '@/shared/constants';
import type { RuntimeResponse, UiMessage } from '@/shared/messages';
import { createMemoryKV, type KV } from '@/shared/storage';
import type { Job, Settings } from '@/shared/types';
import { ToastProvider } from '@/ui/components/Toast';
import { SettingsProvider, type Bridge } from '@/ui/hooks/useSettings';
import { computeStats } from '@/ui/lib/stats';
import { account } from './fixtures';

function mkJob(over: Partial<Job>): Job {
  return {
    key: `${over.platform ?? 'leetcode'}:${over.submissionId ?? Math.random()}`, platform: 'leetcode', submissionId: '1', slug: 'two-sum',
    status: 'uploaded', verdict: 'ACCEPTED', detectedAt: Date.now(), updatedAt: Date.now(), verifyAttempts: 0, attempts: 0,
    nextAttemptAt: null, error: null, problem: { title: 'Two Sum', id: '1', difficulty: 'Easy', topics: ['Array'] },
    language: 'python', languageVariant: 'Python3', outcome: 'created', commitUrl: null, paths: [], request: null, githubId: '1',
    ...over,
  };
}

const JOBS = [
  mkJob({ submissionId: '1' }),
  mkJob({ submissionId: '2', language: 'cpp', languageVariant: 'C++' }),
  mkJob({ submissionId: '3', slug: 'second-highest-salary', language: 'sql', languageVariant: 'MySQL', problem: { title: 'Second Highest Salary', id: '176', difficulty: 'Medium', topics: ['Database'] } }),
  mkJob({ platform: 'gfg', submissionId: 'g1', slug: 'reverse-a-linked-list', problem: { title: 'Reverse a linked list', id: null, difficulty: 'Easy', topics: ['Linked List'] }, language: 'java', languageVariant: 'java' }),
  mkJob({ submissionId: '5', slug: 'lru-cache', status: 'ignored', verdict: 'WRONG_ANSWER', problem: null, language: null, languageVariant: null, outcome: null }),
  mkJob({ submissionId: '6', slug: 'trap', status: 'failed', outcome: null, error: { code: 'GITHUB_PERMISSION_DENIED', message: 'No access to repo' }, problem: { title: 'Trapping Rain Water', id: '42', difficulty: 'Hard', topics: ['Array'] }, request: {} as Job['request'] }),
];

function setup(ui: ReactElement, data: Record<string, unknown> = {}, handler?: (m: UiMessage) => RuntimeResponse) {
  const kv: KV = createMemoryKV({ [KEYS.settings]: DEFAULT_SETTINGS, ...data });
  const sent: UiMessage[] = [];
  const bridge: Bridge = async <T,>(m: UiMessage) => {
    sent.push(m);
    return (handler?.(m) ?? { ok: true, data: null }) as RuntimeResponse<T>;
  };
  render(
    <SettingsProvider kv={kv} bridge={bridge}>
      <ToastProvider>{ui}</ToastProvider>
    </SettingsProvider>,
  );
  return { kv, sent, settings: async () => (await kv.get<Settings>(KEYS.settings))! };
}

describe('Popup', () => {
  it('shows disconnected state and starts GitHub connect via the service worker', async () => {
    const user = userEvent.setup();
    const { sent } = setup(<Popup />);
    expect(await screen.findByTestId('connection-status')).toHaveTextContent('Not connected');
    expect(screen.getByTestId('repo-name')).toHaveTextContent('No repository selected');
    expect(screen.getByText(/No submissions yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /connect github/i }));
    expect(sent).toEqual([{ type: 'ui/connect' }]);
  });

  it('shows the connected user, repository and real activity', async () => {
    setup(<Popup />, { [KEYS.account]: account(), [KEYS.jobs]: Object.fromEntries(JOBS.map((j) => [j.key, j])) });
    expect(await screen.findByTestId('connection-status')).toHaveTextContent('octocat');
    expect(screen.getByTestId('repo-name')).toHaveTextContent('octocat/dsa');
    expect(screen.queryByRole('button', { name: /connect github/i })).not.toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Recent activity' })).getAllByRole('listitem')).toHaveLength(3);
  });

  it('prompts reconnect when GitHub authorization was revoked', async () => {
    setup(<Popup />, { [KEYS.account]: account({ githubAuthorized: false }) });
    expect(await screen.findByTestId('connection-status')).toHaveTextContent('Reconnect required');
    expect(screen.getByRole('button', { name: /reconnect github/i })).toBeInTheDocument();
  });

  it('persists auto-sync and platform toggles', async () => {
    const user = userEvent.setup();
    const { settings } = setup(<Popup />);
    await user.click(await screen.findByRole('switch', { name: 'Automatic sync' }));
    await user.click(screen.getByRole('switch', { name: 'Sync LeetCode' }));
    await waitFor(async () => {
      const s = await settings();
      expect(s.autoSync).toBe(false);
      expect(s.platforms).toEqual({ leetcode: false, gfg: true });
    });
    expect(screen.getByRole('switch', { name: 'Automatic sync' })).toHaveAttribute('aria-checked', 'false');
  });
});

describe('Dashboard navigation', () => {
  const heading = () => screen.getByRole('heading', { level: 1 });
  const nav = () => screen.getByRole('navigation', { name: 'Dashboard' });

  it('navigates every section and updates the hash', async () => {
    const user = userEvent.setup();
    setup(<Dashboard />);
    for (const [link, title] of [['Activity', 'Activity'], ['Repository', 'Repository'], ['Platforms', 'Platforms & languages'], ['General', 'General'], ['Overview', 'Overview']]) {
      await user.click(within(nav()).getByRole('button', { name: link }));
      expect(heading()).toHaveTextContent(title!);
      expect(window.location.hash).toBe(`#/${link!.toLowerCase()}`);
    }
  });

  it('deep-links and maps legacy hashes', async () => {
    window.location.hash = '#/platforms';
    setup(<Dashboard />);
    expect(await screen.findByRole('switch', { name: 'SQL support' })).toBeInTheDocument();
    expect(parseHash('#/submissions')).toBe('activity');
    expect(parseHash('#/nope')).toBe('overview');
  });
});

describe('Overview statistics come from real data', () => {
  it('computes counts and distributions from job history', () => {
    const s = computeStats(JOBS);
    expect(s).toMatchObject({ total: 3, leetcode: 2, gfg: 1, languages: 4, failed: 1, ignored: 1 });
    expect(s.languageDistribution.map((x) => x.label)).toEqual(['C++', 'Java', 'Python', 'SQL']);
    expect(s.topicDistribution).toEqual([{ label: 'Array', count: 1 }, { label: 'Database', count: 1 }, { label: 'Linked List', count: 1 }]);
    expect(computeStats([])).toMatchObject({ total: 0, languages: 0 });
  });

  it('renders statistics, distributions and empty states', async () => {
    setup(<Dashboard />, { [KEYS.jobs]: Object.fromEntries(JOBS.map((j) => [j.key, j])) });
    const stats = await screen.findByRole('region', { name: 'Statistics' });
    expect(within(stats).getByText('Unique problems on GitHub').previousSibling).toHaveTextContent('3');
    expect(within(stats).getByText('Distinct languages used').previousSibling).toHaveTextContent('4');
    expect(within(screen.getByRole('region', { name: 'Languages' })).getByText('SQL')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Topics' })).getByText('Linked List')).toBeInTheDocument();
  });

  it('shows empty states with no data', async () => {
    setup(<Dashboard />);
    expect(await screen.findByText(/Language usage appears after your first sync/)).toBeInTheDocument();
  });
});

describe('Activity', () => {
  it('filters by status and retries failed uploads', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/activity';
    const { sent } = setup(<Dashboard />, { [KEYS.jobs]: Object.fromEntries(JOBS.map((j) => [j.key, j])) });
    await user.click(await screen.findByRole('tab', { name: /Failed/ }));
    expect(screen.getByText('Trapping Rain Water')).toBeInTheDocument();
    expect(screen.queryByText('Two Sum')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry Trapping Rain Water' }));
    expect(sent).toContainEqual({ type: 'ui/retry', key: 'leetcode:6' });
    await user.click(screen.getByRole('tab', { name: /Ignored/ }));
    expect(screen.getByText('Wrong answer')).toBeInTheDocument();
  });
});

describe('Settings controls', () => {
  it('platform, SQL and language toggles persist', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/platforms';
    const { settings } = setup(<Dashboard />);
    await user.click(await screen.findByRole('switch', { name: 'Enable GeeksforGeeks' }));
    await user.click(screen.getByRole('switch', { name: 'SQL support' }));
    await user.click(screen.getByRole('switch', { name: 'Sync Rust' }));
    await waitFor(async () => {
      const s = await settings();
      expect(s.platforms.gfg).toBe(false);
      expect(s.sqlSupport).toBe(false);
      expect(s.languages.rust).toBe(false);
      expect(s.languages.python).toBe(true);
    });
  });

  it('duplicate handling, README preferences, notifications and reset', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/general';
    const { settings } = setup(<Dashboard />);
    await user.click(await screen.findByRole('radio', { name: /Keep every version/ }));
    await user.click(screen.getByRole('switch', { name: 'Include problem statement' }));
    await user.click(screen.getByRole('switch', { name: 'Include examples' }));
    await user.click(screen.getByRole('switch', { name: 'Notify on success' }));
    await waitFor(async () => {
      const s = await settings();
      expect(s.duplicateStrategy).toBe('version');
      expect(s.readme).toEqual({ includeStatement: true, includeExamples: true, includeConstraints: false });
      expect(s.notifications.onSuccess).toBe(false);
    });
    await user.click(screen.getByRole('button', { name: /reset to defaults/i }));
    await waitFor(async () => expect((await settings()).duplicateStrategy).toBe('overwrite'));
  });

  it('repository selection: lists repos/branches, validates folder, saves and tests write access', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/repository';
    const { sent } = setup(<Dashboard />, { [KEYS.account]: account({ repo: null }) }, (m) => {
      if (m.type === 'ui/repos') return { ok: true, data: { installUrl: 'https://github.com/apps/codesync/installations/new', repositories: [{ id: '10', fullName: 'octocat/dsa', private: true, defaultBranch: 'main', canPush: true }, { id: '11', fullName: 'org/readonly', private: false, defaultBranch: 'main', canPush: false }] } };
      if (m.type === 'ui/branches') return { ok: true, data: { branches: ['dev', 'main'] } };
      if (m.type === 'ui/save-repo') return { ok: true, data: { repositoryId: '10', fullName: 'octocat/dsa', branch: m.branch, rootFolder: m.rootFolder, layout: m.layout } };
      return { ok: true, data: null };
    });
    expect(await screen.findByTestId('github-user')).toHaveTextContent('@octocat');
    const repoSelect = await screen.findByLabelText('Repository');
    await waitFor(() => expect(within(repoSelect).getByRole('option', { name: 'octocat/dsa' })).toBeInTheDocument());
    expect(within(repoSelect).getByRole('option', { name: 'org/readonly (read-only)' })).toBeDisabled();
    await user.selectOptions(repoSelect, '10');
    await waitFor(() => expect(screen.getByLabelText('Branch')).toHaveValue('main'));

    const folder = screen.getByLabelText('Root folder');
    await user.clear(folder);
    await user.type(folder, '../escape');
    expect(screen.getByRole('alert')).toHaveTextContent(/\.\./);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(folder);
    await user.type(folder, 'solutions');
    await user.click(screen.getByRole('radio', { name: 'Flat' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(sent).toContainEqual({ type: 'ui/save-repo', repositoryId: '10', branch: 'main', rootFolder: 'solutions', layout: 'platform/problem' });
    expect(screen.getByText(/solutions\/LeetCode\/0001-two-sum\/solution\.py/)).toBeInTheDocument();
  });

  it('disconnects GitHub', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/repository';
    const { sent } = setup(<Dashboard />, { [KEYS.account]: account() }, (m) => (m.type === 'ui/repos' ? { ok: true, data: { repositories: [], installUrl: 'https://x' } } : { ok: true, data: null }));
    await user.click(await screen.findByRole('button', { name: /disconnect/i }));
    expect(sent).toContainEqual({ type: 'ui/disconnect' });
  });
});

describe('Repository page with an empty repository', () => {
  it('offers the default branch and enables Save', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/repository';
    const { sent } = setup(<Dashboard />, { [KEYS.account]: account({ repo: null }) }, (m) => {
      if (m.type === 'ui/repos') return { ok: true, data: { installUrl: 'https://x', repositories: [{ id: '10', fullName: 'octocat/dsa-solutions', private: true, defaultBranch: 'main', canPush: true }] } };
      if (m.type === 'ui/branches') return { ok: true, data: { branches: [] } };
      if (m.type === 'ui/save-repo') return { ok: true, data: { repositoryId: '10', fullName: 'octocat/dsa-solutions', branch: m.branch, rootFolder: m.rootFolder, layout: m.layout } };
      return { ok: true, data: null };
    });
    expect(await screen.findByTestId('save-hint')).toHaveTextContent('Select a repository.');
    const repoSelect = await screen.findByLabelText('Repository');
    await waitFor(() => expect(within(repoSelect).getByRole('option', { name: 'octocat/dsa-solutions' })).toBeInTheDocument());
    await user.selectOptions(repoSelect, '10');
    await waitFor(() => expect(screen.getByLabelText('Branch')).toHaveValue('main'));
    expect(screen.getByText(/This repository is empty/)).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeEnabled();
    await user.click(save);
    expect(sent).toContainEqual({ type: 'ui/save-repo', repositoryId: '10', branch: 'main', rootFolder: 'DSA', layout: 'platform/topic/problem' });
  });
});

describe('SQL repository settings', () => {
  it('saves a separate SQL repository and can turn it off again', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/repository';
    const { sent, kv } = setup(<Dashboard />, { [KEYS.account]: account() }, (m) => {
      if (m.type === 'ui/repos') return { ok: true, data: { installUrl: 'https://x', repositories: [{ id: '10', fullName: 'octocat/dsa', private: true, defaultBranch: 'main', canPush: true }, { id: '20', fullName: 'octocat/sql-solutions', private: true, defaultBranch: 'main', canPush: true }] } };
      if (m.type === 'ui/branches') return { ok: true, data: { branches: ['main'] } };
      if (m.type === 'ui/save-repo') return { ok: true, data: { repositoryId: m.repositoryId, fullName: 'octocat/sql-solutions', branch: m.branch, rootFolder: m.rootFolder, layout: m.layout } };
      return { ok: true, data: null };
    });
    await user.click(await screen.findByRole('switch', { name: 'Separate repository for SQL' }));
    const select = await screen.findByRole('combobox', { name: 'SQL repository' });
    await waitFor(() => expect(within(select).getByRole('option', { name: 'octocat/sql-solutions' })).toBeInTheDocument());
    await user.selectOptions(select, '20');
    await waitFor(() => expect(screen.getByLabelText('SQL branch')).toHaveValue('main'));
    expect(screen.getByText('07-Advanced-String-Functions-Regex-Clause/0176-second-highest-salary/solution.sql')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save SQL repository' }));
    expect(sent).toContainEqual({ type: 'ui/save-repo', repositoryId: '20', branch: 'main', rootFolder: '', layout: 'topic/problem', target: 'sql' });

    await kv.set(KEYS.account, account({ sqlRepo: { repositoryId: '20', fullName: 'octocat/sql-solutions', branch: 'main', rootFolder: '', layout: 'platform/topic/problem' } }));
    await user.click(screen.getByRole('switch', { name: 'Separate repository for SQL' }));
    expect(sent).toContainEqual({ type: 'ui/clear-sql-repo' });
  });
});
