import { KEYS } from '@/shared/constants';
import { ContentMessageSchema, UiMessageSchema, type RuntimeResponse } from '@/shared/messages';
import type { KV } from '@/shared/storage';
import type { Account } from '@/shared/types';
import { ApiFailure, type BackendClient } from './api';
import type { AuthManager } from './auth';
import type { JobService } from './jobs';

export interface Sender {
  id?: string;
  url?: string;
  tab?: { id?: number };
}

export interface RouterDeps {
  extensionId: string;
  extensionOrigin: string; // chrome-extension://<id>/
  jobs: JobService;
  auth: AuthManager;
  api: BackendClient;
  kv: KV;
}

const HOSTS = {
  leetcode: /^(www\.)?leetcode\.com$/,
  gfg: /^(www\.|practice\.)?geeksforgeeks\.org$/,
} as const;

const fail = (code: string, message: string): RuntimeResponse => ({ ok: false, error: { code, message } });

/** Validate sender + payload, then dispatch. Never throws. */
export async function handleMessage(raw: unknown, sender: Sender, d: RouterDeps): Promise<RuntimeResponse> {
  if (sender.id !== d.extensionId) return fail('FORBIDDEN', 'Unknown sender.');
  try {
    const type = (raw as { type?: unknown })?.type;
    if (typeof type === 'string' && type.startsWith('content/')) {
      const msg = ContentMessageSchema.safeParse(raw);
      if (!msg.success) return fail('INVALID_MESSAGE', 'Malformed message.');
      let host = '';
      try {
        host = new URL(sender.url ?? '').hostname;
      } catch {
        /* rejected below */
      }
      // Content messages must come from a tab on the platform they claim to be.
      if (!sender.tab || !HOSTS[msg.data.platform].test(host)) return fail('FORBIDDEN', 'Sender does not match platform.');
      const m = msg.data;
      switch (m.type) {
        case 'content/detected':
          return { ok: true, data: await d.jobs.detect(m.platform, m.submissionId, m.slug) };
        case 'content/verdict':
          return { ok: true, data: await d.jobs.report(m.platform, m.submissionId, m.verdict, m.capture) };
        case 'content/capture-failed':
          return { ok: true, data: await d.jobs.captureFailed(m.platform, m.submissionId, m.code, m.message) };
        case 'content/pending':
          return { ok: true, data: await d.jobs.pendingVerifications(m.platform) };
      }
    }

    // UI messages: only from our own extension pages.
    if (!sender.url?.startsWith(d.extensionOrigin)) return fail('FORBIDDEN', 'UI messages must come from extension pages.');
    const msg = UiMessageSchema.safeParse(raw);
    if (!msg.success) return fail('INVALID_MESSAGE', 'Malformed message.');
    const m = msg.data;
    switch (m.type) {
      case 'ui/ping':
        return { ok: true, data: 'pong' };
      case 'ui/connect': {
        const account = await d.auth.connect();
        void d.jobs.processQueue();
        return { ok: true, data: account };
      }
      case 'ui/refresh':
        return { ok: true, data: await d.auth.refresh() };
      case 'ui/disconnect':
        await d.auth.disconnect();
        return { ok: true, data: null };
      case 'ui/delete-account':
        await d.auth.deleteAccount();
        await d.kv.remove(KEYS.jobs);
        return { ok: true, data: null };
      case 'ui/repos':
        return { ok: true, data: await d.api.repos() };
      case 'ui/branches':
        return { ok: true, data: await d.api.branches(m.repositoryId) };
      case 'ui/save-repo': {
        const repo = await d.api.validateRepo({ repositoryId: m.repositoryId, branch: m.branch, rootFolder: m.rootFolder, layout: m.layout });
        const account = await d.kv.get<Account>(KEYS.account);
        if (account) await d.kv.set<Account>(KEYS.account, { ...account, repo });
        void d.jobs.processQueue();
        return { ok: true, data: repo };
      }
      case 'ui/test-repo': {
        const repo = (await d.kv.get<Account>(KEYS.account))?.repo;
        if (!repo) return fail('REPO_NOT_CONFIGURED', 'Choose and save a repository first.');
        return { ok: true, data: await d.api.testRepo(repo) };
      }
      case 'ui/retry':
        await d.jobs.retry(m.key);
        return { ok: true, data: null };
      case 'ui/sync-held':
        await d.jobs.syncHeld();
        return { ok: true, data: null };
    }
  } catch (e) {
    if (e instanceof ApiFailure) return fail(e.code, e.message);
    const message = e instanceof Error && /cancel|closed|did not approve/i.test(e.message) ? 'Sign-in window was closed.' : 'Something went wrong.';
    return fail('INTERNAL', message);
  }
}
