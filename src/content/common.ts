import type { ContentMessage, RuntimeResponse } from '@/shared/messages';
import { KEYS } from '@/shared/constants';
import { normalizeSettings } from '@/shared/storage';
import type { PlatformId } from '@/shared/types';

/** Send a validated message to the service worker; never throws. */
export async function toBackground<T>(msg: ContentMessage): Promise<RuntimeResponse<T> | null> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as RuntimeResponse<T>;
  } catch {
    return null; // extension reloaded / context invalidated
  }
}

export async function platformEnabled(platform: PlatformId): Promise<boolean> {
  try {
    const raw = (await chrome.storage.local.get(KEYS.settings))[KEYS.settings];
    return normalizeSettings(raw).platforms[platform];
  } catch {
    return false;
  }
}

/** Marker used by MAIN-world hooks when relaying network observations. */
export const HOOK_SOURCE = { leetcode: 'codesync:leetcode-hook', gfg: 'codesync:gfg-hook' } as const;

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface HttpResult {
  status: number;
  body: unknown;
}

export type Http = (url: string, init?: RequestInit) => Promise<HttpResult>;

/** fetch → {status, body}; network failures become status 0. */
export const browserHttp: Http = async (url, init) => {
  try {
    const res = await fetch(url, init);
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch {
    return { status: 0, body: null };
  }
};

export class CaptureError extends Error {
  constructor(
    public readonly code: 'CODE_UNAVAILABLE' | 'UNSUPPORTED_LANGUAGE' | 'METADATA_UNAVAILABLE' | 'VERDICT_MISMATCH',
    message: string,
  ) {
    super(message);
  }
}
