/**
 * Runs in GeeksforGeeks' MAIN world. Observes (never modifies) the practice
 * API's submit and result responses — the platform's own verdict data bound
 * to a submission id — and relays them to the isolated content script.
 *
 * Diagnostics: every GfG API call is logged to the page console as
 * "[CodeSync] GfG …" with the URL path and response *field names* only —
 * never values, code or cookies.
 */
import { HOOK_SOURCE } from '../common';
import { installNetworkObserver, readField } from '../hook-core';
import { API_HOST_RE, describeShape, findSubmissionId, parseSubmitResponse, RESULT_RE, SUBMIT_RE } from './adapter';

const log = (...a: unknown[]) => console.info('%c[CodeSync] GfG', 'color:#3DD68C', ...a);
log('watching this page for submissions');

installNetworkObserver(
  (url, method) => API_HOST_RE.test(url) && url.includes('/api/') && method !== 'GET',
  ({ url, method, requestBody, responseBody, status }) => {
    const path = new URL(url).pathname;
    const ok = status >= 200 && status < 300;
    const submit = SUBMIT_RE.exec(url);
    const isResult = RESULT_RE.test(url);
    if (submit || isResult || /submit|result|compile/i.test(path)) {
      log(method, path, status, 'response shape:', describeShape(responseBody));
    }
    if (!ok) return;

    if (submit) {
      const submissionId = parseSubmitResponse(responseBody);
      log(submissionId ? `submission detected (${submissionId})` : 'submit seen, but no submission id in response');
      if (submissionId) {
        window.postMessage({ source: HOOK_SOURCE.gfg, kind: 'submitted', submissionId, slug: submit[2], apiBase: submit[1] }, location.origin);
      }
      return;
    }
    if (!isResult) return;
    const subId = readField(requestBody, 'sub_id') ?? findSubmissionId(responseBody);
    const subType = readField(requestBody, 'sub_type');
    if (subId && (!subType || subType === 'solutionCheck')) {
      const r = (responseBody as { results?: Record<string, unknown> } & Record<string, unknown>) ?? {};
      const res = (r.results && typeof r.results === 'object' ? r.results : r) as Record<string, unknown>;
      log(`result for ${subId}: status=${String(res.status)} view_mode=${String(res.view_mode)}`);
      // Forward only the verdict fields.
      window.postMessage({ source: HOOK_SOURCE.gfg, kind: 'result', submissionId: subId, result: { status: res.status, view_mode: res.view_mode } }, location.origin);
    } else {
      log('result seen, but could not tell which submission it belongs to', { subType });
    }
  },
);
