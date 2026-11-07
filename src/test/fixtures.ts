import type { SubmissionCapture } from '@/shared/schemas';
import type { Account } from '@/shared/types';

/** Synthetic fixtures mirroring the *shape* of platform responses (verified live for LeetCode's public question query). */
export const LC_QUESTION_HTML = `<p>Given an array of integers <code>nums</code>&nbsp;and an integer <code>target</code>, return <em>indices of the two numbers such that they add up to <code>target</code></em>.</p>
<p>&nbsp;</p>
<p><strong class="example">Example 1:</strong></p>
<pre>
<strong>Input:</strong> nums = [2,7,11,15], target = 9
<strong>Output:</strong> [0,1]
</pre>
<p><strong class="example">Example 2:</strong></p>
<div class="example-block">
<p><strong>Input:</strong> <span class="example-io">nums = [3,2,4], target = 6</span></p>
<p><strong>Output:</strong> <span class="example-io">[1,2]</span></p>
</div>
<p>&nbsp;</p>
<p><strong>Constraints:</strong></p>
<ul>
	<li><code>2 &lt;= nums.length &lt;= 10<sup>4</sup></code></li>
	<li><strong>Only one valid answer exists.</strong></li>
</ul>
<p>&nbsp;</p>
<strong>Follow-up:&nbsp;</strong>Can you do better than <code>O(n<sup>2</sup>)</code>?`;

export const GFG_QUESTION_HTML = `<div><p><span style="font-size: 18px;">Given the <strong>head</strong> of a singly linked list, reverse it.</span></p>
<p><strong>Examples:</strong></p>
<pre><strong>Input:</strong> head: 1 -&gt; 2 -&gt; 3
<strong>Output:</strong> 3 -&gt; 2 -&gt; 1</pre>
<pre><strong>Input:</strong> head: 2
<strong>Output:</strong> 2</pre>
<p><strong>Constraints:</strong><br>1 &lt;= number of nodes &lt;= 10<sup>5</sup><br>0 &lt;= node-&gt;data &lt;= 10<sup>5</sup></p></div>`;

export const lcSubmissionDetails = (over: Record<string, unknown> = {}) => ({
  data: {
    submissionDetails: {
      code: 'class Solution:\n    def twoSum(self, nums, target):\n        seen = {}\n        for i, n in enumerate(nums):\n            if target - n in seen:\n                return [seen[target - n], i]\n            seen[n] = i\n',
      timestamp: 1762509600,
      statusCode: 10,
      lang: { name: 'python3', verboseName: 'Python3' },
      question: { questionId: '1', titleSlug: 'two-sum' },
      ...over,
    },
  },
});

export const lcQuestion = (over: Record<string, unknown> = {}) => ({
  data: {
    question: {
      questionId: '1', questionFrontendId: '1', title: 'Two Sum', titleSlug: 'two-sum', difficulty: 'Easy', isPaidOnly: false,
      topicTags: [{ name: 'Array', slug: 'array' }, { name: 'Hash Table', slug: 'hash-table' }],
      content: LC_QUESTION_HTML,
      ...over,
    },
  },
});

export const gfgNextData = (over: Record<string, unknown> = {}) => ({
  props: { pageProps: { initialState: { problemData: { allData: { probData: {
    id: 700005, problem_name: 'Reverse a linked list', slug: 'reverse-a-linked-list', difficulty: 'Easy',
    tags: { company_tags: ['Amazon'], topic_tags: ['Linked List', 'Data Structures'] },
    problem_question: GFG_QUESTION_HTML,
    ...over,
  } } } } } },
});

export const capture = (over: Partial<SubmissionCapture> = {}): SubmissionCapture => ({
  platform: 'leetcode',
  submissionId: '111',
  problem: { id: '1', title: 'Two Sum', slug: 'two-sum', url: 'https://leetcode.com/problems/two-sum/', difficulty: 'Easy', topics: ['Array'], statementMarkdown: null, examples: [], constraints: [] },
  language: 'python',
  languageVariant: 'Python3',
  code: 'print(1)\n',
  submittedAt: '2026-11-07T10:00:00.000Z',
  ...over,
});

export const account = (over: Partial<Account> = {}): Account => ({
  user: { login: 'octocat', avatarUrl: null, githubId: '1' },
  repo: { repositoryId: '10', fullName: 'octocat/dsa', branch: 'main', rootFolder: 'DSA', layout: 'platform/topic/problem' },
  githubAuthorized: true,
  sessionExpiresAt: '2030-01-01T00:00:00.000Z',
  ...over,
});
