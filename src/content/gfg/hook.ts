/**
 * Runs in GeeksforGeeks' MAIN world. Observes (never modifies) the practice
 * API's submit and result responses — the platform's own verdict data bound
 * to a submission id — and relays them to the isolated content script.
 */
import { HOOK_SOURCE } from '../common';
import { installNetworkObserver, readField } from '../hook-core';
import { parseSubmitResponse, RESULT_RE, SUBMIT_RE } from './adapter';

installNetworkObserver(
  (url, method) => method === 'POST' && (SUBMIT_RE.test(url) || RESULT_RE.test(url)),
  ({ url, requestBody, responseBody, status }) => {
    if (status !== 200) return;
    const submit = SUBMIT_RE.exec(url);
    if (submit) {
      const submissionId = parseSubmitResponse(responseBody);
      if (submissionId) {
        window.postMessage({ source: HOOK_SOURCE.gfg, kind: 'submitted', submissionId, slug: submit[2], apiBase: submit[1] }, location.origin);
      }
      return;
    }
    const subId = readField(requestBody, 'sub_id');
    const subType = readField(requestBody, 'sub_type');
    if (subId && (!subType || subType === 'solutionCheck')) {
      const r = (responseBody as { results?: Record<string, unknown> } & Record<string, unknown>) ?? {};
      const res = (r.results && typeof r.results === 'object' ? r.results : r) as Record<string, unknown>;
      // Forward only the verdict fields.
      window.postMessage({ source: HOOK_SOURCE.gfg, kind: 'result', submissionId: subId, result: { status: res.status, view_mode: res.view_mode } }, location.origin);
    }
  },
);
