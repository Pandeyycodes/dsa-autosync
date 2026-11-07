import type { Http, HttpResult } from '@/content/common';
import * as gfg from '@/content/gfg/adapter';
import { installNetworkObserver, readField } from '@/content/hook-core';
import * as lc from '@/content/leetcode/adapter';
import { extractProblemContent } from '@/content/problem-html';
import { normalizeGfgResult, normalizeLeetCodeCheck } from '@/shared/verdict';
import { gfgNextData, GFG_QUESTION_HTML, lcQuestion, lcSubmissionDetails, LC_QUESTION_HTML } from './fixtures';

/** Scripted HTTP: each call takes the next response for the matching URL fragment. */
function scripted(routes: Record<string, (HttpResult | (() => HttpResult))[]>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const http: Http = async (url, init) => {
    calls.push({ url, init });
    const body = typeof init?.body === 'string' ? init.body : '';
    const key = Object.keys(routes).find((k) => url.includes(k) || body.includes(k));
    const r = key ? routes[key]!.length > 1 ? routes[key]!.shift()! : routes[key]![0]! : { status: 404, body: null };
    return typeof r === 'function' ? r() : r;
  };
  return { http, calls };
}
const ok = (body: unknown): HttpResult => ({ status: 200, body });
const lcDeps = (http: Http): lc.LeetCodeDeps => ({ http, sleep: async () => {}, csrfToken: () => 'csrf123' });

describe('verdict normalization', () => {
  it('maps LeetCode check states and status codes', () => {
    expect(normalizeLeetCodeCheck({ state: 'PENDING' })).toBe('PENDING');
    expect(normalizeLeetCodeCheck({ state: 'STARTED' })).toBe('PENDING');
    expect(normalizeLeetCodeCheck({ state: 'SUCCESS', status_code: 10, status_msg: 'Accepted' })).toBe('ACCEPTED');
    expect(normalizeLeetCodeCheck({ state: 'SUCCESS', status_code: 11 })).toBe('WRONG_ANSWER');
    expect(normalizeLeetCodeCheck({ state: 'SUCCESS', status_code: 12 })).toBe('MEMORY_LIMIT_EXCEEDED');
    expect(normalizeLeetCodeCheck({ state: 'SUCCESS', status_code: 14 })).toBe('TIME_LIMIT_EXCEEDED');
    expect(normalizeLeetCodeCheck({ state: 'SUCCESS', status_code: 15 })).toBe('RUNTIME_ERROR');
    expect(normalizeLeetCodeCheck({ state: 'SUCCESS', status_code: 20 })).toBe('COMPILATION_ERROR');
    expect(normalizeLeetCodeCheck({ state: 'SUCCESS', status_code: 13 })).toBe('UNKNOWN');
    expect(normalizeLeetCodeCheck({ state: 'SUCCESS', status_code: 10, status_msg: 'Wrong Answer' })).toBe('UNKNOWN');
    expect(normalizeLeetCodeCheck('garbage')).toBe('UNKNOWN');
  });

  it('maps GeeksforGeeks result states', () => {
    expect(normalizeGfgResult({ status: 'QUEUED' })).toBe('PENDING');
    expect(normalizeGfgResult({ results: { status: 'PICKED' } })).toBe('PENDING');
    expect(normalizeGfgResult({ status: 'SUCCESS', view_mode: 'correct' })).toBe('ACCEPTED');
    expect(normalizeGfgResult({ status: 'calculated', view_mode: 'correct' })).toBe('ACCEPTED');
    expect(normalizeGfgResult({ status: 'SUCCESS', view_mode: 'NOK' })).toBe('WRONG_ANSWER');
    expect(normalizeGfgResult({ status: 'SUCCESS', view_mode: 'compilation' })).toBe('COMPILATION_ERROR');
    expect(normalizeGfgResult({ status: 'SUCCESS', view_mode: 'runtime' })).toBe('RUNTIME_ERROR');
    expect(normalizeGfgResult({ status: 'SUCCESS', view_mode: 'optimize' })).toBe('TIME_LIMIT_EXCEEDED');
    expect(normalizeGfgResult({ status: 'SUCCESS', view_mode: 'something-new' })).toBe('UNKNOWN');
    expect(normalizeGfgResult({})).toBe('UNKNOWN');
  });
});

