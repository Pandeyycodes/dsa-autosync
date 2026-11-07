import type { ContentMessage, RuntimeResponse } from '@/shared/messages';
import { KEYS } from '@/shared/constants';
import { normalizeSettings } from '@/shared/storage';
import type { PlatformId } from '@/shared/types';

/**
 * True when this content script was orphaned: CodeSync was reloaded/updated
 * while the tab stayed open, so it can no longer talk to the extension.
 */
export function extensionContextLost(): boolean {
  try {
    return !chrome.runtime?.id;
  } catch {
    return true;
  }
}

let staleNoticeShown = false;

/** Tell the user (once) that this tab must be refreshed to keep syncing. */
export function showStaleNotice(): void {
  if (staleNoticeShown || typeof document === 'undefined') return;
  staleNoticeShown = true;
  console.warn('[CodeSync] CodeSync was updated or reloaded — refresh this page so your submissions keep syncing.');
  const el = document.createElement('div');
  el.setAttribute('role', 'alert');
  el.textContent = 'CodeSync was updated — refresh this page so this submission syncs.';
  Object.assign(el.style, {
    position: 'fixed', bottom: '16px', right: '16px', zIndex: '2147483647', maxWidth: '320px',
    padding: '10px 14px', borderRadius: '10px', border: '1px solid #2A2A31', background: '#0F0F12',
    color: '#ECECEE', font: '13px/1.4 system-ui, sans-serif', boxShadow: '0 8px 24px rgba(0,0,0,.4)', cursor: 'pointer',
  });
  el.title = 'Click to refresh';
  el.addEventListener('click', () => location.reload());
  (document.body ?? document.documentElement).appendChild(el);
}

/** Send a validated message to the service worker; never throws. */
export async function toBackground<T>(msg: ContentMessage): Promise<RuntimeResponse<T> | null> {
  if (extensionContextLost()) {
    showStaleNotice();
    return null;
  }
  try {
    return (await chrome.runtime.sendMessage(msg)) as RuntimeResponse<T>;
  } catch {
    if (extensionContextLost()) showStaleNotice();
    return null; // extension reloaded / context invalidated
  }
}

export async function platformEnabled(platform: PlatformId): Promise<boolean> {
  if (extensionContextLost()) {
    showStaleNotice();
    return false;
  }
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
