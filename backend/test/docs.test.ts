import { describe, expect, it } from 'vitest';
import { resolveLanguage } from '../../src/shared/languages';
import { generateReadme } from '../../src/shared/readme';
import { buildSolutionPaths, normalizeRootFolder, safeSegment } from '../../src/shared/repo-paths';
import { syncRequest } from './helpers';

const all = { includeStatement: true, includeExamples: true, includeConstraints: true };
const none = { includeStatement: false, includeExamples: false, includeConstraints: false };

describe('README generation', () => {
  it('renders multiple examples and constraints deterministically', () => {
    const capture = { ...syncRequest().capture, problem: { ...syncRequest().capture.problem, examples: ['a = 1', 'a = 2', 'a = 3'] } };
    const a = generateReadme(capture, all, [{ language: 'python', relativePath: 'solution.py' }]);
    const b = generateReadme(capture, all, [{ language: 'python', relativePath: 'solution.py' }]);
    expect(a).toBe(b);
    expect(a).toContain('### Example 1');
    expect(a).toContain('### Example 3');
    expect(a).toContain('## Constraints');
    expect(a).toContain('| **Problem ID** | 1 |');
    expect(a).toContain('[Python](solution.py)');
  });

  it('omits missing sections instead of fabricating them', () => {
    const capture = { ...syncRequest().capture, problem: { ...syncRequest().capture.problem, difficulty: null, topics: [], constraints: [], examples: [], statementMarkdown: null } };
    const md = generateReadme(capture, all, [{ language: 'python', relativePath: 'solution.py' }]);
    expect(md).not.toContain('## Constraints');
    expect(md).not.toContain('## Examples');
    expect(md).not.toContain('## Problem Statement');
    expect(md).not.toContain('Difficulty');
    expect(md).not.toContain('Topics');
  });

  it('respects README content preferences', () => {
    const md = generateReadme(syncRequest().capture, none, [{ language: 'python', relativePath: 'solution.py' }]);
    expect(md).not.toContain('## Problem Statement');
    expect(md).not.toContain('## Examples');
    expect(md).toContain('| **Link** |');
  });

  it('escapes special characters, tables and raw HTML', () => {
    const capture = {
      ...syncRequest().capture,
      problem: { ...syncRequest().capture.problem, title: 'A | B *bold* <img src=x onerror=alert(1)>', statementMarkdown: 'Use <b>tags</b>\n\n```\nif (a < b) {}\n```', examples: ['contains ``` backticks'] },
    };
    const md = generateReadme(capture, all, [{ language: 'python', relativePath: 'solution.py' }]);
    expect(md).toContain('A \\| B \\*bold\\* \&lt;img');
    expect(md).not.toContain('<img');
    expect(md).toContain('&lt;b&gt;tags');
    expect(md).toContain('if (a < b) {}'); // code fence content preserved verbatim
    expect(md).toContain('````text'); // fence longer than embedded backticks
  });

  it('handles SQL questions', () => {
    const capture = { ...syncRequest().capture, language: 'sql' as const, languageVariant: 'MySQL', problem: { ...syncRequest().capture.problem, topics: [] } };
    const md = generateReadme(capture, all, [{ language: 'sql', relativePath: 'solution.sql' }]);
    expect(md).toContain('| **Language** | SQL |');
    expect(buildSolutionPaths('', 'platform/topic/problem', { platform: 'leetcode', problemId: '177', slug: 'nth-highest-salary', title: 'x', topics: ['Database'], language: 'sql', difficulty: 'Medium', code: 'SELECT MAX(salary) FROM Employee WHERE salary < (SELECT MAX(salary) FROM Employee);' }).solutionFile)
      .toBe('LeetCode/Subqueries/0177-nth-highest-salary/solution.sql');
    // SQL by topic = the SQL concept the solution uses (platform tags are only "Database")
    expect(buildSolutionPaths('', 'platform/topic/problem', { platform: 'gfg', problemId: null, slug: 'q', title: 'q', topics: ['SQL'], language: 'sql', difficulty: null }).solutionFile).toBe('GeeksForGeeks/Database/q/solution.sql');
    // difficulty layout is still available
    expect(buildSolutionPaths('', 'platform/difficulty/problem', { platform: 'leetcode', problemId: '176', slug: 'second-highest-salary', title: 'x', topics: ['Database'], language: 'sql', difficulty: 'Medium' }).solutionFile).toBe('LeetCode/Medium/0176-second-highest-salary/solution.sql');
    // non-SQL keeps topic folders
    expect(buildSolutionPaths('', 'platform/topic/problem', { platform: 'leetcode', problemId: '1', slug: 'two-sum', title: 'x', topics: ['Array'], language: 'python', difficulty: 'Easy' }).solutionFile).toBe('LeetCode/Array/0001-two-sum/solution.py');
  });

  it('lists multiple languages', () => {
    const md = generateReadme(syncRequest().capture, none, [
      { language: 'python', relativePath: 'solution.py' },
      { language: 'cpp', relativePath: 'solution.cpp' },
      { language: 'java', relativePath: 'solution.java' },
    ]);
    expect(md).toContain('| **Languages** | C++, Java, Python |');
    expect(md).toContain('## Solutions');
  });

  it('handles Unicode problem titles safely', () => {
    const capture = { ...syncRequest().capture, platform: 'gfg' as const, problem: { ...syncRequest().capture.problem, id: null, title: 'Café Ñandú — 数组', slug: 'cafe-nandu', url: 'https://www.geeksforgeeks.org/problems/cafe-nandu/1' } };
    const md = generateReadme(capture, none, [{ language: 'java', relativePath: 'solution.java' }]);
    expect(md).toContain('# Café Ñandú — 数组');
    expect(safeSegment('Café Ñandú')).toBe('Cafe-Nandu');
    expect(safeSegment('数组')).toMatch(/^item-[0-9a-f]{8}$/);
    expect(safeSegment('..')).toMatch(/^item-/);
    expect(safeSegment('CON')).toMatch(/^item-/);
  });
});