describe('platform detection', () => {
  it('matches only real submit endpoints (not Run/Compile)', () => {
    expect(lc.SUBMIT_URL_RE.test('https://leetcode.com/problems/two-sum/submit/')).toBe(true);
    expect(lc.SUBMIT_URL_RE.test('https://leetcode.com/problems/two-sum/interpret_solution/')).toBe(false);
    expect(lc.SUBMIT_URL_RE.test('https://evil.com/problems/two-sum/submit/')).toBe(false);
    expect(gfg.SUBMIT_RE.test('https://practiceapi.geeksforgeeks.org/api/latest/problems/reverse-a-linked-list/submit/compile/')).toBe(true);
    expect(gfg.SUBMIT_RE.test('https://practiceapi.geeksforgeeks.org/api/latest/problems/reverse-a-linked-list/compile-sub-id/')).toBe(false);
    expect(gfg.RESULT_RE.test('https://practiceapi.geeksforgeeks.org/api/latest/problems/submission/submit/result/')).toBe(true);
    expect(gfg.RESULT_RE.test('https://practiceapi.geeksforgeeks.org/api/latest/problems/submission/compile-run/result/')).toBe(false);
  });

  it('extracts submission ids from submit responses', () => {
    expect(lc.parseSubmitResponse({ submission_id: 1234567890 })).toBe('1234567890');
    expect(lc.parseSubmitResponse({ submission_id: '12; DROP' })).toBeNull();
    expect(gfg.parseSubmitResponse({ results: { submission_id: 'a1b2c3' } })).toBe('a1b2c3');
    expect(gfg.parseSubmitResponse({ errorMessage: 'Compilation Error' })).toBeNull();
  });

  it('MAIN-world observer reads submit responses without altering them', async () => {
    const observed: unknown[] = [];
    const original = vi.fn(async () => Response.json({ submission_id: 42 }));
    window.fetch = original as unknown as typeof fetch;
    (window as { __codesyncHooked?: boolean }).__codesyncHooked = false;
    installNetworkObserver((url, m) => m === 'POST' && lc.SUBMIT_URL_RE.test(url), (o) => observed.push(o));
    const res = await window.fetch('https://leetcode.com/problems/two-sum/submit/', { method: 'POST', body: '{"typed_code":"x"}' });
    expect(await res.json()).toEqual({ submission_id: 42 }); // page still gets its response
    await window.fetch('https://leetcode.com/problems/two-sum/interpret_solution/', { method: 'POST' });
    await new Promise((r) => setTimeout(r, 0));
    expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({ responseBody: { submission_id: 42 }, status: 200 });
  });

  it('reads request fields from JSON, form and URL-encoded bodies', () => {
    expect(readField('{"sub_id":"abc","sub_type":"solutionCheck"}', 'sub_id')).toBe('abc');
    expect(readField('sub_id=xyz&pid=1', 'sub_id')).toBe('xyz');
    const fd = new FormData();
    fd.set('sub_id', 'f1');
    expect(readField(fd, 'sub_id')).toBe('f1');
    expect(readField(null, 'sub_id')).toBeNull();
  });
});

