/**
 * LeetCode isolated-world content script: receives submission ids from the
 * MAIN-world hook, verifies the final verdict with LeetCode, captures the
 * exact accepted code by submission id and hands it to the service worker.
 */
import { browserHttp, CaptureError, HOOK_SOURCE, platformEnabled, sleep, toBackground } from '../common';
import { captureAccepted, pollVerdict, type LeetCodeDeps } from './adapter';

const deps: LeetCodeDeps = {
  http: browserHttp,
  sleep,
  csrfToken: () => /(?:^|;\s*)csrftoken=([^;]+)/.exec(document.cookie)?.[1] ?? null,
};

const inFlight = new Set<string>();

async function verify(submissionId: string, slug: string | null) {
  if (inFlight.has(submissionId)) return; // duplicate notification
  inFlight.add(submissionId);
  try {
    const verdict = await pollVerdict(submissionId, deps);
    if (verdict !== 'ACCEPTED') {
      await toBackground({ type: 'content/verdict', platform: 'leetcode', submissionId, verdict });
      return;
    }
    try {
      const capture = await captureAccepted(submissionId, slug, deps);
      await toBackground({ type: 'content/verdict', platform: 'leetcode', submissionId, verdict, capture });
    } catch (e) {
      const err = e instanceof CaptureError ? e : new CaptureError('CODE_UNAVAILABLE', 'Could not retrieve the accepted code.');
      await toBackground({ type: 'content/capture-failed', platform: 'leetcode', submissionId, code: err.code, message: err.message });
    }
  } finally {
    inFlight.delete(submissionId);
  }
}

window.addEventListener('message', async (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const d = event.data as { source?: unknown; kind?: unknown; submissionId?: unknown; slug?: unknown } | null;
  if (!d || d.source !== HOOK_SOURCE.leetcode || d.kind !== 'submitted') return;
  if (typeof d.submissionId !== 'string' || !/^\d{1,20}$/.test(d.submissionId)) return;
  const slug = typeof d.slug === 'string' && /^[A-Za-z0-9-]{1,160}$/.test(d.slug) ? d.slug : null;
  if (!(await platformEnabled('leetcode'))) return;
  const res = await toBackground({ type: 'content/detected', platform: 'leetcode', submissionId: d.submissionId, slug });
  if (res?.ok && res.data) void verify(d.submissionId, slug);
});

// Resume verifications left pending by a closed tab or restarted service worker.
void (async () => {
  if (!(await platformEnabled('leetcode'))) return;
  const res = await toBackground<{ submissionId: string; slug: string | null }[]>({ type: 'content/pending', platform: 'leetcode' });
  if (res?.ok) for (const p of res.data) void verify(p.submissionId, p.slug);
})();
