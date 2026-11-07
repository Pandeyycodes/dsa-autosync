import { DEFAULT_SETTINGS, KEYS } from './constants';
import type { Settings } from './types';

/** Minimal async key-value store: chrome.storage.local in the extension, memory in tests/previews. */
export interface KV {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  subscribe<T>(key: string, listener: (value: T | undefined) => void): () => void;
}

export function createMemoryKV(initial: Record<string, unknown> = {}): KV {
  const data = new Map<string, unknown>(Object.entries(structuredClone(initial)));
  const listeners = new Map<string, Set<(v: unknown) => void>>();
  const emit = (key: string) => listeners.get(key)?.forEach((l) => l(structuredClone(data.get(key))));
  return {
    get: async <T,>(key: string) => structuredClone(data.get(key)) as T | undefined,
    set: async (key, value) => {
      data.set(key, structuredClone(value));
      emit(key);
    },
    remove: async (key) => {
      data.delete(key);
      emit(key);
    },
    subscribe: <T,>(key: string, listener: (v: T | undefined) => void) => {
      const set = listeners.get(key) ?? new Set();
      set.add(listener as (v: unknown) => void);
      listeners.set(key, set);
      return () => set.delete(listener as (v: unknown) => void);
    },
  };
}

export function createChromeKV(area: chrome.storage.StorageArea = chrome.storage.local): KV {
  return {
    get: async <T,>(key: string) => (await area.get(key))[key] as T | undefined,
    set: (key, value) => area.set({ [key]: value }),
    remove: (key) => area.remove(key),
    subscribe: <T,>(key: string, listener: (v: T | undefined) => void) => {
      const handler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName === 'local' && key in changes) listener(changes[key]!.newValue as T | undefined);
      };
      chrome.storage.onChanged.addListener(handler);
      return () => chrome.storage.onChanged.removeListener(handler);
    },
  };
}

export const hasChromeStorage = (): boolean => typeof chrome !== 'undefined' && !!chrome.storage?.local;

export function createDefaultKV(): KV {
  return hasChromeStorage() ? createChromeKV() : createMemoryKV();
}

/** Merge stored (possibly partial / older) settings over defaults. */
export function normalizeSettings(raw: unknown): Settings {
  const v = (raw ?? {}) as Partial<Settings>;
  const d = DEFAULT_SETTINGS;
  return {
    ...d,
    ...v,
    platforms: { ...d.platforms, ...(v.platforms ?? {}) },
    languages: { ...d.languages, ...(v.languages ?? {}) },
    readme: { ...d.readme, ...(v.readme ?? {}) },
    notifications: { ...d.notifications, ...(v.notifications ?? {}) },
    repository: { ...d.repository, ...(v.repository ?? {}) },
    duplicateStrategy: ['skip', 'overwrite', 'version'].includes(v.duplicateStrategy as string) ? v.duplicateStrategy! : d.duplicateStrategy,
  };
}

export const loadSettings = async (kv: KV) => normalizeSettings(await kv.get(KEYS.settings));
