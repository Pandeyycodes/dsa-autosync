/**
 * Runs in LeetCode's MAIN world (document_start). Observes only the submit
 * response to learn the submission *id*; verification happens elsewhere.
 * Has no access to extension APIs; relays via window.postMessage.
 */
import { HOOK_SOURCE } from '../common';
import { installNetworkObserver } from '../hook-core';
import { parseSubmitResponse, SUBMIT_URL_RE } from './adapter';

installNetworkObserver(
  (url, method) => method === 'POST' && SUBMIT_URL_RE.test(url),
  ({ url, responseBody, status }) => {
    if (status !== 200) return;
    const submissionId = parseSubmitResponse(responseBody);
    const slug = SUBMIT_URL_RE.exec(url)?.[1] ?? null;
    if (submissionId && slug) {
      window.postMessage({ source: HOOK_SOURCE.leetcode, kind: 'submitted', submissionId, slug }, location.origin);
    }
  },
);
