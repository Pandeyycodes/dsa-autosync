import { KEYS } from '@/shared/constants';
import type { KV } from '@/shared/storage';
import type { Account } from '@/shared/types';

const MIGRATIONS_KEY = 'codesync:migrations';

/**
 * One-time settings migrations, run when the service worker starts.
 *  - sql-root-sections: an SQL-only repository saved with the old default
 *    ("inside LeetCode/") switches to sections at the repository root.
 */
export async function runMigrations(kv: KV): Promise<string[]> {
  const done = new Set((await kv.get<string[]>(MIGRATIONS_KEY)) ?? []);
  const applied: string[] = [];

  if (!done.has('sql-root-sections')) {
    const account = await kv.get<Account>(KEYS.account);
    if (account?.sqlRepo && account.sqlRepo.layout === 'platform/topic/problem') {
      await kv.set<Account>(KEYS.account, { ...account, sqlRepo: { ...account.sqlRepo, layout: 'topic/problem' } });
      applied.push('sql-root-sections');
    }
    done.add('sql-root-sections');
  }

  await kv.set(MIGRATIONS_KEY, [...done]);
  return applied;
}