describe('paths and languages', () => {
  it('builds the configured layouts for both platforms', () => {
    const input = { platform: 'gfg' as const, problemId: '700005', slug: 'reverse-a-linked-list', title: 'Reverse', topics: ['Linked List'], language: 'cpp' as const };
    expect(buildSolutionPaths('DSA', 'platform/topic/problem', input).solutionFile).toBe('DSA/GeeksForGeeks/Linked-List/reverse-a-linked-list/solution.cpp');
    expect(buildSolutionPaths('', 'platform/problem', input).readme).toBe('GeeksForGeeks/reverse-a-linked-list/README.md');
  });

  it('validates root folders', () => {
    expect(normalizeRootFolder('/DSA/2026/')).toBe('DSA/2026');
    for (const bad of ['../x', 'a/../b', 'a\\b', '.git', 'a//b', 'C:', 'a/b/c/d/e/f']) expect(() => normalizeRootFolder(bad), bad).toThrow();
  });

  it('maps platform language names', () => {
    expect(resolveLanguage('python3')?.id).toBe('python');
    expect(resolveLanguage('MySQL')).toEqual({ id: 'sql', variant: 'MySQL' });
    expect(resolveLanguage('golang')?.id).toBe('go');
    expect(resolveLanguage('C#')?.id).toBe('csharp');
    expect(resolveLanguage('scala')).toBeNull();
  });
});

describe('diagrams in examples', () => {
  it('renders example images as Markdown images outside the code fence', () => {
    const examples = [
      ['![tree](https://assets.leetcode.com/uploads/tree.jpg)', 'Input: root = [1,2]', 'Output: 2'].join('\n'),
      ['![x](javascript:alert(1))', 'Input: a'].join('\n'),
    ];
    const capture = { ...syncRequest().capture, problem: { ...syncRequest().capture.problem, examples } };
    const md = generateReadme(capture, all, [{ language: 'python', relativePath: 'solution.py' }]);
    expect(md).toContain(['### Example 1', '', '![tree](https://assets.leetcode.com/uploads/tree.jpg)', '', '```text', 'Input: root = [1,2]', 'Output: 2', '```'].join('\n'));
    // non-https "images" stay inert inside the fence
    expect(md).toContain(['```text', '![x](javascript:alert(1))', 'Input: a', '```'].join('\n'));
  });
});

import { sqlTopic } from '../../src/shared/sql-topics';

describe('SQL topic classification (deterministic)', () => {
  it.each([
    ['SELECT name FROM Customer WHERE referee_id != 2 OR referee_id IS NULL;', 'Basic-Select'],
    ['SELECT p.firstName, a.city FROM Person p LEFT JOIN Address a ON p.personId = a.personId;', 'Joins'],
    ['SELECT w1.id FROM Weather w1, Weather w2 WHERE w1.temperature > w2.temperature;', 'Joins'],
    ['SELECT email FROM Person GROUP BY email HAVING COUNT(*) > 1;', 'Aggregation'],
    ['SELECT MAX(salary) FROM Employee WHERE salary < (SELECT MAX(salary) FROM Employee);', 'Subqueries'],
    ['SELECT d.name, e.name FROM (SELECT *, DENSE_RANK() OVER (PARTITION BY departmentId ORDER BY salary DESC) r FROM Employee) e JOIN Department d ON 1=1 WHERE r <= 3;', 'Window-Functions'],
    ['WITH t AS (SELECT * FROM Logs) SELECT * FROM t;', 'CTE'],
    ['SELECT employee_id FROM Employees UNION SELECT employee_id FROM Salaries;', 'Set-Operations'],
    ['SELECT user_id, CONCAT(UPPER(LEFT(name, 1)), LOWER(SUBSTRING(name, 2))) AS name FROM Users;', 'String-Functions'],
    ["SELECT id FROM Activity WHERE DATEDIFF(event_date, '2019-07-27') < 30;", 'Date-Functions'],
    ['SELECT x, y, z, CASE WHEN x + y > z THEN "Yes" ELSE "No" END AS triangle FROM Triangle;', 'Conditional-Logic'],
    ['DELETE p1 FROM Person p1, Person p2 WHERE p1.email = p2.email AND p1.id > p2.id;', 'Data-Modification'],
    ["SELECT 'JOIN GROUP BY' AS label FROM t -- JOIN in a comment\n;", 'Basic-Select'],
  ])('%s → %s', (code, topic) => {
    expect(sqlTopic(code)).toBe(topic);
  });
});