describe('LeetCode adapter', () => {
  it('polls until the final verdict (delayed verdict)', async () => {
    const { http, calls } = scripted({ '/check/': [ok({ state: 'PENDING' }), ok({ state: 'STARTED' }), ok({ state: 'SUCCESS', status_code: 10, status_msg: 'Accepted' })] });
    expect(await lc.pollVerdict('99', lcDeps(http))).toBe('ACCEPTED');
    expect(calls).toHaveLength(3);
    expect(calls[0]!.url).toBe('https://leetcode.com/submissions/detail/99/check/');
  });

  it.each([
    [11, 'WRONG_ANSWER'],
    [15, 'RUNTIME_ERROR'],
    [20, 'COMPILATION_ERROR'],
  ])('returns status_code %s as %s', async (code, verdict) => {
    const { http } = scripted({ '/check/': [ok({ state: 'SUCCESS', status_code: code })] });
    expect(await lc.pollVerdict('1', lcDeps(http))).toBe(verdict);
  });

  it('reports NETWORK_ERROR after repeated failures and UNKNOWN for foreign ids', async () => {
    expect(await lc.pollVerdict('1', lcDeps(scripted({ '/check/': [{ status: 0, body: null }] }).http))).toBe('NETWORK_ERROR');
    expect(await lc.pollVerdict('1', lcDeps(scripted({ '/check/': [{ status: 403, body: null }] }).http))).toBe('UNKNOWN');
    expect(await lc.pollVerdict('1', lcDeps(scripted({ '/check/': [ok({ state: 'PENDING' })] }).http), { maxPolls: 3, intervalMs: 1 })).toBe('PENDING');
  });

  it('captures the exact code stored for the submission id (not the editor)', async () => {
    const { http, calls } = scripted({ submissionDetails: [ok(lcSubmissionDetails())], questionData: [ok(lcQuestion())] });
    const cap = await lc.captureAccepted('555', 'two-sum', lcDeps(http));
    expect(cap.code).toBe(lcSubmissionDetails().data.submissionDetails.code);
    expect(cap).toMatchObject({ platform: 'leetcode', submissionId: '555', language: 'python', languageVariant: 'Python3' });
    expect(cap.problem).toMatchObject({ id: '1', title: 'Two Sum', difficulty: 'Easy', topics: ['Array', 'Hash Table'], url: 'https://leetcode.com/problems/two-sum/' });
    expect(cap.problem.examples).toHaveLength(2);
    expect(cap.problem.constraints[0]).toContain('10^4');
    const gql = JSON.parse(String(calls[0]!.init!.body));
    expect(gql.variables).toEqual({ submissionId: 555 });
    expect((calls[0]!.init!.headers as Record<string, string>)['x-csrftoken']).toBe('csrf123');
  });

  it('refuses to capture when code is missing, verdict differs, slug mismatches or language unsupported', async () => {
    const run = (sub: Record<string, unknown>, slug = 'two-sum') =>
      lc.captureAccepted('5', slug, lcDeps(scripted({ submissionDetails: [ok(lcSubmissionDetails(sub))], questionData: [ok(lcQuestion())] }).http));
    await expect(run({ code: null })).rejects.toMatchObject({ code: 'CODE_UNAVAILABLE' });
    await expect(run({ statusCode: 11 })).rejects.toMatchObject({ code: 'VERDICT_MISMATCH' });
    await expect(run({}, 'add-two-numbers')).rejects.toMatchObject({ code: 'METADATA_UNAVAILABLE' });
    await expect(run({ lang: { name: 'scala', verboseName: 'Scala' } })).rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' });
    const nothing = lc.captureAccepted('5', 'two-sum', lcDeps(scripted({ submissionDetails: [ok({ data: { submissionDetails: null } })] }).http));
    await expect(nothing).rejects.toMatchObject({ code: 'CODE_UNAVAILABLE' });
  });

  it('captures SQL submissions as the SQL language', async () => {
    const { http } = scripted({
      submissionDetails: [ok(lcSubmissionDetails({ code: 'SELECT 1;', lang: { name: 'mysql', verboseName: 'MySQL' }, question: { questionId: '176', titleSlug: 'second-highest-salary' } }))],
      questionData: [ok(lcQuestion({ questionFrontendId: '176', title: 'Second Highest Salary', titleSlug: 'second-highest-salary', topicTags: [{ name: 'Database', slug: 'database' }], content: null }))],
    });
    const cap = await lc.captureAccepted('7', 'second-highest-salary', lcDeps(http));
    expect(cap.language).toBe('sql');
    expect(cap.languageVariant).toBe('MySQL');
    expect(cap.problem.statementMarkdown).toBeNull(); // paid/unavailable content is not invented
  });
});

