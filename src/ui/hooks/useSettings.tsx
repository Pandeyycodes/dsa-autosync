import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, KEYS } from '@/shared/constants';
import type { RuntimeResponse, UiMessage } from '@/shared/messages';
import { createDefaultKV, normalizeSettings, type KV } from '@/shared/storage';
import type { Account, Job, Settings } from '@/shared/types';

/** Sends a UI message to the service worker. Injected so tests can fake it. */
export type Bridge = <T = unknown>(msg: UiMessage) => Promise<RuntimeResponse<T>>;

export const chromeBridge: Bridge = async <T,>(msg: UiMessage) => {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    return { ok: false, error: { code: 'NO_EXTENSION', message: 'Open CodeSync from the installed extension to use this.' } } as RuntimeResponse<T>;
  }
  try {
    return (await chrome.runtime.sendMessage(msg)) as RuntimeResponse<T>;
  } catch {
    return { ok: false, error: { code: 'NO_SERVICE_WORKER', message: 'CodeSync background service is unavailable. Reload the extension.' } };
  }
};

interface AppContextValue {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Settings> | ((s: Settings) => Settings)) => void;
  reset: () => void;
  account: Account | null;
  jobs: Job[];
  send: Bridge;
}

const AppContext = createContext<AppContextValue | null>(null);

function useStored<T>(kv: KV, key: string, map: (raw: unknown) => T): [T, boolean] {
  const [value, setValue] = useState<T>(() => map(undefined));
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    kv.get(key).then((v) => {
      if (alive) {
        setValue(map(v));
        setLoaded(true);
      }
    });
    const off = kv.subscribe(key, (v) => alive && setValue(map(v)));
    return () => {
      alive = false;
      off();
    };
    // map is stable per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kv, key]);
  return [value, loaded];
}

const toAccount = (v: unknown) => ((v as Account | undefined)?.user ? (v as Account) : null);
const toJobs = (v: unknown) =>
  Object.values((v as Record<string, Job> | undefined) ?? {}).sort((a, b) => b.detectedAt - a.detectedAt);

export function SettingsProvider({ children, kv: injected, bridge }: { children: ReactNode; kv?: KV; bridge?: Bridge }) {
  const [kv] = useState(() => injected ?? createDefaultKV());
  const [settings, settingsLoaded] = useStored(kv, KEYS.settings, normalizeSettings);
  const [account, accountLoaded] = useStored(kv, KEYS.account, toAccount);
  const [jobs] = useStored(kv, KEYS.jobs, toJobs);

  const update = useCallback<AppContextValue['update']>(
    (patch) => {
      void kv.get(KEYS.settings).then((raw) => {
        const prev = normalizeSettings(raw);
        const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
        return kv.set(KEYS.settings, next);
      });
    },
    [kv],
  );
  const reset = useCallback(() => void kv.set(KEYS.settings, DEFAULT_SETTINGS), [kv]);

  const value = useMemo(
    () => ({ settings, ready: settingsLoaded && accountLoaded, update, reset, account, jobs, send: bridge ?? chromeBridge }),
    [settings, settingsLoaded, accountLoaded, update, reset, account, jobs, bridge],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useSettings(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
