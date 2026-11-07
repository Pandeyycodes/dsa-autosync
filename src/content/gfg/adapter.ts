/**
 * GeeksforGeeks adapter — independent of the LeetCode adapter.
 *
 * Interfaces (identified from GfG's own production client bundle; GfG
 * publishes no API documentation, so shapes are parsed defensively and any
 * unrecognised shape yields UNKNOWN → no upload):
 *  - POST {api}problems/{slug}/submit/compile/  → { results: { submission_id } }   (observed)
 *  - POST {api}problems/submission/submit/result/ (body sub_id) → { status, view_mode, ... } (observed)
 *  - GET  {api}problems/submissions/{id}/       → { user_code, language, ... } (exact code by id)
 *  - Problem metadata: __NEXT_DATA__ → props.pageProps.initialState.problemData.allData.probData
 */
import { resolveLanguage } from '@/shared/languages';
import type { SubmissionCapture } from '@/shared/schemas';
import { normalizeGfgResult, type Verdict } from '@/shared/verdict';
import { CaptureError, type Http } from '../common';
import { extractProblemContent } from '../problem-html';

export const SUBMIT_RE = /^(https:\/\/practiceapi(?:origin)?\.geeksforgeeks\.org\/api\/[A-Za-z0-9_-]+\/)problems\/([A-Za-z0-9_.-]+)\/submit\/compile\/?(?:\?.*)?$/;
export const RESULT_RE = /^https:\/\/practiceapi(?:origin)?\.geeksforgeeks\.org\/api\/[A-Za-z0-9_-]+\/problems\/submission\/submit\/result\/?(?:\?.*)?$/;

export function parseSubmitResponse(body: unknown): string | null {
  const r = body as { results?: { submission_id?: unknown }; submission_id?: unknown } | null;
  const id = r?.results?.submission_id ?? r?.submission_id;
  return (typeof id === 'string' || typeof id === 'number') && /^[A-Za-z0-9_-]{1,64}$/.test(String(id)) ? String(id) : null;
}

export function verdictFromResult(body: unknown): Verdict {
  return normalizeGfgResult(body);
}

export interface GfgProblemData {
  id?: number | string;
  problem_name?: string;
  slug?: string;
  difficulty?: string;
  tags?: { topic_tags?: unknown };
  problem_question?: string;
  constraints_display?: unknown;
}

/** Read problem data from a GfG problem page's Next.js payload. */
export function problemFromNextData(nextData: unknown): GfgProblemData | null {
  const p = (nextData as { props?: { pageProps?: { initialState?: { problemData?: { allData?: { probData?: unknown } } } } } })
    ?.props?.pageProps?.initialState?.problemData?.allData?.probData;
  return p && typeof p === 'object' ? (p as GfgProblemData) : null;
}

export function nextDataFromHtml(html: string): unknown {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try {
    return JSON.parse(m[1]!);
  } catch {
    return null;
  }
}

export interface GfgDeps {
  http: Http;
  /** Current page's __NEXT_DATA__ (may be stale after client-side navigation). */
  pageNextData: () => unknown;
  fetchPageHtml: (slug: string) => Promise<string | null>;
}

async function problemData(slug: string, deps: GfgDeps): Promise<GfgProblemData> {
  let p = problemFromNextData(deps.pageNextData());
  if (!p || p.slug !== slug) {
    const html = await deps.fetchPageHtml(slug);
    p = html ? problemFromNextData(nextDataFromHtml(html)) : null;
  }
  if (!p || p.slug !== slug || typeof p.problem_name !== 'string') {
    throw new CaptureError('METADATA_UNAVAILABLE', 'Could not read GeeksforGeeks problem details.');
  }
  return p;
}

/** Retrieve the exact accepted code for this submission id and assemble the capture. */
export async function captureAccepted(submissionId: string, slug: string, apiBase: string, deps: GfgDeps): Promise<SubmissionCapture> {
  if (!/^https:\/\/practiceapi(?:origin)?\.geeksforgeeks\.org\/api\/[A-Za-z0-9_-]+\/$/.test(apiBase)) {
    throw new CaptureError('CODE_UNAVAILABLE', 'Unrecognised GeeksforGeeks API base.');
  }
  const res = await deps.http(`${apiBase}problems/submissions/${encodeURIComponent(submissionId)}/`, { credentials: 'include' });
  const raw = res.body as { results?: Record<string, unknown> } & Record<string, unknown> | null;
  const data = (raw?.results && typeof raw.results === 'object' ? raw.results : raw) as Record<string, unknown> | null;
  const code = data?.user_code;
  if (res.status !== 200 || typeof code !== 'string' || !code.length) {
    throw new CaptureError('CODE_UNAVAILABLE', 'GeeksforGeeks did not return the code for this submission.');
  }
  const langRaw = typeof data?.language === 'string' ? data.language : null;
  const lang = resolveLanguage(langRaw);
  if (!lang) throw new CaptureError('UNSUPPORTED_LANGUAGE', `${langRaw ?? 'This language'} is not supported by CodeSync.`);

  const p = await problemData(slug, deps);
  const content = extractProblemContent(p.problem_question);
  const topics = Array.isArray(p.tags?.topic_tags) ? (p.tags!.topic_tags as unknown[]).filter((t): t is string => typeof t === 'string') : [];
  // If GfG exposes constraints separately, prefer them (verbatim lines).
  if (typeof p.constraints_display === 'string' && !content.constraints.length) {
    content.constraints = extractProblemContent(`<div>${p.constraints_display}</div>`).statementMarkdown?.split('\n').filter(Boolean) ?? [];
  }

  return {
    platform: 'gfg',
    submissionId,
    problem: {
      id: p.id !== undefined && /^[A-Za-z0-9_-]{1,32}$/.test(String(p.id)) ? String(p.id) : null,
      title: p.problem_name!,
      slug,
      url: `https://www.geeksforgeeks.org/problems/${slug}/1`,
      difficulty: typeof p.difficulty === 'string' ? p.difficulty : null,
      topics: topics.slice(0, 30),
      ...content,
    },
    language: lang.id,
    languageVariant: lang.variant,
    code,
    submittedAt: new Date().toISOString(),
  };
}