describe('GeeksforGeeks adapter', () => {
  const api = 'https://practiceapi.geeksforgeeks.org/api/latest/';
  const deps = (http: Http, next: unknown = gfgNextData(), page: string | null = null): gfg.GfgDeps => ({ http, pageNextData: () => next, fetchPageHtml: async () => page });

  it('captures exact code by submission id plus page metadata', async () => {
    const { http, calls } = scripted({ 'problems/submissions/': [ok({ results: { user_code: 'Node* reverse(Node* h){return h;}', language: 'cpp' } })] });
    const cap = await gfg.captureAccepted('sub123', 'reverse-a-linked-list', api, deps(http));
    expect(calls[0]!.url).toBe(`${api}problems/submissions/sub123/`);
    expect(cap).toMatchObject({ platform: 'gfg', submissionId: 'sub123', language: 'cpp', code: 'Node* reverse(Node* h){return h;}' });
    expect(cap.problem).toMatchObject({ id: '700005', title: 'Reverse a linked list', difficulty: 'Easy', topics: ['Linked List', 'Data Structures'], url: 'https://www.geeksforgeeks.org/problems/reverse-a-linked-list/1' });
    expect(cap.problem.examples).toHaveLength(2);
    expect(cap.problem.constraints).toEqual(['1 <= number of nodes <= 10^5', '0 <= node->data <= 10^5']);
  });

  it('refetches metadata when the page data is stale (client-side navigation)', async () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(gfgNextData({ slug: 'other', problem_name: 'Other' }))}</script>`;
    const { http } = scripted({ 'problems/submissions/': [ok({ user_code: 'x', language: 'python3' })] });
    const cap = await gfg.captureAccepted('1', 'other', api, deps(http, gfgNextData(), html));
    expect(cap.problem.title).toBe('Other');
  });

  it('skips upload when code cannot be retrieved or the API base is unexpected', async () => {
    const empty = scripted({ 'problems/submissions/': [ok({ results: {} })] });
    await expect(gfg.captureAccepted('1', 'reverse-a-linked-list', api, deps(empty.http))).rejects.toMatchObject({ code: 'CODE_UNAVAILABLE' });
    const denied = scripted({ 'problems/submissions/': [{ status: 403, body: null }] });
    await expect(gfg.captureAccepted('1', 'reverse-a-linked-list', api, deps(denied.http))).rejects.toMatchObject({ code: 'CODE_UNAVAILABLE' });
    await expect(gfg.captureAccepted('1', 'x', 'https://evil.example/api/latest/', deps(empty.http))).rejects.toMatchObject({ code: 'CODE_UNAVAILABLE' });
  });

  it('reports metadata problems instead of guessing', async () => {
    const { http } = scripted({ 'problems/submissions/': [ok({ user_code: 'x', language: 'java' })] });
    await expect(gfg.captureAccepted('1', 'unknown-slug', api, deps(http, null, null))).rejects.toMatchObject({ code: 'METADATA_UNAVAILABLE' });
  });
});

describe('problem HTML extraction', () => {
  it('splits LeetCode content into statement, examples and constraints', () => {
    const c = extractProblemContent(LC_QUESTION_HTML);
    expect(c.statementMarkdown).toContain('Given an array of integers `nums`');
    expect(c.statementMarkdown).toContain('Follow-up');
    expect(c.statementMarkdown).not.toContain('Example 1');
    expect(c.examples).toEqual(['Input: nums = [2,7,11,15], target = 9\nOutput: [0,1]', '![diagram](https://assets.leetcode.com/uploads/example2.png)\nInput: nums = [3,2,4], target = 6\nOutput: [1,2]']);
    expect(c.constraints).toEqual(['`2 <= nums.length <= 10^4`', '**Only one valid answer exists.**']);
  });

  it('handles GfG "Examples:" with multiple blocks and <br> constraints', () => {
    const c = extractProblemContent(GFG_QUESTION_HTML);
    expect(c.examples).toHaveLength(2);
    expect(c.examples[0]).toBe('Input: head: 1 -> 2 -> 3\nOutput: 3 -> 2 -> 1');
    expect(c.constraints).toHaveLength(2);
  });

  it('returns nothing for missing content and omits absent constraints', () => {
    expect(extractProblemContent(null)).toEqual({ statementMarkdown: null, examples: [], constraints: [] });
    const c = extractProblemContent('<p>Only a statement with <b>bold</b> &amp; special chars: a|b `c` 数组</p>');
    expect(c.constraints).toEqual([]);
    expect(c.statementMarkdown).toBe('Only a statement with **bold** & special chars: a|b `c` 数组');
  });
});
