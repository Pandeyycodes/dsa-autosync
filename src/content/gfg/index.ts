/**
 * GeeksforGeeks isolated-world content script. Verdicts come from the
 * practice API responses for the specific submission id (relayed by the
 * MAIN-world hook), not from UI banners.
 */
import { isFinal } from '@/shared/verdict';
import { browserHttp, CaptureError, HOOK_SOURCE, platformEnabled, toBackground } from '../common';
import { captureAccepted, nextDataFromHtml, verdictFromResult, type GfgDeps } from './adapter';

const deps: GfgDeps = {
  http: browserHttp,
  pageNextData: () => {
    const el = document.getElementById('__NEXT_DATA__');
    try {
      return el ? JSON.parse(el.textContent ?? 'null') : null;
    } catch {
      return null;
    }
  },
  fetchPageHtml: async (slug) => {
    try {
      const res = await fetch(`https://www.geeksforgeeks.org/problems/${encodeURIComponent(slug)}/1`, { credentials: 'include' });
      return res.ok ? await res.text() : null;
    } catch {
      return null;
    }
  },
};
void nextDataFromHtml;

const log = (...a: unknown[]) => console.info('%c[CodeSync] GfG', 'color:#3DD68C', ...a);

const known = new Map<string, { slug: string; apiBase: string }>();
const decided = new Set<string>();

window.addEventListener('message', async (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const d = event.data as Record<string, unknown> | null;
  if (!d || d.source !== HOOK_SOURCE.gfg) return;
  const submissionId = typeof d.submissionId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(d.submissionId) ? d.submissionId : null;
  if (!submissionId) return;
  if (!(await platformEnabled('gfg'))) return log('GeeksforGeeks syncing is turned off in CodeSync settings');

  if (d.kind === 'submitted') {
    const slug = typeof d.slug === 'string' && /^[A-Za-z0-9_.-]{1,160}$/.test(d.slug) ? d.slug : null;
    const apiBase = typeof d.apiBase === 'string' ? d.apiBase : null;
    if (!slug || !apiBase) return log('submission seen but slug/API base missing');
    known.set(submissionId, { slug, apiBase });
    const res = await toBackground({ type: 'content/detected', platform: 'gfg', submissionId, slug });
    log(`registered with CodeSync: ${res?.ok ? 'ok' : JSON.stringify(res)}`);
    return;
  }

  if (d.kind === 'result') {
    const meta = known.get(submissionId);
    if (!meta) return log(`result for ${submissionId}, but its submit wasn't seen in this tab`);
    if (decided.has(submissionId)) return;
    const verdict = verdictFromResult(d.result);
    log(`verdict: ${verdict}`);
    if (!isFinal(verdict)) {
      await toBackground({ type: 'content/verdict', platform: 'gfg', submissionId, verdict });
      return;
    }
    decided.add(submissionId);
    if (verdict !== 'ACCEPTED') {
      await toBackground({ type: 'content/verdict', platform: 'gfg', submissionId, verdict });
      return;
    }
    try {
      const capture = await captureAccepted(submissionId, meta.slug, meta.apiBase, deps);
      log(`accepted code fetched (${capture.languageVariant}, ${capture.code.length} chars) — uploading`);
      await toBackground({ type: 'content/verdict', platform: 'gfg', submissionId, verdict, capture });
    } catch (e) {
      const err = e instanceof CaptureError ? e : new CaptureError('CODE_UNAVAILABLE', 'Could not retrieve the accepted code.');
      log(`could not fetch the accepted code: ${err.code} — ${err.message}`);
      await toBackground({ type: 'content/capture-failed', platform: 'gfg', submissionId, code: err.code, message: err.message });
    }
  }
});
