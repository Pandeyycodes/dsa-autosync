/**
 * Normalized submission verdicts. Only ACCEPTED may enter the upload pipeline.
 */
export const VERDICTS = [
  'ACCEPTED',
  'WRONG_ANSWER',
  'COMPILATION_ERROR',
  'RUNTIME_ERROR',
  'TIME_LIMIT_EXCEEDED',
  'MEMORY_LIMIT_EXCEEDED',
  'PENDING',
  'UNKNOWN',
  'NETWORK_ERROR',
] as const;

export type Verdict = (typeof VERDICTS)[number];

export type VerdictAction = 'upload' | 'wait' | 'ignore' | 'retry_verification';

export function actionFor(verdict: Verdict): VerdictAction {
  switch (verdict) {
    case 'ACCEPTED':
      return 'upload';
    case 'PENDING':
      return 'wait';
    case 'NETWORK_ERROR':
      return 'retry_verification';
    default:
      // Every failed verdict and UNKNOWN is ignored — never uploaded.
      return 'ignore';
  }
}

export const isFinal = (v: Verdict) => v !== 'PENDING' && v !== 'NETWORK_ERROR';

/**
 * LeetCode `/submissions/detail/{id}/check/` response → Verdict.
 * `state` is PENDING | STARTED | SUCCESS; `status_code` is only meaningful
 * once state === SUCCESS (10 = Accepted).
 */
export function normalizeLeetCodeCheck(body: unknown): Verdict {
  if (!body || typeof body !== 'object') return 'UNKNOWN';
  const b = body as { state?: unknown; status_code?: unknown; status_msg?: unknown };
  if (b.state === 'PENDING' || b.state === 'STARTED') return 'PENDING';
  if (b.state !== 'SUCCESS') return 'UNKNOWN';
  switch (b.status_code) {
    case 10:
      return b.status_msg === undefined || b.status_msg === 'Accepted' ? 'ACCEPTED' : 'UNKNOWN';
    case 11:
      return 'WRONG_ANSWER';
    case 12:
      return 'MEMORY_LIMIT_EXCEEDED';
    case 14:
      return 'TIME_LIMIT_EXCEEDED';
    case 15:
      return 'RUNTIME_ERROR';
    case 20:
      return 'COMPILATION_ERROR';
    default:
      // 13 Output Limit Exceeded, 16 Internal Error, 30 Timeout, … — never upload.
      return 'UNKNOWN';
  }
}

/** LeetCode GraphQL `submissionDetails.statusCode` (same codes as above). */
export function normalizeLeetCodeStatusCode(code: unknown): Verdict {
  return normalizeLeetCodeCheck({ state: 'SUCCESS', status_code: code });
}

/**
 * GeeksforGeeks `problems/submission/submit/result/` response → Verdict.
 * Observed in GFG's own client bundle: `status` QUEUED/PICKED while running,
 * SUCCESS/calculated when finished; `view_mode` correct | NOK | compilation |
 * runtime | optimize describes the outcome.
 */
export function normalizeGfgResult(body: unknown): Verdict {
  if (!body || typeof body !== 'object') return 'UNKNOWN';
  const root = body as { results?: unknown };
  const r = (root.results && typeof root.results === 'object' ? root.results : body) as {
    status?: unknown;
    view_mode?: unknown;
  };
  if (r.status === 'QUEUED' || r.status === 'PICKED') return 'PENDING';
  if (r.status !== 'SUCCESS' && r.status !== 'calculated') return 'UNKNOWN';
  switch (r.view_mode) {
    case 'correct':
      return 'ACCEPTED';
    case 'NOK':
      return 'WRONG_ANSWER';
    case 'compilation':
      return 'COMPILATION_ERROR';
    case 'runtime':
      return 'RUNTIME_ERROR';
    case 'optimize':
      return 'TIME_LIMIT_EXCEEDED';
    default:
      return 'UNKNOWN';
  }
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  ACCEPTED: 'Accepted',
  WRONG_ANSWER: 'Wrong answer',
  COMPILATION_ERROR: 'Compilation error',
  RUNTIME_ERROR: 'Runtime error',
  TIME_LIMIT_EXCEEDED: 'Time limit exceeded',
  MEMORY_LIMIT_EXCEEDED: 'Memory limit exceeded',
  PENDING: 'Pending',
  UNKNOWN: 'Unknown',
  NETWORK_ERROR: 'Network error',
};
