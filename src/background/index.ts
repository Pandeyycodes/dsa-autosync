/**
 * CodeSync service worker: wires storage, backend client, auth, the
 * persistent job queue and the message router. Holds no state in memory
 * that is not also in chrome.storage.
 */
import { API_BASE_URL, KEYS, DEFAULT_SETTINGS } from '@/shared/constants';
import { createChromeKV } from '@/shared/storage';
import { BackendClient } from './api';
import { AuthManager } from './auth';
import { JobService } from './jobs';
import { handleMessage } from './router';

const kv = createChromeKV();
let auth: AuthManager;
const api = new BackendClient(API_BASE_URL, () => auth.token(), undefined, (token) => auth.saveSession(token));
auth = new AuthManager({
  kv,
  api,
  redirectUri: chrome.identity.getRedirectURL('github'),
  launchWebAuthFlow: async (url) => {
    const result = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
    if (!result) throw new Error('Sign-in window was closed.');
    return result;
  },
});
const jobs = new JobService({
  kv,
  api,
  notify: (title, message) =>
    chrome.notifications.create({ type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon-128.png'), title, message, priority: 0 }),
});

const RETRY_ALARM = 'codesync-retry';

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL && !(await kv.get(KEYS.settings))) {
    await kv.set(KEYS.settings, DEFAULT_SETTINGS);
  }
});

// Every wake-up (install, browser start, alarm, message) resumes the queue.
chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === RETRY_ALARM) void jobs.recover();
});
chrome.runtime.onStartup.addListener(() => void jobs.recover());
void jobs.recover();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, {
    extensionId: chrome.runtime.id,
    extensionOrigin: chrome.runtime.getURL(''),
    jobs,
    auth,
    api,
    kv,
  }).then(sendResponse);
  return true; // async response
});
