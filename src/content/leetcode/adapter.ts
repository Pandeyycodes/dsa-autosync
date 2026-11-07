/**
 * LeetCode adapter. Interfaces used (all are LeetCode's own web endpoints,
 * called with the user's existing session; nothing is bypassed):
 *  - POST /problems/{slug}/submit/            → { submission_id }  (observed, not called)
 *  - GET  /submissions/detail/{id}/check/     → { state, status_code, lang, ... }
 *  - POST /graphql  submissionDetails(id)     → exact code of THAT submission
 *  - POST /graphql  question(titleSlug)       → title, id, difficulty, topics, content
 */
import { resolveLanguage } from '@/shared/languages';
import type { SubmissionCapture } from '@/shared/schemas';
import { normalizeLeetCodeCheck, normalizeLeetCodeStatusCode, type Verdict } from '@/shared/verdict';
import { CaptureError, type Http } from '../common';
import { extractProblemContent } from '../problem-html';

export const ORIGIN = 'https://leetcode.com';

export interface LeetCodeDeps {
  http: Http;
  sleep: (ms: number) => Promise<void>;
  csrfToken: () => string | null;
}

/** Poll the platform's verdict for one submission id until it is final. */
export async function pollVerdict(id: string, deps: LeetCodeDeps, opts = { maxPolls: 40, intervalMs: 1500 }): Promise<Verdict> {
  let networkErrors = 0;
  for (let i = 0; i < opts.maxPolls; i++) {
    const res = await deps.http(`${ORIGIN}/submissions/detail/${encodeURIComponent(id)}/check/`, { credentials: 'include' });
    if (res.status === 200) {
      const v = normalizeLeetCodeCheck(res.body);
      if (v !== 'PENDING') return v;
      networkErrors = 0;
    } else if (res.status === 429 || res.status === 0 || res.status >= 500) {
      if (++networkErrors >= 5) return 'NETWORK_ERROR';
    } else {
      return 'UNKNOWN'; // 403/404: not this user's submission or unknown id
    }
    await deps.sleep(opts.intervalMs * (i < 6 ? 1 : 2) * (networkErrors ? 2 : 1));
  }
  return 'PENDING'; // still judging — the job stays pending and resumes later
}

async function graphql<T>(deps: LeetCodeDeps, query: string, variables: Record<string, unknown>): Promise<T | null> {
  const csrf = deps.csrfToken();
  const res = await deps.http(`${ORIGIN}/graphql/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(csrf && { 'x-csrftoken': csrf }) },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status !== 200 || !res.body || typeof res.body !== 'object') return null;
  return ((res.body as { data?: T }).data ?? null) as T | null;
}

interface SubmissionDetails {
  submissionDetails: {
    code: string | null;
    timestamp: number;
    statusCode: number;
    lang: { name: string; verboseName: string } | null;
    question: { questionId: string; titleSlug: string } | null;
  } | null;
}

interface QuestionData {
  question: {
    questionId: string;
    questionFrontendId: string;
    title: string;
    titleSlug: string;
    difficulty: string | null;
    isPaidOnly: boolean;
    topicTags: { name: string; slug: string }[];
    content: string | null;
  } | null;
}

export const SUBMISSION_QUERY = `query submissionDetails($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) { code timestamp statusCode lang { name verboseName } question { questionId titleSlug } }
}`;

export const QUESTION_QUERY = `query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) { questionId questionFrontendId title titleSlug difficulty isPaidOnly topicTags { name slug } content }
}`;

/**
 * Build the capture for an ACCEPTED submission using the code stored *for that
 * submission id* — never the editor contents. Throws CaptureError otherwise.
 */
export async function captureAccepted(id: string, expectedSlug: string | null, deps: LeetCodeDeps): Promise<SubmissionCapture> {
  if (!/^\d{1,20}$/.test(id)) throw new CaptureError('CODE_UNAVAILABLE', 'Unexpected LeetCode submission id.');
  const sub = (await graphql<SubmissionDetails>(deps, SUBMISSION_QUERY, { submissionId: Number(id) }))?.submissionDetails;
  if (!sub || typeof sub.code !== 'string' || !sub.code.length) {
    throw new CaptureError('CODE_UNAVAILABLE', 'LeetCode did not return the code for this submission.');
  }
  if (normalizeLeetCodeStatusCode(sub.statusCode) !== 'ACCEPTED') {
    throw new CaptureError('VERDICT_MISMATCH', 'Stored submission is not Accepted.');
  }
  const slug = sub.question?.titleSlug ?? expectedSlug;
  if (!slug || (expectedSlug && slug !== expectedSlug)) throw new CaptureError('METADATA_UNAVAILABLE', 'Submission does not match this problem.');

  const lang = resolveLanguage(sub.lang?.name) ?? resolveLanguage(sub.lang?.verboseName);
  if (!lang) throw new CaptureError('UNSUPPORTED_LANGUAGE', `${sub.lang?.verboseName ?? 'This language'} is not supported by CodeSync.`);

  const q = (await graphql<QuestionData>(deps, QUESTION_QUERY, { titleSlug: slug }))?.question;
  if (!q) throw new CaptureError('METADATA_UNAVAILABLE', 'Could not load problem details from LeetCode.');
  const content = extractProblemContent(q.content);

  return {
    platform: 'leetcode',
    submissionId: id,
    problem: {
      id: q.questionFrontendId || q.questionId || null,
      title: q.title,
      slug: q.titleSlug,
      url: `${ORIGIN}/problems/${q.titleSlug}/`,
      difficulty: q.difficulty,
      topics: q.topicTags.map((t) => t.name).slice(0, 30),
      ...content,
    },
    language: lang.id,
    languageVariant: sub.lang?.verboseName || lang.variant,
    code: sub.code,
    submittedAt: new Date((Number(sub.timestamp) || Date.now() / 1000) * 1000).toISOString(),
  };
}

/** Extract the submission id from LeetCode's submit response body. */
export function parseSubmitResponse(body: unknown): string | null {
  const id = (body as { submission_id?: unknown } | null)?.submission_id;
  return (typeof id === 'number' || typeof id === 'string') && /^\d{1,20}$/.test(String(id)) ? String(id) : null;
}

export const SUBMIT_URL_RE = /^https:\/\/leetcode\.com\/problems\/([A-Za-z0-9-]+)\/submit\/?(?:\?.*)?$/;
